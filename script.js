/* ==========================================================================
   [1] ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP SDK
   ========================================================================== */
const tg = window.Telegram.WebApp;

// Расширяем приложение на весь доступный экран
tg.expand();

// Уведомляем Telegram о готовности интерфейса
tg.ready();

// ПОЛУЧАЕМ ПЕРСОНАЛЬНЫЕ ДАННЫЕ ИГРОКА ИЗ КОНТЕКСТА ТЕЛЕГРАМА
const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const userName = tg.initDataUnsafe?.user?.first_name || 'Уважаемый Рыбак';

// АДРЕС ВАШЕГО СЕРВЕРА НА RENDER
const API = 'https://tama-bot-server.onrender.com/api/action';

/* ==========================================================================
   [2] ГЛОБАЛЬНОЕ СОСТОЯНИЕ (КЭШ ДАННЫХ)
   ========================================================================== */
let cachedData = { 
    b: 0,                   // Баланс Тамакоинов (TC)
    units: 0,               // Баланс Юнитов (валюта для Колеса)
    energy: 100,            // Уровень энергии игрока (в процентах)
    dur: 100,               // Состояние удочки (прочность)
    level: 1,               // Текущий уровень мастерства
    xp: 0,                  // Опыт до следующего уровня
    fish: 0,                // Общий вес рыбы в садке (кг)
    buffs: { 
        vip: 0,             // Дата истечения VIP статуса
        hope: 0             // Статус доступа к Озеру Надежды
    }, 
    lastBonus: 0,           // Время последнего получения бонуса
    isAdmin: false          // Флаг доступа к админ-панели
};

let currentTab = 'main';      // Идентификатор активной вкладки
let isSpinning = false;       // Состояние вращения Колеса Фортуны
let isFishingProcess = false; // Состояние анимации заброса удочки

/* ==========================================================================
   [3] КОНФИГУРАЦИЯ СЕКТОРОВ КОЛЕСА ФОРТУНЫ (8 ПОЗИЦИЙ)
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
    
    // Вспомогательная функция для обновления текстового контента элементов
    function safeUpdate(id, val) { 
        const el = document.getElementById(id); 
        if (el) {
            el.innerText = val; 
        }
    }
    
    // 1. СИНХРОНИЗАЦИЯ СТАТИСТИКИ ИГРОКА
    safeUpdate('main-balance', Math.floor(d.b).toLocaleString());
    safeUpdate('units-val', d.units || 0);
    safeUpdate('energy', (d.energy || 0) + '%');
    safeUpdate('dur', Math.floor(d.dur || 0) + '%');
    safeUpdate('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    safeUpdate('lvl-val', d.level || 1);
    safeUpdate('player-lvl-text', (d.level || 1) + ' LVL');

    // 2. ОТОБРАЖЕНИЕ ПЕРСОНАЛЬНОГО ID (ДЛЯ ИДЕНТИФИКАЦИИ)
    safeUpdate('player-id', d.id || userId); 
    
    // Формирование и вывод реферальной ссылки
    const refDisplay = document.getElementById('ref-link');
    if (refDisplay) {
        refDisplay.innerText = `https://t.me/tamacoin_bot?start=${userId}`;
    }

    // 3. ПРОВЕРКА ДЕЙСТВУЮЩЕГО СТАТУСА VIP
    const nowTimestamp = Date.now();
    const vipStatusActive = (nowTimestamp < (d.buffs?.vip || 0));
    safeUpdate('player-status', vipStatusActive ? "👑 VIP СТАТУС" : "ОБЫЧНЫЙ");

    // 4. ГРАФИЧЕСКОЕ ЗАПОЛНЕНИЕ ПОЛОСЫ ОПЫТА (XP)
    const progressBar = document.getElementById('xp-fill');
    if (progressBar) {
        const xpToNextLevel = (d.level || 1) * 500;
        const widthPercent = Math.min(((d.xp || 0) / xpToNextLevel) * 100, 100);
        progressBar.style.width = widthPercent + '%';
    }
    
    // 5. ОТОБРАЖЕНИЕ КНОПКИ АДМИН-ПАНЕЛИ ДЛЯ РАЗРЕШЕННЫХ ID
    const navAdmin = document.getElementById('nav-admin-btn');
    if (navAdmin) {
        if (d.isAdmin === true) {
            navAdmin.style.display = 'flex';
        } else {
            navAdmin.style.display = 'none';
        }
    }

    // Вызываем логику пересчета таймеров
    updateTickers();
}

/**
 * Логика ежесекундного обновления таймеров на экране
 */
