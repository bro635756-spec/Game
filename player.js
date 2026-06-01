
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class Player {
    constructor(camera, scene, ui = null, manifestConfig = {}) {
        this.camera = camera;
        this.scene = scene;
        this.ui = ui;

        this.position = new THREE.Vector3(0, 10, 0);
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.onGround = false;
        this.height = 1.7;
        this.moveSpeed = 8.0;
        this.gravity = 25.0;
        this.jumpForce = 7.5;

        this.maxHealth = 300;
        this.health = 300;

        this.cameraMode = 'fps';
        this.isADS = false;
        this.defaultFov = 75;
        this.adsFov = 52;
        this.targetFov = this.defaultFov;
        this.thirdPersonDistance = 4.6;
        this.thirdPersonHeight = 1.6;
        this.thirdPersonSide = 0.42;
        this.thirdPersonAimDistance = 16;
        this.viewBobPhase = 0;
        this.maxPitch = Math.PI / 2.1;
        this.viewYaw = this.camera.rotation.y;
        this.viewPitch = THREE.MathUtils.clamp(this.camera.rotation.x, -this.maxPitch, this.maxPitch);
        this.avatarYaw = this.viewYaw;

        this.weaponContainer = new THREE.Group();
        this.weaponContainer.name = 'weapon_container';
        this.camera.add(this.weaponContainer);
        this.weapons = [];
        this.currentWeaponIndex = 0;
        this.isSwitching = false;
        this.isReloading = false;
        this.lastFireTime = 0;
        this.grenadeCooldown = 0;
        this.grenades = [];

        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        this.sounds = {};
        this.impactSoundPool = [];
        this.impactSoundIndex = 0;
        this.audioLoader = new THREE.AudioLoader();
        this.textureUrls = {
            muzzleFlash: 'https://static.seeles.ai/media/game_asset/assets_89248454_4e57_4998_8c15_492b7f5638e0_1773284510025949355.png',
            smoke: 'https://static.seeles.ai/media/game_asset/assets_31ff84ab_9b41_4345_b3f2_ae1e2a26041d_1773284494314685071.png'
        };
        this.soundUrls = {
            shoot: 'https://static.seeles.ai/data/asset/export/6f1cba03-7e72-4eeb-9644-e426432f0de5/174010/sfx_3f590c43-42c4-4c78-814e-a55a4d3d42b0.mp3',
            hitConfirm: 'https://static.seeles.ai/data/asset/export/c1f28fc5-e549-4133-83e8-e49e17aa55ab/174079/sfx_3db919e7-e64f-4b9d-930e-9e8165adcf58.mp3'
        };

        this.weaponConfigs = [
            {
                id: 'ak', displayName: 'AK Assault Rifle',
                url: 'https://static.seeles.ai/games-sdk/fps/buqiang.glb',
                pos: [0.25, -0.2, -0.23], adsPos: [0.04, -0.13, -0.17], rotation: [0, Math.PI, 0],
                modelScale: 1.0, targetViewLength: 0.7, muzzleOffset: [0, 0, 97.2],
                muzzleSocketAliases: ['muzzle', 'barrel', 'gun_tip', 'firepoint'],
                ammo: 30, magazineSize: 30, totalAmmo: 90, fireRate: 100, damage: 34,
                bulletColor: 0xffff00, bulletSize: 0.02, baseSpread: 0.0025, adsSpread: 0.0009,
                moveSpread: 0.006, airSpread: 0.004, recoilSpread: 0.0035, tracerSpeed: 220, impactSize: 0.022
            },
            {
                id: 'handgun', displayName: 'Tactical Handgun',
                url: 'https://static.seeles.ai/games-sdk/fps/shouqiang.glb',
                pos: [0.25, -0.2, -0.23], adsPos: [0.025, -0.12, -0.16], rotation: [0, Math.PI, 0],
                modelScale: 1.0, targetViewLength: 0.42, muzzleOffset: [0, 0, 0.37],
                muzzleSocketAliases: ['muzzle', 'barrel', 'gun_tip', 'firepoint'],
                ammo: 12, magazineSize: 12, totalAmmo: 48, fireRate: 300, damage: 45,
                bulletColor: 0xffffff, bulletSize: 0.015, baseSpread: 0.0045, adsSpread: 0.0018,
                moveSpread: 0.008, airSpread: 0.005, recoilSpread: 0.004, tracerSpeed: 180, impactSize: 0.02
            },
            {
                id: 'sniper', displayName: 'Precision Sniper',
                url: 'https://static.seeles.ai/games-sdk/fps/jujiqiang.glb',
                pos: [0.25, -0.2, -0.23], adsPos: [0.012, -0.1, -0.135], rotation: [0, Math.PI, 0],
                modelScale: 1.0, targetViewLength: 0.78, muzzleOffset: [0, 0, 102.6],
                muzzleSocketAliases: ['muzzle', 'barrel', 'gun_tip', 'firepoint'],
                ammo: 5, magazineSize: 5, totalAmmo: 15, fireRate: 1000, damage: 120,
                bulletColor: 0x00ffff, bulletSize: 0.04, baseSpread: 0.0012, adsSpread: 0.00025,
                moveSpread: 0.004, airSpread: 0.003, recoilSpread: 0.002, tracerSpeed: 280, impactSize: 0.028
            }
        ];
        this.applyManifestAssets(manifestConfig);
        this.initSounds();
        this.weaponConfigs.forEach(cfg => {
            cfg.initialAmmo = cfg.ammo;
            cfg.initialTotalAmmo = cfg.totalAmmo;
        });

        this.mixers = [];
        this.actions = [];
        this.shootRaycaster = new THREE.Raycaster();
        this.groundRaycaster = new THREE.Raycaster();
        this.rayX = new THREE.Raycaster();
        this.rayZ = new THREE.Raycaster();
        this.cameraCollisionRay = new THREE.Raycaster();

        this.tmpV3A = new THREE.Vector3();
        this.tmpV3B = new THREE.Vector3();
        this.tmpV3C = new THREE.Vector3();
        this.tmpV3D = new THREE.Vector3();
        this.tmpV3E = new THREE.Vector3();
        this.tmpV3F = new THREE.Vector3();
        this.tmpShotDir = new THREE.Vector3();
        this.tmpShotRight = new THREE.Vector3();
        this.tmpShotUp = new THREE.Vector3();
        this.tmpImpactRand = new THREE.Vector3();
        this.tmpImpactAxis = new THREE.Vector3();
        this.tmpV2A = new THREE.Vector2();
        this.tmpQuat = new THREE.Quaternion();
        this.viewEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.fxGeometries = {
            impactCore: new THREE.SphereGeometry(1, 6, 6),
            impactRing: new THREE.RingGeometry(0.45, 1.25, 20)
        };

        this.recoilAmount = new THREE.Vector3();
        this.recoilVelocity = new THREE.Vector3();
        this.shakeAmount = new THREE.Vector3();
        this.cameraShakeOffset = new THREE.Vector3();
        this.weaponKick = new THREE.Vector3();
        this.weaponKickVelocity = new THREE.Vector3();
        this.currentSpreadScale = 1;

        this.createPlayerAvatar();
        this.initLoader();
        this.weaponsReady = this.loadWeapons();
        this.updateCameraTransform([], true);
        this.ui?.updatePlayerHealth(this.health, this.maxHealth);
    }

    applyManifestAssets(manifestConfig = {}) {
        const weapons = Array.isArray(manifestConfig.weapons)
            ? manifestConfig.weapons.filter(asset => asset?.url)
            : [];
        if (weapons.length > 0) {
            const defaults = this.weaponConfigs;
            this.weaponConfigs = weapons.map((asset, index) => {
                const fallback = defaults[index] || defaults[defaults.length - 1] || {};
                const id = String(asset.id || fallback.id || `weapon_${index + 1}`).replace(/^weapon_/, '');
                return {
                    ...fallback,
                    id,
                    displayName: asset.displayName || fallback.displayName || id,
                    url: asset.url,
                    pos: Array.isArray(asset.viewOffset) ? asset.viewOffset : fallback.pos,
                    adsPos: Array.isArray(asset.adsOffset) ? asset.adsOffset : fallback.adsPos,
                    rotation: Array.isArray(asset.rotation) ? asset.rotation : (fallback.rotation || [0, Math.PI, 0]),
                    modelScale: Number.isFinite(asset.modelScale) ? asset.modelScale : fallback.modelScale,
                    targetViewLength: Number.isFinite(asset.targetViewLength) ? asset.targetViewLength : fallback.targetViewLength,
                    muzzleOffset: Array.isArray(asset.muzzleOffset) ? asset.muzzleOffset : (fallback.muzzleOffset || [0, 0, -0.6]),
                    muzzleSocketAliases: Array.isArray(asset.muzzleSocketAliases) ? asset.muzzleSocketAliases : (fallback.muzzleSocketAliases || []),
                    animationAliases: asset.animationAliases || fallback.animationAliases || {},
                    ammo: Number.isFinite(asset.ammo) ? asset.ammo : (Number.isFinite(asset.magazineSize) ? asset.magazineSize : fallback.ammo),
                    magazineSize: Number.isFinite(asset.magazineSize) ? asset.magazineSize : fallback.magazineSize,
                    totalAmmo: Number.isFinite(asset.reserveAmmo) ? asset.reserveAmmo : fallback.totalAmmo,
                    fireRate: Number.isFinite(asset.fireRateMs) ? asset.fireRateMs : fallback.fireRate,
                    damage: Number.isFinite(asset.damage) ? asset.damage : fallback.damage
                };
            });
        }

        for (const texture of manifestConfig.textures || []) {
            if (texture.id === 'fx_muzzle_flash' && texture.url) this.textureUrls.muzzleFlash = texture.url;
            if (texture.id === 'fx_smoke' && texture.url) this.textureUrls.smoke = texture.url;
        }

        for (const sound of manifestConfig.sounds || []) {
            if (sound.id === 'sfx_shoot' && sound.url) this.soundUrls.shoot = sound.url;
            if (sound.id === 'sfx_hit_confirm' && sound.url) this.soundUrls.hitConfirm = sound.url;
        }
    }

    createPlayerAvatar() {
        this.avatar = new THREE.Group();

        const armorMat = new THREE.MeshStandardMaterial({ color: 0x526c8f, roughness: 0.42, metalness: 0.72 });
        const undersuitMat = new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.85, metalness: 0.08 });
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x5fd6ff, emissive: 0x16384a, roughness: 0.18, metalness: 0.9 });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0xbfc9d6, roughness: 0.35, metalness: 0.8 });
        const rifleMat = new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.38, metalness: 0.82 });
        const muzzleMat = new THREE.MeshStandardMaterial({ color: 0x9dabbc, roughness: 0.26, metalness: 0.92 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xcab29d, roughness: 0.72, metalness: 0.02 });

        const addPart = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.rotation.set(rx, ry, rz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.avatar.add(mesh);
            return mesh;
        };

        addPart(new THREE.BoxGeometry(0.54, 0.82, 0.28), undersuitMat, 0, 1.05, 0.01);
        addPart(new THREE.BoxGeometry(0.68, 0.55, 0.34), armorMat, 0, 1.14, 0.02);
        addPart(new THREE.BoxGeometry(0.54, 0.28, 0.3), accentMat, 0, 0.82, 0.02);
        addPart(new THREE.BoxGeometry(0.74, 0.12, 0.22), armorMat, 0, 1.42, 0.04);
        addPart(new THREE.CylinderGeometry(0.11, 0.14, 0.16, 14), armorMat, 0, 1.58, 0, Math.PI / 2, 0, 0);
        addPart(new THREE.BoxGeometry(0.34, 0.34, 0.28), armorMat, 0, 1.78, 0.01);
        addPart(new THREE.BoxGeometry(0.26, 0.18, 0.3), visorMat, 0, 1.76, -0.12);
        addPart(new THREE.BoxGeometry(0.18, 0.1, 0.18), skinMat, 0, 1.57, -0.02);
        addPart(new THREE.BoxGeometry(0.14, 0.14, 0.08), accentMat, 0, 1.9, 0.02);
        addPart(new THREE.BoxGeometry(0.1, 0.26, 0.22), accentMat, -0.18, 1.12, -0.08, 0.1, 0, 0.34);
        addPart(new THREE.BoxGeometry(0.1, 0.26, 0.22), accentMat, 0.18, 1.12, -0.08, 0.1, 0, -0.34);

        addPart(new THREE.CapsuleGeometry(0.09, 0.3, 6, 10), undersuitMat, -0.36, 1.1, 0.02, 0, 0, -0.18);
        addPart(new THREE.CapsuleGeometry(0.09, 0.3, 6, 10), undersuitMat, 0.36, 1.1, 0.02, 0, 0, 0.18);
        addPart(new THREE.BoxGeometry(0.14, 0.2, 0.18), armorMat, -0.44, 1.26, 0.02, 0, 0, -0.24);
        addPart(new THREE.BoxGeometry(0.14, 0.2, 0.18), armorMat, 0.44, 1.26, 0.02, 0, 0, 0.24);
        addPart(new THREE.BoxGeometry(0.12, 0.24, 0.12), undersuitMat, -0.48, 0.78, 0.02, 0.12, 0, 0.06);
        addPart(new THREE.BoxGeometry(0.12, 0.24, 0.12), undersuitMat, 0.48, 0.78, 0.02, 0.12, 0, -0.06);

        addPart(new THREE.CapsuleGeometry(0.11, 0.34, 6, 10), undersuitMat, -0.16, 0.38, 0.01, 0.04, 0, -0.03);
        addPart(new THREE.CapsuleGeometry(0.11, 0.34, 6, 10), undersuitMat, 0.16, 0.38, 0.01, 0.04, 0, 0.03);
        addPart(new THREE.BoxGeometry(0.18, 0.18, 0.22), armorMat, -0.16, 0.6, 0.03);
        addPart(new THREE.BoxGeometry(0.18, 0.18, 0.22), armorMat, 0.16, 0.6, 0.03);
        addPart(new THREE.BoxGeometry(0.18, 0.28, 0.2), armorMat, -0.16, 0.06, 0.04);
        addPart(new THREE.BoxGeometry(0.18, 0.28, 0.2), armorMat, 0.16, 0.06, 0.04);
        addPart(new THREE.BoxGeometry(0.2, 0.08, 0.28), accentMat, -0.16, -0.16, 0.03);
        addPart(new THREE.BoxGeometry(0.2, 0.08, 0.28), accentMat, 0.16, -0.16, 0.03);

        const rifle = new THREE.Group();
        const addRiflePart = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            mesh.rotation.set(rx, ry, rz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            rifle.add(mesh);
            return mesh;
        };
        addRiflePart(new THREE.BoxGeometry(0.1, 0.12, 0.86), rifleMat, 0, 0, -0.02);
        addRiflePart(new THREE.BoxGeometry(0.06, 0.16, 0.24), rifleMat, 0, -0.08, 0.18, 0.2, 0, 0);
        addRiflePart(new THREE.BoxGeometry(0.08, 0.18, 0.18), accentMat, 0, -0.16, -0.04, 0.12, 0, 0);
        addRiflePart(new THREE.BoxGeometry(0.05, 0.08, 0.28), accentMat, 0, 0.1, -0.22, 0, 0, 0);
        addRiflePart(new THREE.CylinderGeometry(0.03, 0.03, 0.58, 10), muzzleMat, 0, -0.01, -0.52, Math.PI / 2, 0, 0);
        addRiflePart(new THREE.BoxGeometry(0.08, 0.04, 0.14), visorMat, 0, 0.13, 0.04, 0, 0, 0);
        rifle.position.set(0.24, 1.07, -0.18);
        rifle.rotation.set(0.08, 0.08, -0.22);
        this.avatar.add(rifle);

        this.avatar.visible = false;
        this.scene.add(this.avatar);
    }

    initLoader() {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.loader = new GLTFLoader();
        this.loader.setDRACOLoader(dracoLoader);
        this.textureLoader = new THREE.TextureLoader();
        this.textures = {
            muzzleFlash: this.textureLoader.load(this.textureUrls.muzzleFlash),
            smoke: this.textureLoader.load(this.textureUrls.smoke)
        };
    }

    initSounds() {
        const shootSound = new THREE.Audio(this.listener);
        this.audioLoader.load(this.soundUrls.shoot, (buffer) => {
            shootSound.setBuffer(buffer);
            shootSound.setVolume(0.5);
        });
        this.sounds.shoot = shootSound;
        this.sounds.hitConfirm = new THREE.Audio(this.listener);
        this.sounds.headshotConfirm = new THREE.Audio(this.listener);
        this.sounds.hitConfirm.setVolume(0.18);
        this.sounds.headshotConfirm.setVolume(0.24);
        for (let i = 0; i < 4; i++) {
            const snd = new THREE.Audio(this.listener);
            snd.setVolume(0.3);
            this.impactSoundPool.push(snd);
        }
        this.audioLoader.load(this.soundUrls.hitConfirm, (buffer) => {
            this.impactSoundPool.forEach((snd) => snd.setBuffer(buffer));
            this.sounds.hitConfirm.setBuffer(buffer);
            this.sounds.headshotConfirm.setBuffer(buffer);
        });
    }

    getCurrentWeaponConfig() {
        return this.weaponConfigs[this.currentWeaponIndex] || this.weaponConfigs[0];
    }

    async loadWeapons() {
        const promises = this.weaponConfigs.map((config, index) => new Promise((resolve) => {
            this.loader.load(config.url, (gltf) => {
                const model = gltf.scene;
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                const targetViewLength = Number.isFinite(config.targetViewLength) ? config.targetViewLength : 0.7;
                const scale = (targetViewLength / maxDim) * (config.modelScale ?? 1);
                model.scale.setScalar(scale);
                model.rotation.set(...(config.rotation || [0, Math.PI, 0]));
                model.position.set(...config.pos);
                model.visible = index === 0;
                model.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => {
                            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                            mat.needsUpdate = true;
                        });
                    }
                });
                this.weaponContainer.add(model);
                this.weapons[index] = model;
                if (gltf.animations?.length) {
                    const mixer = new THREE.AnimationMixer(model);
                    this.mixers[index] = mixer;
                    this.actions[index] = {};
                    const aliasMatches = (clipName, state, fallbackAliases) => {
                        const aliases = config.animationAliases?.[state] || fallbackAliases;
                        return aliases.some(alias => clipName.includes(String(alias).toLowerCase()));
                    };
                    gltf.animations.forEach(clip => {
                        const name = clip.name.toLowerCase();
                        if (aliasMatches(name, 'reload', ['reload'])) this.actions[index].reload = mixer.clipAction(clip);
                        else if (aliasMatches(name, 'fire', ['shoot', 'fire'])) this.actions[index].fire = mixer.clipAction(clip);
                    });
                }
                const socketAliases = Array.isArray(config.muzzleSocketAliases)
                    ? config.muzzleSocketAliases.map(alias => String(alias).toLowerCase()).filter(Boolean)
                    : [];
                let socketObject = null;
                if (socketAliases.length > 0) {
                    model.traverse(child => {
                        if (socketObject) return;
                        const childName = (child.name || '').toLowerCase();
                        if (socketAliases.some(alias => childName.includes(alias))) socketObject = child;
                    });
                }
                const muzzle = new THREE.Group();
                muzzle.name = 'muzzle_flash';
                if (socketObject) {
                    socketObject.add(muzzle);
                } else {
                    muzzle.position.set(...(config.muzzleOffset || [0, 0, -0.6]));
                    model.add(muzzle);
                }
                resolve();
            }, undefined, () => resolve());
        }));
        await Promise.all(promises);
        this.updateAmmoUI();
    }

    async reload() {
        if (this.isReloading || this.isSwitching) return;
        const config = this.getCurrentWeaponConfig();
        if (config.ammo >= config.magazineSize || config.totalAmmo <= 0) return;
        this.isReloading = true;
        const action = this.actions[this.currentWeaponIndex]?.reload;
        if (action) {
            action.reset().setLoop(THREE.LoopOnce).play();
            const duration = action.getClip().duration * 1000;
            await new Promise(r => setTimeout(r, duration));
        } else {
            const weapon = this.weapons[this.currentWeaponIndex];
            if (weapon) {
                await this.animateWeaponMove(weapon, weapon.position.y, -0.5, 260);
                await this.animateWeaponMove(weapon, -0.5, config.pos[1], 260);
            }
        }
        const needed = config.magazineSize - config.ammo;
        const reloadAmount = Math.min(needed, config.totalAmmo);
        config.ammo += reloadAmount;
        config.totalAmmo -= reloadAmount;
        this.updateAmmoUI();
        this.isReloading = false;
    }

    toggleCameraMode() {
        this.cameraMode = this.cameraMode === 'fps' ? 'tps' : 'fps';
        this.weaponContainer.visible = this.cameraMode === 'fps';
        this.avatar.visible = this.cameraMode === 'tps';
        this.camera.rotation.z = 0;
        this.updateCameraTransform([], true);
    }

    setADS(active) {
        this.isADS = !!active;
    }

    throwGrenade(enemyManager) {
        if (this.grenadeCooldown > 0) return;
        const origin = this.getEyePosition(this.tmpV3A).clone();
        const dir = this.camera.getWorldDirection(this.tmpV3B).clone().normalize();
        const velocity = dir.multiplyScalar(12);
        velocity.y += 4.8;
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 10, 10),
            new THREE.MeshStandardMaterial({ color: 0x49665a, metalness: 0.45, roughness: 0.45 })
        );
        mesh.position.copy(origin).addScaledVector(this.tmpV3B, 0.6);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.grenades.push({ mesh, velocity, timer: 0, exploded: false, enemyManager });
        this.grenadeCooldown = 1.3;
    }

    updateGrenades(delta, collidables, enemyManager) {
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const grenade = this.grenades[i];
            if (!grenade || !grenade.mesh) continue;
            grenade.timer += delta;
            grenade.velocity.y -= 18 * delta;
            grenade.mesh.position.addScaledVector(grenade.velocity, delta);
            grenade.mesh.rotation.x += 8 * delta;
            grenade.mesh.rotation.z += 11 * delta;
            if (grenade.mesh.position.y <= 0.2 || grenade.timer >= 1.6) {
                this.explodeGrenade(grenade.mesh.position.clone(), enemyManager || grenade.enemyManager);
                this.scene.remove(grenade.mesh);
                grenade.mesh.geometry?.dispose?.();
                grenade.mesh.material?.dispose?.();
                this.grenades.splice(i, 1);
            }
        }
    }

    explodeGrenade(position, enemyManager) {
        const radius = 7.5;
        const blast = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.18, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 })
        );
        blast.position.copy(position);
        this.scene.add(blast);
        const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.smoke, color: 0xe8d0a8, transparent: true, opacity: 0.65, depthWrite: false }));
        smoke.position.copy(position).add(new THREE.Vector3(0, 0.4, 0));
        smoke.scale.setScalar(2.4);
        this.scene.add(smoke);
        const flash = new THREE.PointLight(0xffaa44, 7, 16);
        flash.position.copy(position).add(new THREE.Vector3(0, 0.5, 0));
        this.scene.add(flash);
        if (enemyManager?.applyExplosionDamage) enemyManager.applyExplosionDamage(position, radius, 95, 'Grenade');
        const start = performance.now();
        const animate = (time) => {
            const p = Math.min(1, (time - start) / 450);
            blast.scale.setScalar(1 + p * 4.2);
            blast.material.opacity = 0.9 * (1 - p);
            smoke.scale.setScalar(2.4 + p * 7.5);
            smoke.material.opacity = 0.65 * (1 - p);
            flash.intensity = 7 * (1 - p);
            if (p < 1) requestAnimationFrame(animate);
            else {
                this.scene.remove(blast, smoke, flash);
                blast.geometry.dispose();
                blast.material.dispose();
                smoke.material.dispose();
            }
        };
        requestAnimationFrame(animate);
    }

    shoot(collidables, enemyManager) {
        if (this.isReloading || this.isSwitching) return;
        const now = performance.now();
        const config = this.getCurrentWeaponConfig();
        if (now - this.lastFireTime < config.fireRate) return;
        if (config.ammo <= 0) {
            this.reload();
            return;
        }
        this.lastFireTime = now;
        config.ammo--;
        this.updateAmmoUI();
        const fireAction = this.actions[this.currentWeaponIndex]?.fire;
        if (fireAction) fireAction.reset().setLoop(THREE.LoopOnce).play();
        if (this.sounds.shoot.buffer) {
            if (this.sounds.shoot.isPlaying) this.sounds.shoot.stop();
            if (this.sounds.shoot.setPlaybackRate) this.sounds.shoot.setPlaybackRate(0.96 + Math.random() * 0.08);
            this.sounds.shoot.play();
        }
        this.showMuzzleFlash(config);
        const recoilUp = (this.isADS ? 0.78 : 1.22) + Math.random() * (this.isADS ? 0.2 : 0.32);
        const recoilSide = (Math.random() - 0.5) * (this.isADS ? 0.15 : 0.28);
        this.recoilVelocity.y += recoilUp;
        this.recoilVelocity.x += recoilSide;
        this.weaponKickVelocity.z -= this.isADS ? 2.1 : 2.95;
        this.weaponKickVelocity.y -= this.isADS ? 0.5 : 0.76;
        this.weaponKickVelocity.x += recoilSide * 0.82;
        this.shake(this.isADS ? 0.08 : 0.15);
        this.ui?.pulseShotFeedback?.({
            weaponId: config.id,
            ads: this.isADS,
            power: this.isADS ? 0.9 : 1.15,
            criticalHint: config.id === 'sniper'
        });
        this.showShellEjection();

        const camPos = this.camera.getWorldPosition(this.tmpV3A);
        const camDir = this.camera.getWorldDirection(this.tmpV3B);
        const moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        const moveFactor = Math.min(moveSpeed / this.moveSpeed, 1);
        const recoilFactor = Math.min(this.recoilAmount.length() * 0.7, 1);
        const baseSpread = this.isADS ? config.adsSpread : config.baseSpread;
        const spread = baseSpread + config.moveSpread * moveFactor + (this.onGround ? 0 : config.airSpread) + config.recoilSpread * recoilFactor;
        const shotDir = this.tmpShotDir.copy(camDir);
        const right = this.tmpShotRight.crossVectors(shotDir, this.tmpV3D.set(0, 1, 0)).normalize();
        const up = this.tmpShotUp.crossVectors(right, shotDir).normalize();
        shotDir.addScaledVector(right, (Math.random() * 2 - 1) * spread);
        shotDir.addScaledVector(up, (Math.random() * 2 - 1) * spread);
        shotDir.normalize();

        this.shootRaycaster.set(camPos, shotDir);
        this.shootRaycaster.far = 120;
        this.shootRaycaster.camera = this.camera;
        const targets = [...collidables];
        if (enemyManager) enemyManager.enemies.forEach(e => { if (e.state !== 'dead') targets.push(e.mesh); });
        const hits = this.shootRaycaster.intersectObjects(targets, true);
        const firstHit = hits.find(hit => !hit.object?.isSprite) || null;
        const endPos = this.tmpV3C;
        if (firstHit) endPos.copy(firstHit.point);
        else endPos.copy(camPos).addScaledVector(shotDir, 120);
        this.showBulletTrail(endPos, config);
        if (!firstHit) return;
        const normal = this.tmpV3D;
        if (firstHit.face?.normal) normal.copy(firstHit.face.normal).transformDirection(firstHit.object.matrixWorld);
        else normal.set(0, 1, 0);
        this.showImpactEffect(firstHit.point, normal, config);
        if (!enemyManager) return;
        const hitResult = enemyManager.checkHit(firstHit.object, config.damage, firstHit.point, 'gun');
        if (hitResult?.hit && hitResult.damage > 0) {
            this.ui?.showDamageNumber(hitResult.damage, firstHit.point, this.camera, {
                critical: !!hitResult.critical,
                headshot: !!hitResult.headshot,
                killed: !!hitResult.killed,
                weaponId: config.id
            });
            this.playHitConfirmSound(hitResult);
            if (this.ui?.flashCrosshair) {
                if (hitResult.headshot) this.ui.flashCrosshair('headshot');
                else if (hitResult.critical) this.ui.flashCrosshair('critical');
                else this.ui.flashCrosshair('hit');
            }
            this.ui?.showHitConfirm?.(hitResult);
            this.shake(hitResult.killed ? (this.isADS ? 0.07 : 0.11) : (this.isADS ? 0.024 : 0.04));
        }
    }

    playHitConfirmSound(hitResult = {}) {
        const snd = hitResult.headshot ? this.sounds.headshotConfirm : this.sounds.hitConfirm;
        if (!snd?.buffer) return;
        if (snd.isPlaying) snd.stop();
        if (snd.setPlaybackRate) snd.setPlaybackRate(hitResult.headshot ? 1.45 : (hitResult.critical ? 1.2 : 1.02));
        snd.play();
    }

    shake(amount) {
        this.shakeAmount.x += (Math.random() - 0.5) * amount;
        this.shakeAmount.y += (Math.random() - 0.5) * amount * 0.8;
        this.shakeAmount.z += (Math.random() - 0.5) * amount * 0.25;
    }

    showMuzzleFlash(config) {
        const weapon = this.weapons[this.currentWeaponIndex];
        const muzzle = weapon?.getObjectByName('muzzle_flash');
        if (!muzzle) return;
        const flashLight = new THREE.PointLight(0xffb15e, 14.5 + Math.random() * 5.5, 9.5);
        muzzle.add(flashLight);
        const flashRoot = new THREE.Group();
        muzzle.add(flashRoot);
        const baseSize = config?.bulletSize ? 19 * config.bulletSize : 0.5;
        const layers = [
            { color: 0xffffff, size: 1.12, opacity: 1.0, pos: [0, 0, -0.16] },
            { color: 0xffdc95, size: 1.95, opacity: 0.92, pos: [0, 0.008, -0.24] },
            { color: 0xff9f35, size: 2.8, opacity: 0.62, pos: [0, 0.014, -0.34] },
            { color: 0xff6a00, size: 3.25, opacity: 0.32, pos: [0, 0.022, -0.45] }
        ];
        const sprites = layers.map((layer, index) => {
            const mat = new THREE.SpriteMaterial({
                map: this.textures.muzzleFlash,
                color: layer.color,
                transparent: true,
                opacity: layer.opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                rotation: (Math.random() - 0.5) * 0.3 + index * 0.08
            });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(baseSize * layer.size * (0.95 + Math.random() * 0.2), baseSize * layer.size * 1.35, 1);
            sprite.position.set(...layer.pos);
            flashRoot.add(sprite);
            return sprite;
        });
        const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.textures.smoke,
            color: 0xffd5a3,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        smoke.position.set(0, 0.01, -0.2);
        smoke.scale.set(baseSize * 1.8, baseSize * 1.15, 1);
        flashRoot.add(smoke);
        const start = performance.now();
        const animate = (time) => {
            const p = Math.min(1, (time - start) / 68);
            const burst = 1 + (1 - p) * 0.45;
            sprites.forEach((sprite, index) => {
                sprite.material.opacity = layers[index].opacity * (1 - p);
                sprite.scale.set(baseSize * layers[index].size * burst, baseSize * layers[index].size * 1.45 * burst, 1);
            });
            smoke.material.opacity = 0.42 * (1 - p);
            smoke.scale.set(baseSize * (1.8 + p * 1.6), baseSize * (1.15 + p * 0.9), 1);
            smoke.position.z = -0.2 - p * 0.16;
            flashLight.intensity = (12.4 + sprites.length * 1.4) * (1 - p * 0.9);
            if (p < 1) requestAnimationFrame(animate);
            else {
                muzzle.remove(flashRoot, flashLight);
                sprites.forEach(sprite => sprite.material.dispose());
                smoke.material.dispose();
            }
        };
        requestAnimationFrame(animate);
    }

    showShellEjection() {
        const weapon = this.weapons[this.currentWeaponIndex];
        if (!weapon) return;
        const shell = new THREE.Mesh(
            new THREE.CylinderGeometry(0.005, 0.005, 0.02, 6),
            new THREE.MeshStandardMaterial({ color: 0xccaa44, metalness: 0.8, roughness: 0.2 })
        );
        const worldPos = new THREE.Vector3();
        weapon.localToWorld(worldPos.set(0.1, 0, 0.1));
        shell.position.copy(worldPos);
        shell.quaternion.copy(weapon.quaternion);
        shell.rotation.z += Math.PI / 2;
        this.scene.add(shell);
        const velocity = new THREE.Vector3(0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5, 0.2 + Math.random() * 0.3);
        velocity.applyQuaternion(weapon.getWorldQuaternion(this.tmpQuat));
        const startTime = performance.now();
        const animateShell = (time) => {
            const elapsed = (time - startTime) / 1000;
            if (elapsed < 1) {
                const moveVec = velocity.clone().multiplyScalar(elapsed);
                moveVec.y += -4.9 * elapsed * elapsed;
                shell.position.copy(worldPos).add(moveVec);
                shell.rotation.x += 0.2;
                shell.rotation.y += 0.25;
                shell.rotation.z += 0.18;
                requestAnimationFrame(animateShell);
            } else {
                this.scene.remove(shell);
                shell.geometry.dispose();
                shell.material.dispose();
            }
        };
        requestAnimationFrame(animateShell);
    }

    showBulletTrail(endPos, config) {
        const weapon = this.weapons[this.currentWeaponIndex];
        const muzzle = weapon?.getObjectByName('muzzle_flash');
        if (!muzzle) return;
        const startPos = new THREE.Vector3();
        muzzle.getWorldPosition(startPos);
        const tracerRadius = Math.max(0.011, (config?.bulletSize || 0.02) * 0.82);
        const tracerLength = Math.max(0.46, (config?.bulletSize || 0.02) * 32);
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const distance = direction.length();
        if (distance < 0.0001) return;
        direction.normalize();

        const tracer = new THREE.Mesh(
            new THREE.CylinderGeometry(tracerRadius, tracerRadius * 0.7, tracerLength, 8),
            new THREE.MeshBasicMaterial({ color: config?.bulletColor ?? 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        tracer.position.copy(startPos).addScaledVector(direction, Math.min(distance * 0.5, tracerLength * 0.45));
        tracer.lookAt(endPos);
        tracer.rotateX(Math.PI / 2);
        tracer.scale.y = Math.max(1, distance / tracerLength);
        this.scene.add(tracer);

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.textures.muzzleFlash,
            color: config?.bulletColor ?? 0xffffff,
            transparent: true,
            opacity: 0.84,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        glow.position.copy(endPos).addScaledVector(direction, -0.04);
        glow.scale.setScalar(Math.max(0.12, tracerRadius * 11));
        this.scene.add(glow);

        const startTime = performance.now();
        const animateTracer = (time) => {
            const p = Math.min(1, (time - startTime) / 42);
            tracer.material.opacity = 1 - p * 0.94;
            tracer.scale.x = 1 + p * 0.55;
            tracer.scale.z = 1 + p * 0.35;
            glow.material.opacity = 0.72 * (1 - p);
            glow.scale.setScalar(Math.max(0.12, tracerRadius * 11) * (1 + p * 0.9));
            if (p < 1) requestAnimationFrame(animateTracer);
            else {
                this.scene.remove(tracer, glow);
                tracer.geometry.dispose();
                tracer.material.dispose();
                glow.material.dispose();
            }
        };
        requestAnimationFrame(animateTracer);
    }

    showImpactEffect(pos, normal, config) {
        if (this.impactSoundPool.length > 0) {
            const impactSnd = this.impactSoundPool[this.impactSoundIndex % this.impactSoundPool.length];
            this.impactSoundIndex++;
            if (impactSnd.buffer) {
                if (impactSnd.isPlaying) impactSnd.stop();
                impactSnd.setVolume(0.2);
                impactSnd.play();
            }
        }
        const impactSize = Math.max(0.022, (config?.impactSize || 0.02) * 1.65);
        const unitNormal = normal.clone().normalize();
        const group = new THREE.Group();
        group.position.copy(pos).addScaledVector(unitNormal, 0.012);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), unitNormal);
        this.scene.add(group);
        const core = new THREE.Mesh(this.fxGeometries.impactCore, new THREE.MeshBasicMaterial({ color: 0xfff0d2, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false }));
        core.scale.setScalar(impactSize * 0.82);
        group.add(core);
        const ring = new THREE.Mesh(this.fxGeometries.impactRing, new THREE.MeshBasicMaterial({ color: 0xffc97a, side: THREE.DoubleSide, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.scale.setScalar(impactSize * 1.55);
        group.add(ring);
        const sparks = [];
        for (let i = 0; i < 7; i++) {
            const spark = new THREE.Mesh(
                new THREE.CylinderGeometry(impactSize * 0.06, impactSize * 0.12, impactSize * (1.3 + i * 0.45), 5),
                new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffffff : 0xffb257, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
            );
            spark.rotation.z = Math.random() * Math.PI * 2;
            spark.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
            spark.position.z = impactSize * (0.5 + i * 0.16);
            group.add(spark);
            sparks.push(spark);
        }
        const start = performance.now();
        const animate = (time) => {
            const p = Math.min(1, (time - start) / 180);
            core.scale.setScalar(impactSize * 0.82 * (1 + p * 1.8));
            ring.scale.setScalar(impactSize * 1.55 * (1 + p * 1.18));
            core.material.opacity = 0.98 * (1 - p);
            ring.material.opacity = 0.92 * (1 - p);
            sparks.forEach((spark, index) => {
                spark.position.z = impactSize * (0.5 + index * 0.22 + p * (1.4 + index * 0.55));
                spark.material.opacity = 0.85 * (1 - p);
                spark.scale.setScalar(1 + p * 0.5);
            });
            if (p < 1) requestAnimationFrame(animate);
            else {
                this.scene.remove(group);
                core.material.dispose();
                ring.material.dispose();
                sparks.forEach(spark => spark.material.dispose());
            }
        };
        requestAnimationFrame(animate);
    }

    updateAmmoUI() {
        const config = this.getCurrentWeaponConfig();
        const currentElem = document.getElementById('ammo-current');
        const totalElem = document.getElementById('ammo-total');
        const ammoHud = document.getElementById('ammo-hud');
        if (currentElem && totalElem && ammoHud) {
            currentElem.innerText = config.ammo;
            totalElem.innerText = `/ ${config.totalAmmo}`;
        }
        this.ui?.setWeaponType(config.displayName || config.id);
    }

    async switchWeapon() {
        if (this.isSwitching || this.weapons.length < 2) return;
        this.isSwitching = true;
        const nextIndex = (this.currentWeaponIndex + 1) % this.weaponConfigs.length;
        const currentWeapon = this.weapons[this.currentWeaponIndex];
        const nextWeapon = this.weapons[nextIndex];
        if (!currentWeapon || !nextWeapon) {
            this.isSwitching = false;
            return;
        }
        await this.animateWeaponMove(currentWeapon, currentWeapon.position.y, -1.0, 250);
        currentWeapon.visible = false;
        this.currentWeaponIndex = nextIndex;
        nextWeapon.visible = true;
        nextWeapon.position.y = -1.0;
        await this.animateWeaponMove(nextWeapon, -1.0, this.weaponConfigs[nextIndex].pos[1], 250);
        this.updateAmmoUI();
        this.isSwitching = false;
    }

    animateWeaponMove(model, startY, endY, duration) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            const animate = (currentTime) => {
                const progress = Math.min((currentTime - startTime) / duration, 1);
                const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
                model.position.y = startY + (endY - startY) * eased;
                if (progress < 1) requestAnimationFrame(animate);
                else resolve();
            };
            requestAnimationFrame(animate);
        });
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        this.ui?.showPlayerHitEffect(amount, this.health, this.maxHealth);
        this.ui?.updatePlayerHealth(this.health, this.maxHealth);
        this.shake(0.12);
    }

    resolveGroundedSpawnPosition(pos = new THREE.Vector3(0, 10, 0), collidables = []) {
        const spawn = pos.clone();
        const targets = Array.isArray(collidables) && collidables.length > 0
            ? collidables
            : [this.scene.getObjectByName('world_map'), this.scene.getObjectByName('fallback_ground')].filter(Boolean);
        if (targets.length === 0) return spawn;

        let maxY = spawn.y;
        for (const target of targets) {
            if (!target) continue;
            target.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(target);
            if (!box.isEmpty() && Number.isFinite(box.max.y)) maxY = Math.max(maxY, box.max.y);
        }

        const rayOrigin = this.tmpV3B.copy(spawn);
        rayOrigin.y = maxY + 50;
        this.groundRaycaster.set(rayOrigin, this.tmpV3A.set(0, -1, 0));
        this.groundRaycaster.far = Math.max(120, maxY - spawn.y + 120);

        const hits = this.groundRaycaster.intersectObjects(targets, true).filter(hit => {
            const name = (hit.object?.name || '').toLowerCase();
            return !name.includes('player') && !name.includes('enemy') && !name.includes('weapon');
        });
        if (hits.length > 0) {
            spawn.x = hits[0].point.x;
            spawn.y = hits[0].point.y + 0.02;
            spawn.z = hits[0].point.z;
        }
        return spawn;
    }

    reset(pos, collidables = []) {
        this.health = this.maxHealth;
        this.position.copy(this.resolveGroundedSpawnPosition(pos || new THREE.Vector3(0, 10, 0), collidables));
        this.velocity.set(0, 0, 0);
        this.onGround = false;
        this.recoilAmount.set(0, 0, 0);
        this.recoilVelocity.set(0, 0, 0);
        this.shakeAmount.set(0, 0, 0);
        this.cameraShakeOffset.set(0, 0, 0);
        this.weaponKick.set(0, 0, 0);
        this.weaponKickVelocity.set(0, 0, 0);
        this.grenadeCooldown = 0;
        this.ui?.updatePlayerHealth(this.health, this.maxHealth);
        this.updateCameraTransform([], true);
    }

    resetForNewRound(pos, collidables = []) {
        this.reset(pos, collidables);
        this.isReloading = false;
        this.isSwitching = false;
        this.isADS = false;
        this.cameraMode = 'fps';
        this.weaponContainer.visible = true;
        this.avatar.visible = false;
        this.weaponConfigs.forEach(cfg => {
            cfg.ammo = cfg.initialAmmo;
            cfg.totalAmmo = cfg.initialTotalAmmo;
        });
        this.currentWeaponIndex = 0;
        this.weapons.forEach((weapon, idx) => {
            if (!weapon) return;
            const cfg = this.weaponConfigs[idx];
            weapon.visible = idx === 0;
            weapon.position.set(...cfg.pos);
            weapon.rotation.set(...(cfg.rotation || [0, Math.PI, 0]));
        });
        this.updateAmmoUI();
    }

    getEyePosition(target = new THREE.Vector3()) {
        return target.copy(this.position).add(new THREE.Vector3(0, this.height, 0));
    }

    getPlayerPosition(target = new THREE.Vector3()) {
        return target.copy(this.position);
    }

    applyViewInput(yawDelta = 0, pitchDelta = 0) {
        this.viewYaw -= yawDelta;
        this.viewPitch = THREE.MathUtils.clamp(this.viewPitch - pitchDelta, -this.maxPitch, this.maxPitch);
    }

    getViewForward(target = new THREE.Vector3()) {
        this.viewEuler.set(this.viewPitch, this.viewYaw, 0, 'YXZ');
        return target.set(0, 0, -1).applyEuler(this.viewEuler).normalize();
    }

    getPlanarViewDirection(target = new THREE.Vector3()) {
        this.getViewForward(target);
        target.y = 0;
        if (target.lengthSq() < 1e-5) {
            target.set(Math.sin(this.avatarYaw), 0, -Math.cos(this.avatarYaw));
        }
        return target.normalize();
    }

    updateCameraTransform(collidables = [], immediate = false) {
        const eyePos = this.getEyePosition(this.tmpV3A);
        const moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        this.viewBobPhase += moveSpeed * 0.03;
        const bob = this.cameraMode === 'fps' ? Math.sin(this.viewBobPhase) * Math.min(0.03, moveSpeed * 0.004) : 0;

        if (this.cameraMode === 'fps') {
            this.camera.position.copy(eyePos);
            this.camera.position.y += bob;
            this.camera.rotation.set(this.viewPitch, this.viewYaw, 0, 'YXZ');
            this.avatar.visible = false;
            this.weaponContainer.visible = true;
        } else {
            const pivot = this.tmpV3B.copy(eyePos).add(new THREE.Vector3(0, 0.15, 0));
            const forward = this.getViewForward(this.tmpV3C);
            const planarForward = this.tmpV3D.copy(forward);
            planarForward.y = 0;
            if (planarForward.lengthSq() < 1e-5) {
                planarForward.set(Math.sin(this.avatarYaw), 0, -Math.cos(this.avatarYaw));
            }
            planarForward.normalize();
            const right = this.tmpV3E.crossVectors(planarForward, this.tmpV3F.set(0, 1, 0)).normalize();
            const desired = pivot.clone()
                .addScaledVector(right, this.thirdPersonSide)
                .addScaledVector(planarForward, -this.thirdPersonDistance)
                .add(new THREE.Vector3(0, this.thirdPersonHeight, 0));
            const toDesired = desired.clone().sub(pivot);
            const dist = toDesired.length();
            if (dist > 0.001 && collidables?.length) {
                this.cameraCollisionRay.set(pivot, toDesired.normalize());
                this.cameraCollisionRay.far = dist;
                const hits = this.cameraCollisionRay.intersectObjects(collidables, true);
                if (hits.length > 0) desired.copy(pivot).addScaledVector(this.cameraCollisionRay.ray.direction, Math.max(0.7, hits[0].distance - 0.2));
            }
            if (immediate) this.camera.position.copy(desired);
            else this.camera.position.lerp(desired, 0.16);
            const aimTarget = pivot.clone().addScaledVector(forward, this.thirdPersonAimDistance);
            this.camera.lookAt(aimTarget);
            this.weaponContainer.visible = false;
            this.avatar.visible = true;
            this.avatar.position.copy(this.position);
            const desiredYaw = Math.atan2(planarForward.x, planarForward.z) + Math.PI;
            this.avatarYaw = immediate ? desiredYaw : THREE.MathUtils.lerp(this.avatarYaw, desiredYaw, 0.18);
            this.avatar.rotation.y = this.avatarYaw;
        }

        this.targetFov = this.isADS ? this.adsFov : this.defaultFov;
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFov, immediate ? 1 : 0.16);
        this.camera.updateProjectionMatrix();
    }

    update(delta, inputs, collidables, enemyManager) {
        if (!delta) return;
        if (this.cameraShakeOffset.lengthSq() > 0) {
            this.camera.position.sub(this.cameraShakeOffset);
            this.cameraShakeOffset.set(0, 0, 0);
        }

        if (inputs.lookDelta && (inputs.lookDelta.x !== 0 || inputs.lookDelta.y !== 0)) {
            const sensitivity = 0.0022;
            this.applyViewInput(inputs.lookDelta.x * sensitivity, inputs.lookDelta.y * sensitivity);
            inputs.lookDelta.set(0, 0);
        }
        if (inputs.lookJoystick && (inputs.lookJoystick.x !== 0 || inputs.lookJoystick.y !== 0)) {
            const sensitivity = 2.0 * delta;
            this.applyViewInput(inputs.lookJoystick.x * sensitivity, inputs.lookJoystick.y * sensitivity);
        }

        if (inputs.toggleCamera) {
            this.toggleCameraMode();
            inputs.toggleCamera = false;
        }
        this.setADS(inputs.ads && !this.isSwitching && !this.isReloading);
        if (inputs.switchWeapon && !this.isSwitching) {
            this.switchWeapon();
            inputs.switchWeapon = false;
        }
        if (inputs.shoot) this.shoot(collidables, enemyManager);
        if (inputs.reload && !this.isReloading) {
            this.reload();
            inputs.reload = false;
        }
        if (inputs.throwGrenade) {
            this.throwGrenade(enemyManager);
            inputs.throwGrenade = false;
        }
        if (this.grenadeCooldown > 0) this.grenadeCooldown = Math.max(0, this.grenadeCooldown - delta);
        this.updateGrenades(delta, collidables, enemyManager);

        this.mixers.forEach(mixer => mixer?.update(delta));

        this.recoilVelocity.y -= this.recoilAmount.y * 48.0 * delta;
        this.recoilVelocity.x -= this.recoilAmount.x * 42.0 * delta;
        this.recoilVelocity.multiplyScalar(Math.pow(0.018, delta));
        this.recoilAmount.addScaledVector(this.recoilVelocity, delta);
        this.viewPitch = THREE.MathUtils.clamp(this.viewPitch - this.recoilVelocity.y * delta, -this.maxPitch, this.maxPitch);
        this.viewYaw -= this.recoilVelocity.x * delta;
        this.camera.rotation.z = -THREE.MathUtils.clamp(this.recoilVelocity.x * 0.08 + this.shakeAmount.x * 0.9, -0.035, 0.035);
        this.weaponKickVelocity.addScaledVector(this.weaponKick, -34 * delta);
        this.weaponKickVelocity.multiplyScalar(Math.pow(0.02, delta));
        this.weaponKick.addScaledVector(this.weaponKickVelocity, delta);
        this.shakeAmount.multiplyScalar(Math.pow(0.00002, delta));

        if (this.position.y < -50) {
            this.position.set(0, 10, 0);
            this.velocity.set(0, 0, 0);
            this.updateCameraTransform(collidables, true);
            return;
        }

        const friction = this.onGround ? 8.0 : 2.0;
        this.velocity.x -= this.velocity.x * friction * delta;
        this.velocity.z -= this.velocity.z * friction * delta;
        this.velocity.y -= this.gravity * delta;

        const inputDir = this.tmpV3A.set(0, 0, 0);
        inputDir.z = Number(inputs.forward) - Number(inputs.backward);
        inputDir.x = Number(inputs.right) - Number(inputs.left);
        if (inputDir.length() > 0) inputDir.normalize();
        const camDir = this.getPlanarViewDirection(this.tmpV3B);
        const camSide = this.tmpV3C.crossVectors(camDir, this.tmpV3D.set(0, 1, 0)).normalize();
        const accel = this.onGround ? 60.0 : 20.0;
        const moveVec = this.tmpV3E.set(0, 0, 0);
        moveVec.addScaledVector(camDir, inputDir.z);
        moveVec.addScaledVector(camSide, inputDir.x);
        this.velocity.x += moveVec.x * accel * delta;
        this.velocity.z += moveVec.z * accel * delta;

        const horizontalVelocity = this.tmpV2A.set(this.velocity.x, this.velocity.z);
        const maxMoveSpeed = this.isADS ? this.moveSpeed * 0.68 : this.moveSpeed;
        if (horizontalVelocity.length() > maxMoveSpeed) {
            horizontalVelocity.setLength(maxMoveSpeed);
            this.velocity.x = horizontalVelocity.x;
            this.velocity.z = horizontalVelocity.y;
        }

        if (inputs.jump && this.onGround) {
            this.velocity.y = this.jumpForce;
            this.onGround = false;
            inputs.jump = false;
        }

        this.applyMovement(delta, collidables);

        const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        const cfg = this.getCurrentWeaponConfig();
        const spreadScale = (this.isADS ? 0.3 : 0.75)
            + Math.min(horizontalSpeed / this.moveSpeed, 1) * 0.9
            + (this.onGround ? 0 : 0.45)
            + Math.min(this.recoilAmount.length() * 0.6, 0.8);
        this.currentSpreadScale = spreadScale;
        this.ui?.updateCrosshair(spreadScale, this.isADS);
        this.ui?.updatePlayerHealth(this.health, this.maxHealth);

        if (!this.isSwitching && this.weapons[this.currentWeaponIndex]) {
            const weapon = this.weapons[this.currentWeaponIndex];
            const time = performance.now() * 0.002;
            let breathY = Math.sin(time) * 0.005;
            let breathX = Math.cos(time * 0.5) * 0.005;
            if (horizontalSpeed > 0.1) {
                const walkCycle = Math.sin(time * 6);
                breathY += Math.abs(walkCycle) * (this.isADS ? 0.012 : 0.03);
                breathX += Math.cos(time * 3) * (this.isADS ? 0.008 : 0.015);
            }
            const targetPos = this.isADS ? cfg.adsPos : cfg.pos;
            const baseRotation = Array.isArray(cfg.rotation) ? cfg.rotation : [0, Math.PI, 0];
            const baseRotX = Number.isFinite(baseRotation[0]) ? baseRotation[0] : 0;
            const baseRotY = Number.isFinite(baseRotation[1]) ? baseRotation[1] : Math.PI;
            const baseRotZ = Number.isFinite(baseRotation[2]) ? baseRotation[2] : 0;
            weapon.position.y = THREE.MathUtils.lerp(weapon.position.y, targetPos[1] + breathY + this.weaponKick.y * 0.05, 0.22);
            weapon.position.x = THREE.MathUtils.lerp(weapon.position.x, targetPos[0] + breathX + this.weaponKick.x * 0.04, 0.2);
            weapon.position.z = THREE.MathUtils.lerp(weapon.position.z, targetPos[2] + this.weaponKick.z * 0.045, 0.28);
            weapon.rotation.x = THREE.MathUtils.lerp(weapon.rotation.x, baseRotX + (this.isADS ? -0.02 : 0) + this.weaponKick.z * -0.045, 0.16);
            weapon.rotation.y = THREE.MathUtils.lerp(weapon.rotation.y, baseRotY + this.weaponKick.x * 0.07, 0.16);
            weapon.rotation.z = THREE.MathUtils.lerp(weapon.rotation.z, baseRotZ + this.weaponKick.x * -0.16, 0.18);
        }

        this.updateCameraTransform(collidables, false);
        this.cameraShakeOffset.copy(this.shakeAmount).multiplyScalar(0.18);
        this.cameraShakeOffset.x = THREE.MathUtils.clamp(this.cameraShakeOffset.x, -0.038, 0.038);
        this.cameraShakeOffset.y = THREE.MathUtils.clamp(this.cameraShakeOffset.y, -0.03, 0.03);
        this.camera.position.add(this.cameraShakeOffset);
    }

    applyMovement(delta, collidables) {
        this.position.y += this.velocity.y * delta;
        this.groundRaycaster.set(this.position.clone().add(new THREE.Vector3(0, this.height, 0)), this.tmpV3A.set(0, -1, 0));
        this.groundRaycaster.far = this.height + 0.35;
        const groundHits = this.groundRaycaster.intersectObjects(collidables, true);
        if (groundHits.length > 0) {
            const dist = groundHits[0].distance;
            if (dist < this.height + 0.05) {
                this.position.y += (this.height - dist + 0.02);
                this.velocity.y = 0;
                this.onGround = true;
            }
        } else {
            this.onGround = false;
        }

        const horizontalMove = this.tmpV3B.set(this.velocity.x * delta, 0, this.velocity.z * delta);
        if (horizontalMove.length() === 0) return;
        const playerRadius = 0.5;

        if (Math.abs(horizontalMove.x) > 0.0001) {
            const rayOrigin = this.tmpV3C.copy(this.position).add(new THREE.Vector3(0, this.height * 0.65, 0));
            this.rayX.set(rayOrigin, this.tmpV3D.set(horizontalMove.x > 0 ? 1 : -1, 0, 0));
            this.rayX.far = playerRadius;
            if (this.rayX.intersectObjects(collidables, true).length === 0) this.position.x += horizontalMove.x;
            else this.velocity.x = 0;
        }
        if (Math.abs(horizontalMove.z) > 0.0001) {
            const rayOrigin = this.tmpV3E.copy(this.position).add(new THREE.Vector3(0, this.height * 0.65, 0));
            this.rayZ.set(rayOrigin, this.tmpV3F.set(0, 0, horizontalMove.z > 0 ? 1 : -1));
            this.rayZ.far = playerRadius;
            if (this.rayZ.intersectObjects(collidables, true).length === 0) this.position.z += horizontalMove.z;
            else this.velocity.z = 0;
        }
    }
}
