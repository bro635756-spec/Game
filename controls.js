import * as THREE from 'three';

export class Controls {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        this.isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
        this.pointerLocked = false;
        this.inputs = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            switchWeapon: false,
            shoot: false,
            reload: false,
            ads: false,
            toggleCamera: false,
            throwGrenade: false,
            lookDelta: new THREE.Vector2(0, 0),
            lookJoystick: new THREE.Vector2(0, 0)
        };

        if (this.isMobile) this.setupMobileControls();
        else this.setupPCControls();
    }

    setupPCControls() {
        const onKeyDown = (event) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW': this.inputs.forward = true; break;
                case 'ArrowLeft':
                case 'KeyA': this.inputs.left = true; break;
                case 'ArrowDown':
                case 'KeyS': this.inputs.backward = true; break;
                case 'ArrowRight':
                case 'KeyD': this.inputs.right = true; break;
                case 'Space': this.inputs.jump = true; break;
                case 'KeyE': this.inputs.switchWeapon = true; break;
                case 'KeyR': this.inputs.reload = true; break;
            }
        };
        const onKeyUp = (event) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW': this.inputs.forward = false; break;
                case 'ArrowLeft':
                case 'KeyA': this.inputs.left = false; break;
                case 'ArrowDown':
                case 'KeyS': this.inputs.backward = false; break;
                case 'ArrowRight':
                case 'KeyD': this.inputs.right = false; break;
                case 'Space': this.inputs.jump = false; break;
                case 'KeyE': this.inputs.switchWeapon = false; break;
                case 'KeyR': this.inputs.reload = false; break;
            }
        };
        const onMouseDown = (event) => {
            if (event.button === 0) this.inputs.shoot = true;
        };
        const onMouseUp = (event) => {
            if (event.button === 0) this.inputs.shoot = false;
        };
        const onMouseMove = (event) => {
            if (!this.pointerLocked) return;
            this.inputs.lookDelta.x += event.movementX;
            this.inputs.lookDelta.y += event.movementY;
        };
        const onPointerLockChange = () => {
            this.pointerLocked = document.pointerLockElement === this.canvas;
            if (!this.pointerLocked) this.inputs.lookDelta.set(0, 0);
        };

        window.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('mousemove', onMouseMove);
        document.addEventListener('pointerlockchange', onPointerLockChange);
    }

    setupMobileControls() {
        const joystickZone = document.getElementById('joystick-zone');
        const joystickKnob = document.getElementById('joystick-knob');
        const lookZone = document.getElementById('look-joystick-zone');
        const lookKnob = document.getElementById('look-joystick-knob');
        const updateZoneMetrics = (zone) => zone.getBoundingClientRect();

        const handleJoystick = (e, zone, knob, setter) => {
            const rect = updateZoneMetrics(zone);
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const maxRadius = rect.width / 2;
            const touch = Array.from(e.touches).find(t => t.target.closest(`#${zone.id}`));
            if (!touch) return;
            const dx = touch.clientX - centerX;
            const dy = touch.clientY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const radius = Math.min(distance, maxRadius);
            const angle = Math.atan2(dy, dx);
            knob.style.transform = `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
            setter(dx / maxRadius, dy / maxRadius, maxRadius);
        };

        const resetMove = () => {
            joystickKnob.style.transform = 'translate(0, 0)';
            this.inputs.forward = false;
            this.inputs.backward = false;
            this.inputs.left = false;
            this.inputs.right = false;
        };
        joystickZone?.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoystick(e, joystickZone, joystickKnob, (nx, ny) => {
            this.inputs.forward = ny < -0.3;
            this.inputs.backward = ny > 0.3;
            this.inputs.left = nx < -0.3;
            this.inputs.right = nx > 0.3;
        }); });
        joystickZone?.addEventListener('touchmove', (e) => { e.preventDefault(); handleJoystick(e, joystickZone, joystickKnob, (nx, ny) => {
            this.inputs.forward = ny < -0.3;
            this.inputs.backward = ny > 0.3;
            this.inputs.left = nx < -0.3;
            this.inputs.right = nx > 0.3;
        }); });
        joystickZone?.addEventListener('touchend', resetMove);
        joystickZone?.addEventListener('touchcancel', resetMove);

        const resetLook = () => {
            lookKnob.style.transform = 'translate(0, 0)';
            this.inputs.lookJoystick.set(0, 0);
        };
        lookZone?.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoystick(e, lookZone, lookKnob, (nx, ny) => {
            this.inputs.lookJoystick.set(nx, ny);
        }); });
        lookZone?.addEventListener('touchmove', (e) => { e.preventDefault(); handleJoystick(e, lookZone, lookKnob, (nx, ny) => {
            this.inputs.lookJoystick.set(nx, ny);
        }); });
        lookZone?.addEventListener('touchend', resetLook);
        lookZone?.addEventListener('touchcancel', resetLook);

        const bindHold = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('touchstart', (e) => { e.preventDefault(); this.inputs[key] = true; });
            const off = (e) => { e.preventDefault(); this.inputs[key] = false; };
            el.addEventListener('touchend', off);
            el.addEventListener('touchcancel', off);
        };
        const bindTap = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            const trigger = (e) => { e.preventDefault(); this.inputs[key] = true; };
            const clear = (e) => { e.preventDefault(); this.inputs[key] = false; };
            el.addEventListener('touchstart', trigger);
            el.addEventListener('touchend', clear);
            el.addEventListener('touchcancel', clear);
        };

        bindHold('jump-btn', 'jump');
        bindHold('shoot-btn', 'shoot');
        bindTap('switch-btn', 'switchWeapon');
        bindTap('reload-btn', 'reload');

        let lastTouchX = 0;
        let lastTouchY = 0;
        window.addEventListener('touchstart', (e) => {
            if (e.target.closest('#mobile-controls')) return;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            if (e.target.closest('#mobile-controls')) return;
            const dx = e.touches[0].clientX - lastTouchX;
            const dy = e.touches[0].clientY - lastTouchY;
            this.inputs.lookDelta.x += dx;
            this.inputs.lookDelta.y += dy;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }, { passive: true });
    }

    lock() {
        if (!this.isMobile) this.canvas?.requestPointerLock?.();
    }

    unlock() {
        if (!this.isMobile && document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    }

    isLocked() {
        return !!(!this.isMobile && document.pointerLockElement === this.canvas);
    }

    resetInputs() {
        this.inputs.forward = false;
        this.inputs.backward = false;
        this.inputs.left = false;
        this.inputs.right = false;
        this.inputs.jump = false;
        this.inputs.switchWeapon = false;
        this.inputs.shoot = false;
        this.inputs.reload = false;
        this.inputs.ads = false;
        this.inputs.toggleCamera = false;
        this.inputs.throwGrenade = false;
        this.inputs.lookDelta.set(0, 0);
        this.inputs.lookJoystick.set(0, 0);
    }
}
