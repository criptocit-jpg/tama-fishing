/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ TG WEB APP
   ========================================================================== */
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const API = 'https://tama-bot-server.onrender.com/api/action';

let cachedData = null;
let isFishingProcess = false;
let isSpinning = false;
let lastBonusTime = 0;

/* [2] КОНФИГ КОЛЕСА ФОРТУНЫ */
const sectors = [
    { label: "ПУСТО", color: "#334155", weight: 0.50, type: "null", val: 0 },
    { label: "100 TC", color: "#1e293b", weight: 0.15, type: "tc", val: 100 },
    { label: "500 TC", color: "#1e293b", weight: 0.05, type: "tc", val: 500 },
    { label: "VIP 1 ДЕНЬ", color: "#d97706", weight: 0.05, type: "vip", val: 1 },
    { label: "1.0 TON", color: "#10b981", weight: 0.02, type: "ton", val: 1 },
    { label: "РЕМКОМПЛЕКТ", color: "#475569", weight: 0.23, type: "item", val: "repair" }
];

/* ==========================================================================
   [3] ЯДРО ОБМЕНА ДАННЫМИ (API)
   ========================================================================== */
async function doAction(action, payload = {}) {
    try {
        const response = await fetch(API, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                userId,
                userName: tg.initDataUnsafe?.user?.first_name || "Рыбак",
                action,
                payload
            })
        });
        const data = await response.json();
        updateUI(data);
    } catch(e) {
        console.error("Критическая ошибка API:", e);
    }
}

function updateUI(d) {
    if(!d) return;
    cachedData = d;
    
    // Балансы
    document.getElementById('main-balance').innerText = Math.floor(d.b).toLocaleString();
    document.getElementById('units-val').innerText = (d.units || 0);
    document.getElementById('units-balance') ? document.getElementById('units-balance').innerText = (d.units || 0) : null;

    // Статы
    document.getElementById('energy').innerText = d.energy + '%';
    document.getElementById('dur').innerText = Math.floor(d.dur) + '%';
    document.getElementById('jackpot-display').innerText = Math.floor(d.jackpot.pool).toLocaleString() + ' TC';
    
    // XP и Уровни
    const lvl = d.level || 1;
    const xp = d.xp || 0;
    const target = lvl * 500;
    document.getElementById('lvl-val').innerText = lvl;
    document.getElementById('xp-val').innerText = xp;
    document.getElementById('xp-target').innerText = target;
    document.getElementById('xp-fill').style.width = Math.min((xp/target)*100, 100) + '%';

    // Садок
    document.getElementById('player-id').innerText = d.id;
    document.getElementById('fish-weight').innerText = d.fish.toFixed(2) + ' кг';
    
    const isVip = (d.buffs?.vip > Date.now());
    document.getElementById('player-status').innerText = isVip ? '👑 VIP АККАУНТ' : 'ОБЫЧНЫЙ';

    // Админка
    if(d.isAdmin) document.getElementById('nav-admin-btn').style.display = 'flex';
    if(d.allUsers) document.getElementById('admin-user-list').innerText = JSON.stringify(d.allUsers, null, 2);

    // Логика бонуса
    lastBonusTime = d.lastBonus || 0;
    updateBonusUI();

    // Уведомления от сервера
    if(d.msg && !isSpinning && !isFishingProcess) {
        showWoodAlert("ИНФО", "СИСТЕМА", d.msg);
    }
}

/* ==========================================================================
   [4] МЕХАНИКА РЫБАЛКИ
   ========================================================================== */
function startFishing() {
    if (isFishingProcess) return;
    isFishingProcess = true;
    
    const btn = document.getElementById('cast-btn');
    const float = document.getElementById('float-img');
    
    btn.disabled = true;
    float.classList.add('anim-cast');
    float.style.opacity = '1';
    document.getElementById('status-msg').innerText = "ЗАКИДЫВАЕМ...";
    
    tg.HapticFeedback.impactOccurred('medium');

    setTimeout(() => {
        doAction('cast').then(() => {
            setTimeout(() => {
                float.classList.remove('anim-cast');
                float.style.opacity = '0';
                btn.disabled = false;
                isFishingProcess = false;
                document.getElementById('status-msg').innerText = "ГОТОВ";
            }, 1000);
        });
    }, 500);
}

/* ==========================================================================
   [5] КОЛЕСО ФОРТУНЫ (ENGINE)
   ========================================================================== */
function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const rad = canvas.width / 2;
    const arc = (Math.PI * 2) / sectors.length;

    ctx.clearRect(0,0, canvas.width, canvas.height);

    sectors.forEach((s, i) => {
        const angle = i * arc;
        ctx.beginPath();
        ctx.fillStyle = s.color;
        ctx.moveTo(rad, rad);
        ctx.arc(rad, rad, rad - 5, angle, angle + arc);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.translate(rad, rad);
        ctx.rotate(angle + arc / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(s.label, rad - 20, 5);
        ctx.restore();
    });
}

async function handleSpin() {
    if (isSpinning || (cachedData.units || 0) < 2) {
        if((cachedData.units || 0) < 2) tg.showAlert("Недостаточно Units!");
        return;
    }

    isSpinning = true;
    tg.HapticFeedback.impactOccurred('heavy');

    const winnerIndex = Math.floor(Math.random() * sectors.length);
    const canvas = document.getElementById('wheel-canvas');
    const rotation = (360 * 5) + (360 - (winnerIndex * (360 / sectors.length)));
    
    canvas.style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
        const prize = sectors[winnerIndex];
        doAction('spin_fortune', { prize: prize.label });
        showWoodAlert("КОЛЕСО", prize.label, "ВЫИГРЫШ!");
        isSpinning = false;
        canvas.style.transition = 'none';
        canvas.style.transform = `rotate(${rotation % 360}deg)`;
        setTimeout(() => canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)', 50);
    }, 4100);
}

/* ==========================================================================
   [6] UI HELPER FUNCTIONS
   ========================================================================== */
function showTab(name, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('tab-active');
    el.classList.add('active');
    if(name === 'fortune') setTimeout(drawWheel, 100);
    tg.HapticFeedback.selectionChanged();
}

function showWoodAlert(h, t, v) {
    document.getElementById('wood-header-type').innerText = h;
    document.getElementById('wood-title').innerText = t;
    document.getElementById('wood-profit').innerText = v;
    document.getElementById('wood-alert').style.display = 'block';
    tg.HapticFeedback.notificationOccurred('success');
}

function closeWood() {
    document.getElementById('wood-alert').style.display = 'none';
}

function toggleInv() {
    document.getElementById('inv-block').classList.toggle('inv-open');
}

function toggleCat(id) {
    document.getElementById(id).classList.toggle('open');
}

function requestPay(item, price) {
    document.getElementById('pay-price').innerText = price.toFixed(1);
    document.getElementById('pay-memo').innerText = `FISH_${userId}_${item}`;
    document.getElementById('payment-area').style.display = 'block';
}

function updateBonusUI() {
    const diff = (lastBonusTime + 86400000) - Date.now();
    const btn = document.getElementById('bonus-btn');
    const timer = document.getElementById('bonus-timer');
    if(diff > 0) {
        btn.style.display = 'none';
        timer.innerText = new Date(diff).toISOString().substr(11, 8);
    } else {
        btn.style.display = 'block';
        timer.innerText = "ГОТОВ!";
    }
}

setInterval(updateBonusUI, 1000);

// Первый запуск
doAction('load');
