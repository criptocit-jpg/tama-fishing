        /* [INITIALIZATION] */
        const tg = window.Telegram.WebApp;
        tg.expand();
        tg.ready();

        const userId = tg.initDataUnsafe?.user?.id || '7883085758';
        const API = 'https://tama-bot-server.onrender.com/api/action';

        function getReferrerIdFromStartParam() {
            const raw = tg.initDataUnsafe?.start_param;
            if (!raw) return null;
            const id = String(raw).trim();
            if (!id || id === String(userId)) return null;
            return id;
        }
        
        let lastBonusTime = 0;
        let userHasHope = false;
        let currentTab = 'main'; 
        let isFishingProcess = false; 
        let isSpinning = false;
        let safetyTimeout = null; 
        let cachedData = null;
        const CACHE_STORAGE_KEY = 'tama-fishing-cache';
        const valueAnimationState = {};

        // [НОВОЕ: КОНФИГ КОЛЕСА]
        const sectors = [
            { label: "ПУСТО", color: "#334155", weight: 0.50, type: "null", val: 0 },
            { label: "100 TC", color: "#1e293b", weight: 0.15, type: "tc", val: 100 },
            { label: "500 TC", color: "#1e293b", weight: 0.05, type: "tc", val: 500 },
            { label: "VIP 1 ДЕНЬ", color: "#d97706", weight: 0.05, type: "vip", val: 1 },
            { label: "1.0 TON", color: "#10b981", weight: 0.02, type: "ton", val: 1 },
            { label: "5.0 TON", color: "#fbbf24", weight: 0.01, type: "ton", val: 5 },
            { label: "РЕМКОМПЛЕКТ", color: "#475569", weight: 0.12, type: "item", val: "repair" },
            { label: "ЭНЕРГЕТИК", color: "#475569", weight: 0.10, type: "item", val: "energy" }
        ];

        /* [RENDER SYSTEM] */
        function saveCacheToLocalStorage() {
            if (!cachedData) return;
            try {
                localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cachedData));
            } catch (e) {
                console.error('LocalStorage save failed:', e);
            }
        }

        function loadCacheFromLocalStorage() {
            try {
                const raw = localStorage.getItem(CACHE_STORAGE_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    cachedData = { ...(cachedData || {}), ...parsed };
                }
            } catch (e) {
                console.error('LocalStorage load failed:', e);
            }
        }

        function syncServerStateSmooth(d) {
            if (!d) return;
            const hasCoreState = d.b !== undefined || d.energy !== undefined || d.units !== undefined;
            if (!hasCoreState) return false;

            const prev = cachedData || {};
            const next = { ...prev, ...d };
            const hasDiff = prev.b !== next.b || prev.units !== next.units || prev.energy !== next.energy;

            if (!hasDiff) {
                cachedData = next;
                saveCacheToLocalStorage();
                return false;
            }

            setTimeout(() => {
                cachedData = next;
                renderFromCache(true);
                saveCacheToLocalStorage();
            }, 120);
            return true;
        }

        function parseDisplayedNumber(element) {
            if (!element) return 0;
            const dsVal = Number(element.dataset.rawValue);
            if (!Number.isNaN(dsVal)) return dsVal;
            const plain = (element.innerText || '').replace(/[^\d.-]/g, '');
            const parsed = Number(plain);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function pulseValue(element) {
            if (!element) return;
            element.classList.remove('value-pulse');
            requestAnimationFrame(() => element.classList.add('value-pulse'));
        }

        function animateValue(elementId, start, end, duration = 380, useLocale = true) {
            const element = document.getElementById(elementId);
            if (!element) return;

            const from = Number(start) || 0;
            const to = Number(end) || 0;
            if (from === to) {
                element.dataset.rawValue = String(Math.floor(to));
                element.innerText = useLocale ? Math.floor(to).toLocaleString() : String(Math.floor(to));
                return;
            }

            const clampedDuration = Math.max(300, Math.min(duration, 500));
            if (valueAnimationState[elementId]) cancelAnimationFrame(valueAnimationState[elementId]);
            pulseValue(element);
            const startTime = performance.now();

            const tick = (now) => {
                const progress = Math.min((now - startTime) / clampedDuration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(from + ((to - from) * eased));
                const displayVal = Math.floor(current);
                element.dataset.rawValue = String(displayVal);
                element.innerText = useLocale ? displayVal.toLocaleString() : String(displayVal);

                if (progress < 1) {
                    valueAnimationState[elementId] = requestAnimationFrame(tick);
                } else {
                    delete valueAnimationState[elementId];
                }
            };

            valueAnimationState[elementId] = requestAnimationFrame(tick);
        }

        function updateAnimatedNumber(elementId, nextValue, animate = true, useLocale = true) {
            if (nextValue === undefined) return;
            const element = document.getElementById(elementId);
            if (!element) return;
            const target = Math.floor(Number(nextValue) || 0);
            const current = parseDisplayedNumber(element);
            if (!animate || current === target) {
                element.dataset.rawValue = String(target);
                element.innerText = useLocale ? target.toLocaleString() : String(target);
                return;
            }
            animateValue(elementId, current, target, 380, useLocale);
        }

        function renderFromCache(animateNumbers = true) {
            if(!cachedData) return;
            const d = cachedData;
            
            updateAnimatedNumber('main-balance', d.b, animateNumbers, true);
            updateAnimatedNumber('units-val', d.units, animateNumbers, true);
            
            if(d.jackpot) {
                const poolVal = Math.floor(d.jackpot.pool || 1000);
                document.getElementById('jackpot-display').innerText = poolVal.toLocaleString() + ' TC';
            } else {
                document.getElementById('jackpot-display').innerText = '1 000 TC';
            }
            
            if(d.energy !== undefined) document.getElementById('energy').innerText = d.energy + '%';
            if(d.dur !== undefined) document.getElementById('dur').innerText = Math.floor(d.dur) + '%';
            if(d.fish !== undefined) document.getElementById('fish-weight').innerText = d.fish.toFixed(2) + ' кг';
            if(d.id) document.getElementById('player-id').innerText = d.id;
            
            const lvl = d.level || 1;
            const xp = d.xp || 0;
            const nextLevelXP = lvl * 500; 
            document.getElementById('lvl-val').innerText = lvl;
            document.getElementById('xp-val').innerText = xp;
            document.getElementById('xp-target').innerText = nextLevelXP;
            document.getElementById('player-lvl-text').innerText = lvl + ' LVL';
            document.getElementById('xp-fill').style.width = Math.min((xp / nextLevelXP) * 100, 100) + '%';

            if(d.isAdmin) document.getElementById('nav-admin-btn').style.display = 'flex';
            checkAdminAccess(d);

            const isVip = (d.buffs?.vip > Date.now());
            document.getElementById('player-status').innerText = isVip ? '👑 VIP АККАУНТ' : 'ОБЫЧНЫЙ';
            document.getElementById('player-status').style.color = isVip ? 'var(--gold)' : 'var(--text-muted)';
            
            userHasHope = (d.buffs?.hope > Date.now());
            document.getElementById('lake-status').innerText = userHasHope ? "📍 ОЗЕРО НАДЕЖДЫ ✅" : "📍 ОБЫЧНОЕ ОЗЕРО";
            
            document.getElementById('ref-link').innerText = `https://t.me/tamacoin_bot?start=${userId}`;
            updateLuckyBoxArea(d);
            
            lastBonusTime = d.lastBonus || 0;
            updateBonusButton();
        }

        function updateLuckyBoxArea(data = cachedData) {
            const area = document.getElementById('lucky-box-area');
            const countEl = document.getElementById('lucky-box-count');
            if (!area || !countEl) return;

            const boxesAvailable = Math.max(0, (data?.verifiedRefs?.length || 0) - (data?.openedBoxes || 0));
            if (boxesAvailable > 0) {
                area.style.display = 'block';
                area.classList.add('shake-premium');
                countEl.innerText = `Доступно: ${boxesAvailable}`;
            } else {
                area.style.display = 'none';
                area.classList.remove('shake-premium');
                countEl.innerText = 'Доступно: 0';
            }
        }

        async function openGoldenLuckyBox() {
            const result = await doAction('open_box');
            if (!result) return;
            tg.showAlert(result.msg || (result.boxReward?.n ? `Ваш приз: ${result.boxReward.n}` : 'Коробка открыта!'));
            updateLuckyBoxArea(result);
        }

        /* [NAVIGATION SYSTEM] */
        function showTab(name, el) {
            currentTab = name; 
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('tab-active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            
            document.getElementById('tab-' + name).classList.add('tab-active');
            el.classList.add('active');
            
            const isMain = (name === 'main');
            const isFortune = (name === 'fortune');
            
            document.getElementById('top-area-wrapper').style.display = isMain ? 'block' : 'none';
            document.getElementById('main-controls').style.display = isMain ? 'block' : 'none';
            document.body.classList.toggle('fortune-open', isFortune);
            
            if(isFortune) setTimeout(drawWheel, 100);
            if(name === 'top') doAction('get_top');
            
            tg.HapticFeedback.selectionChanged();
        }

        function closeFortuneView() {
            const mainNav = document.querySelector('.nav-item[onclick*="showTab(\'main\'"]');
            if (mainNav) showTab('main', mainNav);
            tg.HapticFeedback.selectionChanged();
        }

        function checkAdminAccess(data = cachedData) {
            const btn = document.getElementById('admin-btn');
            if (!btn) return;
            const isAdmin = Boolean(data?.isAdmin);
            btn.style.display = isAdmin ? 'block' : 'none';
        }

        function openAdminGodMode() {
            const modal = document.getElementById('admin-god-modal');
            if (modal) modal.style.display = 'flex';
            tg.HapticFeedback.impactOccurred('medium');
        }

        function closeAdminGodMode() {
            const modal = document.getElementById('admin-god-modal');
            if (modal) modal.style.display = 'none';
            tg.HapticFeedback.selectionChanged();
        }

        async function runAdminGodAction(op) {
            if (op === 'broadcast') {
                const text = window.prompt('Введите текст для рассылки:');
                if (!text || !text.trim()) return;
                await doAction('admin_god_op', { op, text: text.trim() });
            } else {
                await doAction('admin_god_op', { op });
            }
            closeAdminGodMode();
        }

        /* [НОВОЕ: WHEEL ENGINE] */
        function drawWheel() {
            const canvas = document.getElementById('wheel-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const cw = canvas.width;
            const rad = cw / 2;
            const arc = (Math.PI * 2) / sectors.length;

            ctx.clearRect(0, 0, cw, cw);

            sectors.forEach((s, i) => {
                const angle = i * arc;
                ctx.beginPath();
                ctx.fillStyle = s.color;
                ctx.moveTo(rad, rad);
                ctx.arc(rad, rad, rad - 5, angle, angle + arc);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.lineWidth = 2;
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
            if (cur === 'tc' && cachedData.b < 200) return tg.showAlert("Недостаточно TC!");
            if (cur === 'units' && (cachedData.units || 0) < 2) return tg.showAlert("Недостаточно Units!");

            isSpinning = true;
            const btnTc = document.getElementById('spin-btn-tc');
            const btnUn = document.getElementById('spin-btn-units');
            btnTc.disabled = btnUn.disabled = true;

            tg.HapticFeedback.notificationOccurred('warning');

            const rand = Math.random();
            let cumul = 0, winner = 0;
            for (let i = 0; i < sectors.length; i++) {
                cumul += sectors[i].weight;
                if (rand <= cumul) { winner = i; break; }
            }

            const canvas = document.getElementById('wheel-canvas');
            const sectorAngle = 360 / sectors.length;
            const totalRot = (360 * 5) + (360 - (winner * sectorAngle)) - (sectorAngle / 2);

            canvas.style.transform = `rotate(${totalRot}deg)`;

            setTimeout(async () => {
                isSpinning = false;
                const p = sectors[winner];
                await doAction('spin_fortune', { cur, pType: p.type, pVal: p.val, pLabel: p.label });

                if (p.type === 'null') showWoodAlert("ОЙ!", "ПУСТО", "В СЛЕДУЮЩИЙ РАЗ!");
                else showWoodAlert("ВЫИГРЫШ!", p.label, "УЖЕ НА БАЛАНСЕ!");

                btnTc.disabled = btnUn.disabled = false;
                canvas.style.transition = 'none';
                canvas.style.transform = `rotate(${totalRot % 360}deg)`;
                setTimeout(() => canvas.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)', 50);
            }, 4100);
        }

        /* [NETWORK SYSTEM] */
        async function doAction(action, payload = {}) {
            try {
                const response = await fetch(API, { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify({ 
                        userId, 
                        userName: tg.initDataUnsafe?.user?.first_name,
                        action, 
                        payload: { ...payload, lake: userHasHope ? 'hope' : 'normal' } 
                    }) 
                });
                const data = await response.json(); 
                
                if (data.lost || (data.msg && data.msg.includes('сорвалась'))) {
                   setTimeout(() => showWoodAlert("УПС!", "СОРВАЛАСЬ!", "РЫБА УШЛА..."), 1300);
                }
                
                if (action === 'sell' && data.msg && data.msg.includes('Продано')) {
                    const profitMatch = data.msg.match(/\+(\d+)/);
                    showWoodAlert("РЫНОК", "ПРОДАНО!", profitMatch ? `+${profitMatch[1]} TC` : "УСПЕХ");
                }
                
                updateUI(data);
                return data;
            } catch(e) { 
                console.error("API error:", e); 
                return null;
            }
        }

        function updateUI(d) {
            if(!d) return;
            const deferredRender = syncServerStateSmooth(d);
            if (!deferredRender) renderFromCache(true);
            checkAdminAccess(d);
            updateLuckyBoxArea(d);

            if (d.stats?.boxes > 0) {
                const boxBtn = document.getElementById('open-box-btn');
                boxBtn.style.display = 'block';
                boxBtn.innerText = `🎁 КЕЙС (${d.stats.boxes})`;
            } else {
                document.getElementById('open-box-btn').style.display = 'none';
            }

            if(d.catchData && currentTab === 'main') {
                if (!isFishingProcess) showWoodAlert("УЛОВ!", d.catchData.type, d.catchData.w);
                else setTimeout(() => showWoodAlert("УЛОВ!", d.catchData.type, d.catchData.w), 1450);
            }
            
            if(d.boxReward) document.getElementById('prize-text').innerText = d.boxReward.n;
            if(d.topPlayers) renderTop(d.topPlayers);
            if(d.allUsers) document.getElementById('admin-user-list').innerText = JSON.stringify(d.allUsers, null, 2);
        }

        /* [FISHING LOGIC] */
        function startFishing() {
            if (isFishingProcess) return; 
            isFishingProcess = true; 
            const btn = document.getElementById('cast-btn');
            const float = document.getElementById('float-img');
            btn.disabled = true;
            float.classList.add('anim-cast');
            float.style.opacity = '1';
            document.getElementById('status-msg').innerText = "ЗАКИДЫВАЕМ...";
            tg.HapticFeedback.impactOccurred('medium');

            safetyTimeout = setTimeout(() => {
                if (isFishingProcess && document.getElementById('wood-alert').style.display !== 'flex') closeWood();
            }, 5500);

            setTimeout(() => doAction('cast'), 180); 
        }

        function showWoodAlert(header, title, value) {
            if (safetyTimeout) clearTimeout(safetyTimeout);
            document.getElementById('wood-header-type').innerText = header;
            document.getElementById('wood-title').innerText = title;
            document.getElementById('wood-profit').innerText = value;
            document.getElementById('wood-alert').classList.add('wood-show');
            document.getElementById('cast-btn').disabled = true;
            tg.HapticFeedback.notificationOccurred('success');
        }

        function closeWood() {
            document.getElementById('wood-alert').classList.remove('wood-show');
            document.getElementById('cast-btn').disabled = false;
            const float = document.getElementById('float-img');
            float.classList.remove('anim-cast');
            float.style.opacity = '0';
            document.getElementById('status-msg').innerText = "ГОТОВ К ЛОВЛЕ";
            isFishingProcess = false; 
        }

        function renderTop(players) {
            const container = document.getElementById('leaderboard-list');
            if(!players) return;
            container.innerHTML = players.map((p, i) => `
                <div class="leader-item ${p.id == userId ? 'me' : ''}">
                    <span class="rank">#${i+1}</span>
                    <span class="leader-name">${p.username || p.n || 'Рыбак'}</span>
                    <span class="leader-score">${Math.floor(p.units || 0).toLocaleString()} UNITS</span>
                </div>
            `).join('');
        }

        function toggleInv() {
            const block = document.getElementById('inv-block');
            block.classList.toggle('inv-open');
            document.getElementById('inv-arrow').innerText = block.classList.contains('inv-open') ? '▲' : '▼';
            tg.HapticFeedback.selectionChanged();
        }

        function toggleCat(id) {
            document.getElementById(id).classList.toggle('open');
            tg.HapticFeedback.selectionChanged();
        }

        function showBoxModal() { 
            document.getElementById('lucky-box-overlay').style.display = 'flex'; 
            tg.HapticFeedback.impactOccurred('heavy'); 
        }
        
        function animateBoxOpening() {
            document.getElementById('lucky-box-overlay').classList.add('box-open-state');
            doAction('open_box').then(() => { 
                setTimeout(() => document.getElementById('close-box-btn').style.display = 'block', 1100); 
            });
        }
        
        function closeBoxModal() { location.reload(); }

        function requestPay(item, price) {
            document.getElementById('pay-price').innerText = price.toFixed(1);
            document.getElementById('pay-memo').innerText = `FISH_${userId}_${item}`;
            document.getElementById('payment-area').style.display = 'block';
            tg.HapticFeedback.notificationOccurred('warning');
        }

        function copyRef() {
            const link = `https://t.me/tamacoin_bot?start=${userId}`;
            navigator.clipboard.writeText(link).then(() => tg.showAlert("Ссылка скопирована!"));
        }

        function updateBonusButton() {
            const now = Date.now();
            const bonusDiff = (lastBonusTime + 86400000) - now;
            const bBtn = document.getElementById('bonus-btn');
            const bTimer = document.getElementById('bonus-timer');
            if(bonusDiff > 0) {
                bTimer.innerText = new Date(bonusDiff).toISOString().substr(11, 8);
                bBtn.style.display = 'none';
            } else {
                bTimer.innerText = "ГОТОВ!";
                bBtn.style.display = 'block';
            }
        }

        setInterval(() => {
            updateBonusButton();
            const nextHour = (3600000 - (Date.now() % 3600000));
            document.getElementById('gold-timer').innerText = new Date(nextHour).toISOString().substr(11, 8);
        }, 1000);

        loadCacheFromLocalStorage();
        renderFromCache(false);
        doAction('init', { referrerId: getReferrerIdFromStartParam() });
    
