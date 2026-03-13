/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP SDK
   ========================================================================== */
const tg = window.Telegram.WebApp;

// Расширяем приложение на весь экран для удобства
tg.expand();

// Сообщаем Telegram, что интерфейс полностью загружен
tg.ready();

// ПОЛУЧАЕМ ПЕРСОНАЛЬНЫЕ ДАННЫЕ ИЗ SDK
const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const userName = tg.initDataUnsafe?.user?.first_name || 'Уважаемый Рыбак';

// ЭНДПОИНТ ТВОЕГО СЕРВЕРА
const API = 'https://tama-bot-server.onrender.com/api/action';

/* ==========================================================================
   [2] ГЛОБАЛЬНОЕ СОСТОЯНИЕ (КЭШ ДАННЫХ)
   ========================================================================== */
let cachedData = { 
    b: 0,                   // Баланс Тамакоинов (TC)
    units: 0,               // Баланс Юнитов (для Колеса)
    energy: 100,            // Энергия игрока
    dur: 100,               // Прочность удочки
    level: 1,               // Уровень игрока
    xp: 0,                  // Текущий опыт
    fish: 0,                // Вес рыбы в садке (кг)
    buffs: { 
        vip: 0,             // Таймштамп окончания VIP
        hope: 0             // Таймштамп Озера Надежды
    }, 
    lastBonus: 0,           // Время последнего получения бонуса
    isAdmin: false          // Флаг администратора
};

let currentTab = 'main';    // Текущая вкладка
let isSpinning = false;     // Процесс крутки колеса
let isFishingProcess = false; // Процесс анимации заброса

/* ==========================================================================
   [3] КОНФИГУРАЦИЯ СЕКТОРОВ КОЛЕСА (8 СЕКТОРОВ)
   ========================================================================== */
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
   [4] СИСТЕМА ОБНОВЛЕНИЯ ИНТЕРФЕЙСА (RENDER ENGINE)
   ========================================================================== */
