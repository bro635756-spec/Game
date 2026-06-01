import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const DEFAULT_ENEMY_MODEL_URL = 'https://static.seeles.ai/games-sdk/multiplayer/Douglas.fbx';
const DEFAULT_ENEMY_ANIMATION_SOURCES = {
    idle: { url: 'https://static.seeles.ai/games-sdk/multiplayer/animations/Rifle-Aiming-Idle.fbx', format: 'fbx' },
    run: { url: 'https://static.seeles.ai/games-sdk/multiplayer/animations/Rifle-Run.fbx', format: 'fbx', targetState: 'walk' },
    jump: { url: 'https://static.seeles.ai/games-sdk/multiplayer/animations/Rifle-Jump.fbx', format: 'fbx', targetState: 'jump' },
    fire: { url: 'https://static.seeles.ai/games-sdk/multiplayer/animations/Rifle-Firing.fbx', format: 'fbx', targetState: 'attack' },
    death: { url: 'https://static.seeles.ai/games-sdk/multiplayer/animations/Rifile-Dying.fbx', format: 'fbx' }
};
const DEFAULT_ENEMY_WEAPON = {
    id: 'enemy_rifle_gun1',
    url: 'https://static.seeles.ai/games-sdk/multiplayer/gun1.glb',
    format: 'glb',
    targetLength: 0.82,
    handBlend: 0.34,
    forwardOffset: 0.22,
    upOffset: 0.03,
    rightHandAliases: ['righthand', 'rightwrist', 'handr', 'rhand', 'mixamorigRightHand'],
    leftHandAliases: ['lefthand', 'leftwrist', 'handl', 'lhand', 'mixamorigLeftHand']
};
const ENEMY_PROJECTILE = {
    speed: 48,
    damage: 12,
    life: 1.45,
    trailLength: 1.35,
    hitRadius: 0.72,
    wallPadding: 0.04
};
const PROJECTILE_AXIS = new THREE.Vector3(0, 1, 0);
const PROJECTILE_CORE_GEOMETRY = new THREE.SphereGeometry(0.075, 8, 8);
const PROJECTILE_TRAIL_GEOMETRY = new THREE.CylinderGeometry(0.018, 0.05, 1, 8, 1, true);
const PROJECTILE_FLASH_GEOMETRY = new THREE.SphereGeometry(0.22, 8, 8);
const PROJECTILE_IMPACT_GEOMETRY = new THREE.SphereGeometry(0.14, 8, 8);

function inferFormat(url = '', fallback = 'glb') {
    const clean = String(url).split('?')[0].split('#')[0].toLowerCase();
    if (clean.endsWith('.fbx')) return 'fbx';
    if (clean.endsWith('.glb')) return 'glb';
    if (clean.endsWith('.gltf')) return 'gltf';
    return fallback;
}

