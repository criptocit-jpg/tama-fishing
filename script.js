/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP SDK
   ========================================================================== */
const tg = window.Telegram.WebApp;

// Расширяем приложение на весь экран
tg.expand();

// Сообщаем Telegram, что приложение готово к работе
tg.ready();

// ПОЛУЧАЕМ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ НАПРЯМУЮ
const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const userName = tg.initDataUnsafe?.user?.first_name || 'Уважаемый Рыбак';

// ЭНДПОИНТ ТВОЕГО СЕРВЕРА
const API = 'https://tama-bot-server.onrender.com/api/action';

/* ==========================================================================
   [2] ГЛОБАЛЬНОЕ СОСТОЯНИЕ (КЭШ ДАННЫХ)
   ========================================================================== */
let cachedData = { 
    b: 0,                   // Баланс Тамакоинов
    units: 0,               // Баланс Юнитов (для колеса)
    energy: 100,            // Текущая энергия
    dur: 100,               // Прочность удочки
    level: 1,               // Уровень игрока
    xp: 0,                  // Текущий опыт
    fish: 0,                // Вес рыбы в садке
    buffs: { 
        vip: 0,             // Таймштамп окончания VIP
        hope: 0             // Таймштамп Озера Надежды
    }, 
    lastBonus: 0,           // Время последнего бонуса
    isAdmin: false          // Флаг админа
};

let currentTab = 'main';    // Текущая открытая вкладка
let isSpinning = false;     // Процесс вращения колеса
let isFishingProcess = false; // Процесс заброса удочки

/* ==========================================================================
   [3] КОНФИГУРАЦИЯ СЕКТОРОВ КОЛЕСА
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
    
    // Вспомогательная функция для безопасного обновления текста
    function safeSet(id, val) { 
        const el = document.getElementById(id); 
        if (el) {
            el.innerText = val; 
        }
    }
    
    // 1. ОБНОВЛЯЕМ ОСНОВНЫЕ ПОКАЗАТЕЛИ
    safeSet('main-balance', Math.floor(d.b).toLocaleString());
    safeSet('units-val', d.units || 0);
    safeSet('energy', (d.energy || 0) + '%');
    safeSet('dur', Math.floor(d.dur || 0) + '%');
    safeSet('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    safeSet('lvl-val', d.level || 1);
    safeSet('player-lvl-text', (d.level || 1) + ' LVL');

    // 2. ОТОБРАЖАЕМ ID И ССЫЛКИ (ДЛЯ ТЕБЯ)
    safeSet('player-id', d.id || userId); 
    
    const refBox = document.getElementById('ref-link');
    if (refBox) {
        refBox.innerText = `https://t.me/tamacoin_bot?start=${userId}`;
    }

    // 3. ПРОВЕРЯЕМ СТАТУС VIP
    const isVip = (Date.now() < (d.buffs?.vip || 0));
    safeSet('player-status', isVip ? "👑 VIP СТАТУС" : "ОБЫЧНЫЙ");

    // 4. ВИЗУАЛИЗАЦИЯ XP БАРА
    const fill = document.getElementById('xp-fill');
    if (fill) {
        const targetXP = (d.level || 1) * 500;
        const percent = Math.min(((d.xp || 0) / targetXP) * 100, 100);
        fill.style.width = percent + '%';
    }
    
    // 5. КНОПКА АДМИН ПАНЕЛИ
    const adminButton = document.getElementById('nav-admin-btn');
    if (adminButton) {
        if (d.isAdmin === true) {
            adminButton.style.display = 'flex';
        } else {
            adminButton.style.display = 'none';
        }
    }

    // Запускаем проверку таймеров
    updateBonusTimerUI();
}

/**
 * Функция обновления таймера бонуса (24 часа)
 */