function renderUI() {
    const d = cachedData;
    
    // Вспомогательная функция для безопасной вставки текста
    function set(id, val) { 
        const el = document.getElementById(id); 
        if (el) {
            el.innerText = val; 
        }
    }
    
    // 1. ОБНОВЛЯЕМ ЦИФРЫ БАЛАНСА И СТАТОВ
    set('main-balance', Math.floor(d.b).toLocaleString());
    set('units-val', d.units || 0);
    set('energy', (d.energy || 0) + '%');
    set('dur', Math.floor(d.dur || 0) + '%');
    set('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    set('lvl-val', d.level || 1);
    set('player-lvl-text', (d.level || 1) + ' LVL');

    // 2. ОТОБРАЖАЕМ ID (ДЛЯ ТВОИХ ПРОВЕРОК)
    set('player-id', d.id || userId); 
    
    // Ссылка для рефералов
    const refLinkBox = document.getElementById('ref-link');
    if (refLinkBox) {
        refLinkBox.innerText = `https://t.me/tamacoin_bot?start=${userId}`;
    }

    // 3. ПРОВЕРКА VIP СТАТУСА
    const isVip = (Date.now() < (d.buffs?.vip || 0));
    set('player-status', isVip ? "👑 VIP СТАТУС" : "ОБЫЧНЫЙ");

    // 4. XP БАР (ЗАПОЛНЕНИЕ)
    const xpFill = document.getElementById('xp-fill');
    if (xpFill) {
        const goal = (d.level || 1) * 500;
        const width = Math.min(((d.xp || 0) / goal) * 100, 100);
        xpFill.style.width = width + '%';
    }
    
    // 5. КНОПКА АДМИНА (ВИДИМОСТЬ)
    const adminTab = document.getElementById('nav-admin-btn');
    if (adminTab) {
        if (d.isAdmin === true) {
            adminTab.style.display = 'flex';
        } else {
            adminTab.style.display = 'none';
        }
    }

    // Сразу обновляем логику таймеров
    updateTimersLogic();
}

/**
 * Расчет таймеров Золотого Часа и Бонуса
 */
function updateTimersLogic() {
    const now = new Date();
    
    // 1. ЗОЛОТОЙ ЧАС (00-10 МИНУТ)
    const goldDisplay = document.getElementById('gold-timer');
    if (goldDisplay) {
        const mins = now.getMinutes();
        const secs = now.getSeconds();
        
        if (mins < 10) {
            const m = 9 - mins;
            const s = 59 - secs;
            goldDisplay.innerText = `АКТИВЕН: ${m}:${s < 10 ? '0' : ''}${s}`;
            goldDisplay.style.color = "#10b981";
        } else {
            const m = 59 - mins;
            const s = 59 - secs;
            goldDisplay.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
            goldDisplay.style.color = "#ffd700";
        }
    }

    // 2. БОНУС (24 ЧАСА)
    const bTimer = document.getElementById('bonus-timer');
    const bBtn = document.getElementById('bonus-btn');
    
    if (bTimer) {
        const nextBonus = (cachedData.lastBonus || 0) + 86400000;
        const diff = nextBonus - Date.now();
        
        if (diff <= 0) {
            bTimer.innerText = "ГОТОВ!";
            bTimer.style.color = "#10b981";
            if (bBtn) {
                bBtn.style.display = 'block';
            }
        } else {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            
            bTimer.innerText = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
            bTimer.style.color = "#94a3b8";
            
            if (bBtn) {
                bBtn.style.display = 'none';
            }
        }
    }
}

/* ==========================================================================
   [5] СЕТЕВАЯ ЛОГИКА (API CALLS)
   ========================================================================== */
async function doAction(action, payload = {}) {
    try {
        const response = await fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                userId: userId, 
                action: action, 
                payload: payload, 
                n: userName 
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            if (action === 'cast') isFishingProcess = false;
            return tg.showAlert(data.error);
        }

        // БЛОКИРУЮЩАЯ ПЛАШКА ДЛЯ РЫБАЛКИ (ФИКС)
        if (action === 'cast') {
            setTimeout(() => {
                if (data.catchData) {
                    showWoodAlert(
                        "НОВЫЙ УЛОВ!", 
                        data.catchData.type.toUpperCase(), 
                        data.catchData.w.toFixed(2) + " КГ"
                    );
                } else if (data.msg && data.msg.includes("сорвалась")) {
                    showWoodAlert("ЭХ...", "СОРВАЛАСЬ!", "ПОПРОБУЙ ЕЩЕ");
                } else {
                    showWoodAlert("ПУСТО", "НИКОГО...", "0.00 TC");
                }
            }, 1000); // Тайминг анимации
        }

        // ПЛАШКА ПРОДАЖИ
        if (action === 'sell' && data.msg) {
            const gain = data.msg.match(/\d+/);
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", gain ? "+" + gain[0] + " TC" : "УСПЕШНО");
        }

        // ОБРАБОТКА ТОПА
        if (action === 'get_top' && data.top) {
            const list = document.getElementById('leaderboard-list');
            if (list) {
                list.innerHTML = data.top.map((u, i) => {
                    return `
                        <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.03); margin-bottom:6px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                            <span><b style="color:var(--gold);">${i+1}.</b> ${u.n || 'Рыбак'}</span>
                            <b style="color:#fff;">${Math.floor(u.b).toLocaleString()} TC</b>
                        </div>
                    `;
                }).join('');
            }
        }

        // ОБРАБОТКА АДМИНКИ (ПОЛНЫЙ СПИСОК)
        if (action === 'admin_get_all' && data.users) {
            const raw = document.getElementById('raw-admin-data');
            if (raw) {
                raw.innerText = JSON.stringify(data.users, null, 1);
            }
        }

        // ОБНОВЛЯЕМ КЭШ И UI
        Object.assign(cachedData, data);
        renderUI();

    } catch (e) { 
        console.error("API ERROR:", e);
        isFishingProcess = false;
    }
}

/* ==========================================================================
   [6] АДМИН-ПАНЕЛЬ И РЕЖИМ БОГА
   ========================================================================== */
function renderAdminGodMode() {
    const container = document.getElementById('admin-user-list');
    if (!container) return;
    
    container.innerHTML = `
        <div style="background:#1e293b; padding:18px; border-radius:18px; border:2px solid #ef4444; margin-bottom:18px;">
            <h4 style="color:#ef4444; margin-bottom:14px; text-transform:uppercase; font-weight:950; text-align:center;">⚡ GOD MODE ACTIVE ⚡</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:13px; border-radius:12px; font-weight:900;">+10,000 TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:13px; border-radius:12px; font-weight:900;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:13px; border-radius:12px; font-weight:900;">ENERGY 100%</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:13px; border-radius:12px; font-weight:900;">REPAIR 100%</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:15px; border-radius:14px; grid-column: span 2; font-weight:950; text-transform:uppercase;">GIVE 7 DAYS VIP</button>
            </div>
        </div>
        <button class="btn-cast" onclick="doAction('admin_get_all')" style="width:100%; height:48px; background:#334155; border-radius:14px; color:white; font-weight:800;">ЗАГРУЗИТЬ БАЗУ</button>
        <div id="raw-admin-data" style="color:#94a3b8; font-size:10px; font-family:monospace; margin-top:15px; word-break:break-all;"></div>
    `;
}