function updateTickers() {
    const currentDate = new Date();
    
    // А) ТАЙМЕР ЗОЛОТОГО ЧАСА (ПЕРВЫЕ 10 МИНУТ ЧАСА)
    const goldDisplay = document.getElementById('gold-timer');
    if (goldDisplay) {
        const currentMins = currentDate.getMinutes();
        const currentSecs = currentDate.getSeconds();
        
        if (currentMins < 10) {
            const minutesLeft = 9 - currentMins;
            const secondsLeft = 59 - currentSecs;
            goldDisplay.innerText = `АКТИВЕН: ${minutesLeft}:${secondsLeft < 10 ? '0' : ''}${secondsLeft}`;
            goldDisplay.style.color = "#10b981";
        } else {
            const minutesToWait = 59 - currentMins;
            const secondsToWait = 59 - currentSecs;
            goldDisplay.innerText = `${minutesToWait}:${secondsToWait < 10 ? '0' : ''}${secondsToWait}`;
            goldDisplay.style.color = "#ffd700";
        }
    }

    // Б) ТАЙМЕР ЕЖЕДНЕВНОГО БОНУСА (ОЖИДАНИЕ 24 ЧАСА)
    const bonusDisplay = document.getElementById('bonus-timer');
    const bonusButton = document.getElementById('bonus-btn');
    
    if (bonusDisplay) {
        const nextBonusAvailability = (cachedData.lastBonus || 0) + 86400000;
        const timeUntilBonus = nextBonusAvailability - Date.now();
        
        if (timeUntilBonus <= 0) {
            bonusDisplay.innerText = "ГОТОВ!";
            bonusDisplay.style.color = "#10b981";
            if (bonusButton) {
                bonusButton.style.display = 'block';
            }
        } else {
            const h = Math.floor(timeUntilBonus / 3600000);
            const m = Math.floor((timeUntilBonus % 3600000) / 60000);
            const s = Math.floor((timeUntilBonus % 60000) / 1000);
            
            bonusDisplay.innerText = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
            bonusDisplay.style.color = "#94a3b8";
            
            if (bonusButton) {
                bonusButton.style.display = 'none';
            }
        }
    }
}

/* ==========================================================================
   [5] СЕТЕВАЯ ЛОГИКА (ВЗАИМОДЕЙСТВИЕ С API)
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
        
        const resultData = await response.json();
        
        // Перехват и вывод ошибок сервера
        if (resultData.error) {
            if (action === 'cast') isFishingProcess = false;
            return tg.showAlert(resultData.error);
        }

        // --- ЛОГИКА РЫБАЛКИ: ПОКАЗ ПЛАШКИ (ФИКС) ---
        if (action === 'cast') {
            // Искусственная задержка для синхронизации с анимацией поплавка
            setTimeout(() => {
                if (resultData.catchData) {
                    // Если зафиксирован улов рыбы
                    showWoodAlert(
                        "НОВЫЙ УЛОВ!", 
                        resultData.catchData.type.toUpperCase(), 
                        resultData.catchData.w.toFixed(2) + " КГ"
                    );
                } else if (resultData.msg && resultData.msg.includes("сорвалась")) {
                    // Если сервер сообщил о срыве рыбы
                    showWoodAlert("ЭХ...", "СОРВАЛАСЬ!", "ПОПРОБУЙ ЕЩЕ");
                } else {
                    // Если результат заброса неопределен или пуст
                    showWoodAlert("ПУСТО", "НИКОГО НЕТ", "0.00 TC");
                }
            }, 1000);
        }

        // --- ЛОГИКА ПРОДАЖИ РЫБЫ ---
        if (action === 'sell' && resultData.msg) {
            const matchMoney = resultData.msg.match(/\d+/);
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", matchMoney ? "+" + matchMoney[0] + " TC" : "УСПЕШНО");
        }

        // --- ОТРИСОВКА ЛИДЕРБОРДА ---
        if (action === 'get_top' && resultData.top) {
            const ladder = document.getElementById('leaderboard-list');
            if (ladder) {
                ladder.innerHTML = resultData.top.map((user, i) => {
                    return `
                        <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.03); margin-bottom:6px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                            <span><b style="color:var(--gold);">${i+1}.</b> ${user.n || 'Рыбак'}</span>
                            <b style="color:#fff;">${Math.floor(user.b).toLocaleString()} TC</b>
                        </div>
                    `;
                }).join('');
            }
        }

        // --- ДАННЫЕ ДЛЯ АДМИНИСТРАЦИИ ---
        if (action === 'admin_get_all' && resultData.users) {
            const adminDataBox = document.getElementById('raw-admin-data');
            if (adminDataBox) {
                adminDataBox.innerText = JSON.stringify(resultData.users, null, 1);
            }
        }

        // ОБНОВЛЕНИЕ ЛОКАЛЬНОГО КЭША И ИНТЕРФЕЙСА
        Object.assign(cachedData, resultData);
        renderUI();

    } catch (err) { 
        console.error("ОШИБКА ВЫПОЛНЕНИЯ ACTION:", err);
        isFishingProcess = false;
    }
}

/* ==========================================================================
   [6] АДМИН-ПАНЕЛЬ: РЕЖИМ БОГА (GOD MODE)
   ========================================================================== */