function normalizeNodeName(name) {
    return String(name || '')
        .split('|').pop()
        .split(':').pop()
        .replace(/^mixamorig/i, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
}

function findCharacterNode(model, candidates = []) {
    const names = new Set(candidates.map(normalizeNodeName).filter(Boolean));
    let found = null;
    model?.traverse?.(node => {
        if (found || !node.name) return;
        if (names.has(normalizeNodeName(node.name))) found = node;
    });
    return found;
}

function vectorFromConfig(value, fallback) {
    return Array.isArray(value) && value.length >= 3
        ? value.map(Number)
        : fallback;
}

export class Enemy {
    constructor(model, scene, animations, player, options = {}) {
        this.scene = scene;
        this.player = player;
        this.animations = animations;
        this.manager = options.manager || null;
        this.enemyType = options.enemyType || 'melee';
        this.animationAliases = {
            idle: ['idle'],
            walk: ['walk', 'run', 'move'],
            attack: ['attack', 'shoot', 'fire'],
            jump: ['jump'],
            hit: ['hit', 'damage'],
            death: ['death', 'die', 'dead'],
            ...(options.animationAliases || {})
        };
        this.weaponConfig = {
            ...DEFAULT_ENEMY_WEAPON,
            ...(options.weaponConfig || {})
        };
        this.nameLabel = options.isBoss ? 'FIELD COMMANDER' : (this.enemyType === 'ranged' ? 'RIFLEMAN' : 'ASSAULT UNIT');
        this.attackLabel = this.enemyType === 'ranged' ? 'Rifle Burst' : 'Assault Rifle';

        try { this.mesh = clone(model); }
        catch { this.mesh = model.clone(); }
        this.mesh.name = `${this.enemyType}_enemy_${Math.random().toString(36).slice(2, 9)}`;
        this.mesh.visible = true;
        this.mesh.traverse(child => {
            if (child.isMesh) {
                child.visible = true;
                child.frustumCulled = false;
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        mat.side = THREE.DoubleSide;
                        if (mat.opacity !== undefined && mat.opacity < 0.1) mat.opacity = 1;
                        mat.visible = true;
                    });
                }
            }
        });
        this.visualRoot = this.mesh.children[0] || this.mesh;
        this.visualBaseRotation = this.visualRoot.rotation.clone();
        this.visualBaseScale = this.visualRoot.scale.clone();

        this.mixer = new THREE.AnimationMixer(this.mesh);
        this.actions = {};
        if (animations?.length) {
            const aliasMatches = (clipName, state) => (this.animationAliases[state] || [])
                .some(alias => clipName.includes(String(alias).toLowerCase()));
            animations.forEach(clip => {
                const name = clip.name.toLowerCase();
                if (aliasMatches(name, 'idle')) this.actions.idle = this.mixer.clipAction(clip);
                else if (aliasMatches(name, 'attack')) this.actions.attack = this.mixer.clipAction(clip);
                else if (aliasMatches(name, 'walk')) this.actions.walk = this.mixer.clipAction(clip);
                else if (aliasMatches(name, 'jump')) this.actions.jump = this.mixer.clipAction(clip);
                else if (aliasMatches(name, 'death')) this.actions.death = this.mixer.clipAction(clip);
                else if (aliasMatches(name, 'hit')) this.actions.hit = this.mixer.clipAction(clip);
            });
            if (!this.actions.idle && animations[0]) this.actions.idle = this.mixer.clipAction(animations[0]);
            this.actions.idle?.play();
            if (this.actions.death) {
                this.actions.death.setLoop(THREE.LoopOnce, 1);
                this.actions.death.clampWhenFinished = true;
            }
            if (this.actions.jump) {
                this.actions.jump.setLoop(THREE.LoopOnce, 1);
                this.actions.jump.clampWhenFinished = true;
            }
        }

        const healthMultiplier = options.healthMultiplier ?? 1.0;
        const scaleMultiplier = options.scaleMultiplier ?? 1.0;
        const moveSpeedMultiplier = options.moveSpeedMultiplier ?? 1.0;
        if (scaleMultiplier !== 1.0) this.mesh.scale.multiplyScalar(scaleMultiplier);
        this.maxHealth = Math.round((this.enemyType === 'ranged' ? 85 : 100) * healthMultiplier);
        this.health = this.maxHealth;
        this.moveSpeed = (this.enemyType === 'ranged' ? 3.4 : 4.0) * moveSpeedMultiplier;
        this.attackRange = this.enemyType === 'ranged' ? 34 : 15;
        this.attackRangeSq = this.attackRange * this.attackRange;
        this.chaseRange = this.enemyType === 'ranged' ? 95 : 80;
        this.chaseRangeSq = this.chaseRange * this.chaseRange;
        this.optimalRange = this.enemyType === 'ranged' ? 22 : 0;
        this.attackDamageRangeSq = (this.attackRange + 2) * (this.attackRange + 2);
        this.closeChaseNoObstacleSq = 20 * 20;
        this.lastAttackTime = Math.random() * 600;
        this.isBoss = !!options.isBoss;
        this.globalSpeedScale = 1.0;
        this.deadRemovalTimer = null;
        this.state = 'idle';
        this.wanderTarget = null;
        this.wanderTime = 0;
        this.worldMap = null;
        this.projectiles = [];

        this.tmpPlayerPos = new THREE.Vector3();
        this.tmpMoveDir = new THREE.Vector3();
        this.tmpFinalDir = new THREE.Vector3();
        this.tmpLookTarget = new THREE.Vector3();
        this.tmpRayStart = new THREE.Vector3();
        this.upAxis = new THREE.Vector3(0, 1, 0);
        this.obstacleRay = new THREE.Raycaster();
        this.groundRay = new THREE.Raycaster();
        this.lastObstacleCheckTime = performance.now() + Math.random() * 80;
        this.lastObstacleHit = false;
        this.obstacleCheckInterval = 60;
        this.lastGroundSnapTime = performance.now() + Math.random() * 90;
        this.groundSnapInterval = 66;
        this.hitReactTimer = 0;
        this.hitReactDuration = 0.14;
        this.hitReactForce = 0;
        this.hitReactVertical = 0;
        this.hitReactTilt = 0;
        this.hitReactPitch = 0;
        this.hitReactDir = new THREE.Vector3();
        this.weapon = this.createWeaponInstance(options.weaponPrototype);
        this.aimBones = null;
        this.tmpGunRight = new THREE.Vector3();
        this.tmpGunUp = new THREE.Vector3(0, 1, 0);
        this.tmpGunCorrectedUp = new THREE.Vector3();
        this.tmpGunForward = new THREE.Vector3();
        this.tmpGunRightHandPos = new THREE.Vector3();
        this.tmpGunLeftHandPos = new THREE.Vector3();
        this.tmpGunBasePos = new THREE.Vector3();
        this.tmpGunMatrix = new THREE.Matrix4();
        this.tmpGunMuzzle = new THREE.Vector3();
        this.tmpProjectileStart = new THREE.Vector3();
        this.tmpProjectileEnd = new THREE.Vector3();
        this.tmpProjectileDir = new THREE.Vector3();
        this.tmpProjectileAim = new THREE.Vector3();
        this.tmpProjectileRight = new THREE.Vector3();
        this.tmpProjectileUp = new THREE.Vector3();
        this.tmpProjectilePoint = new THREE.Vector3();
        this.tmpProjectileClosest = new THREE.Vector3();
        this.tmpProjectilePlayer = new THREE.Vector3();
        this.projectileRay = new THREE.Raycaster();

        this.createHealthBar();
        this.scene.add(this.mesh);
        this.updateWeaponAttachment();
    }

    createWeaponInstance(weaponPrototype) {
        if (!weaponPrototype) return null;
        let weapon = null;
        try { weapon = clone(weaponPrototype); }
        catch { weapon = weaponPrototype.clone(true); }
        weapon.name = 'enemy_attached_rifle';
        const sourceMuzzle = weaponPrototype.userData?.muzzleLocal;
        if (sourceMuzzle?.isVector3) weapon.userData.muzzleLocal = sourceMuzzle.clone();
        else if (sourceMuzzle && Number.isFinite(sourceMuzzle.x) && Number.isFinite(sourceMuzzle.y) && Number.isFinite(sourceMuzzle.z)) {
            weapon.userData.muzzleLocal = new THREE.Vector3(sourceMuzzle.x, sourceMuzzle.y, sourceMuzzle.z);
        }
        weapon.userData.length = weaponPrototype.userData?.length || this.weaponConfig.targetLength || DEFAULT_ENEMY_WEAPON.targetLength;
        weapon.visible = false;
        this.scene.add(weapon);
        return weapon;
    }

    getAimBones() {
        if (this.aimBones) return this.aimBones;
        const rightAliases = this.weaponConfig.rightHandAliases || this.weaponConfig.handBoneAliases || DEFAULT_ENEMY_WEAPON.rightHandAliases;
        const leftAliases = this.weaponConfig.leftHandAliases || DEFAULT_ENEMY_WEAPON.leftHandAliases;
        this.aimBones = {
            rightHand: findCharacterNode(this.mesh, rightAliases),
            leftHand: findCharacterNode(this.mesh, leftAliases)
        };
        return this.aimBones;
    }

    updateWeaponAttachment(forwardOverride = null) {
        if (!this.weapon || !this.mesh) return null;
        const bones = this.getAimBones();
        if (!bones?.rightHand) {
            this.weapon.visible = false;
            return null;
        }

        this.mesh.updateMatrixWorld(true);
        bones.rightHand.getWorldPosition(this.tmpGunRightHandPos);
        if (bones.leftHand) bones.leftHand.getWorldPosition(this.tmpGunLeftHandPos);
        else this.tmpGunLeftHandPos.copy(this.tmpGunRightHandPos);

        if (forwardOverride && forwardOverride.lengthSq() > 0.000001) this.tmpGunForward.copy(forwardOverride);
        else this.mesh.getWorldDirection(this.tmpGunForward);
        this.tmpGunForward.y = 0;
        if (this.tmpGunForward.lengthSq() < 0.000001) this.tmpGunForward.set(0, 0, -1);
        this.tmpGunForward.normalize();

        const handBlend = Number.isFinite(this.weaponConfig.handBlend) ? this.weaponConfig.handBlend : DEFAULT_ENEMY_WEAPON.handBlend;
        const forwardOffset = Number.isFinite(this.weaponConfig.forwardOffset) ? this.weaponConfig.forwardOffset : DEFAULT_ENEMY_WEAPON.forwardOffset;
        const upOffset = Number.isFinite(this.weaponConfig.upOffset) ? this.weaponConfig.upOffset : DEFAULT_ENEMY_WEAPON.upOffset;
        this.tmpGunBasePos.copy(this.tmpGunRightHandPos).lerp(this.tmpGunLeftHandPos, bones.leftHand ? handBlend : 0);
        this.tmpGunBasePos.addScaledVector(this.tmpGunForward, forwardOffset);
        this.tmpGunBasePos.y += upOffset;

        this.tmpGunRight.crossVectors(this.tmpGunUp, this.tmpGunForward);
        if (this.tmpGunRight.lengthSq() < 0.000001) this.tmpGunRight.set(1, 0, 0);
        this.tmpGunRight.normalize();
        this.tmpGunCorrectedUp.crossVectors(this.tmpGunForward, this.tmpGunRight).normalize();
        this.tmpGunMatrix.makeBasis(this.tmpGunRight, this.tmpGunCorrectedUp, this.tmpGunForward);
        this.weapon.quaternion.setFromRotationMatrix(this.tmpGunMatrix);
        this.weapon.position.copy(this.tmpGunBasePos);
        this.weapon.visible = this.mesh.visible !== false;
        return this.weapon;
    }

    getWeaponMuzzlePosition(target = new THREE.Vector3()) {
        if (!this.weapon) return null;
        const local = this.weapon.userData?.muzzleLocal;
        if (local?.isVector3) return this.weapon.localToWorld(target.copy(local));
        return this.weapon.getWorldPosition(target);
    }

    createHealthBar() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        this.healthCanvas = canvas;
        this.healthCtx = canvas.getContext('2d');
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        this.healthSprite = new THREE.Sprite(material);
        this.healthSprite.name = 'enemy_health_bar';
        const s = (this.mesh && this.mesh.scale.y) ? this.mesh.scale.y : 1.0;
        this.healthSprite.position.y = (2.2 / s) + (0.2 / s);
        this.healthSprite.scale.set(1.2 / s, 0.15 / s, 1 / s);
        this.mesh.add(this.healthSprite);
        this.updateHealthBar();
    }

    updateHealthBar() {
        if (!this.healthCtx) return;
        const ctx = this.healthCtx;
        const w = this.healthCanvas.width;
        const h = this.healthCanvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, w, h);
        const hpPerc = Math.max(0, this.health / this.maxHealth);
        const gradient = ctx.createLinearGradient(0, 0, w, 0);
        if (hpPerc > 0.5) {
            gradient.addColorStop(0, '#00ff00');
            gradient.addColorStop(1, '#00cc00');
        } else if (hpPerc > 0.25) {
            gradient.addColorStop(0, '#ffff00');
            gradient.addColorStop(1, '#cc8800');
        } else {
            gradient.addColorStop(0, '#ff0000');
            gradient.addColorStop(1, '#cc0000');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(2, 2, (w - 4) * hpPerc, h - 4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        if (this.healthSprite.material.map) this.healthSprite.material.map.needsUpdate = true;
    }

    setPerformanceProfile({ speedScale = 1.0, obstacleInterval = 60, groundSnapInterval = 66 } = {}) {
        this.globalSpeedScale = speedScale;
        this.obstacleCheckInterval = obstacleInterval;
        this.groundSnapInterval = groundSnapInterval;
    }

    update(delta, runAI = true, sharedPlayerPos = null, runAnimation = true) {
        if (!this.mesh) return;
        this.updateProjectiles(delta);
        if (this.state === 'dead') {
            if (runAnimation && this.mixer) this.mixer.update(delta);
            this.updateWeaponAttachment();
            return;
        }
        if (!runAI) {
            this.applyHitReaction(delta);
            if (runAnimation && this.mixer) this.mixer.update(delta);
            this.updateWeaponAttachment();
            return;
        }
        const playerPos = this.tmpPlayerPos;
        if (sharedPlayerPos) playerPos.copy(sharedPlayerPos);
        else this.player.getPlayerPosition(playerPos);
        const enemyPos = this.mesh.position;
        const dx = enemyPos.x - playerPos.x;
        const dz = enemyPos.z - playerPos.z;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < this.attackRangeSq) this.handleAttack(playerPos, distanceSq, delta);
        else if (distanceSq < this.chaseRangeSq) this.handleChase(playerPos, delta, distanceSq);
        else this.handleWander(delta);

        const now = performance.now();
        if (now - this.lastGroundSnapTime >= this.groundSnapInterval) {
            this.lastGroundSnapTime = now;
            this.applyGroundSnap();
        }
        this.applyHitReaction(delta);
        if (runAnimation && this.mixer) this.mixer.update(delta);
        this.updateWeaponAttachment();
    }


    applyHitReaction(delta) {
        if (!this.mesh) return;
        const visual = this.visualRoot || this.mesh;
        if (this.hitReactTimer <= 0) {
            visual.rotation.x = THREE.MathUtils.lerp(visual.rotation.x, this.visualBaseRotation.x, 0.24);
            visual.rotation.z = THREE.MathUtils.lerp(visual.rotation.z, this.visualBaseRotation.z, 0.24);
            return;
        }
        const t = this.hitReactTimer / this.hitReactDuration;
        const push = this.hitReactForce * t * delta;
        if (push > 0) this.mesh.position.addScaledVector(this.hitReactDir, push);
        if (this.hitReactVertical > 0) this.mesh.position.y += this.hitReactVertical * t * delta;
        visual.rotation.x = THREE.MathUtils.lerp(visual.rotation.x, this.visualBaseRotation.x - this.hitReactPitch * t, 0.36);
        visual.rotation.z = THREE.MathUtils.lerp(visual.rotation.z, this.visualBaseRotation.z + this.hitReactTilt * t, 0.34);
        this.hitReactTimer = Math.max(0, this.hitReactTimer - delta);
        if (this.hitReactTimer <= 0) {
            visual.rotation.x = this.visualBaseRotation.x;
            visual.rotation.z = this.visualBaseRotation.z;
        }
    }

    handleAttack(playerPos, distanceSq, delta) {
        this.setState('attack');
        const enemyPos = this.mesh.position;
        const lookTarget = this.tmpLookTarget.copy(playerPos);
        lookTarget.y = enemyPos.y + 0.5;
        this.mesh.lookAt(lookTarget);
        const now = performance.now();
        if (this.enemyType === 'ranged') {
            if (distanceSq < (this.optimalRange * this.optimalRange) * 0.55) {
                const retreatDir = this.tmpMoveDir.subVectors(enemyPos, playerPos).setY(0).normalize();
                this.mesh.position.addScaledVector(retreatDir, this.moveSpeed * 0.55 * this.globalSpeedScale * delta);
            }
            if (now - this.lastAttackTime > 1600) {
                this.lastAttackTime = now;
                this.fireProjectile(playerPos);
            }
        } else if (now - this.lastAttackTime > 2000) {
            this.lastAttackTime = now;
            if (distanceSq < this.attackDamageRangeSq) this.player.takeDamage?.(5);
        }
    }

    fireProjectile(playerPos) {
        const muzzle = this.getWeaponMuzzlePosition(this.tmpRayStart) || this.mesh.position.clone().add(new THREE.Vector3(0, 1.35, 0));
        const target = this.tmpProjectileAim.copy(playerPos);
        target.y += this.player.height * 0.68;
        const distance = target.distanceTo(muzzle);
        if (this.player?.velocity) target.addScaledVector(this.player.velocity, Math.min(0.38, distance / ENEMY_PROJECTILE.speed) * 0.45);

        const dir = this.tmpProjectileDir.subVectors(target, muzzle).normalize();
        this.tmpProjectileRight.crossVectors(dir, this.upAxis);
        if (this.tmpProjectileRight.lengthSq() < 0.0001) this.tmpProjectileRight.set(1, 0, 0);
        this.tmpProjectileRight.normalize();
        this.tmpProjectileUp.crossVectors(this.tmpProjectileRight, dir).normalize();
        const spread = this.isBoss ? 0.006 : 0.012;
        dir
            .addScaledVector(this.tmpProjectileRight, (Math.random() - 0.5) * spread)
            .addScaledVector(this.tmpProjectileUp, (Math.random() - 0.5) * spread)
            .normalize();

        const projectile = this.createProjectileVisual(muzzle, dir);
        this.scene.add(projectile);
        this.createMuzzleFlash(muzzle, dir);
        this.projectiles.push({
            mesh: projectile,
            velocity: dir.clone().multiplyScalar(ENEMY_PROJECTILE.speed),
            direction: dir.clone(),
            life: 0,
            maxLife: ENEMY_PROJECTILE.life,
            damage: ENEMY_PROJECTILE.damage,
            hitRadius: ENEMY_PROJECTILE.hitRadius
        });
    }

    createProjectileVisual(position, direction) {
        const group = new THREE.Group();
        group.name = 'enemy_rifle_tracer';
        group.position.copy(position);
        group.quaternion.setFromUnitVectors(PROJECTILE_AXIS, direction);

        const trailMaterial = new THREE.MeshBasicMaterial({
            color: 0xff5a30,
            transparent: true,
            opacity: 0.74,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff0a8,
            transparent: true,
            opacity: 0.98,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const trail = new THREE.Mesh(PROJECTILE_TRAIL_GEOMETRY, trailMaterial);
        trail.name = 'enemy_tracer_tail';
        trail.position.y = -ENEMY_PROJECTILE.trailLength * 0.5;
        trail.scale.y = ENEMY_PROJECTILE.trailLength;
        const core = new THREE.Mesh(PROJECTILE_CORE_GEOMETRY, coreMaterial);
        core.name = 'enemy_tracer_core';
        group.add(trail, core);
        group.userData.trailMaterial = trailMaterial;
        group.userData.coreMaterial = coreMaterial;
        return group;
    }

    createMuzzleFlash(position, direction) {
        const flash = new THREE.Group();
        flash.name = 'enemy_muzzle_flash';
        flash.position.copy(position).addScaledVector(direction, 0.08);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffb35c,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const burst = new THREE.Mesh(PROJECTILE_FLASH_GEOMETRY, material);
        burst.scale.set(1.0, 0.55, 0.55);
        flash.quaternion.setFromUnitVectors(PROJECTILE_AXIS, direction);
        flash.add(burst);
        const light = new THREE.PointLight(0xff7a35, 1.8, 7);
        flash.add(light);
        this.scene.add(flash);
        setTimeout(() => {
            this.scene.remove(flash);
            material.dispose();
        }, 70);
    }

    updateProjectiles(delta) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.life += delta;
            this.tmpProjectileStart.copy(projectile.mesh.position);
            projectile.mesh.position.addScaledVector(projectile.velocity, delta);
            this.tmpProjectileEnd.copy(projectile.mesh.position);
            this.updateProjectileVisual(projectile);

            const worldHit = this.getProjectileWorldHit(this.tmpProjectileStart, this.tmpProjectileEnd);
            const playerHit = this.getProjectilePlayerHit(this.tmpProjectileStart, this.tmpProjectileEnd, projectile.hitRadius);
            if (playerHit.hit && (!worldHit || playerHit.distance <= worldHit.distance + ENEMY_PROJECTILE.wallPadding)) {
                this.player.takeDamage?.(projectile.damage);
                this.destroyProjectile(projectile, true, playerHit.point);
                this.projectiles.splice(i, 1);
                continue;
            }
            if (worldHit) {
                this.destroyProjectile(projectile, false, worldHit.point);
                this.projectiles.splice(i, 1);
                continue;
            }
            if (projectile.life > projectile.maxLife) {
                this.destroyProjectile(projectile, false, this.tmpProjectileEnd);
                this.projectiles.splice(i, 1);
            }
        }
    }

    updateProjectileVisual(projectile) {
        const fade = THREE.MathUtils.clamp(1 - projectile.life / projectile.maxLife, 0, 1);
        const pulse = 1 + Math.sin(projectile.life * 46) * 0.05;
        projectile.mesh.scale.setScalar(pulse);
        const trail = projectile.mesh.userData.trailMaterial;
        const core = projectile.mesh.userData.coreMaterial;
        if (trail) trail.opacity = 0.22 + fade * 0.52;
        if (core) core.opacity = 0.3 + fade * 0.68;
    }

    getProjectileWorldHit(start, end) {
        const worldMap = this.getWorldMap();
        if (!worldMap) return null;
        const segment = this.tmpProjectileDir.subVectors(end, start);
        const distance = segment.length();
        if (distance <= 0.0001) return null;
        this.projectileRay.set(start, segment.normalize());
        this.projectileRay.far = distance + ENEMY_PROJECTILE.wallPadding;
        const hits = this.projectileRay.intersectObject(worldMap, true);
        return hits.length > 0 ? hits[0] : null;
    }

    getProjectilePlayerHit(start, end, radius) {
        const playerPos = this.player.getPlayerPosition(this.tmpProjectilePlayer);
        let best = { hit: false, distance: Infinity, point: null };
        const offsets = [this.player.height * 0.45, this.player.height * 0.72, this.player.height * 0.94];
        for (const offset of offsets) {
            this.tmpProjectilePoint.copy(playerPos);
            this.tmpProjectilePoint.y += offset;
            const result = this.getSegmentPointHit(start, end, this.tmpProjectilePoint, radius);
            if (result.hit && result.distance < best.distance) best = result;
        }
        return best;
    }

    getSegmentPointHit(start, end, point, radius) {
        const segment = this.tmpProjectileDir.subVectors(end, start);
        const lenSq = segment.lengthSq();
        if (lenSq <= 0.000001) return { hit: false, distance: Infinity, point: null };
        const t = THREE.MathUtils.clamp(this.tmpProjectileClosest.subVectors(point, start).dot(segment) / lenSq, 0, 1);
        const closest = this.tmpProjectileClosest.copy(start).addScaledVector(segment, t);
        const distSq = closest.distanceToSquared(point);
        return {
            hit: distSq <= radius * radius,
            distance: Math.sqrt(lenSq) * t,
            point: closest.clone()
        };
    }

    destroyProjectile(projectile, didHit = false, impactPoint = null) {
        if (!projectile?.mesh) return;
        this.createProjectileImpact(impactPoint || projectile.mesh.position, didHit);
        this.scene.remove(projectile.mesh);
        projectile.mesh.traverse(child => {
            const materials = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
            materials.forEach(mat => mat.dispose?.());
        });
    }

    createProjectileImpact(position, didHit = false) {
        const impact = new THREE.Group();
        impact.name = didHit ? 'enemy_projectile_hit' : 'enemy_projectile_spark';
        impact.position.copy(position);
        const material = new THREE.MeshBasicMaterial({
            color: didHit ? 0xff342c : 0xffa24d,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const spark = new THREE.Mesh(PROJECTILE_IMPACT_GEOMETRY, material);
        impact.add(spark);
        const light = new THREE.PointLight(didHit ? 0xff3030 : 0xff8a35, didHit ? 2.1 : 1.25, didHit ? 6 : 4);
        impact.add(light);
        this.scene.add(impact);
        const start = performance.now();
        const animate = (time) => {
            const p = Math.min(1, (time - start) / (didHit ? 150 : 110));
            spark.scale.setScalar(1 + p * (didHit ? 3.5 : 2.2));
            material.opacity = 0.95 * (1 - p);
            light.intensity = (didHit ? 2.1 : 1.25) * (1 - p);
            if (p < 1) requestAnimationFrame(animate);
            else {
                this.scene.remove(impact);
                material.dispose();
            }
        };
        requestAnimationFrame(animate);
    }

    handleChase(playerPos, delta, distanceSq) {
        this.setState('walk');
        const enemyPos = this.mesh.position;
        const moveDir = this.tmpMoveDir.subVectors(playerPos, enemyPos);
        moveDir.y = 0;
        if (moveDir.lengthSq() < 0.0001) return;
        moveDir.normalize();

        const finalMoveDir = this.tmpFinalDir.copy(moveDir);
        if (distanceSq > this.closeChaseNoObstacleSq && this.checkObstacle(moveDir)) {
            const angle = Math.sin(performance.now() * 0.005) > 0 ? Math.PI / 4 : -Math.PI / 4;
            finalMoveDir.applyAxisAngle(this.upAxis, angle);
        }

        if (this.enemyType === 'ranged') {
            const currentDist = Math.sqrt(distanceSq);
            const desiredOffset = currentDist > this.optimalRange ? 1 : -0.6;
            if (currentDist < this.optimalRange * 0.8) finalMoveDir.multiplyScalar(-0.5);
            else finalMoveDir.multiplyScalar(desiredOffset);
        }

        this.tmpLookTarget.copy(enemyPos).add(moveDir);
        this.mesh.lookAt(this.tmpLookTarget);
        const speed = this.moveSpeed * this.globalSpeedScale;
        this.mesh.position.addScaledVector(finalMoveDir.normalize(), speed * delta);
    }

    handleWander(delta) {
        this.wanderTime -= delta;
        if (this.wanderTime <= 0) {
            if (this.state === 'idle') {
                this.wanderTime = 3 + Math.random() * 5;
                const angle = Math.random() * Math.PI * 2;
                const dist = 10 + Math.random() * 15;
                this.wanderTarget = this.mesh.position.clone().add(new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
                this.setState('walk');
            } else {
                this.wanderTime = 2 + Math.random() * 3;
                this.setState('idle');
                this.wanderTarget = null;
            }
        }
        if (this.state === 'walk' && this.wanderTarget) {
            const enemyPos = this.mesh.position;
            const moveDir = this.tmpMoveDir.subVectors(this.wanderTarget, enemyPos);
            moveDir.y = 0;
            const distToTarget = moveDir.length();
            if (distToTarget < 1.0) {
                this.wanderTime = 0;
                return;
            }
            moveDir.normalize();
            if (this.checkObstacle(moveDir)) {
                this.wanderTime = 0;
                this.setState('idle');
                return;
            }
            const lookTarget = this.tmpLookTarget.copy(this.wanderTarget);
            lookTarget.y = enemyPos.y;
            this.mesh.lookAt(lookTarget);
            const speed = (this.moveSpeed * 0.6) * this.globalSpeedScale;
            this.mesh.position.addScaledVector(moveDir, speed * delta);
        }
    }

    checkObstacle(direction) {
        const now = performance.now();
        if (now - this.lastObstacleCheckTime < this.obstacleCheckInterval) return this.lastObstacleHit;
        this.lastObstacleCheckTime = now;
        const rayStart = this.tmpRayStart.copy(this.mesh.position);
        rayStart.y += 1.0;
        this.obstacleRay.set(rayStart, direction);
        this.obstacleRay.far = 3;
        const worldMap = this.getWorldMap();
        if (!worldMap) return false;
        const hits = this.obstacleRay.intersectObject(worldMap, true);
        this.lastObstacleHit = hits.length > 0;
        return this.lastObstacleHit;
    }

    applyGroundSnap() {
        const rayStart = this.tmpRayStart.copy(this.mesh.position);
        rayStart.y += 50;
        this.groundRay.set(rayStart, this.tmpMoveDir.set(0, -1, 0));
        this.groundRay.far = 100;
        const worldMap = this.getWorldMap();
        if (!worldMap) return;
        const hits = this.groundRay.intersectObject(worldMap, true);
        if (hits.length > 0) this.mesh.position.y = hits[0].point.y;
    }

    getWorldMap() {
        if (this.worldMap && this.worldMap.parent) return this.worldMap;
        this.worldMap = this.scene.getObjectByName('world_map') || this.scene.getObjectByName('fallback_ground');
        return this.worldMap;
    }

    setState(newState) {
        if (this.state === newState) return;
        const oldAction = this.actions[this.state];
        const newAction = this.actions[newState];
        if (newAction) {
            if (oldAction) oldAction.fadeOut(0.3);
            newAction.reset().fadeIn(0.3).play();
        }
        this.state = newState;
    }

    takeDamage(amount, source = 'gun') {
        if (this.state === 'dead') return;
        this.health -= amount;
        this.updateHealthBar();
        const damage = Math.max(1, amount || 1);
        const pushStrength = THREE.MathUtils.clamp(damage * 0.012, 0.08, 0.42);
        const playerPos = this.player?.getPlayerPosition?.(this.tmpPlayerPos) || this.tmpPlayerPos.set(0, 0, 0);
        this.hitReactDir.subVectors(this.mesh.position, playerPos).setY(0);
        if (this.hitReactDir.lengthSq() < 0.0001) this.hitReactDir.set((Math.random() - 0.5) || 1, 0, (Math.random() - 0.5) || 1);
        this.hitReactDir.normalize();
        this.hitReactTimer = this.hitReactDuration;
        this.hitReactForce = pushStrength * (source === 'gun' ? 8.5 : 5.2);
        this.hitReactVertical = source === 'gun' ? Math.min(0.3, damage * 0.0026) : 0.08;
        this.hitReactTilt = (Math.random() > 0.5 ? 1 : -1) * THREE.MathUtils.clamp(0.02 + damage * 0.0009, 0.025, 0.075);
        this.hitReactPitch = THREE.MathUtils.clamp(0.03 + damage * 0.0011, 0.04, 0.11);
        this.actions.hit?.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.06).play();
        setTimeout(() => {
            if (this.state !== 'dead' && this.actions.hit?.isRunning()) this.actions.hit.fadeOut(0.12);
        }, 120);
        const restoreScale = this.mesh.scale.clone();
        this.mesh.scale.set(
            restoreScale.x * (1 + pushStrength * 0.18),
            restoreScale.y * (1 - pushStrength * 0.1),
            restoreScale.z * (1 - pushStrength * 0.14)
        );
        this.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                    if (mat.color) {
                        const oldColor = mat.color.clone();
                        mat.color.set(source === 'gun' ? 0xff5b5b : 0xff9f52);
                        if ('emissive' in mat && mat.emissive) mat.emissive.set(source === 'gun' ? 0x661111 : 0x663300);
                        setTimeout(() => {
                            mat.color.copy(oldColor);
                            if ('emissive' in mat && mat.emissive) mat.emissive.set(0x000000);
                        }, 85);
                    }
                });
            }
        });
        setTimeout(() => {
            if (!this.mesh || this.state === 'dead') return;
            this.mesh.scale.lerp(restoreScale, 0.85);
            this.mesh.scale.copy(restoreScale);
        }, 95);
        if (this.health <= 0) this.die(source);
    }

    die(source = 'gun') {
        if (this.state === 'dead') return;
        this.setState('death');
        this.state = 'dead';
        if (this.healthSprite) this.healthSprite.visible = false;
        this.projectiles.splice(0).forEach(p => this.destroyProjectile(p));
        this.manager?.notifyKill?.(this, source);
        const deathDuration = this.actions.death ? this.actions.death.getClip().duration : 3;
        const removeDelay = Math.max(800, Math.floor(deathDuration * 1000));
        if (this.deadRemovalTimer) clearTimeout(this.deadRemovalTimer);
        this.deadRemovalTimer = setTimeout(() => this.removeFromScene(), removeDelay);
    }

    removeFromScene() {
        if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
        if (this.weapon?.parent) this.weapon.parent.remove(this.weapon);
    }

    dispose() {
        if (this.deadRemovalTimer) clearTimeout(this.deadRemovalTimer);
        this.projectiles.splice(0).forEach(p => this.destroyProjectile(p));
        this.removeFromScene();
    }
}