async function godCmd(type, val) {
    tg.HapticFeedback.impactOccurred('heavy');
    await doAction('admin_god_command', { type, val });
}

/* ==========================================================================
   [7] КОЛЕСО ФОРТУНЫ (ВЫВЕРЕНО НА 12:00)
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

async function handleSpin(mode) {
    if (isSpinning) return;
    const bal = (mode === 'tc') ? cachedData.b : cachedData.units;
    const cost = (mode === 'tc') ? 200 : 2;

    if (bal < cost) return tg.showAlert("Мало валюты!");

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    const rand = Math.random();
    let cumul = 0, winner = 0;
    for (let i = 0; i < sectors.length; i++) {
        cumul += sectors[i].weight;
        if (rand <= cumul) { winner = i; break; }
    }

    const canvas = document.getElementById('wheel-canvas');
    const sAngle = 360 / sectors.length;
    // ФИКС: Поворот на 12 часов (+270 градусов)
    const rot = (360 * 10) - (winner * sAngle) + 270 - (sAngle / 2);
    
    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${rot}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const prize = sectors[winner];
        await doAction('spin_fortune', { cur: mode, pLabel: prize.label });
        showWoodAlert(prize.type === 'null' ? "ОЙ..." : "ПОБЕДА!", prize.label, "ОК");
        
        setTimeout(() => { 
            canvas.style.transition = 'none'; 
            canvas.style.transform = `rotate(${rot % 360}deg)`; 
        }, 500);
    }, 4100);
}

/* ==========================================================================
   [8] РЫБАЛКА (ЗАБРОС УДОЧКИ)
   ========================================================================== */
function startFishing() {
    if (isFishingProcess || cachedData.energy < 2 || cachedData.dur <= 0) return;
    isFishingProcess = true;
    
    const float = document.getElementById('float-img');
    const msg = document.getElementById('status-msg');
    const btn = document.getElementById('cast-btn');

    if (btn) btn.disabled = true;
    if (float) { 
        float.classList.add('anim-cast'); 
        float.style.opacity = '1'; 
    }
    if (msg) {
        msg.innerText = "ЗАБРОС...";
    }

    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(() => { doAction('cast'); }, 400);
}

/* ==========================================================================
   [9] НАВИГАЦИЯ И ПЛАШКА
   ========================================================================== */
function showTab(name, el) {
    currentTab = name;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const target = document.getElementById('tab-' + name);
    if (target) target.classList.add('tab-active');
    if (el) el.classList.add('active');

    const top = document.getElementById('top-area-wrapper');
    const ctrl = document.getElementById('main-controls');

    if (name === 'main' || name === 'fortune') {
        top.style.display = 'block';
        ctrl.style.display = (name === 'main') ? 'block' : 'none';
        if (name === 'fortune') setTimeout(drawWheel, 100);
    } else {
        top.style.display = 'none';
        ctrl.style.display = 'none';
    }
    
    if (name === 'top') doAction('get_top');
    if (name === 'admin') renderAdminGodMode();
    tg.HapticFeedback.selectionChanged();
}

function showWoodAlert(h, t, p) {
    document.getElementById('wood-header-type').innerText = h;
    document.getElementById('wood-title').innerText = t;
    document.getElementById('wood-profit').innerText = p;
    document.getElementById('wood-alert').classList.add('wood-show');
    tg.HapticFeedback.notificationOccurred('success');
}

function closeWood() {
    document.getElementById('wood-alert').classList.remove('wood-show');
    isFishingProcess = false;
    
    const btn = document.getElementById('cast-btn');
    if (btn) btn.disabled = false;
    
    const float = document.getElementById('float-img');
    if (float) { 
        float.style.opacity = '0'; 
        float.classList.remove('anim-cast'); 
    }
    const msg = document.getElementById('status-msg');
    if (msg) msg.innerText = "ГОТОВ К ЛОВЛЕ";
}

/* ==========================================================================
   [10] ВСПОМОГАТЕЛЬНЫЕ
   ========================================================================== */
function toggleInv() { document.getElementById('inv-block').classList.toggle('inv-open'); }
function toggleCat(id) { document.getElementById(id).classList.toggle('open'); }
function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => tg.showAlert("Ссылка скопирована!"));
}

/* ==========================================================================
   [11] ЗАПУСК
   ========================================================================== */
setInterval(updateTimersLogic, 1000);
window.onload = () => { doAction('load'); };