function renderAdminGodMode() {
    const adminSlot = document.getElementById('admin-user-list');
    if (!adminSlot) return;
    
    adminSlot.innerHTML = `
        <div style="background:#1e293b; padding:18px; border-radius:18px; border:2px solid #ef4444; margin-bottom:18px;">
            <h4 style="color:#ef4444; margin-bottom:14px; text-transform:uppercase; font-weight:950; text-align:center; letter-spacing:1px;">⚡ GOD MODE ACTIVE ⚡</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <button onclick="godCmd('add_tc', 10000)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">+10,000 TC</button>
                <button onclick="godCmd('add_units', 50)" style="background:#0f172a; color:#ffd700; border:1px solid #ffd700; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">+50 Units</button>
                <button onclick="godCmd('set_energy', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">ENERGY 100%</button>
                <button onclick="godCmd('set_dur', 100)" style="background:#0f172a; color:#10b981; border:1px solid #10b981; padding:12px; border-radius:10px; font-weight:900; cursor:pointer;">REPAIR 100%</button>
                <button onclick="godCmd('give_vip', 7)" style="background:#ffd700; color:#000; padding:14px; border-radius:12px; grid-column: span 2; font-weight:950; text-transform:uppercase; cursor:pointer;">ВЫДАТЬ VIP (7 ДНЕЙ)</button>
            </div>
        </div>
        <button class="btn-cast" onclick="doAction('admin_get_all')" style="width:100%; height:48px; background:#475569; border:none; border-radius:14px; color:white; font-weight:800; cursor:pointer;">ЗАГРУЗИТЬ БАЗУ USERS</button>
        <div id="raw-admin-data" style="color:#64748b; font-size:10px; font-family:monospace; margin-top:15px; word-break:break-all; max-height:150px; overflow-y:auto; background:rgba(0,0,0,0.2); padding:10px; border-radius:10px;"></div>
    `;
}

async function godCmd(type, amount) {
    // Вызываем тактильную отдачу
    tg.HapticFeedback.impactOccurred('heavy');
    
    // Передаем команду в сетевой слой
    await doAction('admin_god_command', { 
        type: type, 
        val: amount 
    });
}

/* ==========================================================================
   [7] КОЛЕСО ФОРТУНЫ: МЕХАНИКА (ВЫРАВНИВАНИЕ НА 12 ЧАСОВ)
   ========================================================================== */
function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    
    const context = canvas.getContext('2d');
    const radius = canvas.width / 2;
    const sectorArc = (Math.PI * 2) / sectors.length;

    context.clearRect(0, 0, canvas.width, canvas.height);
    
    sectors.forEach((sector, i) => {
        const startAngle = i * sectorArc;
        
        context.beginPath(); 
        context.fillStyle = sector.color; 
        context.moveTo(radius, radius);
        context.arc(radius, radius, radius - 5, startAngle, startAngle + sectorArc); 
        context.fill();
        
        // Отрисовка названия приза в секторе
        context.save(); 
        context.translate(radius, radius); 
        context.rotate(startAngle + sectorArc / 2);
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
        return tg.showAlert("Недостаточно средств для вращения!");
    }

    isSpinning = true;
    tg.HapticFeedback.notificationOccurred('warning');
    
    const randomSeed = Math.random();
    let weightSum = 0;
    let winningPos = 0;
    
    for (let i = 0; i < sectors.length; i++) {
        weightSum += sectors[i].weight;
        if (randomSeed <= weightSum) { 
            winningPos = i; 
            break; 
        }
    }

    const wheelElement = document.getElementById('wheel-canvas');
    const anglePerSector = 360 / sectors.length;
    
    // КОРРЕКЦИЯ: +270 градусов для точного попадания сектора под верхнюю стрелку (12:00)
    const finalRotation = (360 * 10) - (winningPos * anglePerSector) + 270 - (anglePerSector / 2);
    
    wheelElement.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
    wheelElement.style.transform = `rotate(${finalRotation}deg)`;

    setTimeout(async () => {
        isSpinning = false;
        const prizeData = sectors[winningPos];
        
        // Регистрация выигрыша на сервере
        await doAction('spin_fortune', { 
            cur: mode, 
            pLabel: prizeData.label 
        });
        
        // Отображение плашки с результатом
        showWoodAlert(
            prizeData.type === 'null' ? "ОЙ..." : "УДАЧА!", 
            prizeData.label, 
            "ПРИЗ ВАШ"
        );
        
        // Сброс анимации без визуального рывка
        setTimeout(() => { 
            wheelElement.style.transition = 'none'; 
            wheelElement.style.transform = `rotate(${finalRotation % 360}deg)`; 
        }, 500);
        
    }, 4100);
}

