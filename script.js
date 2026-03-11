// ==========================================================================
// [1] ИНИЦИАЛИЗАЦИЯ И КОНФИГ
// ==========================================================================
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const API = 'https://tama-bot-server.onrender.com/api/action';

// Глобальное состояние (Твоя Золотая База)
let cachedData = { 
    b: 0, units: 0, energy: 100, dur: 100, level: 1, xp: 0, fish: 0,
    jackpot: { pool: 1000 }, buffs: { vip: 0 }
};

let currentTab = 'main';
let isFishingProcess = false;
let isSpinning = false;
let safetyTimeout = null;
let lastBonusTime = 0;

// Конфиг Колеса (50% удержание - твоя прибыль)
const sectors = [
    { label: "ПУСТО", color: "#334155", weight: 0.50, type: "null" },
    { label: "100 TC", color: "#1e293b", weight: 0.15, type: "tc", val: 100 },
    { label: "500 TC", color: "#1e293b", weight: 0.05, type: "tc", val: 500 },
    { label: "VIP 24h", color: "#d97706", weight: 0.05, type: "vip" },
    { label: "1.0 TON", color: "#10b981", weight: 0.02, type: "ton", val: 1 },
    { label: "РЕМКОМПЛЕКТ", color: "#475569", weight: 0.13, type: "item", val: "repair" },
    { label: "ЭНЕРГЕТИК", color: "#475569", weight: 0.10, type: "item", val: "energy" }
];

// ==========================================================================
// [2] СИСТЕМА ТАБОВ (БЕЗ НАЛОЖЕНИЯ)
// ==========================================================================
function showTab(name, el) {
    currentTab = name;
    
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById('tab-' + name).classList.add('tab-active');
    el.classList.add('active');

    const topArea = document.getElementById('top-area-wrapper');
    const controls = document.getElementById('main-controls');

    // Если "Ловля" - показываем окно с рыбой. Если всё остальное - скрываем.
    if (name === 'main') {
        topArea.style.display = 'block';
        controls.style.display = 'block';
    } else if (name === 'fortune') {
        topArea.style.display = 'none'; // Скрываем рыбу для Колеса
        controls.style.display = 'none';
        setTimeout(drawWheel, 100);
    } else {
        topArea.style.display = 'none';
        controls.style.display = 'none';
    }

    if (name === 'top') doAction('get_top');
    tg.HapticFeedback.selectionChanged();
}

// ==========================================================================
// [3] ЯДРО РЫБАЛКИ (FISHING ENGINE)
// ==========================================================================
function startFishing() {
    if (isFishingProcess) return;
    
    if (cachedData.energy < 2) return tg.showAlert("Нет энергии!");
    if (cachedData.dur <= 0) return tg.showAlert("Удочка сломана!");

    isFishingProcess = true;
    const btn = document.getElementById('cast-btn');
    const float = document.getElementById('float-img');
    const status = document.getElementById('status-msg');

    btn.disabled = true;
    float.classList.add('anim-cast');
    float.style.opacity = '1';
    status.innerText = "ЗАБРОС...";
    tg.HapticFeedback.impactOccurred('medium');

    safetyTimeout = setTimeout(() => {
        if (isFishingProcess) closeWood();
    }, 7000);

    setTimeout(() => { doAction('cast'); }, 300);
}

// ==========================================================================
// [4] ЛОГИКА КОЛЕСА (CANVAS + PHYSICS)
// ==========================================================================
function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rad = canvas.width / 2;
    const arc = (Math.PI * 2) / sectors.length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sectors.forEach((s, i) => {
        const angle = i * arc;
        ctx.beginPath();
        ctx.fillStyle = s.color;
        ctx.moveTo(rad, rad);
        ctx.arc(rad, rad, rad - 5, angle, angle + arc);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();

        ctx.save();
        ctx.translate(rad, rad);
        ctx.rotate(angle + arc / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(s.label, rad - 25, 5);
        ctx.restore();
    });
}

async function handleSpin(type) {
    if (isSpinning) return;
    if (type === 'tc' && cachedData.b < 200) return tg.showAlert("Нужно 200 TC");
    if (type === 'units' && (cachedData.units || 0) < 2) return tg.showAlert("Нужно 2 Units");

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    const rand = Math.random();
    let cumulative = 0;
    let winIdx = 0;
    for (let i = 0; i < sectors.length; i++) {
        cumulative += sectors[i].weight;
        if (rand <= cumulative) { winIdx = i; break; }
    }

    const canvas = document.getElementById('wheel-canvas');
    const sectorDeg = 360 / sectors.length;
    const totalDeg = (360 * 5) + (360 - (winIdx * sectorDeg)) - (sectorDeg / 2);

    canvas.style.transform = `rotate(${totalDeg}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const prize = sectors[winIdx];
        await doAction('spin_fortune', { cur: type, pLabel: prize.label });
        
        if (prize.type === 'null') showWoodAlert("ОЙ", "ПУСТО", "ПОВЕЗЕТ ЗАВТРА");
        else showWoodAlert("УРА!", prize.label, "ЗАЧИСЛЕНО");
    }, 4100);
}

// ==========================================================================
// [5] СЕТЕВОЙ МОДУЛЬ (API BRIDGE)
// ==========================================================================
async function doAction(action, payload = {}) {
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId, action, payload })
        });
        const data = await res.json();
        if (data.error) return tg.showAlert(data.error);
        
        // Обновляем кэш
        Object.assign(cachedData, data);
        renderUI();

        if (data.catchData) {
            setTimeout(() => {
                showWoodAlert(data.catchData.isWin ? "УЛОВ!" : "СХОД", data.catchData.type, data.catchData.w + " кг");
            }, 1400);
        }
    } catch (e) { console.error(e); }
}

function renderUI() {
    document.getElementById('main-balance').innerText = Math.floor(cachedData.b).toLocaleString();
    document.getElementById('units-val').innerText = cachedData.units || 0;
    document.getElementById('energy').innerText = cachedData.energy + '%';
    document.getElementById('dur').innerText = Math.floor(cachedData.dur) + '%';
    
    const xpGoal = cachedData.level * 500;
    document.getElementById('xp-fill').style.width = Math.min((cachedData.xp / xpGoal) * 100, 100) + '%';
    
    if (cachedData.isAdmin) document.getElementById('nav-admin-btn').style.display = 'flex';
}

// ==========================================================================
// [6] ВСПОМОГАТЕЛЬНЫЕ
// ==========================================================================
function showWoodAlert(h, t, v) {
    if (safetyTimeout) clearTimeout(safetyTimeout);
    document.getElementById('wood-header-type').innerText = h;
    document.getElementById('wood-title').innerText = t;
    document.getElementById('wood-profit').innerText = v;
    document.getElementById('wood-alert').classList.add('wood-show');
}

function closeWood() {
    document.getElementById('wood-alert').classList.remove('wood-show');
    isFishingProcess = false;
    document.getElementById('cast-btn').disabled = false;
    document.getElementById('float-img').style.opacity = '0';
}

setInterval(() => {
    const nextHour = (3600000 - (Date.now() % 3600000));
    document.getElementById('gold-timer').innerText = new Date(nextHour).toISOString().substr(11, 8);
}, 1000);

window.onload = () => { doAction('load'); };
