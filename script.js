/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP SDK
   ========================================================================== */
const tg = window.Telegram.WebApp;

// Расширяем приложение на весь экран для удобства рыбалки
tg.expand();

// Сообщаем Telegram, что интерфейс готов
tg.ready();

// ПОЛУЧАЕМ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ НАПРЯМУЮ ИЗ ТЕЛЕГРАМА
const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const userName = tg.initDataUnsafe?.user?.first_name || 'Уважаемый Рыбак';

// ЭНДПОИНТ ТВОЕГО СЕРВЕРА НА RENDER
const API = 'https://tama-bot-server.onrender.com/api/action';

/* ==========================================================================
   [2] ГЛОБАЛЬНОЕ СОСТОЯНИЕ (КЭШ ДАННЫХ ИГРОКА)
   ========================================================================== */
let cachedData = { 
    b: 0,                   // Текущий баланс Тамакоинов (TC)
    units: 0,               // Баланс Units для Колеса Фортуны
    energy: 100,            // Процент энергии игрока
    dur: 100,               // Прочность удочки
    level: 1,               // Текущий уровень
    xp: 0,                  // Опыт до следующего уровня
    fish: 0,                // Общий вес рыбы в садке (кг)
    buffs: { 
        vip: 0,             // Время окончания VIP статуса
        hope: 0             // Время действия Озера Надежды
    }, 
    lastBonus: 0,           // Время последнего получения бонуса
    isAdmin: false          // Является ли пользователь администратором
};

let currentTab = 'main';    // Текущая активная вкладка интерфейса
let isSpinning = false;     // Флаг процесса вращения колеса
let isFishingProcess = false; // Флаг процесса анимации рыбалки

/* ==========================================================================
   [3] КОНФИГУРАЦИЯ СЕКТОРОВ КОЛЕСА ФОРТУНЫ
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
    
    // Вспомогательная функция для безопасного обновления текстовых элементов
    function safeSet(id, val) { 
        const el = document.getElementById(id); 
        if (el) {
            el.innerText = val; 
        }
    }
    
    // 1. ОБНОВЛЕНИЕ ОСНОВНЫХ ЦИФРОВЫХ ПОКАЗАТЕЛЕЙ
    safeSet('main-balance', Math.floor(d.b).toLocaleString());
    safeSet('units-val', d.units || 0);
    safeSet('energy', (d.energy || 0) + '%');
    safeSet('dur', Math.floor(d.dur || 0) + '%');
    safeSet('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    safeSet('lvl-val', d.level || 1);
    safeSet('player-lvl-text', (d.level || 1) + ' LVL');

    // 2. ОТОБРАЖЕНИЕ ПЕРСОНАЛЬНОГО ID И ССЫЛОК
    safeSet('player-id', d.id || userId); 
    
    const refBox = document.getElementById('ref-link');
    if (refBox) {
        refBox.innerText = `https://t.me/tamacoin_bot?start=${userId}`;
    }

    // 3. ПРОВЕРКА И ОТОБРАЖЕНИЕ СТАТУСА (VIP ИЛИ ОБЫЧНЫЙ)
    const currentTime = Date.now();
    const isVipActive = (currentTime < (d.buffs?.vip || 0));
    safeSet('player-status', isVipActive ? "👑 VIP СТАТУС" : "ОБЫЧНЫЙ");

    // 4. ВИЗУАЛИЗАЦИЯ ПРОГРЕСС-БАРА ОПЫТА (XP)
    const xpFillBar = document.getElementById('xp-fill');
    if (xpFillBar) {
        const xpTarget = (d.level || 1) * 500;
        const xpPercentage = Math.min(((d.xp || 0) / xpTarget) * 100, 100);
        xpFillBar.style.width = xpPercentage + '%';
    }
    
    // 5. УПРАВЛЕНИЕ ВИДИМОСТЬЮ КНОПКИ АДМИН-ПАНЕЛИ
    const adminTabButton = document.getElementById('nav-admin-btn');
    if (adminTabButton) {
        if (d.isAdmin === true) {
            adminTabButton.style.display = 'flex';
        } else {
            adminTabButton.style.display = 'none';
        }
    }

    // Синхронизируем таймеры
    updateBonusTimerLogic();
}

/**
 * Расчет времени до следующего ежедневного бонуса
 */
