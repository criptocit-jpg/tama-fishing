// ==========================================================================
// [1] ИНИЦИАЛИЗАЦИЯ И ДАННЫЕ
// ==========================================================================
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const API = 'https://tama-bot-server.onrender.com/api/action';

let cachedData = { b: 0, units: 0, energy: 100, dur: 100, level: 1, xp: 0, fish: 0, buffs: { vip: 0, hope: 0 }, lastBonus: 0 };
let currentTab = 'main';
let isFishingProcess = false;
let isSpinning = false;
let safetyTimeout = null;

// КОНФИГУРАЦИЯ КОЛЕСА (8 секторов)
const sectors = [
    { label: "ПУСТО", color: "#334155", weight: 0.50, type: "null" },
    { label: "100 TC", color: "#1e293b", weight: 0.15, type: "tc", val: 100 },
    { label: "500 TC", color: "#1e293b", weight: 0.05, type: "tc", val: 500 },
    { label: "VIP 24h", color: "#d97706", weight: 0.05, type: "vip" },
    { label: "1.0 TON", color: "#10b981", weight: 0.02, type: "ton", val: 1 },
    { label: "5.0 TON", color: "#fbbf24", weight: 0.01, type: "ton", val: 5 },
    { label: "РЕМКОМПЛЕКТ", color: "#475569", weight: 0.12, type: "item", val: "repair" },
    { label: "ЭНЕРГЕТИК", color: "#475569", weight: 0.10, type: "item", val: "energy" }
];

// ==========================================================================
// [2] НАВИГАЦИЯ (ИСПРАВЛЕННЫЙ НАЕЗД)
// ==========================================================================
function showTab(name, el) {
    currentTab = name;
    
    // Переключаем активный таб
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetTab = document.getElementById('tab-' + name);
    if (targetTab) targetTab.classList.add('tab-active');
    if (el) el.classList.add('active');

    // УПРАВЛЕНИЕ ВИДИМОСТЬЮ (Чтобы не наезжало)
    const topArea = document.getElementById('top-area-wrapper');
    const mainControls = document.getElementById('main-controls');

    if (name === 'main') {
        topArea.style.display = 'block';
        mainControls.style.display = 'block';
    } else if (name === 'fortune') {
        topArea.style.display = 'none'; // Полностью скрываем рыбу для колеса
        mainControls.style.display = 'none';
        setTimeout(drawWheel, 100);
    } else {
        topArea.style.display = 'none';
        mainControls.style.display = 'none';
    }

    if (name === 'top') doAction('get_top');
    if (name === 'admin') renderAdminGodMode();
    
    tg.HapticFeedback.selectionChanged();
}

// ==========================================================================
// [3] КОЛЕСО ФОРТУНЫ (ФИКС 12 ЧАСОВ)
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
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(s.label, rad - 25, 5);
        ctx.restore();
    });
}