function updateBonusTimerUI() {
    const bTimerLabel = document.getElementById('bonus-timer');
    const bButton = document.getElementById('bonus-btn');
    
    if (!bTimerLabel) return;

    const nextBonusTime = (cachedData.lastBonus || 0) + 86400000;
    const timeLeft = nextBonusTime - Date.now();
    
    if (timeLeft <= 0) {
        bTimerLabel.innerText = "ГОТОВ!";
        bTimerLabel.style.color = "#10b981";
        if (bButton) {
            bButton.style.display = 'block';
        }
    } else {
        const hours = Math.floor(timeLeft / 3600000);
        const minutes = Math.floor((timeLeft % 3600000) / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        
        bTimerLabel.innerText = `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        bTimerLabel.style.color = "#94a3b8";
        
        if (bButton) {
            bButton.style.display = 'none';
        }
    }
}

/* ==========================================================================
   [5] СЕТЕВОЕ ВЗАИМОДЕЙСТВИЕ (API CALLS)
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
        
        const result = await response.json();
        
        if (result.error) {
            return tg.showAlert(result.error);
        }

        // ОБРАБОТКА ПОЛУЧЕНИЯ ТОПА
        if (action === 'get_top' && result.top) {
            const leaderboard = document.getElementById('leaderboard-list');
            if (leaderboard) {
                leaderboard.innerHTML = result.top.map((user, index) => {
                    return `
                        <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.03); margin-bottom:6px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                            <span><b style="color:var(--gold);">${index + 1}.</b> ${user.n || 'Аноним'}</span>
                            <b style="color:#fff;">${Math.floor(user.b).toLocaleString()} TC</b>
                        </div>
                    `;
                }).join('');
            }
        }

        // ОБРАБОТКА ДАННЫХ ДЛЯ АДМИН-ПАНЕЛИ
        if (action === 'admin_get_all' && result.users) {
            const rawDisplay = document.getElementById('raw-admin-data');
            if (rawDisplay) {
                rawDisplay.innerText = JSON.stringify(result.users, null, 1);
            }
        }

        // СИНХРОНИЗАЦИЯ КЭША С ОТВЕТОМ СЕРВЕРА
        Object.assign(cachedData, result);
        
        // Перерисовываем интерфейс
        renderUI();

    } catch (error) { 
        console.error("КРИТИЧЕСКАЯ ОШИБКА API:", error); 
    }
}

/* ==========================================================================
   [6] РЕЖИМ БОГА (GOD MODE / ADMIN PANEL)
   ========================================================================== */
function renderAdminGodMode() {
    const adminContainer = document.getElementById('admin-user-list');
    if (!adminContainer) return;
    
    adminContainer.innerHTML = `
        <div style="background:#1e293b; padding:15px; border-radius:15px; border:2px solid #ef4444; margin-bottom:15px;">
            <h4 style="color:#ef4444; margin-bottom:12px; text-transform:uppercase; font-weight:900; letter-spacing:1px;">⚡ GOD MODE PANEL</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900;">+10k TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900;">ЭНЕРГИЯ 100%</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900;">ПОЧИНКА 100%</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:14px; border-radius:12px; grid-column: span 2; font-weight:950; text-transform:uppercase;">ВЫДАТЬ VIP (7 ДН)</button>
            </div>
        </div>
        <button class="btn-cast" onclick="doAction('admin_get_all')" style="width:100%; height:45px; background:#475569; margin-top:10px; border:none; border-radius:12px; color:white; font-weight:700;">ЗАГРУЗИТЬ БАЗУ USERS</button>
        <div id="raw-admin-data" style="color:#64748b; font-size:10px; font-family:monospace; margin-top:10px; word-break:break-all;"></div>
    `;
}

async function godCmd(commandType, amount) {
    // Вибрация при нажатии
    tg.HapticFeedback.impactOccurred('heavy');
    
    // Отправляем команду на сервер
    await doAction('admin_god_command', { 
        type: commandType, 
        val: amount 
    });
}

/* ==========================================================================
   [7] ЛОГИКА КОЛЕСА ФОРТУНЫ (ВЫВЕРЕНО НА 12:00)
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

async function handleSpin(currencyType) {
    if (isSpinning) return;

    const balance = (currencyType === 'tc') ? cachedData.b : cachedData.units;
    const cost = (currencyType === 'tc') ? 200 : 2;

    if (balance < cost) {
        return tg.showAlert("Недостаточно валюты для игры!");
    }

    isSpinning = true;
    
    // Алгоритм выбора победителя
    const rand = Math.random();
    let cumul = 0;
    let winnerIndex = 0;
    
    for (let i = 0; i < sectors.length; i++) {
        cumul += sectors[i].weight;
        if (rand <= cumul) { 
            winnerIndex = i; 
            break; 
        }
    }

    const canvas = document.getElementById('wheel-canvas');
    const sectorAngle = 360 / sectors.length;
    
    // ФИКС: Поворот на 12 часов (+270 градусов)
    const totalRotation = (360 * 10) - (winnerIndex * sectorAngle) + 270 - (sectorAngle / 2);
    
    canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvas.style.transform = `rotate(${totalRotation}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const prize = sectors[winnerIndex];
        
        // Отправляем результат на сервер
        await doAction('spin_fortune', { 
            cur: currencyType, 
            pLabel: prize.label 
        });
        
        // Показываем уведомление
        showWoodAlert(prize.type === 'null' ? "ОЙ..." : "УРА!", prize.label, "ОК");
        
        // Сбрасываем позицию без анимации для плавности следующего раза
        setTimeout(() => { 
            canvas.style.transition = 'none'; 
            canvas.style.transform = `rotate(${totalRotation % 360}deg)`; 
        }, 500);
        
    }, 4100);
}

