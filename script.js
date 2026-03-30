/**
 * ==========================================================================
 * [PROJECT]: TAM ACOIN FISHING - THE TRUE MONOLITH
 * [VERSION]: 7.0.5 "STABLE & NITRO"
 * ==========================================================================
 */

const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
// Используем твой рабочий API
const API = 'https://tama-bot-server.onrender.com/api/action';

let lastBonusTime = 0;
let userHasHope = false;
let currentTab = 'main'; 
let isFishingProcess = false; 
let isSpinning = false;
let safetyTimeout = null; 
let cachedData = null;

// Твои сектора (сохраняем веса для честной игры)
const sectors = [
    { label: "ПУСТО", color: "#334155", weight: 0.50, type: "null", val: 0 },
    { label: "100 TC", color: "#1e293b", weight: 0.15, type: "tc", val: 100 },
    { label: "500 TC", color: "#1e293b", weight: 0.05, type: "tc", val: 500 },
    { label: "VIP 1 ДЕНЬ", color: "#d97706", weight: 0.05, type: "vip", val: 1 },
    { label: "1.0 TON", color: "#10b981", weight: 0.02, type: "ton", val: 1 },
    { label: "5.0 TON", color: "#fbbf24", weight: 0.01, type: "ton", val: 5 },
    { label: "РЕМКОМПЛЕКТ", color: "#475569", weight: 0.12, type: "item", val: "repair" },
    { label: "ЭНЕРГЕТИК", color: "#475569", weight: 0.10, type: "item", val: "energy" }
];

// --- РЕНДЕРИНГ (Отрисовка данных) ---
function renderFromCache() {
    if(!cachedData) return;
    const d = cachedData;
    
    // Анимированная прокрутка баланса (опционально, пока просто текст)
    if(d.b !== undefined) document.getElementById('main-balance').innerText = Math.floor(d.b).toLocaleString();
    if(d.nf !== undefined) document.getElementById('units-val').innerText = d.nf; // nf из сервера = units
    
    if(d.jackpot) {
        const poolVal = Math.floor(d.jackpot.pool || 1000);
        document.getElementById('jackpot-display').innerText = poolVal.toLocaleString() + ' TC';
    }
    
    if(d.energy !== undefined) document.getElementById('energy').innerText = d.energy + '%';
    if(d.dur !== undefined) document.getElementById('dur').innerText = Math.floor(d.dur) + '%';
    if(d.fish !== undefined) document.getElementById('fish-weight').innerText = d.fish.toFixed(2) + ' кг';
    if(d.id) document.getElementById('player-id').innerText = d.id;
    
    const lvl = d.level || 1;
    const xp = d.xp || 0;
    const nextLevelXP = lvl * 500; 
    document.getElementById('lvl-val').innerText = lvl;
    document.getElementById('xp-val').innerText = xp;
    document.getElementById('xp-target').innerText = nextLevelXP;
    document.getElementById('player-lvl-text').innerText = lvl + ' LVL';
    document.getElementById('xp-fill').style.width = Math.min((xp / nextLevelXP) * 100, 100) + '%';

    if(d.isAdmin) document.getElementById('nav-admin-btn').style.display = 'flex';

    const isVip = (d.buffs?.vip > Date.now());
    const statusEl = document.getElementById('player-status');
    statusEl.innerText = isVip ? '👑 VIP АККАУНТ' : 'ОБЫЧНЫЙ';
    statusEl.style.color = isVip ? '#ffd700' : '#94a3b8';
    
    userHasHope = (d.buffs?.hope > Date.now());
    document.getElementById('lake-status').innerText = userHasHope ? "📍 ОЗЕРО НАДЕЖДЫ ✅" : "📍 ОБЫЧНОЕ ОЗЕРО";
    
    document.getElementById('ref-link').innerText = `https://t.me/tamacoin_bot?start=${userId}`;
    
    lastBonusTime = d.lastBonus || 0;
}

// --- УПРАВЛЕНИЕ ВКЛАДКАМИ ---
function showTab(name, el) {
    currentTab = name; 
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById('tab-' + name).classList.add('tab-active');
    el.classList.add('active');
    
    const isMain = (name === 'main');
    const isFortune = (name === 'fortune');
    
    document.getElementById('top-area-wrapper').style.display = (isMain || isFortune) ? 'block' : 'none';
    document.getElementById('main-controls').style.display = isMain ? 'block' : 'none';
    
    if(isFortune) setTimeout(drawWheel, 100);
    if(name === 'top') doAction('get_top');
    
    tg.HapticFeedback.selectionChanged();
}

// --- КОЛЕСО УДАЧИ ---
function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const rad = cw / 2;
    const arc = (Math.PI * 2) / sectors.length;

    ctx.clearRect(0, 0, cw, cw);

    sectors.forEach((s, i) => {
        const angle = i * arc;
        ctx.beginPath();
        ctx.fillStyle = s.color;
        ctx.moveTo(rad, rad);
        ctx.arc(rad, rad, rad - 5, angle, angle + arc);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(rad, rad);
        ctx.rotate(angle + arc / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(s.label, rad - 25, 5);
        ctx.restore();
    });
}

