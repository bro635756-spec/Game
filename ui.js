
import * as THREE from 'three';

export class UI {
    constructor() {
        this.loadingScreen = document.getElementById('loading-screen');
        this.startScreen = document.getElementById('start-screen');
        this.pauseScreen = document.getElementById('pause-screen');
        this.victoryScreen = document.getElementById('victory-screen');
        this.centerMessage = document.getElementById('center-message');
        this.crosshair = document.getElementById('crosshair');
        this.mobileControls = document.getElementById('mobile-controls');

        this.playerHealthHud = document.getElementById('player-health-hud');
        this.playerHealthBar = document.getElementById('player-health-bar');
        this.playerHealthText = document.getElementById('player-health-text');
        this.radarContainer = document.getElementById('radar-container');
        this.radarPlayer = document.getElementById('radar-player');
        this.battleInfoHud = document.getElementById('battle-info-hud');
        this.waveInfo = document.getElementById('wave-info');
        this.enemyInfo = document.getElementById('enemy-info');
        this.weaponTypeHud = document.getElementById('weapon-type-hud');
        this.playerHitOverlay = document.getElementById('player-hit-overlay');
        this.damageLayer = document.getElementById('damage-layer');
        this.killFeed = document.getElementById('kill-feed');
        this.ammoHud = document.getElementById('ammo-hud');

        this.isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
        this.loadingTips = [
            'FIELD NOTE: Check cover lanes before the first contact.',
            'FIELD NOTE: Keep moving while firing; static positions get overrun.',
            'FIELD NOTE: Create distance before reloading under pressure.',
            'FIELD NOTE: Later waves hit harder. Enter each push with full armor.'
        ];

        this.buildScreenMarkup();

        this.loaderBar = document.getElementById('loader-bar');
        this.loaderText = document.getElementById('loader-text');
        this.loadingStatus = document.getElementById('loading-status');
        this.loadingTip = document.getElementById('loading-tip');
        this.startBtn = document.getElementById('start-btn');
        this.continueBtn = document.getElementById('continue-btn');
        this.replayBtn = document.getElementById('replay-btn');
        this.instructionPanel = document.getElementById('instruction-panel');

        this.centerMessageTimer = null;
        this.crosshairFlashTimer = null;
        this.shotFeedbackTimer = null;
        this.hitConfirmTimer = null;
        this.playerHitTimer = null;
        this.isPlayerHitBurst = false;
        this.lastWaveText = '';
        this.lastEnemyText = '';
        this.radarDots = [];
        this.radarDotPool = [];
        this.killFeedEntries = [];

        this.setupInstructions();
        this.updateLoadingProgress(0);
        this.hideCombatHUD();
        this.updateCrosshair(1, false);

        if (this.isMobile && this.mobileControls) {
            this.mobileControls.style.display = 'block';
        }
    }

