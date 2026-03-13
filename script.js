/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ И НАСТРОЙКИ WEBAPP
   ========================================================================== */
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// ТВОЙ ID ДЛЯ ТЕСТОВ И ОСНОВНОЙ URL СЕРВЕРА
const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const API = 'https://tama-bot-server.onrender.com/api/action';

// ЛОКАЛЬНОЕ ХРАНИЛИЩЕ ДАННЫХ (КЭШ)
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

// КОНФИГУРАЦИЯ СЕКТОРОВ КОЛЕСА (НЕ ТРОГАТЬ - РАБОТАЕТ ИДЕАЛЬНО)
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
   [2] ЛОГИКА КОЛЕСА ФОРТУНЫ (ФИКС 12 ЧАСОВ)
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

    if (balance < cost) return tg.showAlert("Недостаточно средств для крутки!");

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    const rand = Math.random();
    let cumul = 0;
    let winner = 0;
    
    for (let i = 0; i < sectors.length; i++) {
        cumul += sectors[i].weight;
        if (rand <= cumul) { winner = i; break; }
    }

    const canvas = document.getElementById('wheel-canvas');
    const sectorAngle = 360 / sectors.length;
    
    // ЗОЛОТАЯ ФОРМУЛА: Сдвиг на 12 часов
    const totalRot = (360 * 10) - (winner * sectorAngle) + 270 - (sectorAngle / 2);

    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${totalRot}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const p = sectors[winner];
        
        await doAction('spin_fortune', { cur, pLabel: p.label });
        
        if (p.type === 'null') {
            showWoodAlert("ОЙ...", "ПУСТО", "В СЛЕДУЮЩИЙ РАЗ ПОВЕЗЕТ!");
        } else {
            showWoodAlert("ПОБЕДА!", p.label, "ПРИЗ ЗАЧИСЛЕН");
        }

        setTimeout(() => {
            canvas.style.transition = 'none';
            canvas.style.transform = `rotate(${totalRot % 360}deg)`;
        }, 500);
    }, 4100);
}

/* ==========================================================================
   [3] АДМИНКА И РЕЖИМ БОГА (GOD MODE)
   ========================================================================== */
function renderAdminGodMode() {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    
    list.innerHTML = `
        <div style="background:#1e293b; padding:15px; border-radius:15px; border:2px solid #ef4444; margin-bottom:15px;">
            <h4 style="color:#ef4444; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; font-weight:900;">⚡ GOD MODE ACTIVE</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">+10k TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">ЭНЕРГИЯ 100%</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">ПОЧИНКА 100%</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:14px; border-radius:12px; grid-column: span 2; font-weight:950; text-transform:uppercase; cursor:pointer;">ВЫДАТЬ VIP (7 ДНЕЙ)</button>
            </div>
        </div>
        
        <div style="margin-top:20px; padding:10px; background:rgba(255,255,255,0.02); border-radius:12px;">
            <button class="btn-cast" onclick="doAction('admin_get_all')" style="width:100%; height:45px; background:#475569;">ЗАГРУЗИТЬ БАЗУ USERS</button>
            <div id="raw-admin-data" style="color:#64748b; font-size:10px; font-family:monospace; margin-top:10px; word-break:break-all; max-height:200px; overflow-y:auto;"></div>
        </div>
    `;
}

async function godCmd(type, val) {
    tg.HapticFeedback.impactOccurred('heavy');
    await doAction('admin_god_command', { type, val });
}

/* ==========================================================================
   [4] API И ТОП ЛИСТ (LADDER)
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

        // РЕНДЕР ТОП-ЛИСТА
        if (action === 'get_top' && data.top) {
            const list = document.getElementById('leaderboard-list');
            if (list) {
                list.innerHTML = data.top.map((u, i) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(255,255,255,0.03); margin-bottom:6px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        <span><b style="color:var(--gold);">${i+1}.</b> ${u.n || 'Рыбак'}</span>
                        <b style="color:#fff;">${Math.floor(u.b).toLocaleString()} TC</b>
                    </div>
                `).join('');
            }
        }

        // ВЫВОД СЫРЫХ ДАННЫХ ДЛЯ АДМИНА
        if (action === 'admin_get_all' && data.users) {
            const raw = document.getElementById('raw-admin-data');
            if (raw) raw.innerText = JSON.stringify(data.users, null, 1);
        }

        // ОБНОВЛЕНИЕ КЭША И ИНТЕРФЕЙСА
        Object.assign(cachedData, data);
        renderUI();

    } catch (e) { 
        console.error("КРИТИЧЕСКАЯ ОШИБКА API:", e); 
    }
}

/* ==========================================================================
   [5] UI И ТАЙМЕРЫ
   ========================================================================== */