async function handleSpin(cur) {
    if (isSpinning) return;
    
    // Проверка баланса перед спином
    if (cur === 'tc' && cachedData.b < 200) { tg.showAlert("Нужно 200 TC!"); return; }
    if (cur === 'units' && (cachedData.nf || 0) < 2) { tg.showAlert("Нужно 2 Units!"); return; }

    isSpinning = true;
    const btnTc = document.getElementById('spin-btn-tc');
    const btnUn = document.getElementById('spin-btn-units');
    btnTc.disabled = btnUn.disabled = true;

    tg.HapticFeedback.notificationOccurred('warning');

    // Определяем победителя заранее (математика весов)
    const rand = Math.random();
    let cumul = 0, winner = 0;
    for (let i = 0; i < sectors.length; i++) {
        cumul += sectors[i].weight;
        if (rand <= cumul) { winner = i; break; }
    }

    const canvas = document.getElementById('wheel-canvas');
    const sectorAngle = 360 / sectors.length;
    // Крутим минимум 5 оборотов + попадаем в сектор
    const totalRot = (360 * 5) + (360 - (winner * sectorAngle)) - (sectorAngle / 2);

    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${totalRot}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const p = sectors[winner];
        
        // Отправляем результат на сервер для сохранения
        await doAction('spin', { type: cur === 'tc' ? 'tc' : 'unit' });

        if (p.type === 'null') {
            showWoodAlert("ОЙ!", "ПУСТО", "В СЛЕДУЮЩИЙ РАЗ!");
        } else {
            showWoodAlert("ВЫИГРЫШ!", p.label, "УЖЕ НА БАЛАНСЕ!");
        }

        btnTc.disabled = btnUn.disabled = false;
        // Сброс угла для следующего раза без анимации
        canvas.style.transition = 'none';
        canvas.style.transform = `rotate(${totalRot % 360}deg)`;
    }, 4200);
}

// --- ЯДРО API ---
async function doAction(action, payload = {}) {
    try {
        const response = await fetch(API, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ 
                userId, 
                userName: tg.initDataUnsafe?.user?.first_name || 'Рыбак',
                action, 
                payload: { ...payload } 
            }) 
        });
        const data = await response.json(); 
        
        // Если рыба сорвалась
        if (data.msg && (data.msg.includes('сорвалась') || data.msg.includes('СОРВАЛОСЬ'))) {
           setTimeout(() => showWoodAlert("УПС!", "СОРВАЛАСЬ!", "РЫБА УШЛА..."), 1000);
        }
        
        if (action === 'sell' && data.msg && data.msg.includes('ПРОДАНО')) {
            showWoodAlert("РЫНОК", "ПРОДАНО!", data.msg);
        }
        
        updateUI(data);
    } catch(e) { 
        console.error("API error:", e); 
        isFishingProcess = false;
        document.getElementById('cast-btn').disabled = false;
    }
}

function updateUI(d) {
    if(!d) return;
    // Обновляем кэш
    cachedData = {...cachedData, ...d}; 
    renderFromCache();

    // Обработка улова
    if(d.catch && currentTab === 'main') {
        // Если мы в процессе анимации — ждем её завершения
        const delay = isFishingProcess ? 1500 : 0;
        setTimeout(() => showWoodAlert("УЛОВ!", d.catch.type, `+${d.catch.weight} кг`), delay);
    }
}

// --- ЛОГИКА РЫБАЛКИ ---
function startFishing() {
    if (isFishingProcess) return; 
    
    isFishingProcess = true; 
    const btn = document.getElementById('cast-btn');
    const float = document.getElementById('float-img');
    
    btn.disabled = true;
    btn.style.opacity = "0.5";
    
    float.classList.add('anim-cast'); // Анимация из CSS
    float.style.opacity = '1';
    document.getElementById('status-msg').innerText = "ЗАБРОС УДОЧКИ...";
    
    tg.HapticFeedback.impactOccurred('medium');

    // Страховка от зависания сервера (8 секунд)
    safetyTimeout = setTimeout(() => {
        if (isFishingProcess && document.getElementById('wood-alert').style.display !== 'flex') {
            closeWood();
            tg.showAlert("Сервер не отвечает, попробуй еще раз");
        }
    }, 8000);

    // Выполняем действие
    doAction('cast'); 
}

function showWoodAlert(header, title, value) {
    if (safetyTimeout) clearTimeout(safetyTimeout);
    
    const alert = document.getElementById('wood-alert');
    document.getElementById('wood-header-type').innerText = header;
    document.getElementById('wood-title').innerText = title;
    document.getElementById('wood-profit').innerText = value;
    
    alert.style.display = 'flex'; // Показываем плашку
    alert.classList.add('wood-show');
    
    tg.HapticFeedback.notificationOccurred('success');
}

function closeWood() {
    const alert = document.getElementById('wood-alert');
    alert.style.display = 'none';
    alert.classList.remove('wood-show');
    
    // Разблокировка управления
    isFishingProcess = false; 
    const btn = document.getElementById('cast-btn');
    btn.disabled = false;
    btn.style.opacity = "1";
    
    const float = document.getElementById('float-img');
    float.classList.remove('anim-cast');
    float.style.opacity = '0';
    document.getElementById('status-msg').innerText = "ГОТОВ К ЛОВЛЕ";
}

// --- ТАЙМЕРЫ ---
setInterval(() => {
    // Золотой час
    const now = Date.now();
    const nextHour = (3600000 - (now % 3600000));
    document.getElementById('gold-timer').innerText = new Date(nextHour).toISOString().substr(11, 8);

    // Таймер бонуса
    const bonusDiff = (lastBonusTime + 86400000) - now;
    const bTimer = document.getElementById('bonus-timer');
    if(bonusDiff > 0) {
        bTimer.innerText = new Date(bonusDiff).toISOString().substr(11, 8);
    } else {
        bTimer.innerText = "ГОТОВ!";
    }
}, 1000);

// Первый запуск
doAction('load');
