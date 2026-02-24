
// You can write more code here

/* START OF COMPILED CODE */

export default class UIScene extends Phaser.Scene {

    constructor() {
        super("UIScene");

        /* START-USER-CTR-CODE */
        // Write your code here.
        /* END-USER-CTR-CODE */
    }

    editorCreate(): void {

        // Design your UI here via code or use the editor if available.
        // For now, I will implement basic text objects in create()
        this.events.emit("scene-awake");
    }

    /* START-USER-CODE */

    /* START-USER-CODE */
    private scoreDiv!: HTMLElement | null;
    private moneyDiv!: HTMLElement | null;
    private levelDiv!: HTMLElement | null;
    private damageBtn!: HTMLElement | null;
    private ballsBtn!: HTMLElement | null;
    private orbitBtn!: HTMLElement | null;
    private laserBtn!: HTMLElement | null;
    private electricBtn!: HTMLElement | null;
    private bombBtn!: HTMLElement | null;
    private burstBtn!: HTMLElement | null;

    // Settings UI
    private btnSettings!: HTMLElement | null;
    private modalSettings!: HTMLElement | null;
    private btnCloseSettings!: HTMLElement | null;
    private toggleMusic!: HTMLInputElement | null;
    private toggleFX!: HTMLInputElement | null;
    private toggleHaptics!: HTMLInputElement | null;

    // Game Over UI
    private modalGameOver!: HTMLElement | null;
    private finalScoreText!: HTMLElement | null;
    private btnRestart!: HTMLElement | null;

