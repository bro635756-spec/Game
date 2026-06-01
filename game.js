import * as THREE from 'three';
import { World } from 'world.js';
import { Player } from 'player.js';
import { Controls } from 'controls.js';
import { UI } from 'ui.js';
import { EnemyManager } from 'enemy.js';

class Game {
    constructor() {
        this.clock = new THREE.Clock();
        this.isGameStarted = false;
        this.isPaused = false;
        this.isRespawning = false;
        this.isGameWon = false;
        this.currentWave = 0;
        this.waveTransition = null;
        this.radarUpdateTimer = 0;
        this.radarUpdateInterval = 0.1;
        this.waveConfigs = {
            1: { count: 8, spawnRadius: 180, minEnemyDistance: 18, minPlayerDistance: 26, rangedRatio: 0.25 },
            2: { count: 12, spawnRadius: 210, minEnemyDistance: 16, minPlayerDistance: 28, healthMultiplier: 1.1, moveSpeedMultiplier: 1.05, rangedRatio: 0.38 },
            3: { count: 1, spawnRadius: 220, minEnemyDistance: 20, minPlayerDistance: 36, scaleMultiplier: 2.0, healthMultiplier: 2.4, moveSpeedMultiplier: 0.9, isBoss: true, rangedRatio: 1 }
        };
        this.assetManifest = null;
        this.assetsByRole = new Map();
        this.initScene();
        this.bootstrap();
    }

    async bootstrap() {
        await this.loadAssetManifest();
        this.applyManifestConfig();
        this.initModules();
        this.initEvents();
        this.animate();
    }