    buildScreenMarkup() {
        if (this.loadingScreen) {
            this.loadingScreen.innerHTML = `
                <div class="ops-shell ops-loading">
                    <div class="ops-scanlines"></div>
                    <div class="ops-panel">
                        <div class="ops-id">Breach System</div>
                        <h2 class="ops-title">Blacksite Breach</h2>
                        <p id="loading-status" class="ops-copy">Initializing map, weapons, HUD, and hostile units...</p>
                        <div class="ops-progress">
                            <div id="loader-bar" class="loader-bar"></div>
                        </div>
                        <div class="ops-readout">
                            <span id="loader-text" class="loader-text">0%</span>
                            <span>Render chain armed</span>
                        </div>
                        <div id="loading-tip" class="ops-warning">${this.loadingTips[0]}</div>
                    </div>
                    <div class="ops-visual">
                        <div class="ops-sector">SECTOR 07</div>
                        <div class="ops-bigmark">BREACH</div>
                        <div class="ops-telemetry">
                            <span>MAP LINK</span>
                            <span>DOUGLAS HOSTILES</span>
                            <span>RIFLE PROTOCOL</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this.startScreen) {
            this.startScreen.innerHTML = `
                <div class="ops-shell">
                    <div class="ops-scanlines"></div>
                    <div class="ops-panel">
                        <div class="ops-id">Operation / Live Entry</div>
                        <h1 class="ops-title">Blacksite Breach</h1>
                        <p class="ops-copy">Sweep the sealed facility, neutralize rifle teams, survive two reinforcement waves, then eliminate the field commander.</p>
                        <div class="ops-metrics">
                            <div class="ops-metric">
                                <span>Mode</span>
                                <strong>FPS Assault</strong>
                            </div>
                            <div class="ops-metric">
                                <span>Objective</span>
                                <strong>3 Waves</strong>
                            </div>
                            <div class="ops-metric">
                                <span>Doctrine</span>
                                <strong>Move / Fire</strong>
                            </div>
                        </div>
                        <div class="ops-actions">
                            <button id="start-btn" class="ops-btn start-btn">Begin Breach</button>
                            <span class="ops-hint">Click to lock mouse. Press ESC to pause.</span>
                        </div>
                        <div class="ops-section">
                            <div class="ops-section-title">Combat Controls</div>
                            <div id="instruction-panel" class="ops-checklist"></div>
                        </div>
                    </div>
                    <div class="ops-visual">
                        <div class="ops-sector">HOSTILE GRID</div>
                        <div class="ops-bigmark">CLEAR</div>
                        <div class="ops-telemetry">
                            <span>AK PRIMARY</span>
                            <span>ARMOR 300</span>
                            <span>RADAR ONLINE</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this.pauseScreen) {
            this.pauseScreen.innerHTML = `
                <div class="ops-shell ops-right ops-pause">
                    <div class="ops-scanlines"></div>
                    <div class="ops-visual">
                        <div class="ops-sector">TIME HOLD</div>
                        <div class="ops-bigmark">PAUSE</div>
                        <div class="ops-telemetry">
                            <span>INPUT SAFE</span>
                            <span>HOSTILES HELD</span>
                            <span>RESUME READY</span>
                        </div>
                    </div>
                    <div class="ops-panel">
                        <div class="ops-id">Tactical Hold</div>
                        <h1 class="ops-title">Operation Paused</h1>
                        <p class="ops-copy">Combat time is frozen. Check armor, ammo, and next sightline before returning to the sweep.</p>
                        <div class="ops-metrics">
                            <div class="ops-metric">
                                <span>Status</span>
                                <strong>Standby</strong>
                            </div>
                            <div class="ops-metric">
                                <span>Priority</span>
                                <strong>Reload</strong>
                            </div>
                            <div class="ops-metric">
                                <span>Key</span>
                                <strong>ESC</strong>
                            </div>
                        </div>
                        <div class="ops-actions">
                            <button id="continue-btn" class="ops-btn continue-btn">Resume Mission</button>
                        </div>
                        <div class="ops-section">
                            <div class="ops-section-title">Pause Checklist</div>
                            <div class="ops-checklist">
                                <div class="ops-item">
                                    <strong>Threat Scan</strong>
                                    Read the radar and edge lanes before you release the hold.
                                </div>
                                <div class="ops-item">
                                    <strong>Reset Tempo</strong>
                                    If the last exchange was heavy, find cover and reload before pushing.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this.victoryScreen) {
            this.victoryScreen.innerHTML = `
                <div class="ops-shell ops-right ops-clear">
                    <div class="ops-scanlines"></div>
                    <div class="ops-visual">
                        <div class="ops-sector">AFTERMATH</div>
                        <div class="ops-bigmark">SECURE</div>
                        <div class="ops-telemetry">
                            <span>WAVES CLEAR</span>
                            <span>COMMANDER DOWN</span>
                            <span>REDEPLOY OPEN</span>
                        </div>
                    </div>
                    <div class="ops-panel">
                        <div class="ops-id">Mission Result</div>
                        <h1 class="ops-title">Sector Secured</h1>
                        <p class="ops-copy">All hostile waves are neutralized. Redeploy to chase a faster, cleaner breach.</p>
                        <div class="ops-actions">
                            <button id="replay-btn" class="ops-btn replay-btn">Redeploy</button>
                        </div>
                        <div class="ops-section">
                            <div class="ops-section-title">Blacksite Status</div>
                            <div class="ops-checklist">
                                <div class="ops-item">
                                    <strong>Hostile Force</strong>
                                    Rifle teams and command element eliminated.
                                </div>
                                <div class="ops-item">
                                    <strong>Next Run</strong>
                                    Push harder, reload cleaner, clear faster.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

    }

    setupInstructions() {
        if (!this.instructionPanel) return;
        if (this.isMobile) {
            this.instructionPanel.innerHTML = `
                <div class="ops-item">
                    <strong>Left Stick</strong>
                    Move, strafe, and keep space from rifle units.
                </div>
                <div class="ops-item">
                    <strong>Look Stick</strong>
                    Sweep the camera and identify incoming threats.
                </div>
                <div class="ops-item">
                    <strong>Action Cluster</strong>
                    Fire, reload, swap weapons, and jump from the right side.
                </div>
                <div class="ops-item">
                    <strong>Jump</strong>
                    Use the lower-right control to clear obstacles or break pressure.
                </div>
            `;
        } else {
            this.instructionPanel.innerHTML = `
                <div class="ops-item">
                    <strong>Movement</strong>
                    Use WASD or arrow keys to push, fall back, and strafe.
                </div>
                <div class="ops-item">
                    <strong>Fire Control</strong>
                    Mouse controls view. Hold left mouse to suppress rifle enemies.
                </div>
                <div class="ops-item">
                    <strong>Weapon Work</strong>
                    Press R to reload, E to swap weapons, and Space to jump.
                </div>
                <div class="ops-item">
                    <strong>Tempo</strong>
                    Press ESC to pause. Reposition before reloads when reinforcements close in.
                </div>
            `;
        }
    }

    updateLoadingProgress(percent) {
        const clamped = THREE.MathUtils.clamp(percent || 0, 0, 100);
        if (this.loaderBar) this.loaderBar.style.width = `${clamped}%`;
        if (this.loaderText) this.loaderText.innerText = `${Math.floor(clamped)}%`;
        if (this.loadingStatus) {
            let status = 'Initializing map, weapons, HUD, and hostile units...';
            if (clamped >= 25) status = 'Syncing blacksite geometry and collision surfaces...';
            if (clamped >= 55) status = 'Calibrating rifle animations, radar, and hit feedback...';
            if (clamped >= 85) status = 'Arming the breach route and compiling the scene...';
            if (clamped >= 100) status = 'Deployment ready. Awaiting breach order.';
            this.loadingStatus.innerText = status;
        }
        if (this.loadingTip) {
            const tipIndex = Math.min(this.loadingTips.length - 1, Math.floor(clamped / 25));
            this.loadingTip.innerText = this.loadingTips[tipIndex];
        }
        if (clamped >= 100) {
            setTimeout(() => {
                this.loadingScreen?.classList.add('hidden');
                this.startScreen?.classList.remove('hidden');
                this.hideCombatHUD();
            }, 500);
        }
    }

    onStart(callback) {
        this.startBtn?.addEventListener('click', async () => {
            await callback();
            this.showGameUI();
        });
    }

    onContinue(callback) {
        this.continueBtn?.addEventListener('click', async () => {
            await callback();
        });
    }

    onReplay(callback) {
        this.replayBtn?.addEventListener('click', async () => {
            await callback();
        });
    }

    showGameUI() {
        this.startScreen?.classList.add('hidden');
        this.pauseScreen?.classList.add('hidden');
        this.victoryScreen?.classList.add('hidden');
        this.showCombatHUD();
    }

    showPauseMenu() {
        this.pauseScreen?.classList.remove('hidden');
        if (!this.isMobile) this.crosshair?.classList.add('hidden');
    }

    hidePauseMenu() {
        this.pauseScreen?.classList.add('hidden');
        if (!this.isMobile) this.crosshair?.classList.remove('hidden');
    }

    showVictoryMenu() {
        this.victoryScreen?.classList.remove('hidden');
        this.hideCombatHUD();
        this.crosshair?.classList.add('hidden');
    }

    hideVictoryMenu() {
        this.victoryScreen?.classList.add('hidden');
    }

    showCombatHUD() {
        this.battleInfoHud?.classList.remove('hidden');
        this.weaponTypeHud?.classList.remove('hidden');
        this.playerHealthHud?.classList.remove('hidden');
        this.radarContainer?.classList.remove('hidden');
        this.killFeed?.classList.remove('hidden');
        this.ammoHud?.classList.remove('hidden');
        if (!this.isMobile) this.crosshair?.classList.remove('hidden');
    }

    hideCombatHUD() {
        this.battleInfoHud?.classList.add('hidden');
        this.weaponTypeHud?.classList.add('hidden');
        this.playerHealthHud?.classList.add('hidden');
        this.radarContainer?.classList.add('hidden');
        this.killFeed?.classList.add('hidden');
        this.ammoHud?.classList.add('hidden');
        this.crosshair?.classList.add('hidden');
        this.hideCenterMessage();
    }

    showCenterMessage(text, duration = 0) {
        if (!this.centerMessage) return;
        if (this.centerMessageTimer) clearTimeout(this.centerMessageTimer);
        this.centerMessage.innerText = text || '';
        this.centerMessage.classList.remove('hidden');
        if (duration > 0) {
            this.centerMessageTimer = setTimeout(() => this.hideCenterMessage(), duration);
        }
    }

    hideCenterMessage() {
        if (!this.centerMessage) return;
        if (this.centerMessageTimer) clearTimeout(this.centerMessageTimer);
        this.centerMessageTimer = null;
        this.centerMessage.classList.add('hidden');
    }

    updateBattleInfo(wave, enemiesRemaining) {
        if (!this.waveInfo || !this.enemyInfo) return;
        const waveText = `WAVE ${Math.max(1, wave || 1)}`;
        const enemyText = `HOSTILES ${Math.max(0, enemiesRemaining | 0)}`;
        if (waveText !== this.lastWaveText) {
            this.waveInfo.innerText = waveText;
            this.lastWaveText = waveText;
        }
        if (enemyText !== this.lastEnemyText) {
            this.enemyInfo.innerText = enemyText;
            this.lastEnemyText = enemyText;
        }
    }

    setWeaponType(weaponName) {
        if (!this.weaponTypeHud) return;
        this.weaponTypeHud.innerText = `LOADOUT: ${weaponName || '-'}`;
        this.weaponTypeHud.classList.remove('hidden');
    }

    updateCrosshair(spreadScale = 1, isADS = false) {
        if (!this.crosshair) return;
        const clampedSpread = THREE.MathUtils.clamp(spreadScale, 0, 2.8);
        const gap = Math.round(6 + clampedSpread * 10);
        const scale = (isADS ? 0.74 : 1) + clampedSpread * 0.018;
        this.crosshair.style.setProperty('--gap', `${gap}px`);
        this.crosshair.style.setProperty('--scale', `${scale}`);
        this.crosshair.style.opacity = isADS ? '0.94' : '1';
        this.crosshair.style.filter = `drop-shadow(0 0 ${6 + clampedSpread * 3}px rgba(255,255,255,${0.15 + clampedSpread * 0.06}))`;
    }

    addKillFeed(text) {
        if (!this.killFeed) return;
        const el = document.createElement('div');
        el.className = 'kill-feed-item';
        el.innerText = text;
        this.killFeed.prepend(el);
        this.killFeedEntries.unshift(el);
        while (this.killFeedEntries.length > 5) {
            const stale = this.killFeedEntries.pop();
            stale?.remove();
        }
        setTimeout(() => {
            const idx = this.killFeedEntries.indexOf(el);
            if (idx >= 0) this.killFeedEntries.splice(idx, 1);
            el.remove();
        }, 3800);
    }

    pulseShotFeedback(options = {}) {
        if (!this.crosshair || this.isMobile) return;
        const power = THREE.MathUtils.clamp(options.power ?? 1, 0.55, 1.4);
        const hue = options.weaponId === 'sniper' ? 'rgba(150, 245, 255, 0.9)' : 'rgba(255, 210, 140, 0.95)';
        this.crosshair.style.transition = 'transform 42ms ease-out, opacity 70ms ease-out, filter 70ms ease-out';
        this.crosshair.style.transform = `translate(-50%, -50%) scale(${1 + 0.26 * power}) rotate(${(Math.random() - 0.5) * 6 * power}deg)`;
        this.crosshair.style.filter = `drop-shadow(0 0 ${18 + 14 * power}px ${hue}) brightness(${1.34 + power * 0.24})`;
        this.crosshair.style.opacity = options.ads ? '1' : '0.99';
        if (this.shotFeedbackTimer) clearTimeout(this.shotFeedbackTimer);
        this.shotFeedbackTimer = setTimeout(() => {
            this.crosshair.style.transform = 'translate(-50%, -50%) scale(var(--scale))';
            this.crosshair.style.filter = '';
            this.crosshair.style.transition = 'transform 120ms ease, opacity 120ms ease';
            this.shotFeedbackTimer = null;
        }, options.weaponId === 'sniper' ? 105 : 62);
    }

    showHitConfirm(hitResult = {}) {
        if (!this.crosshair || this.isMobile) return;
        const intensity = hitResult.headshot ? 1.2 : (hitResult.critical ? 1.05 : 0.92);
        this.crosshair.style.transform = `translate(-50%, -50%) scale(${1 + 0.3 * intensity}) rotate(${hitResult.headshot ? 13 : 6}deg)`;
        this.crosshair.style.filter = `drop-shadow(0 0 ${18 + 11 * intensity}px ${hitResult.headshot ? 'rgba(255,90,90,0.98)' : (hitResult.critical ? 'rgba(255,224,102,0.96)' : 'rgba(125,255,125,0.92)')}) brightness(${1.22 + intensity * 0.18})`;
        if (this.hitConfirmTimer) clearTimeout(this.hitConfirmTimer);
        this.hitConfirmTimer = setTimeout(() => {
            this.crosshair.style.transform = 'translate(-50%, -50%) scale(var(--scale))';
            this.crosshair.style.filter = '';
            this.hitConfirmTimer = null;
        }, hitResult.headshot ? 130 : 90);
    }

    showPlayerHitEffect(amount = 5, currentHealth = 100, maxHealth = 100) {
        if (!this.playerHitOverlay) return;
        const hpRate = maxHealth > 0 ? Math.max(0, Math.min(1, currentHealth / maxHealth)) : 1;
        let intensity = THREE.MathUtils.clamp(0.15 + amount * 0.012, 0.15, 0.62);
        if (hpRate < 0.35) intensity = Math.min(0.72, intensity + 0.14);
        this.isPlayerHitBurst = true;
        this.playerHitOverlay.style.opacity = `${intensity.toFixed(3)}`;
        this.playerHitOverlay.classList.toggle('lowhp', hpRate < 0.3);
        this.playerHitOverlay.classList.toggle('critical', hpRate < 0.15);
        if (this.playerHitTimer) clearTimeout(this.playerHitTimer);
        this.playerHitTimer = setTimeout(() => {
            this.isPlayerHitBurst = false;
            const baseOpacity = hpRate < 0.3 ? 0.12 : 0;
            this.playerHitOverlay.style.opacity = `${baseOpacity}`;
        }, 130);
    }

    showDamageNumber(value, worldPos, camera, options = {}) {
        if (!this.damageLayer) return;
        let x = window.innerWidth * 0.5;
        let y = window.innerHeight * 0.5;
        if (worldPos && camera) {
            const projected = worldPos.clone().project(camera);
            if (Number.isFinite(projected.x) && Number.isFinite(projected.y) && projected.z > -1 && projected.z < 1) {
                x = (projected.x * 0.5 + 0.5) * window.innerWidth;
                y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
            }
        }
        const spreadX = options.headshot ? 10 : 18;
        const spreadY = options.headshot ? 6 : 10;
        x += (Math.random() - 0.5) * spreadX;
        y += (Math.random() - 0.5) * spreadY - (options.headshot ? 8 : 0);
        const numberEl = document.createElement('div');
        numberEl.className = 'damage-number';
        numberEl.setAttribute('translate', 'no');
        if (options.headshot) numberEl.classList.add('headshot');
        if (options.critical) numberEl.classList.add('critical');
        if (options.killed) numberEl.classList.add('killed');
        const damageValue = Math.max(1, Math.round(value || 0));
        const prefix = options.headshot ? 'HEADSHOT ' : (options.critical ? 'CRITICAL ' : 'HIT ');
        numberEl.innerText = `${prefix}${damageValue}`;
        numberEl.style.left = `${x}px`;
        numberEl.style.top = `${y}px`;
        numberEl.style.letterSpacing = '0';
        numberEl.style.transform = `translate(-50%, -50%) scale(${options.headshot ? 1.24 : (options.critical ? 1.14 : 1)}) rotate(${(Math.random() - 0.5) * (options.headshot ? 6 : 4)}deg)`;
        numberEl.style.filter = options.headshot
            ? 'drop-shadow(0 0 14px rgba(255,70,70,0.95))'
            : (options.critical ? 'drop-shadow(0 0 12px rgba(255,225,120,0.92))' : 'drop-shadow(0 0 10px rgba(255,175,70,0.72))');
        this.damageLayer.appendChild(numberEl);
        const remove = () => numberEl.remove();
        numberEl.addEventListener('animationend', remove, { once: true });
        setTimeout(remove, options.headshot ? 1050 : 920);
    }

    flashCrosshair(type = 'hit') {
        if (!this.crosshair || this.isMobile) return;
        this.crosshair.classList.remove('hit', 'critical', 'headshot');
        const className = type === 'headshot' ? 'headshot' : (type === 'critical' ? 'critical' : 'hit');
        this.crosshair.classList.add(className);
        const flashScale = type === 'headshot' ? 1.34 : (type === 'critical' ? 1.22 : 1.14);
        this.crosshair.style.transform = `translate(-50%, -50%) scale(${flashScale})`;
        if (this.crosshairFlashTimer) clearTimeout(this.crosshairFlashTimer);
        this.crosshairFlashTimer = setTimeout(() => {
            this.crosshair?.classList.remove('hit', 'critical', 'headshot');
            if (this.crosshair) this.crosshair.style.transform = 'translate(-50%, -50%) scale(var(--scale))';
            this.crosshairFlashTimer = null;
        }, type === 'headshot' ? 150 : 115);
    }

    updatePlayerHealth(current, max) {
        if (!this.playerHealthBar || !this.playerHealthText) return;
        const safeMax = Math.max(1, max || 1);
        const percent = THREE.MathUtils.clamp((current / safeMax) * 100, 0, 100);
        this.playerHealthBar.style.width = `${percent}%`;
        this.playerHealthText.innerText = `ARMOR ${Math.ceil(current)} / ${safeMax}`;
        if (this.playerHitOverlay) {
            this.playerHitOverlay.classList.toggle('lowhp', percent < 30);
            this.playerHitOverlay.classList.toggle('critical', percent < 15);
            if (!this.isPlayerHitBurst) this.playerHitOverlay.style.opacity = percent < 30 ? '0.12' : '0';
        }
        this.playerHealthBar.style.background = percent < 30
            ? 'linear-gradient(90deg, #ff0000, #cc0000)'
            : 'linear-gradient(90deg, #ff4d4d, #ff0000)';
    }

    updateRadar(playerRotation, playerPos, enemies) {
        if (!this.radarContainer || !this.radarPlayer) return;
        this.radarPlayer.style.transform = `translate(-50%, -50%) rotate(${-THREE.MathUtils.radToDeg(playerRotation)}deg)`;
        const radarSize = 75;
        const maxRange = 250;
        let activeCount = 0;
        enemies.forEach(enemy => {
            if (!enemy || enemy.state === 'dead' || !enemy.mesh?.position) return;
            const dx = enemy.mesh.position.x - playerPos.x;
            const dz = enemy.mesh.position.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            let dot = this.radarDotPool[activeCount];
            if (!dot) {
                dot = document.createElement('div');
                dot.className = 'radar-dot';
                this.radarContainer.appendChild(dot);
                this.radarDotPool.push(dot);
            }
            const clampedDist = Math.min(distance, maxRange);
            const ratio = distance > 0.0001 ? clampedDist / distance : 0;
            const x = (dx * ratio / maxRange) * radarSize + radarSize;
            const y = (dz * ratio / maxRange) * radarSize + radarSize;
            dot.style.display = 'block';
            dot.style.left = `${x}px`;
            dot.style.top = `${y}px`;
            dot.style.opacity = distance > maxRange ? '0.65' : '1';
            activeCount++;
        });
        for (let i = activeCount; i < this.radarDotPool.length; i++) {
            this.radarDotPool[i].style.display = 'none';
        }
    }
}