    create() {

        this.editorCreate();

        // Get HTML Elements
        this.scoreDiv = document.getElementById('hud-score');
        this.moneyDiv = document.getElementById('hud-money');
        this.levelDiv = document.getElementById('hud-level');
        this.damageBtn = document.getElementById('btn-damage');
        this.ballsBtn = document.getElementById('btn-balls');
        this.orbitBtn = document.getElementById('btn-orbit');
        this.laserBtn = document.getElementById('btn-laser');
        this.electricBtn = document.getElementById('btn-electric');
        this.bombBtn = document.getElementById('btn-bomb');

        // Settings Elements
        this.btnSettings = document.getElementById('btn-settings');
        this.modalSettings = document.getElementById('modal-settings');
        this.btnCloseSettings = document.getElementById('btn-close-settings');
        this.toggleMusic = document.getElementById('toggle-music') as HTMLInputElement;
        this.toggleFX = document.getElementById('toggle-fx') as HTMLInputElement;
        this.toggleHaptics = document.getElementById('toggle-haptics') as HTMLInputElement;

        // Game Over Elements
        this.modalGameOver = document.getElementById('modal-gameover');
        this.finalScoreText = document.getElementById('final-score');
        this.btnRestart = document.getElementById('btn-restart');

        // Listen for events from the Game Scene
        const gameScene = this.scene.get('Scene');
        gameScene.events.emit('request-shop-update');

        // Setup Buttons - use click for reliable input that doesn't block scrolling
        const bindBtn = (btn: HTMLElement | null, type: string) => {
            if (!btn) return;
            let startX = 0;
            let startY = 0;
            btn.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
            }, { passive: true });
            btn.addEventListener('touchend', (e) => {
                const touch = e.changedTouches[0];
                const dx = Math.abs(touch.clientX - startX);
                const dy = Math.abs(touch.clientY - startY);
                // Only trigger if it was a tap (not a swipe)
                if (dx < 15 && dy < 15) {
                    e.preventDefault();
                    gameScene.events.emit('request-upgrade', type);
                    this.animateBtn(btn);
                }
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                gameScene.events.emit('request-upgrade', type);
                this.animateBtn(btn);
            });
        };

        bindBtn(this.damageBtn, 'damage');
        bindBtn(this.ballsBtn, 'balls');
        bindBtn(this.orbitBtn, 'orbit');
        bindBtn(this.laserBtn, 'laser');
        bindBtn(this.electricBtn, 'electric');
        bindBtn(this.bombBtn, 'bomb');

        // Re-center button
        const recenterBtn = document.getElementById('btn-recenter');
        if (recenterBtn) {
            recenterBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                gameScene.events.emit('request-recenter');
                this.animateBtn(recenterBtn);
            }, { passive: false });
            recenterBtn.addEventListener('click', () => {
                gameScene.events.emit('request-recenter');
                this.animateBtn(recenterBtn);
            });
        }

        // Submit Score button with 10-second cooldown
        const submitScoreBtn = document.getElementById('btn-submit-score');
        let submitOnCooldown = false;
        const submitOrigHTML = submitScoreBtn?.innerHTML || '';
        if (submitScoreBtn) {
            const doSubmit = () => {
                if (submitOnCooldown) return;
                gameScene.events.emit('request-current-score');
                this.animateBtn(submitScoreBtn);
                if (typeof (window as any).triggerHaptic === 'function') {
                    (window as any).triggerHaptic('success');
                }
            };
            submitScoreBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                doSubmit();
            }, { passive: false });
            submitScoreBtn.addEventListener('click', doSubmit);
        }

        gameScene.events.on('submit-score-value', (score: number) => {
            console.log('[UIScene] Submitting score:', score);
            if (typeof (window as any).submitScore === 'function') {
                (window as any).submitScore(score);
            }
            if (!submitScoreBtn) return;

            submitOnCooldown = true;
            submitScoreBtn.classList.add('opacity-50');
            let remaining = 10;
            submitScoreBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                ${remaining}s
            `;
            submitScoreBtn.style.borderColor = '#4ade80';

            const countdownInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(countdownInterval);
                    submitOnCooldown = false;
                    submitScoreBtn.innerHTML = submitOrigHTML;
                    submitScoreBtn.style.borderColor = '';
                    submitScoreBtn.classList.remove('opacity-50');
                } else {
                    submitScoreBtn.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        ${remaining}s
                    `;
                    submitScoreBtn.style.borderColor = '';
                }
            }, 1000);
        }, this);



        // Settings Logic
        this.loadSettings();

        let settingsOpenedAt = 0;

        const openSettings = () => {
            if (this.modalSettings) {
                settingsOpenedAt = Date.now();
                this.modalSettings.classList.remove('hidden');
                this.modalSettings.style.display = 'flex';
                gameScene.input.enabled = false;
            }
        };

        const closeSettings = () => {
            // Guard against ghost click: ignore close within 400ms of opening
            if (Date.now() - settingsOpenedAt < 400) {
                return;
            }
            if (this.modalSettings) {
                this.modalSettings.classList.add('hidden');
                gameScene.input.enabled = true;
            }
        };

        if (this.btnSettings) {
            this.btnSettings.addEventListener('touchstart', (e) => {
                e.preventDefault(); openSettings();
            }, { passive: false });
            this.btnSettings.addEventListener('click', () => {
                openSettings();
            });
        }

        if (this.btnCloseSettings) {
            this.btnCloseSettings.addEventListener('touchstart', (e) => {
                e.preventDefault(); closeSettings();
            }, { passive: false });
            this.btnCloseSettings.addEventListener('click', () => {
                closeSettings();
            });
        }

        // Also close settings by tapping the overlay background
        if (this.modalSettings) {
            this.modalSettings.addEventListener('click', (e) => {
                if (e.target === this.modalSettings) closeSettings();
            });
            this.modalSettings.addEventListener('touchstart', (e) => {
                if (e.target === this.modalSettings) { e.preventDefault(); closeSettings(); }
            }, { passive: false });
        }

        if (this.toggleMusic) this.toggleMusic.onchange = () => this.saveSettings();
        if (this.toggleFX) this.toggleFX.onchange = () => this.saveSettings();
        if (this.toggleHaptics) this.toggleHaptics.onchange = () => this.saveSettings();

        // Burst Button
        this.burstBtn = document.getElementById('btn-burst');
        if (this.burstBtn) {
            this.animateBtn(this.burstBtn);
            this.burstBtn.addEventListener('touchstart', (e) => {
                e.preventDefault(); e.stopPropagation();
                gameScene.events.emit('request-upgrade', 'burst');
            });
            this.burstBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                gameScene.events.emit('request-upgrade', 'burst');
            });
        }

        // Game Over Logic - restart via Phaser scene management (location.reload crashes iOS WebView)
        // Clone-replace to remove any stale event listeners from previous session
        if (this.btnRestart) {
            const fresh = this.btnRestart.cloneNode(true) as HTMLElement;
            this.btnRestart.replaceWith(fresh);
            this.btnRestart = fresh;

            const doRestart = () => {
                if (this.modalGameOver) {
                    this.modalGameOver.classList.add('hidden');
                    this.modalGameOver.style.display = 'none';
                }
                const ul = document.getElementById('ui-layer');
                if (ul) ul.classList.add('hidden');
                const sb = document.getElementById('btn-settings');
                if (sb) sb.classList.add('hidden');

                // Restart game loop directly (skip MainMenu)
                this.scene.stop('Scene');
                this.scene.start('Scene');
                this.scene.stop('UIScene');
            };
            this.btnRestart.addEventListener('touchstart', (e) => { e.preventDefault(); doRestart(); }, { passive: false });
            this.btnRestart.addEventListener('click', doRestart);
        }

        gameScene.events.on('game-over', (score: number) => {
            if (this.modalGameOver) {
                this.modalGameOver.classList.remove('hidden');
            }
            if (this.finalScoreText) {
                this.finalScoreText.innerText = score.toString();
            }
        }, this);


        gameScene.events.on('update-score', (score: number) => {
            if (this.scoreDiv) this.scoreDiv.innerText = 'Score: ' + this.formatCompact(score);
        }, this);

        gameScene.events.on('update-money', (amount: number) => {
            if (this.moneyDiv) this.moneyDiv.innerText = 'Money: $' + Math.floor(amount);
        }, this);

        gameScene.events.on('update-level', (level: number) => {
            if (this.levelDiv) this.levelDiv.innerText = 'LV ' + level;
        }, this);

        // Build button DOM once, then update only text on price changes
        const setupBtn = (btn: HTMLElement | null, label: string, descText: string, priceClass: string) => {
            if (!btn) return;
            btn.innerHTML = `
                <span class="label">${label}</span>
                <span class="skill-desc">${descText}</span>
                <span class="price ${priceClass}" data-role="price"></span>
                <span class="lv-badge" data-role="level"></span>
            `;
        };
        setupBtn(this.damageBtn, 'DAMAGE', '+Hit power', 'text-yellow-300');
        setupBtn(this.ballsBtn, 'BALLS', '+1 permanent ball', 'text-yellow-300');
        setupBtn(this.orbitBtn, 'ORBIT', '+1 circling ball', 'text-purple-300');
        setupBtn(this.laserBtn, 'LASER', '% pierce on kill', 'text-red-300');
        setupBtn(this.electricBtn, 'ELEC', '% chain on kill', 'text-blue-300');
        setupBtn(this.bombBtn, 'BOMB', '% explode on kill', 'text-orange-300');
        setupBtn(this.burstBtn, 'BURST', '8 temp balls, 2x dmg', 'text-red-300');

        gameScene.events.on('update-shop-prices', (prices: any) => {
            const isBallLocked = prices.locked === true;
            const isInitialLocked = prices.timeLocked === true;
            const money = prices.money || 0;

            const toggleLock = (btn: HTMLElement | null, forceLocked: boolean = false, cantAfford: boolean = false) => {
                if (btn) {
                    if (forceLocked) {
                        btn.classList.add('opacity-50', 'pointer-events-none', 'grayscale');
                    } else if (cantAfford) {
                        btn.classList.add('opacity-50', 'grayscale');
                        btn.classList.remove('pointer-events-none');
                    } else {
                        btn.classList.remove('opacity-50', 'pointer-events-none', 'grayscale');
                    }
                }
            };

            const updateBtn = (btn: HTMLElement | null, price: number, lv: number) => {
                if (!btn) return;
                const priceEl = btn.querySelector('[data-role="price"]');
                const lvEl = btn.querySelector('[data-role="level"]');
                if (priceEl) priceEl.textContent = '$' + Math.round(price);
                if (lvEl) lvEl.textContent = lv > 0 ? 'LV ' + lv : '';
            };

            toggleLock(this.damageBtn, isInitialLocked || isBallLocked, money < prices.damage);
            updateBtn(this.damageBtn, prices.damage, prices.damageLv || 0);

            toggleLock(this.ballsBtn, isInitialLocked, money < prices.balls);
            updateBtn(this.ballsBtn, prices.balls, prices.ballsLv || 0);

            toggleLock(this.orbitBtn, isInitialLocked || isBallLocked, money < prices.orbit);
            updateBtn(this.orbitBtn, prices.orbit, prices.orbitLv || 0);

            toggleLock(this.laserBtn, isInitialLocked || isBallLocked, money < prices.laser);
            updateBtn(this.laserBtn, prices.laser, prices.laserLv || 0);

            toggleLock(this.electricBtn, isInitialLocked || isBallLocked, money < prices.electric);
            updateBtn(this.electricBtn, prices.electric, prices.electricLv || 0);

            toggleLock(this.bombBtn, isInitialLocked || isBallLocked, money < prices.bomb);
            updateBtn(this.bombBtn, prices.bomb, prices.bombLv || 0);

            toggleLock(this.burstBtn, isInitialLocked || isBallLocked, money < prices.burst);
            updateBtn(this.burstBtn, prices.burst, 0);
        }, this);

        const uiLayer = document.getElementById('ui-layer');
        const settingsBtn = document.getElementById('btn-settings');
        const bottomBar = document.getElementById('ui-bottom-bar');

        // Reset all UI to visible state (critical for restarts)
        if (uiLayer) {
            uiLayer.classList.remove('hidden');
            uiLayer.style.display = 'flex';
        }
        if (settingsBtn) {
            settingsBtn.classList.remove('hidden');
        }
        if (bottomBar) {
            bottomBar.classList.remove('hidden');
        }
        if (this.modalGameOver) {
            this.modalGameOver.classList.add('hidden');
            this.modalGameOver.style.display = 'none';
        }
        if (this.modalSettings) {
            this.modalSettings.classList.add('hidden');
        }

        gameScene.events.on('game-start', () => {
            if (uiLayer) {
                uiLayer.classList.remove('hidden');
                uiLayer.style.display = 'flex';
            }
            if (settingsBtn) {
                settingsBtn.classList.remove('hidden');
            }
            if (bottomBar) {
                bottomBar.classList.remove('hidden');
            }
            if (recenterBtn) {
                recenterBtn.classList.remove('hidden');
            }
            if (submitScoreBtn) {
                submitScoreBtn.classList.remove('hidden');
            }
        });

        gameScene.events.on('game-over', (score: number) => {
            const hud = document.getElementById('ui-bottom-bar');
            if (hud) hud.classList.add('hidden');
            if (settingsBtn) settingsBtn.classList.add('hidden');
            if (recenterBtn) recenterBtn.classList.add('hidden');
            if (submitScoreBtn) submitScoreBtn.classList.add('hidden');

            // Pause Phaser input so game-over modal is reliably interactive
            gameScene.input.enabled = false;

            if (this.modalGameOver) {
                this.modalGameOver.classList.remove('hidden');
                this.modalGameOver.style.display = 'flex';
            }
            if (this.finalScoreText) {
                this.finalScoreText.innerText = score.toString();
            }
        }, this);

        gameScene.events.emit('request-shop-update');
    }

    /** 1000→1K, 1200→1.2K, 1225→1.22K, 1000000→1M, 1000000000→1B */
    formatCompact(n: number): string {
        const fmt = (val: number, suffix: string) => {
            const truncated = Math.floor(val * 100) / 100;
            const str = truncated.toFixed(2).replace(/\.?0+$/, '');
            return str + suffix;
        };
        if (n >= 1_000_000_000) return fmt(n / 1_000_000_000, 'B');
        if (n >= 1_000_000) return fmt(n / 1_000_000, 'M');
        if (n >= 1_000) return fmt(n / 1_000, 'K');
        return Math.floor(n).toString();
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('joy_settings') || '{"music":true,"fx":true,"haptics":true}');
        if (this.toggleMusic) this.toggleMusic.checked = settings.music;
        if (this.toggleFX) this.toggleFX.checked = settings.fx;
        if (this.toggleHaptics) this.toggleHaptics.checked = settings.haptics;
    }

    saveSettings() {
        const settings = {
            music: this.toggleMusic?.checked,
            fx: this.toggleFX?.checked,
            haptics: this.toggleHaptics?.checked
        };
        localStorage.setItem('joy_settings', JSON.stringify(settings));

        // Notify Game Scene
        const gameScene = this.scene.get('Scene');
        gameScene.events.emit('update-settings', settings);
    }

    animateBtn(btn: HTMLElement) {
        // CSS Animation or simple JS class toggle could work better, but let's use a simple transform
        btn.style.transform = 'translateY(4px)';
        setTimeout(() => {
            btn.style.transform = 'translateY(0px)';
        }, 100);
    }
    /* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