function renderUI() {
    const d = cachedData;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    
    // Обновляем основные статы
    set('main-balance', Math.floor(d.b).toLocaleString());
    set('units-val', d.units || 0);
    set('energy', (d.energy || 0) + '%');
    set('dur', Math.floor(d.dur || 0) + '%');
    set('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    set('lvl-val', d.level || 1);
    
    // XP бар
    const fill = document.getElementById('xp-fill');
    if (fill) {
        const goal = d.level * 500;
        fill.style.width = Math.min((d.xp / goal) * 100, 100) + '%';
    }
    
    // Кнопка админа
    if (d.isAdmin) {
        const btn = document.getElementById('nav-admin-btn');
        if (btn) btn.style.display = 'flex';
    }
    
    // Таймер бонуса
    updateBonusTimer();
}

function updateBonusTimer() {
    const bTim = document.getElementById('bonus-timer');
    const bBtn = document.getElementById('bonus-btn');
    if (!bTim) return;

    const diff = ((cachedData.lastBonus || 0) + 86400000) - Date.now();
    
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
   [6] УПРАВЛЕНИЕ ВКЛАДКАМИ
   ========================================================================== */
function showTab(name, el) {
    currentTab = name;
    
    // Снимаем активные классы
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // Ставим новые
    const target = document.getElementById('tab-' + name);
    if (target) target.classList.add('tab-active');
    if (el) el.classList.add('active');

    // Скрываем/Показываем рыбу (Чтобы не накладывалось)
    const top = document.getElementById('top-area-wrapper');
    const ctrl = document.getElementById('main-controls');
    
    if (name === 'main' || name === 'fortune') {
        top.style.display = 'block';
        ctrl.style.display = (name === 'main') ? 'block' : 'none';
    } else {
        top.style.display = 'none';
        ctrl.style.display = 'none';
    }

    // Триггеры вкладок
    if (name === 'fortune') setTimeout(drawWheel, 100);
    if (name === 'top') doAction('get_top');
    if (name === 'admin') renderAdminGodMode();
    
    tg.HapticFeedback.selectionChanged();
}

/* ==========================================================================
   [7] ЛОВЛЯ И АЛЕРТЫ
   ========================================================================== */
function startFishing() {
    if (isFishingProcess || cachedData.energy < 2 || cachedData.dur <= 0) return;
    
    isFishingProcess = true;
    const float = document.getElementById('float-img');
    const status = document.getElementById('status-msg');
    
    if (float) { float.classList.add('anim-cast'); float.style.opacity = '1'; }
    if (status) status.innerText = "ЗАБРОС УДОЧКИ...";
    
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
    const float = document.getElementById('float-img');
    if (float) { float.style.opacity = '0'; float.classList.remove('anim-cast'); }
    const status = document.getElementById('status-msg');
    if (status) status.innerText = "ГОТОВ К ЛОВЛЕ";
}

/* ==========================================================================
   [8] ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================================================== */
function toggleInv() { document.getElementById('inv-block').classList.toggle('inv-open'); }
function toggleCat(id) { document.getElementById(id).classList.toggle('open'); }
function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => tg.showAlert("Ссылка скопирована в буфер!"));
}

/* ==========================================================================
   [9] ЗАПУСК ПРИЛОЖЕНИЯ
   ========================================================================== */
// Запускаем таймер обновления каждую секунду
setInterval(updateBonusTimer, 1000);

// Первичная загрузка
window.onload = () => { 
    doAction('load'); 
};