/* ==========================================================================
   [8] ЛОВЛЯ РЫБЫ
   ========================================================================= */
function startFishing() {
    if (isFishingProcess) return;
    if (cachedData.energy < 2) return tg.showAlert("Нет энергии для заброса!");
    if (cachedData.dur <= 0) return tg.showAlert("Удочка сломана! Почините в магазине.");

    isFishingProcess = true;
    
    const float = document.getElementById('float-img');
    const statusMsg = document.getElementById('status-msg');
    const castBtn = document.getElementById('cast-btn');

    if (castBtn) castBtn.disabled = true;
    if (float) { 
        float.classList.add('anim-cast'); 
        float.style.opacity = '1'; 
    }
    if (statusMsg) {
        statusMsg.innerText = "ЗАБРОС УДОЧКИ...";
    }

    setTimeout(() => { 
        doAction('cast'); 
    }, 400);
}

/* ==========================================================================
   [9] НАВИГАЦИЯ И МОДАЛКИ
   ========================================================================== */
function showTab(tabName, element) {
    currentTab = tabName;
    
    // Снимаем активные стили
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // Активируем выбранную вкладку
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) {
        targetTab.classList.add('tab-active');
    }
    if (element) {
        element.classList.add('active');
    }

    const mainGameArea = document.getElementById('top-area-wrapper');
    const mainActionBtn = document.getElementById('main-controls');

    // ЛОГИКА СКРЫТИЯ РЫБАЛКИ
    if (tabName === 'main') {
        mainGameArea.style.display = 'block';
        mainActionBtn.style.display = 'block';
    } else {
        mainGameArea.style.display = 'none';
        mainActionBtn.style.display = 'none';
        
        if (tabName === 'fortune') {
            setTimeout(drawWheel, 100);
        }
    }

    if (tabName === 'top') {
        doAction('get_top');
    }
    
    if (tabName === 'admin') {
        renderAdminGodMode();
    }
    
    tg.HapticFeedback.selectionChanged();
}

function showWoodAlert(header, title, profit) {
    const h = document.getElementById('wood-header-type');
    const t = document.getElementById('wood-title');
    const p = document.getElementById('wood-profit');
    const modal = document.getElementById('wood-alert');
    
    if (h) h.innerText = header;
    if (t) t.innerText = title;
    if (p) p.innerText = profit;
    if (modal) modal.classList.add('wood-show');
}

function closeWood() {
    const modal = document.getElementById('wood-alert');
    if (modal) modal.classList.remove('wood-show');
    
    isFishingProcess = false;
    
    const float = document.getElementById('float-img');
    const castBtn = document.getElementById('cast-btn');
    const statusMsg = document.getElementById('status-msg');

    if (castBtn) castBtn.disabled = false;
    if (float) { 
        float.style.opacity = '0'; 
        float.classList.remove('anim-cast'); 
    }
    if (statusMsg) {
        statusMsg.innerText = "ГОТОВ К ЛОВЛЕ";
    }
}

/* ==========================================================================
   [10] ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================================================== */
function toggleInv() { 
    const inv = document.getElementById('inv-block');
    if (inv) inv.classList.toggle('inv-open'); 
}

function toggleCat(catId) { 
    const cat = document.getElementById(catId);
    if (cat) cat.classList.toggle('open'); 
}

function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => {
        tg.showAlert("Реферальная ссылка скопирована!");
    });
}

/* ==========================================================================
   [11] ЗАПУСК ПРИЛОЖЕНИЯ
   ========================================================================== */
// Запускаем таймер обновления каждую секунду
setInterval(updateBonusTimerUI, 1000);

// Загружаем данные при старте
window.onload = function() { 
    doAction('load'); 
};