async function handleSpin(cur) {
    if (isSpinning) return;
    const cost = (cur === 'tc') ? 200 : 2;
    const balance = (cur === 'tc') ? cachedData.b : cachedData.units;

    if (balance < cost) return tg.showAlert("Недостаточно средств!");

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    const rand = Math.random();
    let cumul = 0, winner = 0;
    for (let i = 0; i < sectors.length; i++) {
        cumul += sectors[i].weight;
        if (rand <= cumul) { winner = i; break; }
    }

    const canvas = document.getElementById('wheel-canvas');
    const sectorAngle = 360 / sectors.length;
    // ФОРМУЛА: 8 оборотов - (индекс * угол) + 90 (сдвиг на 12 часов) - полсектора для центра
    const totalRot = (360 * 8) - (winner * sectorAngle) + 90 - (sectorAngle / 2);

    canvas.style.transform = `rotate(${totalRot}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const p = sectors[winner];
        await doAction('spin_fortune', { cur, pLabel: p.label });
        
        if (p.type === 'null') showWoodAlert("ОЙ...", "ПУСТО", "В СЛЕДУЮЩИЙ РАЗ");
        else showWoodAlert("ПОБЕДА!", p.label, "ПРИЗ ВАШ!");
    }, 4100);
}

// ==========================================================================
// [4] РЕЖИМ БОГА (ADMIN GOD MODE)
// ==========================================================================
function renderAdminGodMode() {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    list.innerHTML = `
        <div style="background:#1e293b; padding:15px; border-radius:15px; border:2px solid #ef4444; margin-bottom:15px;">
            <h4 style="color:#ef4444; margin-bottom:10px; text-transform:uppercase;">⚡ GOD MODE ACTIVE</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:10px; border-radius:10px; font-size:10px;">+10k TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:10px; border-radius:10px; font-size:10px;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:10px; border-radius:10px; font-size:10px;">FULL ENERGY</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:10px; border-radius:10px; font-size:10px;">REPAIR ROD</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:10px; border-radius:10px; grid-column: span 2; font-weight:900;">GIVE 7 DAYS VIP</button>
            </div>
        </div>
        <div id="raw-admin-data" style="color:#94a3b8; font-size:10px;">Нажмите "Загрузить базу" ниже</div>
    `;
}

async function godCmd(type, val) {
    tg.HapticFeedback.impactOccurred('heavy');
    await doAction('admin_god_command', { type, val });
}

// ==========================================================================
// [5] ЛОВЛЯ И API
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

        // ПЛАШКА ПРИ ПРОДАЖЕ
        if (action === 'sell' && data.msg) {
            const gain = data.msg.match(/\d+/);
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", gain ? `+${gain[0]} TC` : "ОК");
        }

        Object.assign(cachedData, data);
        renderUI();

        if (data.catchData && currentTab === 'main') {
            setTimeout(() => showWoodAlert("УЛОВ!", data.catchData.type, data.catchData.w + " кг"), 1500);
        }
    } catch (e) { 
        console.error(e); 
        if (action === 'cast') closeWood();
    }
}

function renderUI() {
    const d = cachedData;
    const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    
    safeSet('main-balance', Math.floor(d.b).toLocaleString());
    safeSet('units-val', d.units || 0);
    safeSet('energy', (d.energy || 0) + '%');
    safeSet('dur', Math.floor(d.dur || 0) + '%');
    safeSet('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    safeSet('lvl-val', d.level || 1);
    safeSet('xp-val', d.xp || 0);
    safeSet('player-id', d.id || userId);
    
    const xpGoal = (d.level || 1) * 500;
    const fill = document.getElementById('xp-fill');
    if (fill) fill.style.width = Math.min((d.xp / xpGoal) * 100, 100) + '%';

    if (d.isAdmin) {
        const admBtn = document.getElementById('nav-admin-btn');
        if (admBtn) admBtn.style.display = 'flex';
    }

    // Ежедневный бонус
    const bBtn = document.getElementById('bonus-btn');
    const bTim = document.getElementById('bonus-timer');
    const bonusReady = (Date.now() - (d.lastBonus || 0) > 86400000);
    if (bBtn) bBtn.style.display = bonusReady ? 'block' : 'none';
    if (bTim) bTim.innerText = bonusReady ? "ГОТОВ!" : "ЖДИТЕ";
}

function startFishing() {
    if (isFishingProcess) return;
    isFishingProcess = true;
    const btn = document.getElementById('cast-btn');
    const float = document.getElementById('float-img');
    if (btn) btn.disabled = true;
    if (float) { float.classList.add('anim-cast'); float.style.opacity = '1'; }
    const status = document.getElementById('status-msg');
    if (status) status.innerText = "ЗАКИДЫВАЕМ...";
    
    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(() => { doAction('cast'); }, 400);
}

function showWoodAlert(h, t, v) {
    document.getElementById('wood-header-type').innerText = h;
    document.getElementById('wood-title').innerText = t;
    document.getElementById('wood-profit').innerText = v;
    document.getElementById('wood-alert').classList.add('wood-show');
    tg.HapticFeedback.notificationOccurred('success');
}

function closeWood() {
    document.getElementById('wood-alert').classList.remove('wood-show');
    isFishingProcess = false;
    const btn = document.getElementById('cast-btn');
    if (btn) btn.disabled = false;
    const float = document.getElementById('float-img');
    if (float) { float.style.opacity = '0'; float.classList.remove('anim-cast'); }
    const status = document.getElementById('status-msg');
    if (status) status.innerText = "ГОТОВ К ЛОВЛЕ";
}

function toggleInv() { document.getElementById('inv-block').classList.toggle('inv-open'); }
function toggleCat(id) { document.getElementById(id).classList.toggle('open'); }
function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => tg.showAlert("Ссылка скопирована!"));
}

window.onload = () => { doAction('load'); };
