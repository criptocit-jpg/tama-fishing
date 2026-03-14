/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP SDK
   ========================================================================== */
const tg = window.Telegram.WebApp;

// Расширяем Mini App на весь экран мобильного устройства
tg.expand();

// Сообщаем Telegram, что наше приложение полностью загружено и готово к работе
tg.ready();

/* ==========================================================================
   [2] ДАННЫЕ ПОЛЬЗОВАТЕЛЯ И НАСТРОЙКИ СЕРВЕРА
   ========================================================================== */
// Извлекаем персональный ID пользователя из данных Telegram или используем тестовый
const userId = tg.initDataUnsafe?.user?.id || '7883085758';

// Извлекаем имя пользователя для отображения в топ-листе
const userName = tg.initDataUnsafe?.user?.first_name || 'Рыбак';

// Основной URL адрес твоего сервера на платформе Render
const API = 'https://tama-bot-server.onrender.com/api/action';

/* ==========================================================================
   [3] ГЛОБАЛЬНОЕ СОСТОЯНИЕ ИГРЫ (КЭШ ДАННЫХ)
   ========================================================================== */
let cachedData = { 
    b: 0,                   // Баланс Тамакоинов (главная валюта)
    units: 0,               // Баланс Units (валюта для Колеса Фортуны)
    energy: 100,            // Уровень энергии игрока (в процентах)
    dur: 100,               // Прочность рыболовной удочки (в процентах)
    level: 1,               // Текущий уровень мастерства игрока
    xp: 0,                  // Текущий опыт до следующего уровня
    fish: 0,                // Вес пойманной рыбы в садке (кг)
    buffs: { 
        vip: 0,             // Таймштамп окончания действия VIP статуса
        hope: 0             // Таймштамп доступа к Озеру Надежды
    }, 
    lastBonus: 0,           // Время последнего получения ежедневного бонуса
    isAdmin: false          // Флаг наличия прав администратора
};

// Переменные для контроля состояний интерфейса
let currentTab = 'main';      // Идентификатор текущей открытой вкладки
let isSpinning = false;       // Флаг активного вращения Колеса
let isFishingProcess = false; // Флаг активного процесса заброса и ловли

/* ==========================================================================
   [4] КОНФИГУРАЦИЯ СЕКТОРОВ КОЛЕСА ФОРТУНЫ (8 ПОЗИЦИЙ)
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
   [5] СИСТЕМА ОБНОВЛЕНИЯ ИНТЕРФЕЙСА (RENDER ENGINE)
   ========================================================================== */