    async loadAssetManifest() {
        try {
            const response = await fetch('./asset-manifest.json', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.assetManifest = await response.json();
        } catch (error) {
            console.warn('asset-manifest.json could not be loaded; using starter defaults.', error);
            this.assetManifest = { game: {}, assets: [] };
        }

        this.assetsByRole = new Map();
        for (const asset of this.assetManifest.assets || []) {
            if (!asset?.role) continue;
            if (!this.assetsByRole.has(asset.role)) this.assetsByRole.set(asset.role, []);
            this.assetsByRole.get(asset.role).push(asset);
        }
    }

    getAssetsByRole(role) {
        return this.assetsByRole.get(role) || [];
    }

    getPrimaryAsset(role) {
        return this.getAssetsByRole(role)[0] || null;
    }

    applyManifestConfig() {
        const waves = this.assetManifest?.game?.waves;
        if (Array.isArray(waves) && waves.length > 0) {
            this.waveConfigs = {};
            for (const wave of waves) {
                if (!wave?.id) continue;
                this.waveConfigs[wave.id] = { ...wave };
            }
        }
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 20, 100);
        const canvas = document.getElementById('game-canvas');
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.name = 'main_camera';
        this.camera.rotation.order = 'YXZ';
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);
        this.scene.add(this.camera);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
    }

    initModules() {
        this.ui = new UI();
        this.world = new World(this.scene, this.getPrimaryAsset('map'));
        this.player = new Player(this.camera, this.scene, this.ui, {
            weapons: this.getAssetsByRole('weapon'),
            textures: this.getAssetsByRole('texture'),
            sounds: this.getAssetsByRole('sound')
        });
        this.controls = new Controls(this.camera, this.renderer.domElement);
        this.enemyManager = new EnemyManager(this.scene, this.player, this.getPrimaryAsset('enemy'));
        this.enemyManager.defaultWaveConfig = { ...this.waveConfigs[1] };
        this.enemyManager.setActive(false);
        this.enemyManager.onEnemyKilled = ({ enemy, source }) => {
            const sourceLabel = source === 'Grenade' ? 'FRAG' : 'RIFLE';
            this.ui?.addKillFeed(`NEUTRALIZED ${enemy?.nameLabel || 'HOSTILE'} / ${sourceLabel}`);
            this.ui?.updateBattleInfo(this.currentWave || 1, this.enemyManager.getAliveCount());
        };

        this.world.loadMap(
            (percent) => this.ui.updateLoadingProgress(Math.min(percent, 90)),
            async () => {
                this.player.resetForNewRound(new THREE.Vector3(0, 10, 0), this.world.collidables);
                await this.player.weaponsReady;
                await this.enemyManager.init();
                this.installAssetManifestTools();
                try { this.renderer.compile(this.scene, this.camera); } catch (_) {}
                this.ui.updateLoadingProgress(100);
                this.ui.updatePlayerHealth(this.player.health, this.player.maxHealth);
            }
        );

        this.ui.onStart(async () => {
            this.controls.lock();
            this.startGame();
        });
        this.ui.onContinue(async () => { this.resumeGame(); });
        this.ui.onReplay(async () => { this.restartGame(); });
    }

    initEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        window.addEventListener('keydown', (event) => {
            if (event.code === 'Escape' && this.isGameStarted && !this.isPaused) {
                event.preventDefault();
                this.pauseGame();
            }
        });
        document.addEventListener('pointerlockchange', () => {
            if (!this.controls || this.controls.isMobile) return;
            if (this.isGameStarted && !this.isPaused && !this.controls.isLocked()) this.pauseGame();
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = Math.min(this.clock.getDelta(), 0.05);
        if (this.isGameStarted && !this.isPaused && !this.isGameWon) {
            this.player?.update(delta, this.controls.inputs, this.world.collidables, this.enemyManager);
            this.enemyManager?.update(delta);
            this.updateWaveProgress(delta);
            if (this.player.health <= 0 && !this.isRespawning) this.handlePlayerDeath();
            if (this.ui && this.enemyManager) {
                this.ui.updateBattleInfo(this.currentWave || 1, this.enemyManager.getAliveCount());
                this.radarUpdateTimer += delta;
                if (this.radarUpdateTimer >= this.radarUpdateInterval) {
                    this.radarUpdateTimer = 0;
                    this.ui.updateRadar(this.camera.rotation.y, this.player.getPlayerPosition(new THREE.Vector3()), this.enemyManager.enemies);
                }
            }
        }
        this.renderer.render(this.scene, this.camera);
    }

    startGame() {
        if (this.isGameStarted) return;
        this.isGameStarted = true;
        this.isPaused = false;
        this.isGameWon = false;
        this.currentWave = 1;
        this.waveTransition = null;
        this.radarUpdateTimer = 0;
        this.player.resetForNewRound(new THREE.Vector3(0, 10, 0), this.world.collidables);
        this.enemyManager.spawnWave(this.waveConfigs[1]);
        this.enemyManager.setActive(true);
        this.ui.hideVictoryMenu();
        this.ui.showGameUI();
        this.ui.updatePlayerHealth(this.player.health, this.player.maxHealth);
        this.ui.updateBattleInfo(this.currentWave, this.enemyManager.getAliveCount());
        this.ui.showCenterMessage('WAVE 1 / BREACH', 1500);
        this.clock.getDelta();
    }

    pauseGame() {
        if (!this.isGameStarted || this.isPaused || this.isGameWon) return;
        this.isPaused = true;
        this.enemyManager?.setActive(false);
        this.controls?.resetInputs();
        this.controls?.unlock();
        this.ui?.showPauseMenu();
    }

    resumeGame() {
        if (!this.isGameStarted || !this.isPaused || this.isGameWon) return;
        this.isPaused = false;
        this.enemyManager?.setActive(!this.waveTransition);
        this.controls?.resetInputs();
        this.controls?.lock();
        this.ui?.hidePauseMenu();
        this.clock.getDelta();
    }

    restartGame() {
        this.isGameStarted = true;
        this.isPaused = false;
        this.isRespawning = false;
        this.isGameWon = false;
        this.currentWave = 1;
        this.waveTransition = null;
        this.radarUpdateTimer = 0;
        this.controls?.resetInputs();
        this.controls?.lock();
        this.player?.resetForNewRound(new THREE.Vector3(0, 10, 0), this.world.collidables);
        this.enemyManager?.spawnWave(this.waveConfigs[1]);
        this.enemyManager?.setActive(true);
        this.ui?.hidePauseMenu();
        this.ui?.hideVictoryMenu();
        this.ui?.showGameUI();
        this.ui?.updateBattleInfo(this.currentWave, this.enemyManager ? this.enemyManager.getAliveCount() : 0);
        this.ui?.showCenterMessage('WAVE 1 / BREACH', 1500);
        this.clock.getDelta();
    }

    updateWaveProgress(delta) {
        if (!this.enemyManager || !this.enemyManager.isLoaded || this.isRespawning || this.isGameWon) return;
        if (this.waveTransition) {
            this.waveTransition.remaining -= delta;
            const remainSec = Math.max(0, Math.ceil(this.waveTransition.remaining));
            this.ui?.showCenterMessage(`${this.waveTransition.text} ${remainSec}s`, 0);
            if (this.waveTransition.remaining <= 0) {
                const nextWave = this.waveTransition.nextWave;
                this.waveTransition = null;
                this.spawnWave(nextWave);
            }
            return;
        }
        const aliveCount = this.enemyManager.getAliveCount();
        if (aliveCount > 0) return;
        if (this.currentWave === 1) this.beginWaveTransition(2, 'REINFORCEMENTS IN');
        else if (this.currentWave === 2) this.beginWaveTransition(3, 'COMMANDER CONTACT IN');
        else if (this.currentWave === 3) this.handleVictory();
    }

    beginWaveTransition(nextWave, text) {
        this.waveTransition = { nextWave, remaining: 5, text };
        this.enemyManager?.setActive(false);
        this.ui?.showCenterMessage(`${text} 5s`, 0);
    }

    spawnWave(waveNumber) {
        const config = this.waveConfigs[waveNumber];
        if (!this.enemyManager || !config) return;
        this.enemyManager.spawnWave(config);
        this.enemyManager.setActive(true);
        this.currentWave = waveNumber;
        this.ui?.updateBattleInfo(this.currentWave, this.enemyManager.getAliveCount());
        if (waveNumber === 2) this.ui?.showCenterMessage('WAVE 2 / CONTACT', 1600);
        else if (waveNumber === 3) this.ui?.showCenterMessage('COMMANDER ON SITE', 2000);
        else this.ui?.hideCenterMessage();
    }

    handleVictory() {
        if (this.isGameWon) return;
        this.isGameWon = true;
        this.enemyManager?.setActive(false);
        this.controls?.resetInputs();
        this.controls?.unlock();
        this.ui?.updateBattleInfo(this.currentWave, 0);
        this.ui?.showCenterMessage('SECTOR SECURED / COMMANDER DOWN', 0);
        this.ui?.showVictoryMenu();
    }

    async handlePlayerDeath() {
        this.isRespawning = true;
        this.player.reset(new THREE.Vector3(0, 10, 0), this.world.collidables);
        this.ui?.showCenterMessage('REDEPLOYED', 1200);
        this.isRespawning = false;
    }
    roundNumber(value, digits = 4) {
        return Number((Number.isFinite(value) ? value : 0).toFixed(digits));
    }

    roundVector(values, digits = 4) {
        return values.map((value) => this.roundNumber(value, digits));
    }

    getBBox(object3d) {
        if (!object3d) return null;
        object3d.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(object3d);
        if (box.isEmpty()) return null;
        return {
            min: this.roundVector([box.min.x, box.min.y, box.min.z]),
            max: this.roundVector([box.max.x, box.max.y, box.max.z])
        };
    }

    getAnimationNames(clips = []) {
        return clips.map((clip) => clip?.name).filter(Boolean);
    }

    getTransform(object3d) {
        if (!object3d) return null;
        return {
            location: this.roundVector([object3d.position.x, object3d.position.y, object3d.position.z]),
            rotation: this.roundVector([object3d.rotation.x, object3d.rotation.y, object3d.rotation.z]),
            scale: this.roundVector([object3d.scale.x, object3d.scale.y, object3d.scale.z])
        };
    }

    buildAssetManifest() {
        const assets = [];
        const worldMap = this.world?.worldMap;
        if (worldMap) {
            const transform = this.getTransform(worldMap);
            assets.push({
                name: 'World_Map',
                desc: 'Main level map model',
                url: this.world.mapUrl,
                bbox: this.getBBox(worldMap),
                location: transform.location,
                rotation: transform.rotation,
                scale: transform.scale
            });
        }

        const enemyBase = this.enemyManager?.baseModel;
        if (enemyBase) {
            const transform = this.getTransform(enemyBase);
            assets.push({
                name: 'Enemy_Base',
                desc: 'Enemy base model used for melee enemies, ranged enemies, and the boss',
                url: this.enemyManager.modelUrl,
                bbox: this.getBBox(enemyBase),
                location: transform.location,
                rotation: transform.rotation,
                scale: transform.scale,
                animation: this.getAnimationNames(this.enemyManager.animations)
            });
            if (this.enemyManager?.weaponUrl) {
                assets.push({
                    name: 'Enemy_Weapon',
                    desc: 'Enemy held rifle model',
                    parent: 'Enemy_Base',
                    url: this.enemyManager.weaponUrl
                });
            }
            Object.entries(this.enemyManager?.animationSourceUrls || {}).forEach(([state, url]) => {
                assets.push({
                    name: `Enemy_Animation_${state}`,
                    desc: `External enemy ${state} animation`,
                    parent: 'Enemy_Base',
                    url
                });
            });
        }

        this.player?.weaponConfigs?.forEach((config, index) => {
            const weapon = this.player.weapons?.[index];
            const clips = this.player.actions?.[index]
                ? Object.values(this.player.actions[index]).map((action) => action.getClip())
                : [];
            const transform = weapon
                ? this.getTransform(weapon)
                : {
                    location: this.roundVector(config.pos),
                    rotation: [0, this.roundNumber(Math.PI), 0],
                    scale: null
                };
            assets.push({
                name: `Weapon_${config.id}`,
                desc: `Player weapon: ${config.displayName || config.id}`,
                url: config.url,
                bbox: weapon ? this.getBBox(weapon) : null,
                location: transform.location,
                rotation: transform.rotation,
                scale: transform.scale,
                animation: this.getAnimationNames(clips)
            });
        });

        assets.push({
            name: 'FX_MuzzleFlash',
            desc: 'Muzzle flash texture',
            url: this.player?.textureUrls?.muzzleFlash || null
        });
        assets.push({
            name: 'FX_Smoke',
            desc: 'Smoke texture',
            url: this.player?.textureUrls?.smoke || null
        });
        assets.push({
            name: 'SFX_Shoot',
            desc: 'Player shooting sound effect',
            url: this.player?.soundUrls?.shoot || null
        });
        assets.push({
            name: 'SFX_HitConfirm',
            desc: 'Hit confirm sound effect',
            url: this.player?.soundUrls?.hitConfirm || null
        });

        return assets;
    }

    buildAssetManifestStandard() {
        const assets = [];
        const pushAnimationChildren = (parentName, animationNames, url) => {
            animationNames.forEach((name) => {
                assets.push({
                    name,
                    desc: `Embedded animation clip for ${parentName}: ${name}`,
                    parent: parentName,
                    url
                });
            });
        };

        const worldMap = this.world?.worldMap;
        if (worldMap) {
            const transform = this.getTransform(worldMap);
            assets.push({
                name: 'World_Map',
                desc: 'Main level map model',
                url: this.world.mapUrl,
                bbox: this.getBBox(worldMap),
                location: transform.location,
                rotation: transform.rotation,
                scale: transform.scale
            });
        }

        const enemyBase = this.enemyManager?.baseModel;
        if (enemyBase) {
            const animationNames = this.getAnimationNames(this.enemyManager.animations);
            const transform = this.getTransform(enemyBase);
            assets.push({
                name: 'Enemy_Base',
                desc: 'Enemy base model used for melee enemies, ranged enemies, and the boss',
                url: this.enemyManager.modelUrl,
                bbox: this.getBBox(enemyBase),
                location: transform.location,
                rotation: transform.rotation,
                scale: transform.scale,
                animation: animationNames
            });
            pushAnimationChildren('Enemy_Base', animationNames, this.enemyManager.modelUrl);
            if (this.enemyManager?.weaponUrl) {
                assets.push({
                    name: 'Enemy_Weapon',
                    desc: 'Enemy held rifle model',
                    parent: 'Enemy_Base',
                    url: this.enemyManager.weaponUrl
                });
            }
            Object.entries(this.enemyManager?.animationSourceUrls || {}).forEach(([state, url]) => {
                assets.push({
                    name: `Enemy_Animation_${state}`,
                    desc: `External enemy ${state} animation`,
                    parent: 'Enemy_Base',
                    url
                });
            });
        }

        this.player?.weaponConfigs?.forEach((config, index) => {
            const weapon = this.player.weapons?.[index];
            const clipNames = this.getAnimationNames(
                this.player.actions?.[index]
                    ? Object.values(this.player.actions[index]).map((action) => action.getClip())
                    : []
            );
            const transform = weapon
                ? this.getTransform(weapon)
                : {
                    location: this.roundVector(config.pos),
                    rotation: [0, this.roundNumber(Math.PI), 0],
                    scale: null
                };
            const assetName = `Weapon_${config.id}`;
            assets.push({
                name: assetName,
                desc: `Player weapon: ${config.displayName || config.id}`,
                url: config.url,
                bbox: weapon ? this.getBBox(weapon) : null,
                location: transform.location,
                rotation: transform.rotation,
                scale: transform.scale,
                animation: clipNames
            });
            pushAnimationChildren(assetName, clipNames, config.url);
        });

        assets.push({
            name: 'FX_MuzzleFlash',
            desc: 'Muzzle flash texture',
            url: this.player?.textureUrls?.muzzleFlash || null
        });
        assets.push({
            name: 'FX_Smoke',
            desc: 'Smoke texture',
            url: this.player?.textureUrls?.smoke || null
        });
        assets.push({
            name: 'SFX_Shoot',
            desc: 'Player shooting sound effect',
            url: this.player?.soundUrls?.shoot || null
        });
        assets.push({
            name: 'SFX_HitConfirm',
            desc: 'Hit confirm sound effect',
            url: this.player?.soundUrls?.hitConfirm || null
        });

        return assets;
    }

    logAssetManifest() {
        const manifest = this.buildAssetManifestStandard();
        console.log(JSON.stringify(manifest, null, 2));
        return manifest;
    }

    installAssetManifestTools() {
        if (this.assetManifestToolsInstalled) return;
        this.assetManifestToolsInstalled = true;
        window.__dumpGameAssets = () => this.logAssetManifest();
        window.__getGameAssets = () => this.buildAssetManifestStandard();
        console.log('Asset manifest tools ready. Use __dumpGameAssets() or __getGameAssets() in the console.');
    }
}

window.__game = new Game();