/* ==========================================================================
   [8] ЛОВЛЯ РЫБЫ: ЗАБРОС УДОЧКИ
   ========================================================================== */
function startFishing() {
    if (isFishingProcess) return;
    
    // Предварительная проверка ресурсов
    if (cachedData.energy < 2) return tg.showAlert("Недостаточно энергии!");
    if (cachedData.dur <= 0) return tg.showAlert("Удочка сломана! Требуется ремонт.");

    isFishingProcess = true;
    
    const float = document.getElementById('float-img');
    const status = document.getElementById('status-msg');
    const btn = document.getElementById('cast-btn');

    if (btn) btn.disabled = true;
    if (float) { 
        float.classList.add('anim-cast'); 
        float.style.opacity = '1'; 
    }
    if (status) {
        status.innerText = "ЗАКИДЫВАЕМ...";
    }

    tg.HapticFeedback.impactOccurred('medium');
    
    // Запускаем API запрос
    setTimeout(() => { 
        doAction('cast'); 
    }, 400);
}

/* ==========================================================================
   [9] УПРАВЛЕНИЕ ВКЛАДКАМИ И МОДАЛКАМИ (ФИКС НАЕЗДА)
   ========================================================================== */
function showTab(name, element) {
    currentTab = name;
    
    // Сбрасываем активные состояния навигации и контента
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // Устанавливаем новые активные элементы
    const targetTab = document.getElementById('tab-' + name);
    if (targetTab) {
        targetTab.classList.add('tab-active');
    }
    if (element) {
        element.classList.add('active');
    }

    const visualArea = document.getElementById('top-area-wrapper');
    const actionArea = document.getElementById('main-controls');

    // ЛОГИКА ПРЯТКИ: Скрываем зону рыбалки везде, кроме вкладки "Ловля"
    if (name === 'main') {
        visualArea.style.display = 'block';
        actionArea.style.display = 'block';
    } else {
        visualArea.style.display = 'none';
        actionArea.style.display = 'none';
        
        // Если перешли на колесо - инициируем отрисовку
        if (name === 'fortune') {
            setTimeout(drawWheel, 100);
        }
    }

    // Подгрузка данных по условию
    if (name === 'top') doAction('get_top');
    if (name === 'admin') renderAdminGodMode();
    
    tg.HapticFeedback.selectionChanged();
}

/**
 * ОТОБРАЖЕНИЕ ДЕРЕВЯННОЙ ПЛАШКИ (WOOD ALERT)
 */
function showWoodAlert(head, title, reward) {
    const h = document.getElementById('wood-header-type');
    const t = document.getElementById('wood-title');
    const p = document.getElementById('wood-profit');
    const modal = document.getElementById('wood-alert');
    
    if (h) h.innerText = head;
    if (t) t.innerText = title;
    if (p) p.innerText = reward;
    if (modal) modal.classList.add('wood-show');
    
    tg.HapticFeedback.notificationOccurred('success');
}

/**
 * ЗАКРЫТИЕ ПЛАШКИ И РАЗБЛОКИРОВКА РЫБАЛКИ
 */
function closeWood() {
    const modal = document.getElementById('wood-alert');
    if (modal) modal.classList.remove('wood-show');
    
    // Разблокируем процесс рыбалки
    isFishingProcess = false;
    
    const float = document.getElementById('float-img');
    const btn = document.getElementById('cast-btn');
    const status = document.getElementById('status-msg');

    if (btn) btn.disabled = false;
    if (float) { 
        float.style.opacity = '0'; 
        float.classList.remove('anim-cast'); 
    }
    if (status) {
        status.innerText = "ГОТОВ К ЛОВЛЕ";
    }
}

/* ==========================================================================
   [10] ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================================================== */
function toggleInv() { 
    const block = document.getElementById('inv-block');
    if (block) block.classList.toggle('inv-open'); 
}

function toggleCat(id) { 
    const cat = document.getElementById(id);
    if (cat) cat.classList.toggle('open'); 
}

function copyRef() {
    const link = `https://t.me/tamacoin_bot?start=${userId}`;
    navigator.clipboard.writeText(link).then(() => {
        tg.showAlert("Реферальная ссылка скопирована!");
    });
}

/* ==========================================================================
   [11] ЖИЗНЕННЫЙ ЦИКЛ ПРИЛОЖЕНИЯ
   ========================================================================== */
// Инициализация фонового таймера
setInterval(updateTickers, 1000);

// Первичная загрузка данных с сервера
window.onload = function() { 
    doAction('load'); 
};