function updateBonusTimerLogic() {
    const bTimerDisplay = document.getElementById('bonus-timer');
    const bClaimButton = document.getElementById('bonus-btn');
    
    if (!bTimerDisplay) return;

    const nextAvailableBonus = (cachedData.lastBonus || 0) + 86400000;
    const timeRemaining = nextAvailableBonus - Date.now();
    
    if (timeRemaining <= 0) {
        bTimerDisplay.innerText = "ГОТОВ!";
        bTimerDisplay.style.color = "#10b981";
        if (bClaimButton) {
            bClaimButton.style.display = 'block';
        }
    } else {
        const h = Math.floor(timeRemaining / 3600000);
        const m = Math.floor((timeRemaining % 3600000) / 60000);
        const s = Math.floor((timeRemaining % 60000) / 1000);
        
        bTimerDisplay.innerText = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        bTimerDisplay.style.color = "#94a3b8";
        
        if (bClaimButton) {
            bClaimButton.style.display = 'none';
        }
    }
}

/* ==========================================================================
   [5] СЕТЕВОЕ ВЗАИМОДЕЙСТВИЕ (API ACTIONS)
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
        
        const serverResult = await response.json();
        
        // Обработка серверных ошибок
        if (serverResult.error) {
            if (action === 'cast') isFishingProcess = false;
            return tg.showAlert(serverResult.error);
        }

        // --- ЛОГИКА ОТОБРАЖЕНИЯ УЛОВА В ПЛАШКЕ (ТВОЙ ЗАПРОС) ---
        if (action === 'cast') {
            setTimeout(() => {
                if (serverResult.catchData) {
                    // Если рыба успешно поймана
                    showWoodAlert(
                        "НОВЫЙ УЛОВ!", 
                        serverResult.catchData.type.toUpperCase(), 
                        serverResult.catchData.w.toFixed(2) + " КГ"
                    );
                } else if (serverResult.msg && serverResult.msg.includes("сорвалась")) {
                    // Если рыба сорвалась
                    showWoodAlert("ЭХ...", "СОРВАЛАСЬ!", "ПОПРОБУЙ ЕЩЕ");
                } else {
                    // Прочие варианты (пустой заброс)
                    showWoodAlert("ПУСТО", "НИКОГО...", "0.00 TC");
                }
            }, 1000); // Задержка для завершения анимации поплавка
        }

        // --- ЛОГИКА ПРОДАЖИ УЛОВА ---
        if (action === 'sell' && serverResult.msg) {
            const earnedMoney = serverResult.msg.match(/\d+/);
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", earnedMoney ? "+" + earnedMoney[0] + " TC" : "УСПЕШНО");
        }

        // --- ОБРАБОТКА ТАБЛИЦЫ ЛИДЕРОВ ---
        if (action === 'get_top' && serverResult.top) {
            const topListContainer = document.getElementById('leaderboard-list');
            if (topListContainer) {
                topListContainer.innerHTML = serverResult.top.map((u, i) => {
                    return `
                        <div style="display:flex; justify-content:space-between; padding:13px; background:rgba(255,255,255,0.03); margin-bottom:7px; border-radius:14px; border:1px solid rgba(255,255,255,0.05);">
                            <span><b style="color:var(--gold);">${i + 1}.</b> ${u.n || 'Рыбак'}</span>
                            <b style="color:#fff;">${Math.floor(u.b).toLocaleString()} TC</b>
                        </div>
                    `;
                }).join('');
            }
        }

        // --- ОБРАБОТКА ДАННЫХ ДЛЯ АДМИНИСТРАТОРА ---
        if (action === 'admin_get_all' && serverResult.users) {
            const adminRawBox = document.getElementById('raw-admin-data');
            if (adminRawBox) {
                adminRawBox.innerText = JSON.stringify(serverResult.users, null, 1);
            }
        }

        // ОБНОВЛЯЕМ КЭШ И ПЕРЕРИСОВЫВАЕМ ИНТЕРФЕЙС
        Object.assign(cachedData, serverResult);
        renderUI();

    } catch (apiError) { 
        console.error("ОШИБКА ПРИ ОБРАЩЕНИИ К API:", apiError);
        isFishingProcess = false;
    }
}

/* ==========================================================================
   [6] АДМИН-ПАНЕЛЬ И РЕЖИМ БОГА (GOD MODE)
   ========================================================================== */
