/* ==========================================================================
   [1] CONFIG & WEBAPP INIT
   ========================================================================== */
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const API = 'https://tama-bot-server.onrender.com/api/action';

let cachedData = { 
    b: 0, 
    units: 0, 
    energy: 100, 
    dur: 100, 
    level: 1, 
    xp: 0, 
    fish: 0, 
    buffs: { vip: 0 }, 
    lastBonus: 0 
};

let currentTab = 'main';
let isFishingProcess = false;
let isSpinning = false;

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

/* ==========================================================================
   [2] WHEEL ENGINE (ИСПРАВЛЕННЫЙ РАСЧЕТ НА 12 ЧАСОВ)
   ========================================================================== */
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
    const balance = (cur === 'tc') ? cachedData.b : cachedData.units;
    const cost = (cur === 'tc') ? 200 : 2;

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
    
    // ФОРМУЛА: Сдвигаем на 12 часов (+90 градусов) и центрируем сектор
    // Мы крутим КАНВАС, поэтому вычитаем угол победителя из общего вращения
    const totalRot = (360 * 10) - (winner * sectorAngle) + 270 - (sectorAngle / 2);

    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${totalRot}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const p = sectors[winner];
        await doAction('spin_fortune', { cur, pLabel: p.label });
        
        if (p.type === 'null') showWoodAlert("УПС...", "ПУСТО", "ПОПРОБУЙ ЕЩЕ!");
        else showWoodAlert("ВЫИГРЫШ!", p.label, "НАЧИСЛЕНО");

        setTimeout(() => {
            canvas.style.transition = 'none';
            canvas.style.transform = `rotate(${totalRot % 360}deg)`;
        }, 500);
    }, 4100);
}

/* ==========================================================================
   [3] ТАЙМЕРЫ (ФИКС ЗАВИСАНИЯ)
   ========================================================================== */
function updateTimers() {
    const now = new Date();
    
    // ЗОЛОТОЙ ЧАС
    const mins = now.getMinutes();
    const secs = now.getSeconds();
    const goldTimer = document.getElementById('gold-timer');
    
    if (goldTimer) {
        if (mins < 10) {
            const m = 9 - mins;
            const s = 59 - secs;
            goldTimer.innerText = `АКТИВЕН: ${m}:${s < 10 ? '0' : ''}${s}`;
            goldTimer.style.color = '#10b981';
        } else {
            const m = 59 - mins;
            const s = 59 - secs;
            goldTimer.innerText = `00:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
            goldTimer.style.color = '#ffd700';
        }
    }

    // ТАЙМЕР БОНУСА
    const bTim = document.getElementById('bonus-timer');
    const bBtn = document.getElementById('bonus-btn');
    if (bTim) {
        const nextB = (cachedData.lastBonus || 0) + 86400000;
        const diff = nextB - Date.now();

        if (diff <= 0) {
            bTim.innerText = "ГОТОВ!";
            bTim.style.color = '#10b981';
            if (bBtn) bBtn.style.display = 'block';
        } else {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            bTim.innerText = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
            bTim.style.color = '#94a3b8';
            if (bBtn) bBtn.style.display = 'none';
        }
    }
}

/* ==========================================================================
   [4] CORE API & UI
   ========================================================================== */
async function doAction(action, payload = {}) {
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId, action, payload })
        });
        const data = await res.json();
        if (data.error) return tg.showAlert(data.error);

        if (action === 'sell' && data.msg) {
            const gain = data.msg.match(/\d+/);
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", gain ? `+${gain[0]} TC` : "УСПЕШНО");
        }

        Object.assign(cachedData, data);
        renderUI();
        updateTimers(); // Обновляем таймеры сразу после загрузки данных

        if (data.catchData && currentTab === 'main') {
            setTimeout(() => showWoodAlert("УЛОВ!", data.catchData.type, data.catchData.w + " кг"), 1500);
        }
    } catch (e) { console.error(e); }
}

function renderUI() {
    const d = cachedData;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    
    set('main-balance', Math.floor(d.b).toLocaleString());
    set('units-val', d.units || 0);
    set('energy', (d.energy || 0) + '%');
    set('dur', Math.floor(d.dur || 0) + '%');
    set('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    set('lvl-val', d.level || 1);
    
    const xpGoal = (d.level || 1) * 500;
    const fill = document.getElementById('xp-fill');
    if (fill) fill.style.width = Math.min((d.xp / xpGoal) * 100, 100) + '%';
    
    if (d.isAdmin) {
        const adm = document.getElementById('nav-admin-btn');
        if (adm) adm.style.display = 'flex';
    }
}

/* ==========================================================================
   [5] ACTIONS & UTILS
   ========================================================================== */
function startFishing() {
    if (isFishingProcess || cachedData.energy < 2 || cachedData.dur <= 0) return;
    isFishingProcess = true;
    const btn = document.getElementById('cast-btn');
    const float = document.getElementById('float-img');
    const msg = document.getElementById('status-msg');
    
    if (btn) btn.disabled = true;
    if (float) { float.classList.add('anim-cast'); float.style.opacity = '1'; }
    if (msg) msg.innerText = "ЗАКИДЫВАЕМ...";
    
    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(() => { doAction('cast'); }, 400);
}

function showWoodAlert(h, t, v) {
    document.getElementById('wood-header-type').innerText = h;
    document.getElementById('wood-title').innerText = t;
    document.getElementById('wood-profit').innerText = v;
    document.getElementById('wood-alert').classList.add('wood-show');
}

function closeWood() {
    document.getElementById('wood-alert').classList.remove('wood-show');
    isFishingProcess = false;
    const btn = document.getElementById('cast-btn');
    if (btn) btn.disabled = false;
    const float = document.getElementById('float-img');
    if (float) { float.style.opacity = '0'; float.classList.remove('anim-cast'); }
    const msg = document.getElementById('status-msg');
    if (msg) msg.innerText = "ГОТОВ К ЛОВЛЕ";
}

function showTab(name, el) {
    currentTab = name;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('tab-active');
    el.classList.add('active');

    const top = document.getElementById('top-area-wrapper');
    const ctrl = document.getElementById('main-controls');
    top.style.display = (name === 'main') ? 'block' : 'none';
    ctrl.style.display = (name === 'main') ? 'block' : 'none';

    if (name === 'fortune') setTimeout(drawWheel, 100);
    if (name === 'top') doAction('get_top');
}

function toggleInv() { document.getElementById('inv-block').classList.toggle('inv-open'); }
function toggleCat(id) { document.getElementById(id).classList.toggle('open'); }
function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => tg.showAlert("Ссылка скопирована!"));
}

/* ==========================================================================
   [6] RUN
   ========================================================================== */
setInterval(updateTimers, 1000);
window.onload = () => { doAction('load'); };