export class EnemyManager {
    constructor(scene, player, enemyAsset = null) {
        this.scene = scene;
        this.player = player;
        this.enemyAsset = enemyAsset || {};
        this.enemies = [];
        this.objectToEnemy = new WeakMap();
        this.spawnRaycaster = new THREE.Raycaster();
        this.spawnRayStart = new THREE.Vector3();
        this.spawnRayDir = new THREE.Vector3(0, -1, 0);
        this.spawnCandidate = new THREE.Vector3();
        this.sharedPlayerPos = new THREE.Vector3();
        this.tmpHitBox = new THREE.Box3();
        this.tmpExplosion = new THREE.Vector3();
        this.modelUrl = this.enemyAsset.url || DEFAULT_ENEMY_MODEL_URL;
        this.modelFormat = inferFormat(this.modelUrl, this.enemyAsset.format || 'fbx');
        this.expectedHeight = Number.isFinite(this.enemyAsset.expectedHeight) ? this.enemyAsset.expectedHeight : 2.2;
        this.modelRotation = vectorFromConfig(this.enemyAsset.modelRotation, [0, 0, 0]);
        this.animationSources = this.enemyAsset.animationSources || DEFAULT_ENEMY_ANIMATION_SOURCES;
        this.weaponConfig = {
            ...DEFAULT_ENEMY_WEAPON,
            ...(this.enemyAsset.weapon || this.enemyAsset.weaponAsset || {})
        };
        this.weaponUrl = this.weaponConfig.url || null;
        this.animationSourceUrls = {};
        this.animationAliases = this.enemyAsset.animationAliases || {};
        this.hitZoneAliases = this.enemyAsset.hitZones || {};
        this.headshotHeightRatio = Number.isFinite(this.enemyAsset.fallbacks?.headshotByHeightRatio)
            ? this.enemyAsset.fallbacks.headshotByHeightRatio
            : 0.78;
        this.isLoaded = false;
        this.active = false;
        this.aiFrameIndex = 0;
        this.animFrameIndex = 0;
        this.onEnemyKilled = null;
        this.defaultWaveConfig = {
            count: 8,
            spawnRadius: 180,
            minEnemyDistance: 18,
            minPlayerDistance: 26,
            rangedRatio: 0.3
        };
    }

