const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe?.user?.id || '7883085758';
const userName = tg.initDataUnsafe?.user?.first_name || 'Рыбак';
const API = 'https://tama-bot-server.onrender.com/api/action';

let cachedData = { 
    b: 0, units: 0, energy: 100, dur: 100, level: 1, xp: 0, fish: 0, 
    buffs: { vip: 0, hope: 0, titan: 0, bait: 0, myakish: 0 }, lastBonus: 0, isAdmin: false 
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
    safeUpdate('player-lvl-text', (d.level || 1) + ' LVL');
    safeUpdate('player-id', d.id || userId); 
    
    const rl = document.getElementById('ref-link');
    if (rl) rl.innerText = `https://t.me/tamacoin_bot?start=${userId}`;

    const now = Date.now();
    safeUpdate('player-status', (now < (d.buffs?.vip || 0)) ? "👑 VIP СТАТУС" : "ОБЫЧНЫЙ");

    const xpFill = document.getElementById('xp-fill');
    if (xpFill) {
        const target = (d.level || 1) * 500;
        xpFill.style.width = Math.min(((d.xp || 0) / target) * 100, 100) + '%';
    }
    
    const adminBtn = document.getElementById('nav-admin-btn');
    if (adminBtn) adminBtn.style.display = d.isAdmin ? 'flex' : 'none';

    updateAllTickers();
}

function updateAllTickers() {
    const now = new Date();
    const gt = document.getElementById('gold-timer');
    if (gt) {
        const m = now.getMinutes(); const s = now.getSeconds();
        if (m < 10) {
            gt.innerText = `АКТИВЕН: ${9 - m}:${59 - s < 10 ? '0' : ''}${59 - s}`;
            gt.style.color = "#10b981";
        } else {
            gt.innerText = `${59 - m}:${59 - s < 10 ? '0' : ''}${59 - s}`;
            gt.style.color = "#ffd700";
        }
    }
    const bt = document.getElementById('bonus-timer');
    const bb = document.getElementById('bonus-btn');
    if (bt) {
        const diff = (cachedData.lastBonus || 0) + 86400000 - Date.now();
        if (diff <= 0) {
            bt.innerText = "ГОТОВ!"; if (bb) bb.style.display = 'block';
        } else {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            bt.innerText = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
            if (bb) bb.style.display = 'none';
        }
    }
}

async function doAction(action, payload = {}) {
    try {
        const response = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action, payload, userName })
        });
        const data = await response.json();
        if (data.error) { isFishingProcess = false; return tg.showAlert(data.error); }

        // --- ТОТ САМЫЙ ФИКС ПЛАШКИ ---
        if (action === 'cast') {
            if (data.catchData) {
                const w = data.catchData.w.toString();
                showWoodAlert("НОВЫЙ УЛОВ! 🎣", data.catchData.type.toUpperCase(), w.includes("кг") ? w : w + " КГ");
            } else {
                showWoodAlert("МИМО... 🌊", "НИКОГО НЕТ", "ПОПРОБУЙ ЕЩЕ");
            }
        }

        if (action === 'sell' && data.msg) showWoodAlert("РЫНОК", "УЛОВ ПРОДАН!", data.msg);

        Object.assign(cachedData, data);
        renderUI();
    } catch (e) { isFishingProcess = false; }
}

function showWoodAlert(h, t, r) {
    document.getElementById('wood-header-type').innerText = h;
    document.getElementById('wood-title').innerText = t;
    document.getElementById('wood-profit').innerText = r;
    document.getElementById('wood-alert').classList.add('wood-show');
    tg.HapticFeedback.notificationOccurred('success');
}

function closeWood() {
    document.getElementById('wood-alert').classList.remove('wood-show');
    isFishingProcess = false;
    document.getElementById('cast-btn').disabled = false;
    const img = document.getElementById('float-img');
    if (img) { img.style.opacity = '0'; img.classList.remove('anim-cast'); }
    document.getElementById('status-msg').innerText = "ГОТОВ К ЛОВЛЕ";
}

function startFishing() {
    if (isFishingProcess) return;
    if (cachedData.energy < 2) return tg.showAlert("Недостаточно энергии!");
    isFishingProcess = true;
    document.getElementById('cast-btn').disabled = true;
    const img = document.getElementById('float-img');
    img.classList.add('anim-cast'); img.style.opacity = '1';
    document.getElementById('status-msg').innerText = "ЗАКИДЫВАЕМ...";
    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(() => { doAction('cast'); }, 400);
}

// --- АВТОПЛАТЕЖ (ПЕРСОНАЛЬНЫЙ ФИКС) ---
function requestPay(itemId, price) {
    const area = document.getElementById('payment-area');
    document.getElementById('pay-price').innerText = price.toFixed(1);
    document.getElementById('pay-memo').innerText = `FISH_${userId}_${itemId}`;
    area.style.display = 'block';
    area.scrollIntoView({ behavior: 'smooth' });
}

function showTab(tab, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('tab-active');
    if (el) el.classList.add('active');

    const tw = document.getElementById('top-area-wrapper');
    const mc = document.getElementById('main-controls');
    if (tab === 'main') {
        tw.style.display = 'block'; mc.style.display = 'block';
    } else {
        tw.style.display = 'none'; mc.style.display = 'none';
        if (tab === 'fortune') setTimeout(drawWheel, 100);
        if (tab === 'admin') renderAdminGodMode();
    }
}

function renderAdminGodMode() {
    const slot = document.getElementById('admin-user-list');
    if (!slot) return;
    slot.innerHTML = `
        <div style="background:#1e293b; padding:18px; border-radius:18px; border:2px solid #ef4444; margin-bottom:18px;">
            <h4 style="color:#ef4444; text-align:center;">⚡ GOD MODE ⚡</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <button onclick="doAction('admin_user_op',{targetId:'${userId}',op:'add_money',val:10000})">+10k TC</button>
                <button onclick="doAction('admin_user_op',{targetId:'${userId}',op:'add_nf',val:50})">+50 NF</button>
            </div>
        </div>
        <button class="btn-cast" onclick="doAction('admin_get_all')">USERS DB</button>
        <div id="raw-admin-data" style="font-size:10px; color:#64748b; margin-top:10px; max-height:150px; overflow:auto;"></div>
    `;
}

function drawWheel() {
    const cv = document.getElementById('wheel-canvas');
    const ctx = cv.getContext('2d');
    const r = cv.width / 2; const a = (Math.PI * 2) / sectors.length;
    ctx.clearRect(0, 0, cv.width, cv.height);
    sectors.forEach((s, i) => {
        ctx.beginPath(); ctx.fillStyle = s.color; ctx.moveTo(r, r);
        ctx.arc(r, r, r - 5, i * a, (i + 1) * a); ctx.fill();
        ctx.save(); ctx.translate(r, r); ctx.rotate(i * a + a / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(s.label, r - 25, 5); ctx.restore();
    });
}

function toggleInv() { document.getElementById('inv-block').classList.toggle('inv-open'); }
function toggleCat(id) { document.getElementById(id).classList.toggle('open'); }

window.onload = () => { doAction('load'); setInterval(updateAllTickers, 1000); };
