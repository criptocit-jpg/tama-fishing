/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ И НАСТРОЙКИ (TELEGRAM SDK)
   ========================================================================== */
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// ПОЛУЧАЕМ ID ИЗ ТЕЛЕГРАМА НАПРЯМУЮ
const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const userName = tg.initDataUnsafe?.user?.first_name || 'Рыбак';

const API = 'https://tama-bot-server.onrender.com/api/action';

// ГЛОБАЛЬНЫЙ КЭШ ИГРОКА
let cachedData = { 
    b: 0, 
    units: 0, 
    energy: 100, 
    dur: 100, 
    level: 1, 
    xp: 0, 
    fish: 0, 
    buffs: { vip: 0 }, 
    lastBonus: 0, 
    isAdmin: false 
};

let currentTab = 'main';
let isSpinning = false;
let isFishingProcess = false;

// КОНФИГУРАЦИЯ КОЛЕСА (8 СЕКТОРОВ)
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
   [2] ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (RENDER ENGINE)
   ========================================================================== */
function renderUI() {
    const d = cachedData;
    
    // Вспомогательная функция для безопасной вставки текста
    const safeSet = (id, val) => { 
        const el = document.getElementById(id); 
        if (el) {
            el.innerText = val; 
        } else {
            console.warn("Элемент не найден в HTML:", id);
        }
    };
    
    // 1. ОСНОВНЫЕ СТАТЫ
    safeSet('main-balance', Math.floor(d.b).toLocaleString());
    safeSet('units-val', d.units || 0);
    safeSet('energy', (d.energy || 0) + '%');
    safeSet('dur', Math.floor(d.dur || 0) + '%');
    safeSet('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    safeSet('lvl-val', d.level || 1);
    safeSet('player-lvl-text', (d.level || 1) + ' LVL');

    // 2. ОТОБРАЖЕНИЕ ID (ТРИЖДЫ ДЛЯ ВЕРНОСТИ)
    safeSet('player-id', d.id || userId); 
    
    const refLinkEl = document.getElementById('ref-link');
    if (refLinkEl) {
        refLinkEl.innerText = `https://t.me/tamacoin_bot?start=${userId}`;
    }

    // 3. XP БАР
    const fill = document.getElementById('xp-fill');
    if (fill) {
        const goal = (d.level || 1) * 500;
        const progress = Math.min(((d.xp || 0) / goal) * 100, 100);
        fill.style.width = progress + '%';
    }
    
    // 4. СТАТУС ИГРОКА
    safeSet('player-status', d.buffs?.vip > Date.now() ? "👑 VIP ИГРОК" : "ОБЫЧНЫЙ");

    // 5. КНОПКА АДМИНА
    const admBtn = document.getElementById('nav-admin-btn');
    if (admBtn) {
        admBtn.style.display = d.isAdmin ? 'flex' : 'none';
    }

    // 6. ЛОГИКА ТАЙМЕРА БОНУСА
    updateBonusTimerUI();
}

function updateBonusTimerUI() {
    const bTim = document.getElementById('bonus-timer');
    const bBtn = document.getElementById('bonus-btn');
    if (!bTim) return;

    const lastB = cachedData.lastBonus || 0;
    const diff = (lastB + 86400000) - Date.now();
    
    if (diff <= 0) {
        bTim.innerText = "ГОТОВ!";
        bTim.style.color = "#10b981";
        if (bBtn) bBtn.style.display = 'block';
    } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        bTim.innerText = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        bTim.style.color = "#94a3b8";
        if (bBtn) bBtn.style.display = 'none';
    }
}

/* ==========================================================================
   [3] УПРАВЛЕНИЕ ВКЛАДКАМИ
   ========================================================================== */
function showTab(name, el) {
    currentTab = name;
    
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const target = document.getElementById('tab-' + name);
    if (target) target.classList.add('tab-active');
    if (el) el.classList.add('active');

    const topArea = document.getElementById('top-area-wrapper');
    const mainControls = document.getElementById('main-controls');

    // СКРЫВАЕМ РЫБАЛКУ ВЕЗДЕ КРОМЕ ГЛАВНОЙ
    if (name === 'main') {
        topArea.style.display = 'block';
        mainControls.style.display = 'block';
    } else if (name === 'fortune') {
        topArea.style.display = 'none';
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

/* ==========================================================================
   [4] API И СЕТЬ
   ========================================================================== */
async function doAction(action, payload = {}) {
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId, action, payload, n: userName })
        });
        const data = await res.json();
        
        if (data.error) return tg.showAlert(data.error);

        // ОБРАБОТКА ТОПА
        if (action === 'get_top' && data.top) {
            const list = document.getElementById('leaderboard-list');
            if (list) {
                list.innerHTML = data.top.map((u, i) => `
                    <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.03); margin-bottom:6px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        <span><b style="color:var(--gold);">${i+1}.</b> ${u.n || 'Рыбак'}</span>
                        <b style="color:#fff;">${Math.floor(u.b).toLocaleString()} TC</b>
                    </div>
                `).join('');
            }
        }

        // ОБРАБОТКА ДАННЫХ ДЛЯ АДМИНА
        if (action === 'admin_get_all' && data.users) {
            const raw = document.getElementById('raw-admin-data');
            if (raw) raw.innerText = JSON.stringify(data.users, null, 1);
        }

        Object.assign(cachedData, data);
        renderUI();
    } catch (e) { 
        console.error("ОШИБКА API:", e); 
    }
}