function renderUI() {
    const d = cachedData;
    
    // Вспомогательная функция для безопасного обновления текста в DOM
    function safeUpdate(id, val) { 
        const el = document.getElementById(id); 
        if (el) {
            el.innerText = val; 
        }
    }
    
    // 1. СИНХРОНИЗАЦИЯ СТАТИСТИКИ ИГРОКА НА ЭКРАНЕ
    safeUpdate('main-balance', Math.floor(d.b).toLocaleString());
    safeUpdate('units-val', d.units || 0);
    safeUpdate('energy', (d.energy || 0) + '%');
    safeUpdate('dur', Math.floor(d.dur || 0) + '%');
    safeUpdate('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    safeUpdate('lvl-val', d.level || 1);
    safeUpdate('player-lvl-text', (d.level || 1) + ' LVL');

    // 2. ВЫВОД ПЕРСОНАЛЬНОГО ID И ССЫЛОК (ДЛЯ ПРОВЕРКИ)
    safeUpdate('player-id', d.id || userId); 
    
    const refLinkBox = document.getElementById('ref-link');
    if (refLinkBox) {
        refLinkBox.innerText = `https://t.me/tamacoin_bot?start=${userId}`;
    }

    // 3. ОБНОВЛЕНИЕ СТАТУСА ИГРОКА (VIP / ОБЫЧНЫЙ)
    const now = Date.now();
    const isVipActive = (now < (d.buffs?.vip || 0));
    safeUpdate('player-status', isVipActive ? "👑 VIP СТАТУС" : "ОБЫЧНЫЙ");

    // 4. ГРАФИЧЕСКОЕ ЗАПОЛНЕНИЕ ШКАЛЫ ОПЫТА (XP BAR)
    const xpFillBar = document.getElementById('xp-fill');
    if (xpFillBar) {
        const xpTarget = (d.level || 1) * 500;
        const progressPercent = Math.min(((d.xp || 0) / xpTarget) * 100, 100);
        xpFillBar.style.width = progressPercent + '%';
    }
    
    // 5. УПРАВЛЕНИЕ ВИДИМОСТЬЮ КНОПКИ АДМИНИСТРАТОРА
    const navAdminBtn = document.getElementById('nav-admin-btn');
    if (navAdminBtn) {
        if (d.isAdmin === true) {
            navAdminBtn.style.display = 'flex';
        } else {
            navAdminBtn.style.display = 'none';
        }
    }

    // Запускаем пересчет всех временных таймеров
    updateAllTickers();
}

/**
 * Функция ежесекундного обновления таймеров на игровом экране
 */
function updateAllTickers() {
    const now = new Date();
    
    // А) ТАЙМЕР ЗОЛОТОГО ЧАСА (ПЕРВЫЕ 10 МИНУТ КАЖДОГО ЧАСА)
    const goldTimerEl = document.getElementById('gold-timer');
    if (goldTimerEl) {
        const mins = now.getMinutes();
        const secs = now.getSeconds();
        
        if (mins < 10) {
            // Период активного Золотого Часа
            const mRem = 9 - mins;
            const sRem = 59 - secs;
            goldTimerEl.innerText = `АКТИВЕН: ${mRem}:${sRem < 10 ? '0' : ''}${sRem}`;
            goldTimerEl.style.color = "#10b981"; // Зеленый цвет активности
        } else {
            // Период ожидания следующего часа
            const mWait = 59 - mins;
            const sWait = 59 - secs;
            goldTimerEl.innerText = `${mWait}:${sWait < 10 ? '0' : ''}${sWait}`;
            goldTimerEl.style.color = "#ffd700"; // Золотой цвет ожидания
        }
    }

    // Б) ТАЙМЕР ЕЖЕДНЕВНОГО БОНУСА (24-ЧАСОВОЙ ЦИКЛ)
    const bonusTimerEl = document.getElementById('bonus-timer');
    const bonusBtnEl = document.getElementById('bonus-btn');
    
    if (bonusTimerEl) {
        const nextBonusAvail = (cachedData.lastBonus || 0) + 86400000;
        const timeDiff = nextBonusAvail - Date.now();
        
        if (timeDiff <= 0) {
            // Бонус можно забирать
            bonusTimerEl.innerText = "ГОТОВ!";
            bonusTimerEl.style.color = "#10b981";
            if (bonusBtnEl) {
                bonusBtnEl.style.display = 'block';
            }
        } else {
            // Бонус еще в откате, считаем время
            const h = Math.floor(timeDiff / 3600000);
            const m = Math.floor((timeDiff % 3600000) / 60000);
            const s = Math.floor((timeDiff % 60000) / 1000);
            
            bonusTimerEl.innerText = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
            bonusTimerEl.style.color = "#94a3b8";
            
            if (bonusBtnEl) {
                bonusBtnEl.style.display = 'none';
            }
        }
    }
}

/* ==========================================================================
   [6] СЕТЕВОЕ ВЗАИМОДЕЙСТВИЕ (API ACTIONS)
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
        
        // Обработка критических ошибок со стороны сервера
        if (data.error) {
            if (action === 'cast') isFishingProcess = false;
            return tg.showAlert(data.error);
        }

        // --- ГЛАВНЫЙ ФИКС: ЛОГИКА ОТОБРАЖЕНИЯ ПЛАШКИ ПРИ ЛОВЛЕ ---
        if (action === 'cast') {
            // Вызываем плашку немедленно при получении ответа от сервера
            if (data.catchData) {
                // Случай успешной поимки рыбы
                showWoodAlert(
                    "НОВЫЙ УЛОВ!", 
                    data.catchData.type.toUpperCase(), 
                    data.catchData.w.toFixed(2) + " КГ"
                );
            } else if (data.msg && data.msg.includes("сорвалась")) {
                // Случай срыва рыбы
                showWoodAlert("ЭХ...", "СОРВАЛАСЬ!", "ПОПРОБУЙ ЕЩЕ");
            } else {
                // Случай пустого заброса
                showWoodAlert("ПУСТО", "НИКОГО НЕТ", "0.00 TC");
            }
        }

        // --- ЛОГИКА ПРОДАЖИ УЛОВА ---
        if (action === 'sell' && data.msg) {
            const moneyEarned = data.msg.match(/\d+/);
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", moneyEarned ? "+" + moneyEarned[0] + " TC" : "УСПЕШНО");
        }

        // --- ОТРИСОВКА ТАБЛИЦЫ ЛИДЕРОВ ---
        if (action === 'get_top' && data.top) {
            const topList = document.getElementById('leaderboard-list');
            if (topList) {
                topList.innerHTML = data.top.map((user, i) => {
                    return `
                        <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.03); margin-bottom:6px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                            <span><b style="color:var(--gold);">${i+1}.</b> ${user.n || 'Рыбак'}</span>
                            <b style="color:#fff;">${Math.floor(user.b).toLocaleString()} TC</b>
                        </div>
                    `;
                }).join('');
            }
        }

        // --- ВЫВОД ДАННЫХ ДЛЯ АДМИНИСТРАТОРА (DEBUG) ---
        if (action === 'admin_get_all' && data.users) {
            const adminRawBox = document.getElementById('raw-admin-data');
            if (adminRawBox) {
                adminRawBox.innerText = JSON.stringify(data.users, null, 1);
            }
        }

        // СИНХРОНИЗИРУЕМ КЭШ С ДАННЫМИ СЕРВЕРА И ОБНОВЛЯЕМ ЭКРАН
        Object.assign(cachedData, data);
        renderUI();

    } catch (e) { 
        console.error("КРИТИЧЕСКАЯ ОШИБКА API:", e);
        isFishingProcess = false;
    }
}

/* ==========================================================================
   [7] АДМИН-ПАНЕЛЬ И РЕЖИМ БОГА (GOD MODE)
   ========================================================================== */
function renderAdminGodMode() {
    const adminSlot = document.getElementById('admin-user-list');
    if (!adminSlot) return;
    
    adminSlot.innerHTML = `
        <div style="background:#1e293b; padding:18px; border-radius:18px; border:2px solid #ef4444; margin-bottom:18px;">
            <h4 style="color:#ef4444; margin-bottom:14px; text-transform:uppercase; font-weight:950; text-align:center; letter-spacing:1px;">⚡ GOD MODE PANEL ⚡</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">+10,000 TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">ENERGY 100%</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">REPAIR 100%</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:14px; border-radius:12px; grid-column: span 2; font-weight:950; text-transform:uppercase; cursor:pointer;">GIVE 7 DAYS VIP STATUS</button>
            </div>
        </div>
        <button class="btn-cast" onclick="doAction('admin_get_all')" style="width:100%; height:48px; background:#334155; border:none; border-radius:14px; color:white; font-weight:800; cursor:pointer;">ЗАГРУЗИТЬ БАЗУ USERS</button>
        <div id="raw-admin-data" style="color:#64748b; font-size:10px; font-family:monospace; margin-top:15px; word-break:break-all; max-height:200px; overflow-y:auto; background:rgba(0,0,0,0.2); padding:10px; border-radius:10px;"></div>
    `;
}

async function godCmd(type, val) {
    // Тяжелая тактильная отдача при нажатии админ-кнопок
    tg.HapticFeedback.impactOccurred('heavy');
    
    // Выполнение команды через API
    await doAction('admin_god_command', { 
        type: type, 
        val: val 
    });
}

/* ==========================================================================
   [8] КОЛЕСО ФОРТУНЫ: МЕХАНИКА (ЦЕНТРОВКА НА 12:00)
   ========================================================================== */
function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    const radius = canvas.width / 2;
    const arcSize = (Math.PI * 2) / sectors.length;

    context.clearRect(0, 0, canvas.width, canvas.height);
    
    sectors.forEach((sector, i) => {
        const startAngle = i * arcSize;
        
        context.beginPath(); 
        context.fillStyle = sector.color; 
        context.moveTo(radius, radius);
        context.arc(radius, radius, radius - 5, startAngle, startAngle + arcSize); 
        context.fill();
        
        // Отрисовка названия призов в секторах
        context.save(); 
        context.translate(radius, radius); 
        context.rotate(startAngle + arcSize / 2);
        context.textAlign = 'right'; 
        context.fillStyle = '#fff'; 
        context.font = 'bold 11px sans-serif';
        context.fillText(sector.label, radius - 25, 5); 
        context.restore();
    });
}

