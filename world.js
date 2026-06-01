import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class World {
    constructor(scene, mapAsset = null) {
        this.scene = scene;
        this.collidables = [];
        this.worldMap = null;
        this.mapAsset = mapAsset || {};
        this.mapUrl = this.mapAsset.url || 'https://static.seeles.ai/games-sdk/fps/single-fps-person.glb';
        this.targetSize = Number.isFinite(this.mapAsset.targetSize) ? this.mapAsset.targetSize : 240;
        this.collisionAliases = Array.isArray(this.mapAsset.collisionAliases)
            ? this.mapAsset.collisionAliases.map(alias => String(alias).toLowerCase()).filter(Boolean)
            : [];
        
        this.setupLights();
        // Add a fallback floor in case the map model fails to load.
        const groundGeo = new THREE.PlaneGeometry(this.targetSize, this.targetSize);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.name = 'initial_ground';
        this.scene.add(ground);
        this.collidables.push(ground);
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        ambientLight.name = 'ambient_light';
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.name = 'directional_light';
        this.scene.add(directionalLight);
        
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 1.0);
        hemiLight.name = 'hemi_light';
        this.scene.add(hemiLight);
    }

    loadMap(onProgress, onLoad) {
        console.log('Loading map from:', this.mapUrl);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        loader.load(this.mapUrl, 
            (gltf) => {
                console.log('Model loaded successfully');
                const model = gltf.scene;
                model.name = this.mapAsset.runtimeName || 'world_map';
                
                // Normalize model scale and position.
                const box = new THREE.Box3().setFromObject(model);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                // Target the map's largest horizontal dimension to about the configured size.
                const maxDim = Math.max(size.x, size.z);
                let scale = 1;
                if (maxDim > 0) {
                    scale = this.targetSize / maxDim;
                }
                model.scale.set(scale, scale, scale);
                
                // Update matrices before reading the scaled bounds.
                model.updateMatrixWorld(true);
                const scaledBox = new THREE.Box3().setFromObject(model);
                const scaledCenter = new THREE.Vector3();
                scaledBox.getCenter(scaledCenter);
                
                // Center the model on the origin and align its bottom to y=0.
                model.position.x = -scaledCenter.x;
                model.position.z = -scaledCenter.z;
                model.position.y = -scaledBox.min.y;

                this.scene.add(model);
                this.worldMap = model;
                
                // Replace the initial floor with the loaded map.
                const initialGround = this.scene.getObjectByName('initial_ground');
                if (initialGround) {
                    this.scene.remove(initialGround);
                }
                const aliasCollidables = [];
                
                // Prepare every mesh in the scene.
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.name = child.name || `mesh_${child.uuid}`;
                        child.receiveShadow = true;
                        child.castShadow = true;
                        const childName = child.name.toLowerCase();
                        if (this.collisionAliases.some(alias => childName.includes(alias))) {
                            aliasCollidables.push(child);
                        }
                        
                        // Keep material color spaces consistent.
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => {
                                    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                                    mat.needsUpdate = true;
                                });
                            } else {
                                if (child.material.map) child.material.map.colorSpace = THREE.SRGBColorSpace;
                                child.material.needsUpdate = true;
                            }
                        }
                    }
                });
                this.collidables = aliasCollidables.length > 0 ? aliasCollidables : [model];
                
                onLoad(model);
            },
            (xhr) => {
                if (xhr.lengthComputable) {
                    const percent = (xhr.loaded / xhr.total) * 100;
                    console.log(`Loading: ${percent.toFixed(2)}%`);
                    onProgress(percent);
                } else {
                    // Use a midpoint progress value when total size is unknown.
                    onProgress(50);
                }
            },
            (error) => {
                console.error('Map load failed:', error);
                // Create a simple fallback floor.
                const groundGeo = new THREE.PlaneGeometry(this.targetSize, this.targetSize);
                const groundMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
                const ground = new THREE.Mesh(groundGeo, groundMat);
                ground.rotation.x = -Math.PI / 2;
                ground.name = 'fallback_ground';
                this.scene.add(ground);
                this.worldMap = ground;
                this.collidables = [ground];
                
                onLoad(ground);
            }
        );
    }
}
