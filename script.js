/* ==========================================================================
   [1] CORE SETUP
   ========================================================================== */
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const API = 'https://tama-bot-server.onrender.com/api/action';

let currentTab = 'main';
let isFishingProcess = false;
let isSpinning = false;
let safetyTimeout = null;
let cachedData = { b: 0, units: 0, energy: 100, dur: 100, level: 1, xp: 0, fish: 0, buffs: { vip: 0 } };

// КОНФИГ КОЛЕСА (8 секторов по 45 градусов)
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
   [2] WHEEL ENGINE (ИСПРАВЛЕННЫЙ ЦЕНТР НА 12 ЧАСОВ)
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
    const cost = (cur === 'tc') ? 200 : 2;
    const balance = (cur === 'tc') ? cachedData.b : cachedData.units;

    if (balance < cost) return tg.showAlert("Недостаточно средств!");

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    // Генерируем победителя
    const rand = Math.random();
    let cumul = 0, winner = 0;
    for (let i = 0; i < sectors.length; i++) {
        cumul += sectors[i].weight;
        if (rand <= cumul) { winner = i; break; }
    }

    const canvas = document.getElementById('wheel-canvas');
    const sectorAngle = 360 / sectors.length;
    
    // ФОРМУЛА ФИКСА: (8 оборотов) - (индекс * угол) + 90 градусов (сдвиг с 3 на 12 часов) - (полсектора для центра)
    const totalRot = (360 * 8) - (winner * sectorAngle) + 90 - (sectorAngle / 2);

    canvas.style.transform = `rotate(${totalRot}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const p = sectors[winner];
        await doAction('spin_fortune', { cur, pLabel: p.label });
        
        if (p.type === 'null') showWoodAlert("УПС...", "ПУСТО", "ПОВЕЗЕТ В СЛЕДУЮЩИЙ РАЗ");
        else showWoodAlert("ВЫИГРЫШ!", p.label, "ПРИЗ НАЧИСЛЕН");
    }, 4100);
}

/* ==========================================================================
   [3] API & УВЕДОМЛЕНИЯ (ПЛАШКА ПРОДАЖИ)
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
        
        // ПЛАШКА ПРИ ПРОДАЖЕ РЫБЫ
        if (action === 'sell' && data.msg) {
            const tcGained = data.msg.match(/\d+/); // Вытаскиваем цифры из сообщения сервера
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", tcGained ? `+${tcGained[0]} TC` : "УСПЕШНО");
        }

        Object.assign(cachedData, data);
        renderUI();
    } catch (e) { console.error(e); }
}

/* ==========================================================================
   [4] АДМИНКА: РЕЖИМ БОГА (GOD MODE)
   ========================================================================== */
function renderAdminGodMode() {
    const container = document.getElementById('admin-user-list');
    container.innerHTML = `
        <div style="background:#1e293b; padding:15px; border-radius:12px; border:2px solid var(--danger);">
            <h4 style="color:var(--danger); margin-bottom:10px;">⚡ GOD MODE: ПРЯМОЕ УПРАВЛЕНИЕ</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button onclick="godAction('add_tc', 10000)" style="background:#0f172a; color:var(--gold); border:1px solid var(--gold); padding:8px; border-radius:8px;">+10,000 TC</button>
                <button onclick="godAction('add_units', 50)" style="background:#0f172a; color:var(--gold); border:1px solid var(--gold); padding:8px; border-radius:8px;">+50 Units</button>
                <button onclick="godAction('set_energy', 100)" style="background:#0f172a; color:var(--success); border:1px solid var(--success); padding:8px; border-radius:8px;">Full Energy</button>
                <button onclick="godAction('set_dur', 100)" style="background:#0f172a; color:var(--success); border:1px solid var(--success); padding:8px; border-radius:8px;">Repair Rod</button>
                <button onclick="godAction('give_vip', 7)" style="background:var(--gold); color:#000; font-weight:900; padding:8px; border-radius:8px; grid-column: span 2;">GIVE 7 DAYS VIP</button>
            </div>
            <p style="font-size:9px; color:var(--text-muted); margin-top:10px;">*Команды улетают сразу в базу данных*</p>
        </div>
        <hr style="margin:15px 0; border:0; border-top:1px solid #334155;">
        <div id="admin-raw-data">Нажмите "Загрузить базу" для сырых данных</div>
    `;
}

async function godAction(type, val) {
    tg.HapticFeedback.notificationOccurred('success');
    await doAction('admin_god_command', { type, val });
}

/* ==========================================================================
   [5] ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================================================== */
function showTab(name, el) {
    currentTab = name;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('tab-active');
    el.classList.add('active');

    // Прячем рыбу во время Колеса и Админки
    const topArea = document.getElementById('top-area-wrapper');
    const controls = document.getElementById('main-controls');
    topArea.style.display = (name === 'main' || name === 'fortune') ? 'block' : 'none';
    controls.style.display = (name === 'main') ? 'block' : 'none';

    if (name === 'fortune') setTimeout(drawWheel, 100);
    if (name === 'admin') renderAdminGodMode();
    tg.HapticFeedback.selectionChanged();
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
    document.getElementById('cast-btn').disabled = false;
    document.getElementById('float-img').style.opacity = '0';
}

function renderUI() {
    document.getElementById('main-balance').innerText = Math.floor(cachedData.b).toLocaleString();
    document.getElementById('units-val').innerText = cachedData.units || 0;
    document.getElementById('energy').innerText = (cachedData.energy || 0) + '%';
    document.getElementById('dur').innerText = Math.floor(cachedData.dur || 0) + '%';
    document.getElementById('fish-weight').innerText = (cachedData.fish || 0).toFixed(2) + ' кг';
    
    if (cachedData.isAdmin) document.getElementById('nav-admin-btn').style.display = 'flex';
}

function startFishing() {
    if (isFishingProcess) return;
    isFishingProcess = true;
    const btn = document.getElementById('cast-btn');
    const float = document.getElementById('float-img');
    btn.disabled = true;
    float.classList.add('anim-cast');
    float.style.opacity = '1';
    document.getElementById('status-msg').innerText = "ЗАКИДЫВАЕМ...";
    setTimeout(() => { doAction('cast'); }, 400);
}

window.onload = () => { doAction('load'); };