/* ==========================================================================
   [5] РЕЖИМ БОГА (GOD MODE)
   ========================================================================== */
function renderAdminGodMode() {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    
    list.innerHTML = `
        <div style="background:#1e293b; padding:15px; border-radius:15px; border:2px solid #ef4444; margin-bottom:15px;">
            <h4 style="color:#ef4444; margin-bottom:12px; text-transform:uppercase; font-weight:900;">⚡ GOD MODE ACTIVE</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900;">+10k TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900;">ЭНЕРГИЯ</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900;">ПОЧИНКА</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:14px; border-radius:12px; grid-column: span 2; font-weight:950; text-transform:uppercase;">GIVE 7 DAYS VIP</button>
            </div>
        </div>
        <button class="btn-cast" onclick="doAction('admin_get_all')" style="width:100%; height:45px; background:#475569; margin-top:10px;">ЗАГРУЗИТЬ БАЗУ USERS</button>
        <div id="raw-admin-data" style="color:#64748b; font-size:10px; font-family:monospace; margin-top:10px; word-break:break-all;"></div>
    `;
}

async function godCmd(type, val) {
    tg.HapticFeedback.impactOccurred('heavy');
    await doAction('admin_god_command', { type, val });
}

/* ==========================================================================
   [6] ЛОВЛЯ И КОЛЕСО (НЕ ТРОГАТЬ - РАБОТАЮТ)
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
        ctx.beginPath(); ctx.fillStyle = s.color; ctx.moveTo(rad, rad);
        ctx.arc(rad, rad, rad - 5, angle, angle + arc); ctx.fill();
        ctx.save(); ctx.translate(rad, rad); ctx.rotate(angle + arc / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(s.label, rad - 25, 5); ctx.restore();
    });
}

async function handleSpin(cur) {
    if (isSpinning) return;
    const bal = (cur === 'tc') ? cachedData.b : cachedData.units;
    const cost = (cur === 'tc') ? 200 : 2;
    if (bal < cost) return tg.showAlert("Мало валюты!");
    isSpinning = true;
    const rand = Math.random();
    let cumul = 0, winner = 0;
    for (let i = 0; i < sectors.length; i++) {
        cumul += sectors[i].weight;
        if (rand <= cumul) { winner = i; break; }
    }
    const canvas = document.getElementById('wheel-canvas');
    const sectorAngle = 360 / sectors.length;
    const totalRot = (360 * 10) - (winner * sectorAngle) + 270 - (sectorAngle / 2);
    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${totalRot}deg)`;
    setTimeout(async () => {
        isSpinning = false;
        const p = sectors[winner];
        await doAction('spin_fortune', { cur, pLabel: p.label });
        showWoodAlert(p.type === 'null' ? "ОЙ..." : "УРА!", p.label, "OK");
        setTimeout(() => { canvas.style.transition = 'none'; canvas.style.transform = `rotate(${totalRot % 360}deg)`; }, 500);
    }, 4100);
}

function startFishing() {
    if (isFishingProcess || cachedData.energy < 2 || cachedData.dur <= 0) return;
    isFishingProcess = true;
    const float = document.getElementById('float-img');
    const msg = document.getElementById('status-msg');
    if (float) { float.classList.add('anim-cast'); float.style.opacity = '1'; }
    if (msg) msg.innerText = "ЗАБРОС УДОЧКИ...";
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
    const float = document.getElementById('float-img');
    if (float) { float.style.opacity = '0'; float.classList.remove('anim-cast'); }
    const msg = document.getElementById('status-msg');
    if (msg) msg.innerText = "ГОТОВ К ЛОВЛЕ";
}

/* ==========================================================================
   [7] ВСПОМОГАТЕЛЬНЫЕ
   ========================================================================== */
function toggleInv() { document.getElementById('inv-block').classList.toggle('inv-open'); }
function toggleCat(id) { document.getElementById(id).classList.toggle('open'); }
function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => tg.showAlert("Ссылка скопирована!"));
}

/* ==========================================================================
   [8] СТАРТ
   ========================================================================== */
setInterval(updateBonusTimerUI, 1000);
window.onload = () => { doAction('load'); };