function renderAdminGodMode() {
    const adminSlot = document.getElementById('admin-user-list');
    if (!adminSlot) return;
    
    adminSlot.innerHTML = `
        <div style="background:#1e293b; padding:18px; border-radius:18px; border:2.5px solid #ef4444; margin-bottom:18px; box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);">
            <h4 style="color:#ef4444; margin-bottom:14px; text-transform:uppercase; font-weight:950; letter-spacing:1px; text-align:center;">⚡ GOD MODE ACTIVE ⚡</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1.5px solid #ffd700; padding:13px; border-radius:12px; font-weight:900; font-size:11px;">+10,000 TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1.5px solid #ffd700; padding:13px; border-radius:12px; font-weight:900; font-size:11px;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1.5px solid #10b981; padding:13px; border-radius:12px; font-weight:900; font-size:11px;">FULL ENERGY</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1.5px solid #10b981; padding:13px; border-radius:12px; font-weight:900; font-size:11px;">REPAIR ROD</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:15px; border-radius:14px; grid-column: span 2; font-weight:950; text-transform:uppercase; margin-top:5px; box-shadow: 0 4px 0 #b59a00;">GIVE 7 DAYS VIP STATUS</button>
            </div>
        </div>
        
        <div style="margin-top:20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top:20px;">
            <button class="btn-cast" onclick="doAction('admin_get_all')" style="width:100%; height:48px; background:#334155; border:none; border-radius:14px; color:white; font-weight:800; text-transform:uppercase;">ЗАГРУЗИТЬ БАЗУ ДАННЫХ</button>
            <div id="raw-admin-data" style="color:#94a3b8; font-size:10px; font-family:monospace; margin-top:15px; word-break:break-all; background:rgba(0,0,0,0.3); padding:10px; border-radius:10px;"></div>
        </div>
    `;
}

async function godCmd(actionType, val) {
    // Тяжелая вибрация при использовании способностей Бога
    tg.HapticFeedback.impactOccurred('heavy');
    
    // Вызов действия на сервере
    await doAction('admin_god_command', { 
        type: actionType, 
        val: val 
    });
}

/* ==========================================================================
   [7] МЕХАНИКА КОЛЕСА ФОРТУНЫ (ВЫВЕРЕНО НА 12:00)
   ========================================================================== */
function drawWheel() {
    const wheelCanvas = document.getElementById('wheel-canvas');
    if (!wheelCanvas) return;
    
    const ctx = wheelCanvas.getContext('2d');
    const radius = wheelCanvas.width / 2;
    const arcSize = (Math.PI * 2) / sectors.length;

    ctx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
    
    sectors.forEach((sector, index) => {
        const startAngle = index * arcSize;
        
        ctx.beginPath(); 
        ctx.fillStyle = sector.color; 
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius - 5, startAngle, startAngle + arcSize); 
        ctx.fill();
        
        // Отрисовка текста внутри секторов
        ctx.save(); 
        ctx.translate(radius, radius); 
        ctx.rotate(startAngle + arcSize / 2);
        ctx.textAlign = 'right'; 
        ctx.fillStyle = '#fff'; 
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(sector.label, radius - 25, 5); 
        ctx.restore();
    });
}