    async init() {
        this.setupLoaders();
        try {
            const { scene: model, animations } = await this.loadModelAsset(this.modelUrl, this.modelFormat);
            if (!model) throw new Error(`No enemy model scene loaded from ${this.modelUrl}`);
            this.baseAnimations = animations || [];
            this.animations = await this.loadAnimationClips(this.baseAnimations);
            this.weaponPrototype = await this.loadWeaponPrototype();

            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const scale = size.y > 0 ? this.expectedHeight / size.y : 1.0;
            this.baseModel = new THREE.Group();
            this.baseModel.name = this.enemyAsset.runtimeName || 'enemy_base_wrapper';
            model.position.y = -box.min.y;
            model.rotation.set(...this.modelRotation);
            this.configureModelMaterials(model);
            this.baseModel.add(model);
            this.baseModel.scale.setScalar(scale);
            this.baseModel.updateMatrixWorld(true);
            this.spawnWave(this.defaultWaveConfig);
            this.isLoaded = true;
        } catch (error) {
            console.error('Enemy model load failed:', error);
            this.createFallbackModel();
            this.spawnWave(this.defaultWaveConfig);
            this.isLoaded = true;
        }
    }

    setupLoaders() {
        if (this.gltfLoader && this.fbxLoader) return;
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.setDRACOLoader(dracoLoader);
        this.fbxLoader = new FBXLoader();
    }

