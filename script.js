const tg = window.Telegram.WebApp;
tg.expand();

let cachedData = { b: 0, units: 0, energy: 100, dur: 100, level: 1, xp: 0 };
let isFishingProcess = false;
let isSpinning = false;

// [1] ПЕРЕКЛЮЧЕНИЕ ТАБОВ
function showTab(name, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById('tab-' + name).classList.add('tab-active');
    el.classList.add('active');

    // Скрываем/показываем окно рыбалки
    const topArea = document.getElementById('top-area-wrapper');
    const mainControls = document.getElementById('main-controls');

    if (name === 'main') {
        topArea.style.display = 'block';
        mainControls.style.display = 'block';
    } else {
        topArea.style.display = 'none'; // Скрываем рыбу во всех остальных окнах!
        mainControls.style.display = 'none';
    }

    if (name === 'fortune') {
        setTimeout(drawWheel, 100);
    }
    tg.HapticFeedback.selectionChanged();
}

// [2] КОЛЕСО ФОРТУНЫ
const sectors = [
    { label: "ПУСТО", color: "#334155", type: "null" },
    { label: "500 TC", color: "#1e293b", type: "tc", val: 500 },
    { label: "1000 TC", color: "#d97706", type: "tc", val: 1000 },
    { label: "ЭНЕРГИЯ", color: "#10b981", type: "item" },
    { label: "ПУСТО", color: "#334155", type: "null" },
    { label: "JACKPOT", color: "#fbbf24", type: "jp" }
];

function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rad = canvas.width / 2;
    const arc = (Math.PI * 2) / sectors.length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sectors.forEach((s, i) => {
        ctx.beginPath();
        ctx.fillStyle = s.color;
        ctx.moveTo(rad, rad);
        ctx.arc(rad, rad, rad, i * arc, (i + 1) * arc);
        ctx.fill();
        ctx.save();
        ctx.translate(rad, rad);
        ctx.rotate(i * arc + arc / 2);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(s.label, rad - 60, 5);
        ctx.restore();
    });
}

function handleSpin(type) {
    if (isSpinning) return;
    isSpinning = true;
    const canvas = document.getElementById('wheel-canvas');
    const deg = 3600 + Math.random() * 360;
    canvas.style.transform = `rotate(${deg}deg)`;
    
    tg.HapticFeedback.notificationOccurred('warning');

    setTimeout(() => {
        isSpinning = false;
        showWoodAlert("КОЛЕСО", "РЕЗУЛЬТАТ", "ОБРАБОТКА...");
        tg.HapticFeedback.notificationOccurred('success');
    }, 4000);
}

// [3] РЫБАЛКА
function startFishing() {
    if (isFishingProcess) return;
    isFishingProcess = true;
    
    const float = document.getElementById('float-img');
    const btn = document.getElementById('cast-btn');
    
    btn.disabled = true;
    float.classList.add('anim-cast');
    float.style.opacity = '1';
    
    tg.HapticFeedback.impactOccurred('medium');

    setTimeout(() => {
        isFishingProcess = false;
        btn.disabled = false;
        float.classList.remove('anim-cast');
        float.style.opacity = '0';
        showWoodAlert("УЛОВ!", "КАРАСЬ", "1.25 кг");
    }, 2000);
}

// [4] ВСПОМОГАТЕЛЬНЫЕ
function showWoodAlert(h, t, v) {
    document.getElementById('wood-header-type').innerText = h;
    document.getElementById('wood-title').innerText = t;
    document.getElementById('wood-profit').innerText = v;
    document.getElementById('wood-alert').classList.add('wood-show');
}

function closeWood() {
    document.getElementById('wood-alert').classList.remove('wood-show');
}

window.onload = () => {
    drawWheel();
};
