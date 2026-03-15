const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const userName = tg.initDataUnsafe?.user?.first_name || 'Рыбак';
const API = 'https://tama-bot-server.onrender.com/api/action';

let cachedData = { 
    b: 0, units: 0, energy: 100, dur: 100, level: 1, xp: 0, fish: 0, buffs: { vip: 0, hope: 0 }, lastBonus: 0, isAdmin: false 
};

let currentTab = 'main'; 
let isSpinning = false; 
let isFishingProcess = false;

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

function renderUI() {
    const d = cachedData;
    const safeUpdate = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    
    safeUpdate('main-balance', Math.floor(d.b).toLocaleString());
    safeUpdate('units-val', d.units || 0);
    safeUpdate('energy', (d.energy || 0) + '%');
    safeUpdate('dur', Math.floor(d.dur || 0) + '%');
    safeUpdate('fish-weight', (d.fish || 0).toFixed(2) + ' кг');
    safeUpdate('lvl-val', d.level || 1);

    const xpTarget = (d.level || 1) * 500;
    const xpFillBar = document.getElementById('xp-fill');
    if (xpFillBar) xpFillBar.style.width = Math.min(((d.xp || 0) / xpTarget) * 100, 100) + '%';

    updateAllTickers();
}

function updateAllTickers() {
    const now = new Date();
    const goldTimerEl = document.getElementById('gold-timer');
    if (goldTimerEl) {
        const mins = now.getMinutes();
        const secs = now.getSeconds();
        if (mins < 10) {
            goldTimerEl.innerText = `АКТИВЕН: ${9 - mins}:${59 - secs < 10 ? '0' : ''}${59 - secs}`;
            goldTimerEl.style.color = "#10b981";
        } else {
            goldTimerEl.innerText = `${59 - mins}:${59 - secs < 10 ? '0' : ''}${59 - secs}`;
            goldTimerEl.style.color = "#ffd700";
        }
    }
}

async function doAction(action, payload = {}) {
    try {
        const response = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action, payload, n: userName })
        });
        const data = await response.json();
        if (data.error) { isFishingProcess = false; return tg.showAlert(data.error); }

        // --- ФИКС ЛОГИКИ ОТОБРАЖЕНИЯ ПЛАШКИ ---
        if (action === 'cast') {
            if (data.catchData) {
                // ПРОВЕРКА НА ТИП (Рыба или Турбо)
                const weightText = data.catchData.w.toString().includes("кг") 
                                   ? data.catchData.w 
                                   : data.catchData.w + " КГ";
                
                showWoodAlert(
                    "НОВЫЙ УЛОВ! 🎣", 
                    data.catchData.type.toUpperCase(), 
                    weightText
                );
            } else {
                showWoodAlert("МИМО... 🌊", "НИКОГО НЕТ", "ПОПРОБУЙ ЕЩЕ");
            }
        }

        if (action === 'sell' && data.msg) {
            showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", data.msg);
        }

        Object.assign(cachedData, data);
        renderUI();
    } catch (e) { isFishingProcess = false; }
}

function showWoodAlert(headStr, titleStr, rewardStr) {
    document.getElementById('wood-header-type').innerText = headStr;
    document.getElementById('wood-title').innerText = titleStr;
    document.getElementById('wood-profit').innerText = rewardStr;
    document.getElementById('wood-alert').classList.add('wood-show');
    tg.HapticFeedback.notificationOccurred('success');
}

function closeWood() {
    document.getElementById('wood-alert').classList.remove('wood-show');
    isFishingProcess = false;
    document.getElementById('cast-btn').disabled = false;
    const floatImg = document.getElementById('float-img');
    if (floatImg) { floatImg.style.opacity = '0'; floatImg.classList.remove('anim-cast'); }
}

function startFishing() {
    if (isFishingProcess) return;
    if (cachedData.energy < 2) return tg.showAlert("Недостаточно энергии!");
    isFishingProcess = true;
    document.getElementById('cast-btn').disabled = true;
    const floatImg = document.getElementById('float-img');
    floatImg.classList.add('anim-cast'); floatImg.style.opacity = '1';
    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(() => { doAction('cast'); }, 400);
}

function showTab(tabName, navEl) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('tab-active');
    if (navEl) navEl.classList.add('active');
    if (tabName === 'fortune') setTimeout(drawWheel, 100);
    tg.HapticFeedback.selectionChanged();
}

function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const radius = canvas.width / 2;
    const arcSize = (Math.PI * 2) / sectors.length;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sectors.forEach((sector, i) => {
        const startAngle = i * arcSize;
        ctx.beginPath(); ctx.fillStyle = sector.color; ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius - 5, startAngle, startAngle + arcSize); ctx.fill();
        ctx.save(); ctx.translate(radius, radius); ctx.rotate(startAngle + arcSize / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(sector.label, radius - 25, 5); ctx.restore();
    });
}

window.onload = () => { doAction('load'); setInterval(updateAllTickers, 1000); };