    loadModelAsset(url, format = inferFormat(url)) {
        return new Promise((resolve) => {
            const onError = (error) => {
                console.warn(`Could not load ${format} asset ${url}:`, error);
                resolve({ scene: null, animations: [] });
            };
            if (format === 'fbx') {
                this.fbxLoader.load(url, object => resolve({ scene: object, animations: object.animations || [] }), undefined, onError);
            } else {
                this.gltfLoader.load(url, gltf => resolve({ scene: gltf.scene, animations: gltf.animations || [] }), undefined, onError);
            }
        });
    }

    async loadAnimationClips(fallbackAnimations = []) {
        const clips = [];
        const sources = this.animationSources || {};
        for (const [stateName, source] of Object.entries(sources)) {
            const sourceConfig = typeof source === 'string' ? { url: source } : source;
            if (!sourceConfig?.url) continue;
            const state = sourceConfig.targetState || stateName;
            const format = inferFormat(sourceConfig.url, sourceConfig.format || 'fbx');
            const { animations } = await this.loadModelAsset(sourceConfig.url, format);
            const clip = animations?.[0]?.clone?.();
            if (!clip) {
                console.warn(`No animation clip found for enemy state ${stateName}: ${sourceConfig.url}`);
                continue;
            }
            clip.name = sourceConfig.clipName || stateName;
            clip.userData = {
                ...(clip.userData || {}),
                sourceState: stateName,
                targetState: state,
                sourceUrl: sourceConfig.url
            };
            clips.push(clip);
            this.animationSourceUrls[stateName] = sourceConfig.url;
        }

        if (clips.length > 0) return clips;
        return fallbackAnimations || [];
    }