async function handleSpin(mode) {
    if (isSpinning) return;

    const currentBalance = (mode === 'tc') ? cachedData.b : cachedData.units;
    const spinCost = (mode === 'tc') ? 200 : 2;

    if (currentBalance < spinCost) {
        return tg.showAlert("У вас недостаточно средств для игры!");
    }

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    // Алгоритм определения победителя
    const randomValue = Math.random();
    let accumulatedWeight = 0;
    let winningIndex = 0;
    
    for (let i = 0; i < sectors.length; i++) {
        accumulatedWeight += sectors[i].weight;
        if (randomValue <= accumulatedWeight) { 
            winningIndex = i; 
            break; 
        }
    }

    const canvasElement = document.getElementById('wheel-canvas');
    const singleSectorAngle = 360 / sectors.length;
    
    // ФОРМУЛА: 10 оборотов + смещение на 12:00 (+270 градусов)
    const finalRotation = (360 * 10) - (winningIndex * singleSectorAngle) + 270 - (singleSectorAngle / 2);
    
    canvasElement.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    canvasElement.style.transform = `rotate(${finalRotation}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const selectedPrize = sectors[winningIndex];
        
        // Отправка результата на сервер
        await doAction('spin_fortune', { 
            cur: mode, 
            pLabel: selectedPrize.label 
        });
        
        // Уведомление игрока
        showWoodAlert(selectedPrize.type === 'null' ? "ОЙ..." : "ПОБЕДА!", selectedPrize.label, "ОК");
        
        // Возвращаем колесо в нормальный диапазон углов для следующего раза
        setTimeout(() => { 
            canvasElement.style.transition = 'none'; 
            canvasElement.style.transform = `rotate(${finalRotation % 360}deg)`; 
        }, 500);
        
    }, 4100);
}

/* ==========================================================================
   [8] МЕХАНИКА РЫБАЛКИ (ЗАБРОС УДОЧКИ)
   ========================================================================== */
function startFishing() {
    if (isFishingProcess) return;
    
    // Проверка лимитов перед забросом
    if (cachedData.energy < 2) return tg.showAlert("У вас закончилась энергия! Купите энергетик.");
    if (cachedData.dur <= 0) return tg.showAlert("Удочка сломана! Почините её в инвентаре.");

    isFishingProcess = true;
    
    const floatImg = document.getElementById('float-img');
    const statusText = document.getElementById('status-msg');
    const castButton = document.getElementById('cast-btn');

    if (castButton) castButton.disabled = true;
    if (floatImg) { 
        floatImg.classList.add('anim-cast'); 
        floatImg.style.opacity = '1'; 
    }
    if (statusText) {
        statusText.innerText = "УДОЧКА ЗАБРОШЕНА...";
    }

    // Вибрация при забросе
    tg.HapticFeedback.impactOccurred('medium');

    // Отправляем запрос на сервер спустя небольшую паузу
    setTimeout(() => { 
        doAction('cast'); 
    }, 400);
}

/* ==========================================================================
   [9] НАВИГАЦИЯ И УПРАВЛЕНИЕ ВКЛАДКАМИ
   ========================================================================== */
function showTab(targetName, navElement) {
    currentTab = targetName;
    
    // Сбрасываем все активные состояния
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    // Активируем нужную вкладку
    const activeTab = document.getElementById('tab-' + targetName);
    if (activeTab) {
        activeTab.classList.add('tab-active');
    }
    if (navElement) {
        navElement.classList.add('active');
    }

    // Управление видимостью главной игровой зоны
    const gameZone = document.getElementById('top-area-wrapper');
    const controlZone = document.getElementById('main-controls');

    if (targetName === 'main' || targetName === 'fortune') {
        gameZone.style.display = 'block';
        controlZone.style.display = (targetName === 'main') ? 'block' : 'none';
        
        // Если перешли на колесо, перерисовываем его
        if (targetName === 'fortune') {
            setTimeout(drawWheel, 100);
        }
    } else {
        gameZone.style.display = 'none';
        controlZone.style.display = 'none';
    }

    // Специфические действия при открытии вкладок
    if (targetName === 'top') {
        doAction('get_top');
    }
    
    if (targetName === 'admin') {
        renderAdminGodMode();
    }
    
    // Вибрация при смене вкладки
    tg.HapticFeedback.selectionChanged();
}

/* ==========================================================================
   [10] МОДАЛЬНЫЕ ОКНА (WOOD ALERTS)
   ========================================================================== */
function showWoodAlert(head, title, reward) {
    const hElement = document.getElementById('wood-header-type');
    const tElement = document.getElementById('wood-title');
    const rElement = document.getElementById('wood-profit');
    const modalElement = document.getElementById('wood-alert');
    
    if (hElement) hElement.innerText = head;
    if (tElement) tElement.innerText = title;
    if (rElement) rElement.innerText = reward;
    if (modalElement) modalElement.classList.add('wood-show');
    
    // Звуковое сопровождение вибрацией
    tg.HapticFeedback.notificationOccurred('success');
}

function closeWood() {
    const modalElement = document.getElementById('wood-alert');
    if (modalElement) modalElement.classList.remove('wood-show');
    
    isFishingProcess = false;
    
    const floatImg = document.getElementById('float-img');
    const castButton = document.getElementById('cast-btn');
    const statusText = document.getElementById('status-msg');

    if (castButton) castButton.disabled = false;
    if (floatImg) { 
        floatImg.style.opacity = '0'; 
        floatImg.classList.remove('anim-cast'); 
    }
    if (statusText) {
        statusText.innerText = "ГОТОВ К ЛОВЛЕ";
    }
}

/* ==========================================================================
   [11] ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ИНТЕРФЕЙСА
   ========================================================================== */
function toggleInv() { 
    const inventory = document.getElementById('inv-block');
    if (inventory) inventory.classList.toggle('inv-open'); 
}

function toggleCat(categoryId) { 
    const category = document.getElementById(categoryId);
    if (category) category.classList.toggle('open'); 
}

function copyRef() {
    const inviteLink = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        tg.showAlert("Ваша реферальная ссылка успешно скопирована!");
    });
}

/* ==========================================================================
   [12] ЗАПУСК И ЦИКЛ ОБНОВЛЕНИЯ
   ========================================================================== */
// Запускаем таймер обновления бонуса каждую секунду
setInterval(updateBonusTimerLogic, 1000);

// Первичная загрузка данных при старте приложения
window.onload = function() { 
    doAction('load'); 
};