async function handleSpin(mode) {
    if (isSpinning) return;
    
    const balance = (mode === 'tc') ? cachedData.b : cachedData.units;
    const cost = (mode === 'tc') ? 200 : 2;

    if (balance < cost) {
        return tg.showAlert("Недостаточно средств для вращения Колеса!");
    }

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    // Алгоритм определения выигрышного сектора
    const randomSeed = Math.random();
    let cumulativeWeight = 0;
    let winnerIdx = 0;
    
    for (let i = 0; i < sectors.length; i++) {
        cumulativeWeight += sectors[i].weight;
        if (randomSeed <= cumulativeWeight) { 
            winnerIdx = i; 
            break; 
        }
    }

    const wheelCanvas = document.getElementById('wheel-canvas');
    const sectorAngle = 360 / sectors.length;
    
    // ФИКС: 10 оборотов + смещение на 12:00 (+270 градусов) для точного попадания
    const totalRotation = (360 * 10) - (winnerIdx * sectorAngle) + 270 - (sectorAngle / 2);
    
    wheelCanvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    wheelCanvas.style.transform = `rotate(${totalRotation}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const prize = sectors[winnerIdx];
        
        // Регистрация выигрыша на бэкенде
        await doAction('spin_fortune', { 
            cur: mode, 
            pLabel: prize.label 
        });
        
        // Отображение результата игроку
        showWoodAlert(
            prize.type === 'null' ? "ОЙ..." : "ПОБЕДА!", 
            prize.label, 
            "ПРИЗ ЗАЧИСЛЕН"
        );
        
        // Плавный сброс угла поворота для предотвращения рывков в будущем
        setTimeout(() => { 
            wheelCanvas.style.transition = 'none'; 
            wheelCanvas.style.transform = `rotate(${totalRotation % 360}deg)`; 
        }, 500);
        
    }, 4100);
}

/* ==========================================================================
   [9] МЕХАНИКА РЫБАЛКИ: ЗАБРОС УДОЧКИ
   ========================================================================== */
function startFishing() {
    if (isFishingProcess) return;
    
    // Предварительная проверка доступности ресурсов
    if (cachedData.energy < 2) return tg.showAlert("Недостаточно энергии! Пополните запасы.");
    if (cachedData.dur <= 0) return tg.showAlert("Удочка сломана! Требуется ремонт.");

    isFishingProcess = true;
    
    const floatImg = document.getElementById('float-img');
    const statusMsg = document.getElementById('status-msg');
    const castBtn = document.getElementById('cast-btn');

    if (castBtn) castBtn.disabled = true;
    if (floatImg) { 
        floatImg.classList.add('anim-cast'); 
        floatImg.style.opacity = '1'; 
    }
    if (statusMsg) {
        statusMsg.innerText = "ЗАКИДЫВАЕМ...";
    }

    tg.HapticFeedback.impactOccurred('medium');
    
    // Отправляем запрос на сервер через короткую паузу для визуала
    setTimeout(() => { 
        doAction('cast'); 
    }, 400);
}

/* ==========================================================================
   [10] УПРАВЛЕНИЕ ВКЛАДКАМИ И МОДАЛКАМИ (ПЛАШКИ)
   ========================================================================== */
function showTab(tabName, navEl) {
    currentTab = tabName;
    
    // Сбрасываем стили активных элементов навигации и контента
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    
    // Устанавливаем новые активные элементы
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) {
        targetTab.classList.add('tab-active');
    }
    if (navEl) {
        navEl.classList.add('active');
    }

    // Глобальные блоки управления игровой зоной
    const topAreaWrapper = document.getElementById('top-area-wrapper');
    const mainControlsBlock = document.getElementById('main-controls');

    // ФИКС НАЕЗДА: Рыбалка видна ТОЛЬКО на вкладке "Ловля"
    if (tabName === 'main') {
        topAreaWrapper.style.display = 'block';
        mainControlsBlock.style.display = 'block';
    } else {
        // На любой другой вкладке полностью отключаем визуальную зону рыбалки
        topAreaWrapper.style.display = 'none';
        mainControlsBlock.style.display = 'none';
        
        // Если перешли на Колесо Фортуны - инициируем отрисовку канваса
        if (tabName === 'fortune') {
            setTimeout(drawWheel, 100);
        }
    }

    // Обработка специальных действий вкладок
    if (tabName === 'top') {
        doAction('get_top');
    }
    
    if (tabName === 'admin') {
        renderAdminGodMode();
    }
    
    tg.HapticFeedback.selectionChanged();
}

/**
 * ОТОБРАЖЕНИЕ ПЛАШКИ (WOOD ALERT) - БЛОКИРУЕТ ИНТЕРФЕЙС
 */
function showWoodAlert(headStr, titleStr, rewardStr) {
    const hEl = document.getElementById('wood-header-type');
    const tEl = document.getElementById('wood-title');
    const pEl = document.getElementById('wood-profit');
    const modalEl = document.getElementById('wood-alert');
    
    if (hEl) hEl.innerText = headStr;
    if (tEl) tEl.innerText = titleStr;
    if (pEl) pEl.innerText = rewardStr;
    if (modalEl) modalEl.classList.add('wood-show');
    
    tg.HapticFeedback.notificationOccurred('success');
}

/**
 * ЗАКРЫТИЕ ПЛАШКИ И СБРОС СОСТОЯНИЯ РЫБАЛКИ
 */
function closeWood() {
    const modalEl = document.getElementById('wood-alert');
    if (modalEl) {
        modalEl.classList.remove('wood-show');
    }
    
    // Сбрасываем флаг процесса для возможности нового заброса
    isFishingProcess = false;
    
    const floatImg = document.getElementById('float-img');
    const castBtn = document.getElementById('cast-btn');
    const statusMsg = document.getElementById('status-msg');

    if (castBtn) {
        castBtn.disabled = false;
    }
    if (floatImg) { 
        floatImg.style.opacity = '0'; 
        floatImg.classList.remove('anim-cast'); 
    }
    if (statusMsg) {
        statusMsg.innerText = "ГОТОВ К ЛОВЛЕ";
    }
}

/* ==========================================================================
   [11] ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ИНТЕРФЕЙСА
   ========================================================================== */
function toggleInv() { 
    const invBlock = document.getElementById('inv-block');
    if (invBlock) {
        invBlock.classList.toggle('inv-open'); 
    }
}

function toggleCat(catId) { 
    const categoryEl = document.getElementById(catId);
    if (categoryEl) {
        categoryEl.classList.toggle('open'); 
    }
}

function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => {
        tg.showAlert("Реферальная ссылка скопирована в буфер обмена!");
    });
}

/* ==========================================================================
   [12] ИНИЦИАЛИЗАЦИЯ И ЦИКЛ ЖИЗНИ ПРИЛОЖЕНИЯ
   ========================================================================== */
// Запускаем фоновый процесс обновления таймеров каждую секунду
setInterval(updateAllTickers, 1000);

// Выполняем первичную загрузку данных с сервера при запуске страницы
window.onload = function() { 
    doAction('load'); 
};