    configureModelMaterials(model) {
        model.traverse(child => {
            if (!child.isMesh && !child.isSkinnedMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            if (!child.material) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                if (mat.opacity !== undefined && mat.opacity < 0.1) mat.opacity = 1;
                mat.visible = true;
                mat.needsUpdate = true;
            });
        });
    }

    async loadWeaponPrototype() {
        if (!this.weaponConfig?.url) return null;
        const format = inferFormat(this.weaponConfig.url, this.weaponConfig.format || 'glb');
        const { scene } = await this.loadModelAsset(this.weaponConfig.url, format);
        if (!scene) return null;
        return this.buildWeaponPrototype(scene, this.weaponConfig);
    }

    buildWeaponPrototype(model, config = {}) {
        const wrapper = new THREE.Group();
        const visual = model;
        this.configureModelMaterials(visual);
        visual.updateMatrixWorld(true);
        const rawBox = new THREE.Box3().setFromObject(visual);
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const longest = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
        const targetLength = Number.isFinite(config.targetLength) ? config.targetLength : DEFAULT_ENEMY_WEAPON.targetLength;
        visual.scale.setScalar(targetLength / longest);
        if (rawSize.x >= rawSize.z && rawSize.x >= rawSize.y) visual.rotation.y = -Math.PI / 2;

        wrapper.add(visual);
        wrapper.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(wrapper);
        const size = box.getSize(new THREE.Vector3());
        const grip = new THREE.Vector3(
            (box.min.x + box.max.x) * 0.5,
            box.min.y + size.y * (Number.isFinite(config.gripY) ? config.gripY : 0.48),
            box.min.z + size.z * (Number.isFinite(config.gripZ) ? config.gripZ : 0.32)
        );
        visual.position.sub(grip);
        wrapper.userData.muzzleLocal = new THREE.Vector3(
            0,
            box.min.y + size.y * (Number.isFinite(config.muzzleY) ? config.muzzleY : 0.55),
            box.max.z
        ).sub(grip);
        wrapper.userData.length = size.z;
        wrapper.name = config.id || 'enemy_rifle_gun';
        return wrapper;
    }

    createFallbackModel() {
        this.baseModel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 8), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
        this.baseModel.name = 'fallback_enemy_model';
        this.animations = [];
    }

    clearEnemies() {
        this.enemies.forEach(enemy => enemy?.dispose?.());
        this.enemies = [];
        this.objectToEnemy = new WeakMap();
    }

    spawnWave(waveConfig = {}) {
        if (!this.baseModel) return;
        this.clearEnemies();
        const cfg = { ...this.defaultWaveConfig, ...waveConfig };
        const count = Math.max(1, cfg.count | 0);
        const worldMap = this.scene.getObjectByName('world_map');
        const collidables = worldMap ? [worldMap] : [];
        const playerPos = this.player?.getPlayerPosition(new THREE.Vector3()) || new THREE.Vector3();
        const rangedCount = Math.max(1, Math.round(count * (cfg.rangedRatio ?? 0.3)));

        for (let i = 0; i < count; i++) {
            const enemyType = i < rangedCount ? 'ranged' : 'melee';
            const enemy = new Enemy(this.baseModel, this.scene, this.animations, this.player, {
                ...cfg,
                enemyType,
                manager: this,
                animationAliases: this.animationAliases,
                weaponPrototype: this.weaponPrototype,
                weaponConfig: this.weaponConfig
            });
            let x = 0, y = 0.5, z = 0;
            let foundValidSpot = false;
            let attempts = 0;
            while (!foundValidSpot && attempts < 180) {
                attempts++;
                x = (Math.random() - 0.5) * (cfg.spawnRadius ?? 180);
                z = (Math.random() - 0.5) * (cfg.spawnRadius ?? 180);
                const dxPlayer = x - playerPos.x;
                const dzPlayer = z - playerPos.z;
                if ((dxPlayer * dxPlayer + dzPlayer * dzPlayer) < ((cfg.minPlayerDistance ?? 26) ** 2)) continue;
                this.spawnCandidate.set(x, 0, z);
                let tooClose = false;
                for (const existed of this.enemies) {
                    const dx = existed.mesh.position.x - this.spawnCandidate.x;
                    const dz = existed.mesh.position.z - this.spawnCandidate.z;
                    if ((dx * dx + dz * dz) < ((cfg.minEnemyDistance ?? 18) ** 2)) { tooClose = true; break; }
                }
                if (tooClose) continue;
                this.spawnRayStart.set(x, 100, z);
                this.spawnRaycaster.set(this.spawnRayStart, this.spawnRayDir);
                this.spawnRaycaster.far = 200;
                const hits = this.spawnRaycaster.intersectObjects(collidables.length > 0 ? collidables : this.scene.children, true);
                if (hits.length > 0) {
                    const hit = hits[0];
                    const hitName = (hit.object.name || '').toLowerCase();
                    if (!hitName.includes('player') && !hitName.includes('enemy')) {
                        x = hit.point.x; z = hit.point.z; y = hit.point.y; foundValidSpot = true;
                    }
                }
            }
            enemy.mesh.position.set(x, y, z);
            enemy.updateWeaponAttachment();
            this.enemies.push(enemy);
            this.registerEnemyHitboxes(enemy);
        }
    }

    update(delta) {
        if (!this.isLoaded || !this.active) return;
        this.player.getPlayerPosition(this.sharedPlayerPos);
        const aliveCount = this.getAliveCount();
        let nearbyCount = 0;
        const nearDistSq = 60 * 60;
        for (const enemy of this.enemies) {
            if (!enemy || enemy.state === 'dead' || !enemy.mesh) continue;
            const dx = enemy.mesh.position.x - this.sharedPlayerPos.x;
            const dz = enemy.mesh.position.z - this.sharedPlayerPos.z;
            if ((dx * dx + dz * dz) <= nearDistSq) nearbyCount++;
        }
        const crowdOver = Math.max(0, nearbyCount - 6);
        const speedScale = Math.max(0.55, 1 - crowdOver * 0.05);
        let aiStride = 1;
        if (aliveCount >= 20 || nearbyCount >= 10) aiStride = 4;
        else if (aliveCount >= 12 || nearbyCount >= 6) aiStride = 3;
        else if (aliveCount >= 7 || nearbyCount >= 3) aiStride = 2;
        let animStride = 1;
        if (aliveCount >= 22) animStride = 3;
        else if (aliveCount >= 12) animStride = 2;
        const obstacleInterval = aiStride >= 3 ? 160 : (aiStride === 2 ? 120 : 80);
        const groundSnapInterval = aiStride >= 3 ? 180 : (aiStride === 2 ? 140 : 90);
        this.aiFrameIndex = (this.aiFrameIndex + 1) % aiStride;
        this.animFrameIndex = (this.animFrameIndex + 1) % animStride;
        this.enemies.forEach((enemy, index) => {
            if (!enemy) return;
            const enemySpeedScale = enemy.isBoss ? Math.max(0.75, speedScale) : speedScale;
            enemy.setPerformanceProfile({ speedScale: enemySpeedScale, obstacleInterval, groundSnapInterval });
            const enemyPos = enemy.mesh?.position;
            const dx = enemyPos ? (enemyPos.x - this.sharedPlayerPos.x) : 0;
            const dz = enemyPos ? (enemyPos.z - this.sharedPlayerPos.z) : 0;
            const distSq = dx * dx + dz * dz;
            const forceAI = enemy.isBoss || enemy.state === 'attack' || distSq < 20 * 20;
            const runAI = forceAI || enemy.state === 'dead' || ((index + this.aiFrameIndex) % aiStride === 0);
            const runAnimation = enemy.isBoss || enemy.state === 'dead' || distSq < 45 * 45 || ((index + this.animFrameIndex) % animStride === 0);
            enemy.update(delta, runAI, this.sharedPlayerPos, runAnimation);
        });
    }

    setActive(active) { this.active = !!active; }
    getAliveEnemies() { return this.enemies.filter(enemy => enemy && enemy.state !== 'dead'); }
    getAliveCount() { return this.getAliveEnemies().length; }

    registerEnemyHitboxes(enemy) {
        this.objectToEnemy.set(enemy.mesh, enemy);
        enemy.mesh.traverse(child => this.objectToEnemy.set(child, enemy));
    }

    isHeadshotHit(intersectedObject, enemy, hitPoint = null) {
        const headAliases = this.hitZoneAliases.head || ['head', 'helmet', 'neck', 'skull'];
        let cur = intersectedObject;
        let depth = 0;
        while (cur && depth < 8) {
            const n = (cur.name || '').toLowerCase();
            if (headAliases.some(alias => n.includes(String(alias).toLowerCase()))) return true;
            if (cur === enemy?.mesh) break;
            cur = cur.parent;
            depth++;
        }
        if (hitPoint && enemy?.mesh) {
            this.tmpHitBox.setFromObject(enemy.mesh);
            const height = this.tmpHitBox.max.y - this.tmpHitBox.min.y;
            if (height > 0.0001) {
                const yRatio = (hitPoint.y - this.tmpHitBox.min.y) / height;
                if (yRatio >= this.headshotHeightRatio) return true;
            }
        }
        return false;
    }

    checkHit(intersectedObject, damage = 50, hitPoint = null, source = 'gun') {
        let obj = intersectedObject;
        const baseDamage = Math.max(1, Number.isFinite(damage) ? damage : 50);
        while (obj) {
            const enemy = this.objectToEnemy.get(obj);
            if (enemy && enemy.state !== 'dead') {
                const headshot = this.isHeadshotHit(intersectedObject, enemy, hitPoint);
                const critical = headshot || Math.random() < 0.12;
                const multiplier = headshot ? 2.0 : (critical ? 1.5 : 1.0);
                const realDamage = Math.round(baseDamage * multiplier);
                const beforeHp = enemy.health;
                enemy.takeDamage(realDamage, source);
                const dealt = Math.max(0, Math.min(realDamage, beforeHp));
                return { hit: true, damage: dealt, enemy, killed: enemy.state === 'dead', critical, headshot };
            }
            obj = obj.parent;
        }
        return { hit: false, damage: 0, enemy: null, killed: false, critical: false, headshot: false };
    }

    applyExplosionDamage(position, radius = 7, damage = 95, source = 'Grenade') {
        const alive = this.getAliveEnemies();
        for (const enemy of alive) {
            const enemyPos = enemy.mesh.position;
            const dist = enemyPos.distanceTo(position);
            if (dist > radius) continue;
            const falloff = 1 - (dist / radius);
            const dealt = Math.max(22, Math.round(damage * falloff));
            enemy.takeDamage(dealt, source);
        }
    }

    notifyKill(enemy, source = 'gun') {
        if (typeof this.onEnemyKilled === 'function') {
            this.onEnemyKilled({ enemy, source, label: enemy?.nameLabel || 'HOSTILE' });
        }
    }
}
