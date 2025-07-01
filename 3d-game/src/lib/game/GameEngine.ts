import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GameState {
	survivalTime: number;
	zombiesKilled: number;
	gameOver: boolean;
	paused: boolean;
	itemsCollected: number;
}

interface Zombie {
	mesh: THREE.Group;
	health: number;
	speed: number;
	target: THREE.Vector3;
}

interface Item {
	mesh: THREE.Group;
	type: 'weapon' | 'health';
}

interface Building {
	mesh: THREE.Mesh;
	climbable: boolean;
	height: number;
	ladder?: THREE.Mesh; // Add ladder property
}

export class GameEngine {
	private scene!: THREE.Scene;
	private camera!: THREE.PerspectiveCamera;
	private renderer!: THREE.WebGLRenderer;
	private player!: THREE.Mesh;
	private zombies: Zombie[] = [];
	private items: Item[] = [];
	private buildings: Building[] = [];
	private gameState: GameState;
	private animationId: number | null = null;
	private clock: THREE.Clock;
	private startTime: number;
	
	// Player physics
	private playerVelocity = new THREE.Vector3();
	private playerOnGround = true;
	private playerHealth = 100;
	private isAttacking = false;
	private attackCooldown = 0;
	
	// Improved jumping system
	private coyoteTime = 0.1; // Time in seconds you can still jump after leaving ground
	private coyoteTimeCounter = 0;
	private jumpBufferTime = 0.1; // Time in seconds to buffer jump input
	private jumpBufferCounter = 0;
	
	// Game mechanics - improved balance
	private zombieSpawnTimer = 0;
	private zombieSpawnInterval = 180; // Slower initial spawn rate
	private itemSpawnTimer = 0;
	private itemSpawnInterval = 120; // More frequent item spawning
	private gameTime = 0;
	private difficultyMultiplier = 1.0;
	
	// Map size - much larger for impressive cityscape
	private mapSize = 200; // Much larger map for better exploration
	private mapBounds = 98; // Half of mapSize - 2 for safety
	
	// Controls
	private keys = {
		left: false,
		right: false,
		up: false,
		down: false,
		jump: false,
		attack: false,
		r: false
	};

	// Mouse controls
	private mouseX = 0;
	private mouseY = 0;
	private isMouseDown = false;
	private cameraDistance = 15;
	private cameraHeight = 10;
	private minCameraDistance = 5;
	private maxCameraDistance = 30;
	private cameraRotationX = 0;
	private cameraRotationY = 0;
	private lastMouseX = 0;
	private lastMouseY = 0;
	private isPointerLocked = false;

	// Player group and details
	private playerGroup!: THREE.Group;
	private animationTime = 0;
	private isMoving = false;
	
	// Character animation system
	private animationMixer: THREE.AnimationMixer | null = null;
	private currentAnimation: THREE.AnimationAction | null = null;
	private animations: { [key: string]: THREE.AnimationAction } = {};
	private isGLTFLoaded = false;

	// Audio context
	private audioContext: AudioContext | null = null;

	// State tracking for better collision handling
	private lastPosition = new THREE.Vector3();
	private lastVelocity = new THREE.Vector3();
	private isOnBuilding = false;
	private currentBuildingHeight = 0;
	private buildingExitTimer = 0; // Timer to prevent immediate re-detection after jumping off
	
	// Ladder interaction system - simplified and intuitive
	private nearLadder = false;
	private currentLadder: THREE.Mesh | null = null;
	private ladderIndicator: THREE.Mesh | null = null;
	private isClimbingLadder = false;
	private ladderClimbProgress = 0;
	private ladderClimbSpeed = 6; // Units per second - faster for better feel
	private ladderClimbTarget = 0; // Target height to climb to
	private ladderStartHeight = 0; // Starting height when climbing begins
	private ladderClimbStartTime = 0; // Track when climbing started
	private ladderClimbTimeout = 10; // Maximum time to climb (seconds)

	// Player parts for animations
	private playerParts: { [key: string]: THREE.Mesh } = {};

	// Building indicator
	private buildingIndicator: THREE.Mesh | null = null;

	// Anti-stuck system
	private lastPlayerPosition = new THREE.Vector3();
	private stuckTimer = 0;
	private stuckThreshold = 0.05; // Distance threshold for stuck detection (reduced to be less sensitive)
	private maxStuckTime = 2.0; // Maximum time before auto-unstuck
	private postClimbingGracePeriod = 0; // Grace period after climbing to prevent false stuck detection
	
	// Damage animation system
	private isTakingDamage = false;
	private damageAnimationTimer = 0;
	private damageAnimationDuration = 0.5; // Duration of damage animation in seconds
	private lastDamageTime = 0;
	private damageCooldown = 0.3; // Minimum time between damage animations

	constructor(container: HTMLElement) {
		console.log('GameEngine constructor called');
		console.log('Container:', container);
		console.log('Container dimensions:', container.clientWidth, 'x', container.clientHeight);
		
		this.clock = new THREE.Clock();
		this.startTime = Date.now();
		this.gameState = {
			survivalTime: 0,
			zombiesKilled: 0,
			gameOver: false,
			paused: false,
			itemsCollected: 0
		};

		console.log('Initializing scene...');
		this.initScene(container);
		console.log('Scene initialized');
		
		console.log('Initializing city...');
		this.initCity();
		console.log('City initialized');
		
		console.log('Initializing lighting...');
		this.initLighting();
		console.log('Lighting initialized');
		
		console.log('Initializing event listeners...');
		this.initEventListeners();
		console.log('Event listeners initialized');
		
		// Initialize player and start animation loop asynchronously
		this.initializeGame();
	}

	private async initializeGame(): Promise<void> {
		console.log('Initializing player...');
		await this.loadPlayerGLTF();
		console.log('Player initialized');
		
		console.log('Starting animation loop...');
		this.animate();
		console.log('Animation loop started');
	}

	private initScene(container: HTMLElement): void {
		// Scene setup with enhanced atmosphere
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x0a0a1a); // Darker, more atmospheric
		this.scene.fog = new THREE.Fog(0x0a0a1a, 15, 80); // Extended fog for larger map

		// Camera setup - third person view with better positioning
		this.camera = new THREE.PerspectiveCamera(
			70, // Slightly wider FOV
			container.clientWidth / container.clientHeight,
			0.1,
			1000
		);
		this.camera.position.set(0, 12, 12);
		this.camera.lookAt(0, 0, 0);

		// Renderer setup - optimized for performance while maintaining quality
		this.renderer = new THREE.WebGLRenderer({ 
			antialias: false, // Disable for better performance
			powerPreference: "default"
		});
		this.renderer.setSize(container.clientWidth, container.clientHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.BasicShadowMap; // Use basic shadows for performance
		this.renderer.toneMapping = THREE.NoToneMapping; // Disable tone mapping for performance
		container.appendChild(this.renderer.domElement);

		// Ground - realistic asphalt street
		const groundGeometry = new THREE.PlaneGeometry(this.mapSize, this.mapSize);
		const groundMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x1a1a1a, // Darker asphalt color
			emissive: 0x0a0a0a,
			emissiveIntensity: 0.1
		});
		const ground = new THREE.Mesh(groundGeometry, groundMaterial);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.5;
		ground.receiveShadow = true;
		this.scene.add(ground);
		
		// Add sidewalk areas
		this.addSidewalks();

		// Add street markings for larger map
		this.addStreetMarkings();

		// Handle window resize
		window.addEventListener('resize', () => {
			this.camera.aspect = container.clientWidth / container.clientHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(container.clientWidth, container.clientHeight);
		});
	}

	private addSidewalks(): void {
		// Add realistic sidewalks around the street
		const sidewalkGeometry = new THREE.PlaneGeometry(this.mapSize, 4);
		const sidewalkMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x666666, // Concrete color
			emissive: 0x222222,
			emissiveIntensity: 0.1
		});
		
		// Left sidewalk
		const leftSidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
		leftSidewalk.rotation.x = -Math.PI / 2;
		leftSidewalk.position.set(0, -0.3, -this.mapSize/2 + 2);
		leftSidewalk.receiveShadow = true;
		this.scene.add(leftSidewalk);
		
		// Right sidewalk
		const rightSidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
		rightSidewalk.rotation.x = -Math.PI / 2;
		rightSidewalk.position.set(0, -0.3, this.mapSize/2 - 2);
		rightSidewalk.receiveShadow = true;
		this.scene.add(rightSidewalk);
		
		// Top sidewalk
		const topSidewalkGeometry = new THREE.PlaneGeometry(4, this.mapSize);
		const topSidewalk = new THREE.Mesh(topSidewalkGeometry, sidewalkMaterial);
		topSidewalk.rotation.x = -Math.PI / 2;
		topSidewalk.position.set(-this.mapSize/2 + 2, -0.3, 0);
		topSidewalk.receiveShadow = true;
		this.scene.add(topSidewalk);
		
		// Bottom sidewalk
		const bottomSidewalk = new THREE.Mesh(topSidewalkGeometry, sidewalkMaterial);
		bottomSidewalk.rotation.x = -Math.PI / 2;
		bottomSidewalk.position.set(this.mapSize/2 - 2, -0.3, 0);
		bottomSidewalk.receiveShadow = true;
		this.scene.add(bottomSidewalk);
	}
	
	private addStreetMarkings(): void {
		// Center line - longer for larger map
		const lineGeometry = new THREE.PlaneGeometry(0.4, this.mapSize);
		const lineMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xffff00,
			emissive: 0x222200,
			emissiveIntensity: 0.2
		});
		const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
		centerLine.rotation.x = -Math.PI / 2;
		centerLine.position.y = -0.4;
		this.scene.add(centerLine);

		// Side lines - multiple lanes with better materials
		const sideLineGeometry = new THREE.PlaneGeometry(0.2, this.mapSize);
		const sideLineMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xffffff,
			emissive: 0x222222,
			emissiveIntensity: 0.1
		});
		
		// Multiple lanes
		const lanePositions = [-12, -6, 6, 12];
		lanePositions.forEach(x => {
			const leftLine = new THREE.Mesh(sideLineGeometry, sideLineMaterial);
			leftLine.rotation.x = -Math.PI / 2;
			leftLine.position.set(x, -0.4, 0);
			this.scene.add(leftLine);
		});

		// Realistic crosswalks with better spacing
		for (let i = -45; i <= 45; i += 20) {
			const crosswalkGeometry = new THREE.PlaneGeometry(10, 0.4);
			const crosswalkMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xffffff,
				emissive: 0x222222,
				emissiveIntensity: 0.1
			});
			const crosswalk = new THREE.Mesh(crosswalkGeometry, crosswalkMaterial);
			crosswalk.rotation.x = -Math.PI / 2;
			crosswalk.position.set(0, -0.4, i);
			this.scene.add(crosswalk);
		}
		
		// Add stop lines at intersections
		for (let i = -45; i <= 45; i += 20) {
			const stopLineGeometry = new THREE.PlaneGeometry(0.3, 16);
			const stopLineMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xffffff,
				emissive: 0x222222,
				emissiveIntensity: 0.1
			});
			const stopLine = new THREE.Mesh(stopLineGeometry, stopLineMaterial);
			stopLine.rotation.x = -Math.PI / 2;
			stopLine.position.set(0, -0.4, i + 8);
			this.scene.add(stopLine);
		}
	}

	private async loadPlayerGLTF(): Promise<void> {
		// Try to load GLTF model first, fallback to placeholder if not found
		const loader = new GLTFLoader();
		return new Promise((resolve, reject) => {
			loader.load(
				'/models/player.glb', // Place your GLB file here
				gltf => {
					console.log('GLTF model loaded successfully!');
					this.playerGroup = gltf.scene;
					this.scene.add(this.playerGroup);
					
					// Set up animation mixer for the character
					this.setupCharacterAnimations(gltf);
					
					// Set initial position
					this.playerGroup.position.set(0, 1, 0);
					
					resolve();
				},
				xhr => {
					// Progress callback
					console.log(`Loading model: ${(xhr.loaded / xhr.total * 100)}%`);
				},
				error => {
					console.warn('GLTF model not found, creating placeholder player:', error);
					// Create a temporary placeholder player until we have the GLTF model
					this.createPlaceholderPlayer();
					resolve();
				}
			);
		});
	}

	private setupCharacterAnimations(gltf: any): void {
		// Set up animation mixer for GLTF character
		if (gltf.animations && gltf.animations.length > 0) {
			console.log(`Found ${gltf.animations.length} animations in model`);
			
			// Create animation mixer
			this.animationMixer = new THREE.AnimationMixer(this.playerGroup);
			this.isGLTFLoaded = true;
			
			// Set up animations - look for common animation names
			gltf.animations.forEach((clip: THREE.AnimationClip, index: number) => {
				const action = this.animationMixer!.clipAction(clip);
				this.animations[clip.name.toLowerCase()] = action;
				
				// Log available animations
				console.log(`Animation ${index}: ${clip.name}`);
			});
			
			// Play idle animation by default
			this.playAnimation('idle') || this.playAnimation('idle_01') || this.playAnimation('idle_02');
		}
	}

	private playAnimation(animationName: string): boolean {
		if (!this.animationMixer || !this.animations[animationName.toLowerCase()]) {
			return false;
		}
		
		// Stop current animation
		if (this.currentAnimation) {
			this.currentAnimation.stop();
		}
		
		// Play new animation
		this.currentAnimation = this.animations[animationName.toLowerCase()];
		this.currentAnimation.reset().play();
		
		console.log(`Playing animation: ${animationName}`);
		return true;
	}

	private updateCharacterAnimations(delta: number): void {
		// Skip GLTF animations if climbing (use placeholder animations instead)
		if (this.isClimbingLadder) {
			return;
		}
		
		// Update GLTF animation mixer if available
		if (this.animationMixer && this.isGLTFLoaded) {
			this.animationMixer.update(delta);
		}
		
		// Determine current animation state
		const isMoving = this.keys.up || this.keys.down || this.keys.left || this.keys.right;
		
		// Play appropriate animation based on state
		if (this.isGLTFLoaded && this.animations) {
			if (isMoving && !this.playerOnGround) {
				this.playAnimation('jump');
			} else if (isMoving && this.playerOnGround) {
				this.playAnimation('walk');
			} else if (this.playerOnGround) {
				this.playAnimation('idle');
			}
		}
	}

	private createPlaceholderPlayer(): void {
		// Create a detailed placeholder player group with better proportions
		this.playerGroup = new THREE.Group();
		
		// Create a more realistic player body (taller and better proportioned)
		const bodyGeometry = new THREE.CapsuleGeometry(0.4, 1.8, 4, 8);
		const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x2c5aa0 }); // Blue shirt
		const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
		body.position.y = 1.8;
		body.castShadow = true;
		this.playerGroup.add(body);
		
		// Create a better head
		const headGeometry = new THREE.SphereGeometry(0.25, 8, 6);
		const headMaterial = new THREE.MeshLambertMaterial({ color: 0xf4d03f }); // Skin tone
		const head = new THREE.Mesh(headGeometry, headMaterial);
		head.position.y = 3.1;
		head.castShadow = true;
		this.playerGroup.add(head);
		
		// Create better arms with shoulders
		const armGeometry = new THREE.CapsuleGeometry(0.12, 1.2, 4, 4);
		const armMaterial = new THREE.MeshLambertMaterial({ color: 0xf4d03f }); // Skin tone
		
		// Left arm
		const leftArm = new THREE.Mesh(armGeometry, armMaterial);
		leftArm.position.set(-0.6, 2.2, 0);
		leftArm.rotation.z = 0.1; // Slight outward angle
		leftArm.castShadow = true;
		this.playerGroup.add(leftArm);
		
		// Right arm
		const rightArm = new THREE.Mesh(armGeometry, armMaterial);
		rightArm.position.set(0.6, 2.2, 0);
		rightArm.rotation.z = -0.1; // Slight outward angle
		rightArm.castShadow = true;
		this.playerGroup.add(rightArm);
		
		// Create better legs with pants
		const legGeometry = new THREE.CapsuleGeometry(0.18, 1.4, 4, 4);
		const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 }); // Dark pants
		
		// Left leg
		const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
		leftLeg.position.set(-0.25, 0.7, 0);
		leftLeg.castShadow = true;
		this.playerGroup.add(leftLeg);
		
		// Right leg
		const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
		rightLeg.position.set(0.25, 0.7, 0);
		rightLeg.castShadow = true;
		this.playerGroup.add(rightLeg);
		
		// Add shoes
		const shoeGeometry = new THREE.BoxGeometry(0.3, 0.15, 0.6);
		const shoeMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a }); // Black shoes
		
		const leftShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
		leftShoe.position.set(-0.25, 0.1, 0.1);
		leftShoe.castShadow = true;
		this.playerGroup.add(leftShoe);
		
		const rightShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
		rightShoe.position.set(0.25, 0.1, 0.1);
		rightShoe.castShadow = true;
		this.playerGroup.add(rightShoe);
		
		// Add simple hair
		const hairGeometry = new THREE.SphereGeometry(0.28, 6, 4);
		const hairMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Brown hair
		const hair = new THREE.Mesh(hairGeometry, hairMaterial);
		hair.position.y = 3.25;
		hair.scale.y = 0.8; // Flatten the hair
		hair.castShadow = true;
		this.playerGroup.add(hair);
		
		// Store references for animations
		this.playerParts = {
			leftArm,
			rightArm,
			leftLeg,
			rightLeg,
			leftShoe,
			rightShoe,
			body
		};
		
		// Set initial position - properly on the ground
		this.playerGroup.position.set(0, 1, 0);
		
		// Add to scene
		this.scene.add(this.playerGroup);
		
		console.log('Detailed placeholder player created successfully');
	}

	private initCity(): void {
		// Create massive city with properly spaced buildings and streets between them
		const buildingPositions = [
			// Downtown area - massive skyscrapers with wide streets
			{ x: -80, z: -80, height: 45, climbable: true, type: 'skyscraper' },
			{ x: 80, z: -80, height: 52, climbable: true, type: 'skyscraper' },
			{ x: -80, z: 80, height: 38, climbable: true, type: 'skyscraper' },
			{ x: 80, z: 80, height: 55, climbable: true, type: 'skyscraper' },
			{ x: 0, z: -90, height: 48, climbable: true, type: 'skyscraper' },
			{ x: -90, z: 0, height: 42, climbable: true, type: 'skyscraper' },
			{ x: 90, z: 0, height: 35, climbable: true, type: 'skyscraper' },
			{ x: 0, z: 90, height: 40, climbable: true, type: 'skyscraper' },
			
			// Mid-rise buildings - properly spaced with streets
			{ x: -50, z: -50, height: 25, climbable: true, type: 'office' },
			{ x: 50, z: -50, height: 28, climbable: true, type: 'apartment' },
			{ x: -50, z: 50, height: 22, climbable: false, type: 'shop' },
			{ x: 50, z: 50, height: 30, climbable: true, type: 'office' },
			{ x: -40, z: -60, height: 24, climbable: true, type: 'apartment' },
			{ x: 40, z: -60, height: 32, climbable: true, type: 'office' },
			{ x: -60, z: -40, height: 26, climbable: true, type: 'apartment' },
			{ x: 60, z: -40, height: 20, climbable: false, type: 'shop' },
			{ x: -60, z: 40, height: 28, climbable: true, type: 'office' },
			{ x: 60, z: 40, height: 24, climbable: true, type: 'apartment' },
			
			// Residential area - medium buildings with wide streets
			{ x: -120, z: -120, height: 15, climbable: true, type: 'house' },
			{ x: 120, z: -120, height: 12, climbable: true, type: 'house' },
			{ x: -120, z: 120, height: 14, climbable: true, type: 'house' },
			{ x: 120, z: 120, height: 11, climbable: true, type: 'house' },
			{ x: -130, z: 0, height: 16, climbable: true, type: 'house' },
			{ x: 130, z: 0, height: 10, climbable: true, type: 'house' },
			{ x: 0, z: -130, height: 17, climbable: true, type: 'house' },
			{ x: 0, z: 130, height: 9, climbable: true, type: 'house' },
			
			// Additional mid-rise buildings - properly spaced
			{ x: -30, z: 45, height: 23, climbable: true, type: 'apartment' },
			{ x: 30, z: 45, height: 18, climbable: false, type: 'shop' },
			{ x: -45, z: -30, height: 25, climbable: true, type: 'office' },
			{ x: 45, z: -30, height: 21, climbable: true, type: 'apartment' },
			{ x: -45, z: 30, height: 19, climbable: false, type: 'shop' },
			{ x: 45, z: 30, height: 29, climbable: true, type: 'office' },
			
			// Strategic corner buildings - properly spaced
			{ x: -42, z: -42, height: 31, climbable: true, type: 'office' },
			{ x: 42, z: -42, height: 22, climbable: true, type: 'apartment' },
			{ x: -42, z: 42, height: 20, climbable: false, type: 'shop' },
			{ x: 42, z: 42, height: 33, climbable: true, type: 'office' },
			
			// Additional buildings for larger map coverage
			{ x: -25, z: -25, height: 18, climbable: true, type: 'apartment' },
			{ x: 25, z: -25, height: 16, climbable: false, type: 'shop' },
			{ x: -25, z: 25, height: 19, climbable: true, type: 'office' },
			{ x: 25, z: 25, height: 21, climbable: true, type: 'apartment' },
			
			// Outer ring buildings
			{ x: -90, z: -40, height: 12, climbable: true, type: 'house' },
			{ x: 90, z: -40, height: 13, climbable: true, type: 'house' },
			{ x: -90, z: 40, height: 11, climbable: true, type: 'house' },
			{ x: 90, z: 40, height: 14, climbable: true, type: 'house' },
			{ x: -40, z: -90, height: 15, climbable: true, type: 'house' },
			{ x: 40, z: -90, height: 10, climbable: true, type: 'house' },
			{ x: -40, z: 90, height: 12, climbable: true, type: 'house' },
			{ x: 40, z: 90, height: 13, climbable: true, type: 'house' }
		];

		// Validate building spacing before creating buildings
		this.validateBuildingSpacing(buildingPositions);
		
		buildingPositions.forEach(pos => {
			this.createBuilding(pos);
		});

		// Add street lights throughout the larger map
		this.addStreetLights();

		// Add more decorative elements
		this.addDecorations();
		
		// Add rooftop structures for more exploration
		this.addRooftopStructures();
		
		// Add building accent lighting after all buildings are created
		this.addBuildingAccentLights();
	}
	
	private validateBuildingSpacing(buildingPositions: any[]): void {
		// Validate that buildings are properly spaced to avoid conflicts
		// Buildings are now 30 units wide at base, so need much more spacing for streets
		const minSpacing = 60; // Much larger minimum distance for proper streets between buildings
		
		for (let i = 0; i < buildingPositions.length; i++) {
			for (let j = i + 1; j < buildingPositions.length; j++) {
				const pos1 = buildingPositions[i];
				const pos2 = buildingPositions[j];
				const distance = Math.sqrt(
					Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.z - pos2.z, 2)
				);
				
				if (distance < minSpacing) {
					console.warn(`Building spacing issue: Buildings at (${pos1.x}, ${pos1.z}) and (${pos2.x}, ${pos2.z}) are only ${distance.toFixed(2)} units apart (minimum: ${minSpacing})`);
				}
			}
		}
	}

	private addRooftopStructures(): void {
		// Add some rooftop structures for more vertical gameplay - updated for massive buildings
		const rooftopPositions = [
			{ x: -30, z: -30, height: 35, type: 'antenna' },
			{ x: 30, z: -30, height: 42, type: 'water_tank' },
			{ x: -30, z: 30, height: 28, type: 'antenna' },
			{ x: 30, z: 30, height: 45, type: 'helicopter_pad' }
		];

		rooftopPositions.forEach(pos => {
			this.createRooftopStructure(pos);
		});
	}

	private createRooftopStructure(data: any): void {
		const { x, z, height, type } = data;
		
		switch (type) {
			case 'antenna':
				const antennaGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2);
				const antennaMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
				const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
				antenna.position.set(x, height + 1, z);
				antenna.castShadow = true;
				this.scene.add(antenna);
				break;
				
			case 'water_tank':
				const tankGeometry = new THREE.CylinderGeometry(1, 1, 1.5);
				const tankMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
				const tank = new THREE.Mesh(tankGeometry, tankMaterial);
				tank.position.set(x, height + 0.75, z);
				tank.castShadow = true;
				this.scene.add(tank);
				break;
				
			case 'helicopter_pad':
				const padGeometry = new THREE.CylinderGeometry(2, 2, 0.2);
				const padMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
				const pad = new THREE.Mesh(padGeometry, padMaterial);
				pad.position.set(x, height + 0.1, z);
				pad.castShadow = true;
				this.scene.add(pad);
				
				// Add H marking
				const hGeometry = new THREE.PlaneGeometry(1, 0.3);
				const hMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
				const h = new THREE.Mesh(hGeometry, hMaterial);
				h.rotation.x = -Math.PI / 2;
				h.position.set(x, height + 0.2, z);
				this.scene.add(h);
				break;
		}
	}

	private createBuilding(buildingData: any): void {
		const { x, z, height, climbable, type } = buildingData;
		
		// Create tapered building geometry - 5 times wider at base than top
		const topWidth = 6; // Width at the top (rooftop running space)
		const baseWidth = topWidth * 5; // Width at the base (30 units)
		
		// Use simple box geometry for now to ensure visibility
		const buildingGeometry = new THREE.BoxGeometry(baseWidth, height, baseWidth);
		
		// Create much more realistic building material with better textures
		const buildingMaterial = new THREE.MeshLambertMaterial({ 
			color: this.getBuildingColor(type),
			emissive: this.getBuildingEmissiveColor(type),
			emissiveIntensity: 0.2
		});
		
		const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
		building.position.set(x, height / 2, z);
		building.castShadow = true;
		building.receiveShadow = true;
		this.scene.add(building);

		// Add comprehensive architectural details
		this.addArchitecturalDetails(building, type, height);
		
		// Add detailed building features (windows, balconies, etc.)
		this.addBuildingDetails(building, type, height);
		
		// Add rooftop structures and details
		this.addRooftopStructures();

		// Add ladder if building is climbable
		let ladder: THREE.Mesh | undefined;
		if (climbable) {
			ladder = this.createLadder(x, z, height);
		}

		this.buildings.push({
			mesh: building,
			climbable: climbable,
			height: height,
			ladder: ladder
		});
	}
	
	private createTaperedBuildingGeometry(baseWidth: number, topWidth: number, height: number): THREE.BufferGeometry {
		// Create a more realistic building geometry with architectural details
		const geometry = new THREE.BufferGeometry();
		
		// Define the vertices for a realistic building
		const vertices = [];
		const indices = [];
		const uvs = [];
		
		// Create more segments for smoother tapering and architectural details
		const segments = 16; // More segments for smoother appearance
		
		for (let i = 0; i <= segments; i++) {
			const y = (i / segments) * height;
			const progress = i / segments;
			
			// Calculate width at this height with more realistic tapering curve
			// Use a curved interpolation for more natural building shape
			const curveProgress = Math.pow(progress, 1.5); // Curved tapering
			const currentWidth = baseWidth + (topWidth - baseWidth) * curveProgress;
			const halfWidth = currentWidth / 2;
			
			// Create 4 vertices at this height (one for each corner)
			// Front face
			vertices.push(-halfWidth, y, halfWidth);  // 0
			vertices.push(halfWidth, y, halfWidth);   // 1
			// Back face
			vertices.push(-halfWidth, y, -halfWidth); // 2
			vertices.push(halfWidth, y, -halfWidth);  // 3
			
			// UVs for texturing - repeat texture vertically for realistic appearance
			const uvY = progress * 4; // Repeat texture 4 times vertically
			uvs.push(0, uvY);
			uvs.push(1, uvY);
			uvs.push(0, uvY);
			uvs.push(1, uvY);
		}
		
		// Create indices for the building sides
		for (let i = 0; i < segments; i++) {
			const baseIndex = i * 4;
			const nextBaseIndex = (i + 1) * 4;
			
			// Front face
			indices.push(baseIndex, baseIndex + 1, nextBaseIndex);
			indices.push(nextBaseIndex, baseIndex + 1, nextBaseIndex + 1);
			
			// Back face
			indices.push(baseIndex + 2, baseIndex + 3, nextBaseIndex + 2);
			indices.push(nextBaseIndex + 2, baseIndex + 3, nextBaseIndex + 3);
			
			// Left face
			indices.push(baseIndex, baseIndex + 2, nextBaseIndex);
			indices.push(nextBaseIndex, baseIndex + 2, nextBaseIndex + 2);
			
			// Right face
			indices.push(baseIndex + 1, baseIndex + 3, nextBaseIndex + 1);
			indices.push(nextBaseIndex + 1, baseIndex + 3, nextBaseIndex + 3);
		}
		
		// Add top face (flat roof)
		const topBaseIndex = segments * 4;
		const topHalfWidth = topWidth / 2;
		
		// Top face vertices
		vertices.push(-topHalfWidth, height, -topHalfWidth); // 0
		vertices.push(topHalfWidth, height, -topHalfWidth);  // 1
		vertices.push(-topHalfWidth, height, topHalfWidth);  // 2
		vertices.push(topHalfWidth, height, topHalfWidth);   // 3
		
		// Top face UVs
		uvs.push(0, 0);
		uvs.push(1, 0);
		uvs.push(0, 1);
		uvs.push(1, 1);
		
		// Top face indices
		indices.push(topBaseIndex, topBaseIndex + 1, topBaseIndex + 2);
		indices.push(topBaseIndex + 2, topBaseIndex + 1, topBaseIndex + 3);
		
		// Set geometry attributes
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		geometry.setIndex(indices);
		
		// Compute normals for proper lighting
		geometry.computeVertexNormals();
		
		return geometry;
	}

	private createLadder(x: number, z: number, buildingHeight: number): THREE.Mesh {
		// Create ladder geometry - much larger for 6x6 buildings
		const ladderGroup = new THREE.Group();
		
		// Ladder sides (vertical rails) - much larger and more visible
		const railGeometry = new THREE.BoxGeometry(0.2, buildingHeight, 0.2); // Doubled size
		const railMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x666666,
			emissive: 0x444444
		}); // Brighter and more visible
		
		const leftRail = new THREE.Mesh(railGeometry, railMaterial);
		leftRail.position.set(-1.2, buildingHeight / 2, 0); // Wider spacing
		ladderGroup.add(leftRail);
		
		const rightRail = new THREE.Mesh(railGeometry, railMaterial);
		rightRail.position.set(1.2, buildingHeight / 2, 0); // Wider spacing
		ladderGroup.add(rightRail);
		
		// Ladder rungs (horizontal steps) - much larger and more visible
		const rungGeometry = new THREE.BoxGeometry(2.4, 0.15, 0.15); // Much larger rungs
		const rungMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x888888,
			emissive: 0x555555
		}); // Bright and glowing
		
		const rungCount = Math.floor(buildingHeight / 1.5); // More rungs for easier climbing
		for (let i = 0; i < rungCount; i++) {
			const rung = new THREE.Mesh(rungGeometry, rungMaterial);
			rung.position.set(0, (i + 1) * 1.5, 0);
			ladderGroup.add(rung);
		}
		
		// Add a much more visible glow effect around the ladder
		const glowGeometry = new THREE.BoxGeometry(3, buildingHeight + 1, 1);
		const glowMaterial = new THREE.MeshBasicMaterial({ 
			color: 0x00ff00,
			transparent: true,
			opacity: 0.3, // More visible
			side: THREE.DoubleSide
		});
		const glow = new THREE.Mesh(glowGeometry, glowMaterial);
		glow.position.set(0, buildingHeight / 2, 0);
		ladderGroup.add(glow);
		
		// Position ladder on the side of the building (not in front)
		// Place ladder on the right side of the building
		ladderGroup.position.set(x + 15.5, 0, z); // 15.5 units from center (half building width + ladder offset)
		ladderGroup.rotation.y = 0; // No rotation - ladder faces the side of the building
		ladderGroup.castShadow = true;
		this.scene.add(ladderGroup);
		
		// Return the ladder group as a single mesh for collision detection
		return ladderGroup as any;
	}

	private getBuildingColor(type: string): number {
		switch (type) {
			case 'office': return 0x666666; // Lighter gray for better visibility
			case 'apartment': return 0x888888; // Lighter gray for residential
			case 'shop': return 0xaa6633; // Lighter brown for commercial buildings
			case 'skyscraper': return 0x444444; // Lighter dark gray for modern skyscrapers
			case 'house': return 0xaa8866; // Lighter warm brown for houses
			default: return 0x777777;
		}
	}
	
	private getBuildingEmissiveColor(type: string): number {
		switch (type) {
			case 'office': return 0x222222;
			case 'apartment': return 0x333333;
			case 'shop': return 0x442222;
			case 'skyscraper': return 0x111111;
			case 'house': return 0x332222;
			default: return 0x222222;
		}
	}
	
	private addArchitecturalDetails(building: THREE.Mesh, type: string, height: number): void {
		// Add simplified architectural elements for better performance
		
		// Add corner pillars/columns
		this.addCornerPillars(building, height);
		
		// Add entrance details
		this.addEntranceDetails(building, type);
		
		// Add rooftop details based on building type
		this.addRooftopDetails(building, type, height);
	}
	
	private addCornerPillars(building: THREE.Mesh, height: number): void {
		// Add simplified corner pillars for architectural detail
		const pillarGeometry = new THREE.BoxGeometry(0.8, height, 0.8);
		const pillarMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x333333,
			emissive: 0x111111
		});
		
		// Calculate building width at different heights for pillar positioning
		const topWidth = 6;
		const baseWidth = topWidth * 5;
		
		// Add pillars at corners
		const pillarPositions = [
			{ x: -baseWidth/2 + 0.4, z: -baseWidth/2 + 0.4 }, // Bottom left
			{ x: baseWidth/2 - 0.4, z: -baseWidth/2 + 0.4 },  // Bottom right
			{ x: -baseWidth/2 + 0.4, z: baseWidth/2 - 0.4 },  // Top left
			{ x: baseWidth/2 - 0.4, z: baseWidth/2 - 0.4 }    // Top right
		];
		
		pillarPositions.forEach(pos => {
			const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
			pillar.position.set(pos.x, height/2, pos.z);
			building.add(pillar);
		});
	}
	
	private addHorizontalBands(building: THREE.Mesh, height: number): void {
		// Add horizontal architectural bands
		const bandGeometry = new THREE.BoxGeometry(30, 0.3, 30);
		const bandMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x555555,
			emissive: 0x222222
		});
		
		// Add bands at regular intervals
		const bandCount = Math.floor(height / 8);
		for (let i = 1; i <= bandCount; i++) {
			const band = new THREE.Mesh(bandGeometry, bandMaterial);
			band.position.y = (i * height / (bandCount + 1)) - height/2;
			building.add(band);
		}
	}
	
	private addEntranceDetails(building: THREE.Mesh, type: string): void {
		// Add simplified entrance details at the base
		const entranceGeometry = new THREE.BoxGeometry(3, 2.5, 1.5);
		const entranceMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x333333,
			emissive: 0x111111
		});
		
		const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
		entrance.position.set(0, 1.25, 15.75); // Front entrance
		building.add(entrance);
	}
	
	private addRooftopDetails(building: THREE.Mesh, type: string, height: number): void {
		// Add simplified rooftop architectural elements
		switch (type) {
			case 'skyscraper':
				// Add antenna/spire
				const antennaGeometry = new THREE.CylinderGeometry(0.2, 0.2, 6);
				const antennaMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
				const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
				antenna.position.set(0, height/2 + 3, 0);
				building.add(antenna);
				break;
				
			case 'office':
				// Add rooftop garden/terrace
				const terraceGeometry = new THREE.BoxGeometry(3, 0.3, 3);
				const terraceMaterial = new THREE.MeshLambertMaterial({ color: 0x228822 });
				const terrace = new THREE.Mesh(terraceGeometry, terraceMaterial);
				terrace.position.set(0, height/2 + 0.15, 0);
				building.add(terrace);
				break;
				
			case 'apartment':
				// Add water tank
				const tankGeometry = new THREE.CylinderGeometry(0.8, 0.8, 1.5);
				const tankMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
				const tank = new THREE.Mesh(tankGeometry, tankMaterial);
				tank.position.set(0, height/2 + 0.75, 0);
				building.add(tank);
				break;
		}
	}
	
	private addFacadeDetails(building: THREE.Mesh, type: string, height: number): void {
		// Add detailed facade elements to make buildings look more realistic
		
		// Add decorative panels
		const panelGeometry = new THREE.PlaneGeometry(2, 1);
		const panelMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x555555,
			emissive: 0x222222
		});
		
		// Add panels at regular intervals
		for (let y = 3; y < height - 3; y += 6) {
			const progress = y / height;
			const topWidth = 6;
			const baseWidth = topWidth * 5;
			const currentWidth = baseWidth + (topWidth - baseWidth) * progress;
			const halfWidth = currentWidth / 2;
			
			// Front facade panels
			for (let x = -halfWidth + 2; x <= halfWidth - 2; x += 4) {
				const panel = new THREE.Mesh(panelGeometry, panelMaterial);
				panel.position.set(x, y, halfWidth + 0.05);
				building.add(panel);
			}
			
			// Side facade panels
			for (let z = -halfWidth + 2; z <= halfWidth - 2; z += 4) {
				const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
				leftPanel.position.set(-halfWidth - 0.05, y, z);
				leftPanel.rotation.y = Math.PI / 2;
				building.add(leftPanel);
				
				const rightPanel = new THREE.Mesh(panelGeometry, panelMaterial);
				rightPanel.position.set(halfWidth + 0.05, y, z);
				rightPanel.rotation.y = -Math.PI / 2;
				building.add(rightPanel);
			}
		}
		
		// Add building signage for commercial buildings
		if (type === 'shop' || type === 'office') {
			const signGeometry = new THREE.PlaneGeometry(3, 0.8);
			const signMaterial = new THREE.MeshLambertMaterial({ 
				color: 0x888888,
				emissive: 0x444444
			});
			
			const sign = new THREE.Mesh(signGeometry, signMaterial);
			sign.position.set(0, height - 2, 15.5);
			building.add(sign);
			
			// Add sign lighting
			const signLight = new THREE.PointLight(0xffffaa, 0.4, 3);
			signLight.position.set(0, height - 1.5, 16);
			building.add(signLight);
		}
	}

	private addBuildingDetails(building: THREE.Mesh, type: string, height: number): void {
		// Add simplified but still detailed windows for better performance
		const windowGeometry = new THREE.PlaneGeometry(0.8, 1.2);
		const windowMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x87ceeb,
			emissive: 0x222222,
			transparent: true,
			opacity: 0.8
		});

		// Add window frames
		const frameGeometry = new THREE.PlaneGeometry(1.0, 1.4);
		const frameMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x333333,
			emissive: 0x111111
		});

		// Add windows on each side - reduced frequency for performance
		for (let y = 2; y < height - 2; y += 2.5) { // Increased spacing
			const progress = y / height;
			const topWidth = 6;
			const baseWidth = topWidth * 5;
			const currentWidth = baseWidth + (topWidth - baseWidth) * progress;
			const halfWidth = currentWidth / 2;
			
			// Calculate window spacing based on current building width
			const windowSpacing = Math.max(3.0, currentWidth / 4); // Reduced frequency
			const maxOffset = halfWidth - 1.0;
			
			// Front windows - fewer windows per side
			for (let x = -maxOffset; x <= maxOffset; x += windowSpacing) {
				// Window frame
				const frontFrame = new THREE.Mesh(frameGeometry, frameMaterial);
				frontFrame.position.set(x, y, halfWidth + 0.02);
				building.add(frontFrame);
				
				// Window glass
				const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				frontWindow.position.set(x, y, halfWidth + 0.03);
				building.add(frontWindow);

				// Back windows
				const backFrame = new THREE.Mesh(frameGeometry, frameMaterial);
				backFrame.position.set(x, y, -halfWidth - 0.02);
				backFrame.rotation.y = Math.PI;
				building.add(backFrame);
				
				const backWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				backWindow.position.set(x, y, -halfWidth - 0.03);
				backWindow.rotation.y = Math.PI;
				building.add(backWindow);
			}

			// Side windows - fewer windows per side
			for (let z = -maxOffset; z <= maxOffset; z += windowSpacing) {
				// Left side
				const leftFrame = new THREE.Mesh(frameGeometry, frameMaterial);
				leftFrame.position.set(-halfWidth - 0.02, y, z);
				leftFrame.rotation.y = Math.PI / 2;
				building.add(leftFrame);
				
				const leftWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				leftWindow.position.set(-halfWidth - 0.03, y, z);
				leftWindow.rotation.y = Math.PI / 2;
				building.add(leftWindow);

				// Right side
				const rightFrame = new THREE.Mesh(frameGeometry, frameMaterial);
				rightFrame.position.set(halfWidth + 0.02, y, z);
				rightFrame.rotation.y = -Math.PI / 2;
				building.add(rightFrame);
				
				const rightWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				rightWindow.position.set(halfWidth + 0.03, y, z);
				rightWindow.rotation.y = -Math.PI / 2;
				building.add(rightWindow);
			}
		}

		// Add simplified roof details
		if (height > 3) {
			// Main roof
			const roofGeometry = new THREE.BoxGeometry(6.2, 0.3, 6.2);
			const roofMaterial = new THREE.MeshLambertMaterial({ 
				color: 0x333333,
				emissive: 0x111111
			});
			const roof = new THREE.Mesh(roofGeometry, roofMaterial);
			roof.position.y = height / 2 + 0.15;
			building.add(roof);
		}
	}
	
	private addBalconies(building: THREE.Mesh, height: number): void {
		// Add balconies for apartment buildings
		const balconyGeometry = new THREE.BoxGeometry(2, 0.2, 1.5);
		const balconyMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x666666,
			emissive: 0x333333
		});
		
		const railingGeometry = new THREE.BoxGeometry(2.2, 0.8, 0.1);
		const railingMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x444444,
			emissive: 0x222222
		});
		
		// Add balconies at different heights
		for (let y = 4; y < height - 4; y += 4) {
			const progress = y / height;
			const topWidth = 6;
			const baseWidth = topWidth * 5;
			const currentWidth = baseWidth + (topWidth - baseWidth) * progress;
			const halfWidth = currentWidth / 2;
			
			// Add balcony on front side
			const balcony = new THREE.Mesh(balconyGeometry, balconyMaterial);
			balcony.position.set(0, y, halfWidth + 0.75);
			building.add(balcony);
			
			// Add railing
			const railing = new THREE.Mesh(railingGeometry, railingMaterial);
			railing.position.set(0, y + 0.5, halfWidth + 0.75);
			building.add(railing);
			
			// Add side railings
			const sideRailingGeometry = new THREE.BoxGeometry(0.1, 0.8, 1.6);
			const leftRailing = new THREE.Mesh(sideRailingGeometry, railingMaterial);
			leftRailing.position.set(-1.1, y + 0.5, halfWidth + 0.75);
			building.add(leftRailing);
			
			const rightRailing = new THREE.Mesh(sideRailingGeometry, railingMaterial);
			rightRailing.position.set(1.1, y + 0.5, halfWidth + 0.75);
			building.add(rightRailing);
		}
	}

	private addStreetLights(): void {
		// Add street lights throughout the massive map - updated for larger map
		const lightPositions = [
			// Main intersections - updated for new building positions
			{ x: -30, z: -30 }, { x: 30, z: -30 }, { x: -30, z: 30 }, { x: 30, z: 30 },
			{ x: -50, z: -50 }, { x: 50, z: -50 }, { x: -50, z: 50 }, { x: 50, z: 50 },
			{ x: 0, z: -60 }, { x: 0, z: 60 }, { x: -60, z: 0 }, { x: 60, z: 0 },
			
			// Additional lights for better coverage - updated positions
			{ x: -20, z: -40 }, { x: 20, z: -40 }, { x: -40, z: -20 }, { x: 40, z: -20 },
			{ x: -40, z: 20 }, { x: 40, z: 20 }, { x: -20, z: 40 }, { x: 20, z: 40 },
			{ x: -80, z: -80 }, { x: 80, z: -80 }, { x: -80, z: 80 }, { x: 80, z: 80 },
			{ x: -90, z: 0 }, { x: 90, z: 0 }, { x: 0, z: -90 }, { x: 0, z: 90 },
			
			// Strategic lighting for parkour routes
			{ x: -35, z: -35 }, { x: 35, z: -35 }, { x: -35, z: 35 }, { x: 35, z: 35 },
			{ x: -15, z: 45 }, { x: 15, z: 45 }, { x: -45, z: -15 }, { x: 45, z: -15 },
			{ x: -45, z: 15 }, { x: 45, z: 15 },
			
			// Additional lights for outer areas
			{ x: -70, z: -30 }, { x: 70, z: -30 }, { x: -70, z: 30 }, { x: 70, z: 30 },
			{ x: -30, z: -70 }, { x: 30, z: -70 }, { x: -30, z: 70 }, { x: 30, z: 70 }
		];

		lightPositions.forEach(pos => {
			this.createStreetLight(pos.x, pos.z);
		});
	}

	private createStreetLight(x: number, z: number): void {
		// Pole
		const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 4);
		const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
		const pole = new THREE.Mesh(poleGeometry, poleMaterial);
		pole.position.set(x, 2, z);
		pole.castShadow = true;
		this.scene.add(pole);

		// Light fixture
		const fixtureGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.8);
		const fixtureMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
		const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial);
		fixture.position.set(x, 4, z);
		fixture.castShadow = true;
		this.scene.add(fixture);

		// Light source
		const light = new THREE.PointLight(0xffffaa, 0.5, 8);
		light.position.set(x, 3.8, z);
		this.scene.add(light);
	}

	private addDecorations(): void {
		// Add more trash cans throughout the larger map
		for (let i = 0; i < 20; i++) {
			const canGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.8);
			const canMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
			const can = new THREE.Mesh(canGeometry, canMaterial);
			can.position.set(
				Math.random() * this.mapSize - this.mapSize/2,
				0.4,
				Math.random() * this.mapSize - this.mapSize/2
			);
			can.castShadow = true;
			this.scene.add(can);
		}

		// Add more benches
		for (let i = 0; i < 15; i++) {
			this.createBench(
				Math.random() * this.mapSize - this.mapSize/2,
				Math.random() * this.mapSize - this.mapSize/2
			);
		}

		// Add some newspaper stands
		for (let i = 0; i < 10; i++) {
			this.createNewspaperStand(
				Math.random() * this.mapSize - this.mapSize/2,
				Math.random() * this.mapSize - this.mapSize/2
			);
		}

		// Add some fire hydrants
		for (let i = 0; i < 18; i++) {
			this.createFireHydrant(
				Math.random() * this.mapSize - this.mapSize/2,
				Math.random() * this.mapSize - this.mapSize/2
			);
		}
	}

	private createNewspaperStand(x: number, z: number): void {
		// Stand base
		const baseGeometry = new THREE.BoxGeometry(0.8, 0.1, 0.8);
		const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.position.set(x, 0.05, z);
		base.castShadow = true;
		this.scene.add(base);

		// Stand structure
		const structureGeometry = new THREE.BoxGeometry(0.6, 1.5, 0.6);
		const structureMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
		const structure = new THREE.Mesh(structureGeometry, structureMaterial);
		structure.position.set(x, 0.8, z);
		structure.castShadow = true;
		this.scene.add(structure);

		// Newspaper rack
		const rackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.4);
		const rackMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
		const rack = new THREE.Mesh(rackGeometry, rackMaterial);
		rack.position.set(x, 1.2, z);
		rack.castShadow = true;
		this.scene.add(rack);
	}

	private createFireHydrant(x: number, z: number): void {
		// Hydrant base
		const baseGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.3);
		const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.position.set(x, 0.15, z);
		base.castShadow = true;
		this.scene.add(base);

		// Hydrant body
		const bodyGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8);
		const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
		const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
		body.position.set(x, 0.7, z);
		body.castShadow = true;
		this.scene.add(body);

		// Hydrant cap
		const capGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2);
		const capMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
		const cap = new THREE.Mesh(capGeometry, capMaterial);
		cap.position.set(x, 1.2, z);
		cap.castShadow = true;
		this.scene.add(cap);
	}

	private initLighting(): void {
		// Enhanced ambient lighting for better building visibility
		const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
		this.scene.add(ambientLight);

		// Main directional light (moonlight) - optimized for performance
		const directionalLight = new THREE.DirectionalLight(0x87ceeb, 0.7);
		directionalLight.position.set(50, 100, 50);
		directionalLight.castShadow = true;
		directionalLight.shadow.mapSize.width = 1024; // Reduced for performance
		directionalLight.shadow.mapSize.height = 1024;
		directionalLight.shadow.camera.near = 0.5;
		directionalLight.shadow.camera.far = 500;
		directionalLight.shadow.camera.left = -100;
		directionalLight.shadow.camera.right = 100;
		directionalLight.shadow.camera.top = 100;
		directionalLight.shadow.camera.bottom = -100;
		directionalLight.shadow.bias = -0.0001; // Reduce shadow acne
		this.scene.add(directionalLight);

		// Add secondary fill light for better building illumination
		const fillLight = new THREE.DirectionalLight(0x444444, 0.2);
		fillLight.position.set(-30, 80, -30);
		this.scene.add(fillLight);

		// Add street lights
		this.addStreetLights();
	}
	
	private addBuildingAccentLights(): void {
		// Add subtle accent lights to highlight building features
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const height = building.height;
			
			// Add rooftop accent light
			const rooftopLight = new THREE.PointLight(0xffffff, 0.3, 15);
			rooftopLight.position.set(buildingPos.x, height + 2, buildingPos.z);
			this.scene.add(rooftopLight);
			
			// Add ground-level accent light
			const groundLight = new THREE.PointLight(0xffffaa, 0.2, 8);
			groundLight.position.set(buildingPos.x, 1, buildingPos.z + 15);
			this.scene.add(groundLight);
		});
	}

	private initEventListeners(): void {
		// Keyboard controls
		document.addEventListener('keydown', (event) => {
			switch (event.code) {
				case 'KeyW':
				case 'ArrowUp':
					this.keys.up = true;
					break;
				case 'KeyS':
				case 'ArrowDown':
					this.keys.down = true;
					break;
				case 'KeyA':
				case 'ArrowLeft':
					this.keys.left = true;
					break;
				case 'KeyD':
				case 'ArrowRight':
					this.keys.right = true;
					break;
				case 'Space':
					this.keys.jump = true;
					break;
				case 'KeyP':
				case 'Escape':
					this.togglePause();
					break;
				case 'KeyR':
					this.keys.r = true;
					break;
			}
		});

		document.addEventListener('keyup', (event) => {
			switch (event.code) {
				case 'KeyW':
				case 'ArrowUp':
					this.keys.up = false;
					break;
				case 'KeyS':
				case 'ArrowDown':
					this.keys.down = false;
					break;
				case 'KeyA':
				case 'ArrowLeft':
					this.keys.left = false;
					break;
				case 'KeyD':
				case 'ArrowRight':
					this.keys.right = false;
					break;
				case 'Space':
					this.keys.jump = false;
					break;
				case 'KeyR':
					this.keys.r = false;
					break;
			}
		});

		// Mouse controls
		const canvas = this.renderer.domElement;
		
		// Pointer lock for mouse camera control
		canvas.addEventListener('click', () => {
			if (!this.isPointerLocked) {
				canvas.requestPointerLock();
			}
		});

		document.addEventListener('pointerlockchange', () => {
			this.isPointerLocked = document.pointerLockElement === canvas;
		});

		// Mouse movement for camera control
		document.addEventListener('mousemove', (event) => {
			if (this.isPointerLocked) {
				const deltaX = event.movementX || 0;
				const deltaY = event.movementY || 0;
				
				// Camera rotation sensitivity
				const sensitivity = 0.002;
				this.cameraRotationY -= deltaX * sensitivity;
				this.cameraRotationX -= deltaY * sensitivity;
				
				// Clamp vertical rotation to prevent camera flipping
				this.cameraRotationX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.cameraRotationX));
			}
		});

		// Mouse click for attacking
		document.addEventListener('mousedown', (event) => {
			if (event.button === 0) { // Left click
				this.keys.attack = true;
			}
		});

		document.addEventListener('mouseup', (event) => {
			if (event.button === 0) { // Left click
				this.keys.attack = false;
			}
		});

		// Mouse wheel for camera zoom
		document.addEventListener('wheel', (event) => {
			event.preventDefault();
			
			// Zoom in/out based on scroll direction
			const zoomSpeed = 2;
			const zoomDelta = event.deltaY > 0 ? zoomSpeed : -zoomSpeed;
			
			// Update camera distance with bounds
			this.cameraDistance = Math.max(
				this.minCameraDistance,
				Math.min(this.maxCameraDistance, this.cameraDistance + zoomDelta)
			);
		});

		// Touch controls for mobile
		let touchStartX = 0;
		let touchStartY = 0;
		let isJumping = false;

		document.addEventListener('touchstart', (event) => {
			event.preventDefault();
			const touch = event.touches[0];
			touchStartX = touch.clientX;
			touchStartY = touch.clientY;
			
			// Check if this is a jump gesture (swipe up)
			if (event.touches.length === 1) {
				// Single touch - could be movement or jump
				isJumping = false;
			}
		});

		document.addEventListener('touchmove', (event) => {
			event.preventDefault();
			if (event.touches.length === 1) {
				const touch = event.touches[0];
				const deltaX = touch.clientX - touchStartX;
				const deltaY = touch.clientY - touchStartY;
				const threshold = 20;

				// Handle movement
				if (Math.abs(deltaX) > threshold) {
					if (deltaX > 0) {
						this.keys.right = true;
						this.keys.left = false;
					} else {
						this.keys.left = true;
						this.keys.right = false;
					}
				} else {
					this.keys.left = false;
					this.keys.right = false;
				}

				if (Math.abs(deltaY) > threshold) {
					if (deltaY > 0) {
						this.keys.down = true;
						this.keys.up = false;
					} else {
						this.keys.up = true;
						this.keys.down = false;
						// Upward swipe triggers jump
						if (!isJumping) {
							this.keys.jump = true;
							isJumping = true;
						}
					}
				} else {
					this.keys.up = false;
					this.keys.down = false;
				}
			}
		});

		document.addEventListener('touchend', (event) => {
			event.preventDefault();
			
			// Only reset keys if no touches remain
			if (event.touches.length === 0) {
				// Reset movement keys but keep jump if it was just triggered
				this.keys.left = false;
				this.keys.right = false;
				this.keys.up = false;
				this.keys.down = false;
				
				// Keep jump active for a short time to ensure it registers
				if (this.keys.jump) {
					setTimeout(() => {
						this.keys.jump = false;
						isJumping = false;
					}, 100);
				}
			}
			
			// Handle tap to attack
			const touch = event.changedTouches[0];
			const deltaX = touch.clientX - touchStartX;
			const deltaY = touch.clientY - touchStartY;
			const threshold = 30;
			
			if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
				this.keys.attack = true;
				setTimeout(() => this.keys.attack = false, 100);
			}
		});
	}

	private updatePlayerPhysics(delta: number): void {
		// Safety check - ensure player exists before updating physics
		if (!this.playerGroup) {
			return;
		}
		
		// If climbing, skip all physics updates
		if (this.isClimbingLadder) {
			return;
		}
		
		// Debug logging for movement issues
		if (this.isOnBuilding && this.currentBuildingHeight > 0) {
			console.log('Physics update - Player on building:', this.currentBuildingHeight, 'Position:', this.playerGroup.position.x.toFixed(2), this.playerGroup.position.y.toFixed(2), this.playerGroup.position.z.toFixed(2), 'OnGround:', this.playerOnGround, 'Velocity:', this.playerVelocity.x.toFixed(2), this.playerVelocity.y.toFixed(2), this.playerVelocity.z.toFixed(2));
		}
		
		// Store previous position for interpolation
		this.lastPosition.copy(this.playerGroup.position);
		this.lastVelocity.copy(this.playerVelocity);

		// Handle input-based movement
		const moveX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
		const moveZ = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
		
		// Debug input logging
		if (this.isOnBuilding && this.currentBuildingHeight > 0 && (moveX !== 0 || moveZ !== 0)) {
			console.log('Input detected - moveX:', moveX, 'moveZ:', moveZ, 'keys:', this.keys);
		}
		
		// Force input processing even when on buildings
		if (this.isOnBuilding && this.currentBuildingHeight > 0) {
			// Ensure movement works on buildings by forcing ground state
			this.playerOnGround = true;
		}
		
		// Normalize diagonal movement
		const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
		const normalizedMoveX = moveMagnitude > 0 ? moveX / moveMagnitude : 0;
		const normalizedMoveZ = moveMagnitude > 0 ? moveZ / moveMagnitude : 0;

		// Get camera direction for movement relative to camera
		const cameraDirection = new THREE.Vector3(0, 0, -1);
		cameraDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);
		
		const cameraRight = new THREE.Vector3(1, 0, 0);
		cameraRight.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);

		// Calculate movement speed - same for ground and buildings
		const baseSpeed = 8;
		const currentSpeed = baseSpeed * (this.isMoving ? 1.5 : 1); // Running speed

		// Calculate target velocity in camera-relative space
		const targetVelocityX = (cameraRight.x * normalizedMoveX + cameraDirection.x * normalizedMoveZ) * currentSpeed;
		const targetVelocityZ = (cameraRight.z * normalizedMoveX + cameraDirection.z * normalizedMoveZ) * currentSpeed;

		// Apply movement forces - simplified for both ground and buildings
		// Force playerOnGround to true when on a building to ensure movement works
		if (this.isOnBuilding && this.currentBuildingHeight > 0) {
			this.playerOnGround = true;
			// Ensure player stays at building height when not jumping
			if (this.playerVelocity.y <= 0 && this.playerGroup.position.y < this.currentBuildingHeight + 0.5) {
				this.playerGroup.position.y = this.currentBuildingHeight + 1.5;
				this.playerVelocity.y = 0;
			}
		}
		
		if (this.playerOnGround) {
			// Smooth velocity interpolation
			this.playerVelocity.x += (targetVelocityX - this.playerVelocity.x) * 8 * delta;
			this.playerVelocity.z += (targetVelocityZ - this.playerVelocity.z) * 8 * delta;
			
			// Apply friction when not moving
			if (moveMagnitude === 0) {
				this.playerVelocity.x *= 0.85;
				this.playerVelocity.z *= 0.85;
			}
		} else {
			// Air movement with reduced control
			const airControl = 0.3;
			this.playerVelocity.x += targetVelocityX * airControl * delta;
			this.playerVelocity.z += targetVelocityZ * airControl * delta;
		}

		// Update movement state for animation
		this.isMoving = moveMagnitude > 0;

		// Handle jumping - simplified
		if (this.keys.jump) {
			this.jumpBufferCounter = this.jumpBufferTime;
		}

		// Apply jump if conditions are met
		if (this.jumpBufferCounter > 0 && (this.playerOnGround || this.coyoteTimeCounter > 0)) {
			this.playerVelocity.y = 12;
			this.playerOnGround = false;
			this.jumpBufferCounter = 0;
			this.coyoteTimeCounter = 0;
		}

		// Apply gravity
		const gravity = 25;
		const terminalVelocity = 20;
		this.playerVelocity.y -= gravity * delta;
		this.playerVelocity.y = Math.max(this.playerVelocity.y, -terminalVelocity);

		// Update coyote time
		if (this.playerOnGround) {
			this.coyoteTimeCounter = this.coyoteTime;
		} else {
			this.coyoteTimeCounter -= delta;
		}

		// Update jump buffer
		this.jumpBufferCounter -= delta;

		// Apply velocity to position - always apply full velocity
		this.playerGroup.position.add(this.playerVelocity.clone().multiplyScalar(delta));

		// Update character rotation based on movement
		this.updateCharacterRotation(moveX, moveZ);

		// Update running animation
		this.updateRunningAnimation(delta);

		// Update weapon animation
		this.updateWeaponAnimation(delta);

		// Update camera
		this.updateCamera();

		// Handle collisions with delta parameter
		this.handleCollisions(delta);

		// Prevent getting stuck
		this.preventStuckPosition();
		
		// Update attack cooldown
		if (this.attackCooldown > 0) {
			this.attackCooldown -= delta;
		}
	}

	private preventStuckPosition(): void {
		// If player is in an invalid position, reset to a safe position
		if (this.playerGroup.position.y < 0) {
			this.playerGroup.position.y = 1;
			this.playerVelocity.y = 0;
			this.playerOnGround = true;
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
		}
		
		// If player is stuck in a building, push them out
		if (this.isOnBuilding && this.playerGroup.position.y < this.currentBuildingHeight) {
			this.playerGroup.position.y = this.currentBuildingHeight + 1;
			this.playerVelocity.y = 0;
		}
	}

	private handleCollisions(delta: number): void {
		// Skip collisions during climbing
		if (this.isClimbingLadder) {
			return;
		}
		
		// 1. Building collisions (highest priority - check for landings first)
		this.checkBuildingCollisions(delta);
		
		// 2. Ground collision (only if not on a building and not climbing)
		if (!this.isOnBuilding && this.playerGroup.position.y <= 1.5) {
			this.checkGroundCollision(delta);
		}
		
		// 3. Boundary collision
		this.playerGroup.position.x = Math.max(-this.mapBounds, Math.min(this.mapBounds, this.playerGroup.position.x));
		this.playerGroup.position.z = Math.max(-this.mapBounds, Math.min(this.mapBounds, this.playerGroup.position.z));
	}

	private checkGroundCollision(delta: number): void {
		const groundLevel = 1;
		
		// Only check ground collision if not on a building and not climbing
		if (this.isOnBuilding || this.isClimbingLadder) {
			return;
		}
		
		// Check if player is below ground level and falling
		if (this.playerGroup.position.y <= groundLevel && this.playerVelocity.y <= 0) {
			this.playerGroup.position.y = groundLevel;
			this.playerVelocity.y = 0;
			this.playerOnGround = true;
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
		}
	}

	private checkBuildingCollisions(delta: number): void {
		// Skip building collisions entirely if climbing
		if (this.isClimbingLadder) {
			return;
		}
		
		// Simple post-climbing handling
		if (this.postClimbingGracePeriod > 0) {
			this.postClimbingGracePeriod -= delta;
		}
		
		// Update building exit timer
		if (this.buildingExitTimer > 0) {
			this.buildingExitTimer -= delta;
		}
		
		let landedOnBuilding = false;
		
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = this.playerGroup.position.distanceTo(buildingPos);
			const playerHeight = this.playerGroup.position.y;
			const buildingTop = building.height;
			
			// Building detection using correct radius for the building size
			const buildingRadius = 3; // Top width is 6, so radius is 3 (this is correct for rooftop)
			const landingHeight = buildingTop + 1.5;
			const isNearBuilding = distance < buildingRadius;
			const isAboveBuilding = playerHeight > buildingTop - 1 && playerHeight < buildingTop + 5;
			const isOnBuilding = isNearBuilding && isAboveBuilding && this.playerVelocity.y <= 0;
			
					// CASE 1: Player is already on this building - simple height maintenance
		if (this.isOnBuilding && this.currentBuildingHeight === buildingTop && distance < buildingRadius + 2) {
			// Only maintain height if player is actually falling and below the building surface
			if (this.playerVelocity.y <= 0 && playerHeight < buildingTop + 0.5) {
				this.playerGroup.position.y = landingHeight;
				this.playerVelocity.y = 0;
				this.playerOnGround = true;
				landedOnBuilding = true;
				
				// Show building indicator
				if (!this.buildingIndicator) {
					this.addBuildingIndicator();
				}
			} else {
				// Player is jumping or moving - allow free movement and don't interfere
				this.playerOnGround = this.playerVelocity.y <= 0;
				landedOnBuilding = true;
				
				// Show building indicator
				if (!this.buildingIndicator) {
					this.addBuildingIndicator();
				}
			}
			return; // Skip other checks for this building
		}
			
			// CASE 2: Player is landing on a building (not currently on one)
			if (!this.isOnBuilding && isOnBuilding && this.buildingExitTimer <= 0) {
				// Land on building
				this.playerGroup.position.y = landingHeight;
				this.playerVelocity.y = 0;
				this.playerOnGround = true;
				this.isOnBuilding = true;
				this.currentBuildingHeight = buildingTop;
				landedOnBuilding = true;
				
				// Show building indicator
				this.addBuildingIndicator();
				
				// Add landing effect
				this.addLandingEffect(this.playerGroup.position.clone());
				
				console.log(`Landed on building at height ${buildingTop}!`);
			}
			
			// CASE 3: Check for climbing only if not on any building
			if (!landedOnBuilding && !this.isOnBuilding && !this.isClimbingLadder) {
				this.checkClimbing(building, buildingPos, buildingTop, delta);
			}
		});

		// Check for building-to-building jumping (always check, even when on a building)
		this.checkBuildingToBuildingJumping();
		
		// Check if player has left the building they were on
		if (this.isOnBuilding && !landedOnBuilding) {
			const currentBuilding = this.buildings.find(building => 
				building.height === this.currentBuildingHeight
			);
			
			if (currentBuilding) {
				const distance = this.playerGroup.position.distanceTo(currentBuilding.mesh.position);
				const playerHeight = this.playerGroup.position.y;
				const buildingTop = currentBuilding.height;
				
				// More lenient exit detection - only exit if player is clearly off the building
				const hasLeftBuilding = distance > 4 || // Use building radius + 1 for exit detection
					playerHeight < buildingTop - 5 || // Increased from 3 to 5
					playerHeight > buildingTop + 15; // Increased from 10 to 15
				
				// Skip exit detection during and immediately after climbing
				if (hasLeftBuilding && this.buildingExitTimer <= 0 && this.postClimbingGracePeriod <= 0) {
					// Player has left the building
					this.isOnBuilding = false;
					this.currentBuildingHeight = 0;
					this.removeBuildingIndicator();
					this.buildingExitTimer = 0.5;
					
					console.log('Player left building');
				}
			}
		}
		
		// Reset building state if player falls below ground level
		// BUT skip this check during and immediately after climbing
		if (!landedOnBuilding && this.playerGroup.position.y < 0.5 && this.postClimbingGracePeriod <= 0) {
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
			this.removeBuildingIndicator();
		}
	}

	private checkClimbing(building: Building, buildingPos: THREE.Vector3, buildingTop: number, delta: number): void {
		if (!building.climbable || !building.ladder) return;
		
		const ladderPos = building.ladder.position;
		const distanceToLadder = this.playerGroup.position.distanceTo(ladderPos);
		const playerHeight = this.playerGroup.position.y;
		
		// Check if player is near the ladder (increased range for better usability)
		const ladderDetectionRange = 12.0; // Increased range for better accessibility with side-mounted ladders
		const nearLadder = distanceToLadder < ladderDetectionRange;
		
		// Update ladder interaction state
		if (nearLadder && !this.nearLadder) {
			this.nearLadder = true;
			this.currentLadder = building.ladder;
			this.showLadderIndicator(ladderPos);
		} else if (!nearLadder && this.nearLadder && this.currentLadder === building.ladder) {
			this.nearLadder = false;
			this.currentLadder = null;
			this.hideLadderIndicator();
			
			// Stop climbing if player moves away from ladder
			if (this.isClimbingLadder) {
				this.stopClimbing();
			}
		}
		
		// Handle ladder climbing with Space key - ONLY START CLIMBING, don't continue here
		if (this.nearLadder && this.currentLadder === building.ladder) {
			// Start climbing when Space is pressed and player is near ladder
			if (this.keys.jump && !this.isClimbingLadder) {
				// Validate that we can actually climb this building
				if (playerHeight < buildingTop + 5) { // Don't climb if already too high
					console.log('Starting climb from checkClimbing');
					this.startClimbing(buildingTop, ladderPos);
				}
			}
			
			// Stop climbing when Space is released
			if (this.isClimbingLadder && !this.keys.jump) {
				this.stopClimbing();
			}
		}
	}

	private checkBuildingToBuildingJumping(): void {
		// Check when player is in air and moving, OR when on a building and jumping
		if ((this.playerOnGround && !this.isOnBuilding) || (this.playerVelocity.x === 0 && this.playerVelocity.z === 0)) return;
		
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = this.playerGroup.position.distanceTo(buildingPos);
			const playerHeight = this.playerGroup.position.y;
			const buildingTop = building.height;
			
			// IMPROVED BUILDING-TO-BUILDING JUMPING - Adjusted for new spacing
			const jumpDetectionRange = 10.0; // Increased for better building-to-building jumping
			const heightRange = 4.0; // Increased for more forgiving height detection
			
			// Check if player is jumping toward a building (more generous when jumping from buildings)
			const heightRangeForJump = this.isOnBuilding ? heightRange + 2 : heightRange;
			if (distance < jumpDetectionRange && 
				playerHeight > buildingTop - heightRangeForJump && 
				playerHeight < buildingTop + heightRangeForJump + 2) {
				
				const playerToBuilding = buildingPos.clone().sub(this.playerGroup.position).normalize();
				const jumpDirection = new THREE.Vector3(this.playerVelocity.x, 0, this.playerVelocity.z).normalize();
				
				// Only check if player has significant horizontal velocity
				if (jumpDirection.length() > 0.1) {
					const dotProduct = jumpDirection.dot(playerToBuilding);
					
					// Land on building if jumping toward it - more generous angle
					if (dotProduct > 0.1) { // Reduced from 0.2 for easier landing
						// Land on building
						this.playerGroup.position.y = buildingTop + 1.5; // Match landing height
						this.playerVelocity.y = 0;
						this.playerOnGround = true;
						this.isOnBuilding = true;
						this.currentBuildingHeight = buildingTop;
						
						// Show building indicator
						this.addBuildingIndicator();
						
						// Add landing effect
						this.addLandingEffect(this.playerGroup.position.clone());
						
						console.log(`Building-to-building jump successful! Landed on building at height ${buildingTop}, distance: ${distance.toFixed(2)}`);
					}
				}
			}
		});
	}

	private updateRunningAnimation(delta: number): void {
		// Running animation removed - placeholder player doesn't need complex animations
	}

	private updateCharacterRotation(moveX: number, moveZ: number): void {
		if (moveX === 0 && moveZ === 0) return;

		// Calculate movement direction in camera-relative space
		const cameraDirection = new THREE.Vector3(0, 0, -1);
		cameraDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);
		
		const cameraRight = new THREE.Vector3(1, 0, 0);
		cameraRight.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);

		// Calculate actual movement direction in world space
		const moveDirection = new THREE.Vector3();
		moveDirection.add(cameraRight.clone().multiplyScalar(moveX));
		moveDirection.add(cameraDirection.clone().multiplyScalar(moveZ));
		moveDirection.normalize();

		// Calculate target rotation based on actual movement direction
		const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
		
		// Get current rotation
		const currentRotation = this.playerGroup.rotation.y;
		
		// Calculate the shortest rotation path
		let rotationDiff = targetRotation - currentRotation;
		
		// Handle rotation wrapping
		if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
		if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
		
		// Smooth rotation interpolation
		const rotationSpeed = this.playerOnGround ? 0.15 : 0.08; // Slower rotation in air for better control
		const newRotation = currentRotation + rotationDiff * rotationSpeed;
		
		// Apply rotation
		this.playerGroup.rotation.y = newRotation;
	}

	private updateCamera(): void {
		// Calculate camera position based on player position and mouse rotation
		const playerPos = this.playerGroup.position;
		
		// Dynamic camera height based on player height
		const playerHeight = playerPos.y;
		const dynamicCameraHeight = Math.max(this.cameraHeight, playerHeight + 8);
		
		const cameraOffset = new THREE.Vector3(
			Math.sin(this.cameraRotationY) * this.cameraDistance,
			dynamicCameraHeight,
			Math.cos(this.cameraRotationY) * this.cameraDistance
		);
		
		this.camera.position.copy(playerPos).add(cameraOffset);
		
		// Look at player with better height offset
		const lookAtY = playerHeight + 1.5; // Look at player's head level
		this.camera.lookAt(playerPos.x, lookAtY, playerPos.z);
		
		// Prevent camera from going through buildings
		this.preventCameraCollision();
	}
	
	private preventCameraCollision(): void {
		// Simple collision detection to prevent camera going through buildings
		const playerPos = this.playerGroup.position;
		const cameraPos = this.camera.position;
		
		// Check if camera is too close to any building
		for (const building of this.buildings) {
			const buildingPos = building.mesh.position;
			const distance = cameraPos.distanceTo(buildingPos);
			const buildingRadius = 15; // Approximate building radius
			
			if (distance < buildingRadius + 2) {
				// Push camera away from building
				const direction = cameraPos.clone().sub(buildingPos).normalize();
				const pushDistance = buildingRadius + 2 - distance;
				this.camera.position.add(direction.multiplyScalar(pushDistance));
			}
		}
	}

	private updateWeaponAnimation(delta: number): void {
		// Weapon animation removed - placeholder player doesn't have weapons
	}

	private addLandingEffect(position: THREE.Vector3): void {
		// Create a landing dust effect
		for (let i = 0; i < 8; i++) {
			const particleGeometry = new THREE.SphereGeometry(0.08, 4, 4);
			const particleMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xcccccc,
				transparent: true,
				opacity: 0.6
			});
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);
			
			// Random position around the landing point
			particle.position.copy(position);
			particle.position.x += (Math.random() - 0.5) * 3;
			particle.position.z += (Math.random() - 0.5) * 3;
			particle.position.y += Math.random() * 0.3;
			
			this.scene.add(particle);
			
			// Animate particle
			const velocity = new THREE.Vector3(
				(Math.random() - 0.5) * 3,
				Math.random() * 1.5,
				(Math.random() - 0.5) * 3
			);
			
			const animateParticle = () => {
				particle.position.add(velocity.clone().multiplyScalar(0.016));
				particle.material.opacity -= 0.03;
				
				if (particle.material.opacity > 0) {
					requestAnimationFrame(animateParticle);
				} else {
					this.scene.remove(particle);
				}
			};
			
			animateParticle();
		}
	}

	private addClimbingEffect(position: THREE.Vector3): void {
		// Create a small dust effect when climbing
		for (let i = 0; i < 5; i++) {
			const particleGeometry = new THREE.SphereGeometry(0.05, 4, 4);
			const particleMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xcccccc,
				transparent: true,
				opacity: 0.7
			});
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);
			
			// Random position around the climbing point
			particle.position.copy(position);
			particle.position.x += (Math.random() - 0.5) * 2;
			particle.position.z += (Math.random() - 0.5) * 2;
			particle.position.y += Math.random() * 0.5;
			
			this.scene.add(particle);
			
			// Animate particle
			const velocity = new THREE.Vector3(
				(Math.random() - 0.5) * 2,
				Math.random() * 2,
				(Math.random() - 0.5) * 2
			);
			
			const animateParticle = () => {
				particle.position.add(velocity.clone().multiplyScalar(0.016));
				particle.material.opacity -= 0.02;
				
				if (particle.material.opacity > 0) {
					requestAnimationFrame(animateParticle);
				} else {
					this.scene.remove(particle);
				}
			};
			animateParticle();
		}
	}

	private playAttackSound(): void {
		// Create audio context for sound effects
		if (!this.audioContext) {
			this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		}
		
		// Create a "whoosh" sound effect
		const oscillator = this.audioContext.createOscillator();
		const gainNode = this.audioContext.createGain();
		
		oscillator.connect(gainNode);
		gainNode.connect(this.audioContext.destination);
		
		// Configure sound
		oscillator.type = 'sawtooth';
		oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
		oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.2);
		
		gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
		gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
		
		oscillator.start(this.audioContext.currentTime);
		oscillator.stop(this.audioContext.currentTime + 0.2);
	}

	private killZombie(zombie: Zombie, index: number): void {
		// Death animation
		const deathAnimation = () => {
			zombie.mesh.rotation.z += 0.2;
			zombie.mesh.position.y -= 0.1;
			
			// Fade out effect
			zombie.mesh.traverse((child) => {
				if (child instanceof THREE.Mesh && child.material) {
					if (!child.material.transparent) {
						child.material.transparent = true;
						child.material.opacity = 1;
					}
					child.material.opacity = Math.max(0, child.material.opacity - 0.05);
				}
			});
			
			if (zombie.mesh.position.y > -2) {
				requestAnimationFrame(deathAnimation);
			} else {
				this.scene.remove(zombie.mesh);
				this.zombies.splice(index, 1);
				this.gameState.zombiesKilled++;
			}
		};
		
		deathAnimation();
	}

	private updateZombies(delta: number): void {
		this.zombies.forEach((zombie, index) => {
			// Update target to current player position
			zombie.target.copy(this.playerGroup.position);
			
			// Move towards player
			const distance = zombie.mesh.position.distanceTo(this.playerGroup.position);
			if (distance > 0.5) {
				const toPlayer = this.playerGroup.position.clone().sub(zombie.mesh.position).normalize();
				zombie.mesh.position.add(toPlayer.multiplyScalar(zombie.speed * delta));
			}
			
			// Check building collisions for zombies
			this.checkZombieBuildingCollisions(zombie);
			
			// Check for player damage
			if (zombie.mesh.position.distanceTo(this.playerGroup.position) < 1.5) {
				const currentTime = Date.now() / 1000;
				if (currentTime - this.lastDamageTime >= this.damageCooldown) {
					this.playerHealth -= 10 * delta;
					this.lastDamageTime = currentTime;
					
					// Trigger damage animation
					this.triggerDamageAnimation();
					
					if (this.playerHealth <= 0) {
						this.gameState.gameOver = true;
					}
				}
			}
			
			// Remove zombies that are too far away
			if (zombie.mesh.position.distanceTo(this.playerGroup.position) > 60) {
				this.scene.remove(zombie.mesh);
				this.zombies.splice(index, 1);
			}
		});
	}

	private updateItems(delta: number): void {
		this.items.forEach((item, index) => {
			// Rotate items
			item.mesh.rotation.y += delta * 2;
			
			// Check for collection
			if (item.mesh.position.distanceTo(this.playerGroup.position) < 1.5) {
				// Collect item
				this.scene.remove(item.mesh);
				this.items.splice(index, 1);
				this.gameState.itemsCollected++;
				
				// Apply item effect
				if (item.type === 'health') {
					this.playerHealth = Math.min(100, this.playerHealth + 30);
				} else if (item.type === 'weapon') {
					// Give health boost instead of weapon upgrade for now
					this.playerHealth = Math.min(100, this.playerHealth + 50);
				}
			}
		});
	}

	private staggerZombie(zombie: Zombie): void {
		// Push zombie away from player
		const staggerDirection = zombie.mesh.position.clone().sub(this.playerGroup.position).normalize();
		zombie.mesh.position.add(staggerDirection.multiplyScalar(2));
		
		// Temporarily reduce speed
		zombie.speed *= 0.5;
		setTimeout(() => {
			zombie.speed *= 2;
		}, 1000);
	}
	
	private triggerDamageAnimation(): void {
		if (!this.isTakingDamage) {
			this.isTakingDamage = true;
			this.damageAnimationTimer = this.damageAnimationDuration;
			
			// Create damage effect particles
			this.createDamageEffect();
			
			// Play damage sound
			this.playDamageSound();
		}
	}
	
	private createDamageEffect(): void {
		// Create red damage particles around the player
		const particleCount = 8;
		const radius = 2;
		
		for (let i = 0; i < particleCount; i++) {
			const angle = (i / particleCount) * Math.PI * 2;
			const x = Math.cos(angle) * radius;
			const z = Math.sin(angle) * radius;
			
			// Create damage particle
			const particleGeometry = new THREE.SphereGeometry(0.15, 4, 4);
			const particleMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xff0000,
				emissive: 0x440000,
				transparent: true,
				opacity: 0.9
			});
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);
			
			particle.position.copy(this.playerGroup.position);
			particle.position.x += x;
			particle.position.z += z;
			particle.position.y = 1.5;
			
			this.scene.add(particle);
			
			// Animate particle
			const startTime = Date.now();
			const animateParticle = () => {
				const elapsed = (Date.now() - startTime) / 1000;
				const progress = elapsed / 0.4; // 0.4 second animation
				
				if (progress < 1) {
					// Expand outward and upward
					const currentRadius = radius * (1 + progress * 0.5);
					particle.position.x = this.playerGroup.position.x + Math.cos(angle) * currentRadius;
					particle.position.z = this.playerGroup.position.z + Math.sin(angle) * currentRadius;
					particle.position.y = 1.5 + progress * 2; // Move upward
					
					// Fade out
					particle.material.opacity = 0.9 * (1 - progress);
					particle.scale.setScalar(1 + progress * 0.3);
					
					requestAnimationFrame(animateParticle);
				} else {
					this.scene.remove(particle);
				}
			};
			animateParticle();
		}
	}
	
	private playDamageSound(): void {
		// Create a simple damage sound effect
		if (!this.audioContext) {
			this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		}
		
		try {
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();
			
			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);
			
			oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
			oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.1);
			
			gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
			
			oscillator.start(this.audioContext.currentTime);
			oscillator.stop(this.audioContext.currentTime + 0.1);
		} catch (error) {
			console.log('Audio not supported or blocked');
		}
	}
	
	private updateDamageVisualEffect(): void {
		// Make the player flash red during damage animation
		if (this.playerGroup) {
			const progress = this.damageAnimationTimer / this.damageAnimationDuration;
			const flashIntensity = Math.sin(progress * Math.PI * 8) * 0.5 + 0.5; // Rapid flashing
			
			// Apply red tint to player materials
			this.playerGroup.children.forEach((child: any) => {
				if (child.material && child.material.color) {
					// Store original color if not already stored
					if (!child.material.userData.originalColor) {
						child.material.userData.originalColor = child.material.color.clone();
					}
					
					// Apply red tint based on flash intensity
					const originalColor = child.material.userData.originalColor;
					child.material.color.setRGB(
						originalColor.r + flashIntensity * 0.5,
						originalColor.g * (1 - flashIntensity * 0.3),
						originalColor.b * (1 - flashIntensity * 0.3)
					);
				}
			});
		}
	}
	
	private resetPlayerVisualEffect(): void {
		// Reset player materials to original colors
		if (this.playerGroup) {
			this.playerGroup.children.forEach((child: any) => {
				if (child.material && child.material.color && child.material.userData.originalColor) {
					child.material.color.copy(child.material.userData.originalColor);
				}
			});
		}
	}

	private attack(): void {
		if (this.isAttacking || this.attackCooldown > 0) {
			console.log('Attack blocked: isAttacking=', this.isAttacking, 'attackCooldown=', this.attackCooldown);
			return;
		}
		
		this.isAttacking = true;
		this.attackCooldown = 0.5;
		
		// Create 360-degree attack effect
		this.create360AttackEffect();
		
		// Play attack sound
		this.playAttackSound();
		
		// Check for zombie hits in a circle around player
		const attackRadius = 3;
		this.zombies.forEach((zombie, index) => {
			const distance = zombie.mesh.position.distanceTo(this.playerGroup.position);
			if (distance < attackRadius) {
				zombie.health--;
				if (zombie.health <= 0) {
					this.killZombie(zombie, index);
				} else {
					this.staggerZombie(zombie);
				}
			}
		});
		
		// Reset attack state
		setTimeout(() => {
			this.isAttacking = false;
		}, 300);
	}

	private create360AttackEffect(): void {
		// Create a circular attack effect around the player
		const segments = 16;
		const radius = 3;
		
		for (let i = 0; i < segments; i++) {
			const angle = (i / segments) * Math.PI * 2;
			const x = Math.cos(angle) * radius;
			const z = Math.sin(angle) * radius;
			
			// Create attack particle
			const particleGeometry = new THREE.SphereGeometry(0.1, 4, 4);
			const particleMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xffaa00,
				emissive: 0x442200,
				transparent: true,
				opacity: 0.8
			});
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);
			
			particle.position.copy(this.playerGroup.position);
			particle.position.x += x;
			particle.position.z += z;
			particle.position.y = 1;
			
			this.scene.add(particle);
			
			// Animate particle
			const startTime = Date.now();
			const animateParticle = () => {
				const elapsed = (Date.now() - startTime) / 1000;
				const progress = elapsed / 0.3; // 0.3 second animation
				
				if (progress < 1) {
					// Expand outward
					const currentRadius = radius * (1 + progress * 0.5);
					particle.position.x = this.playerGroup.position.x + Math.cos(angle) * currentRadius;
					particle.position.z = this.playerGroup.position.z + Math.sin(angle) * currentRadius;
					particle.position.y = 1 + Math.sin(progress * Math.PI) * 0.5;
					
					// Fade out
					particle.material.opacity = 0.8 * (1 - progress);
					particle.scale.setScalar(1 + progress * 0.5);
					
					requestAnimationFrame(animateParticle);
				} else {
					this.scene.remove(particle);
				}
			};
			animateParticle();
		}
	}

	private showLadderIndicator(ladderPos: THREE.Vector3): void {
		// Remove existing indicator if any
		this.hideLadderIndicator();
		
		// Create a bright, pulsing ring indicator - larger for bigger ladders
		const ringGeometry = new THREE.RingGeometry(2.5, 3.5, 16); // Larger ring for bigger ladders
		const ringMaterial = new THREE.MeshBasicMaterial({ 
			color: 0x00ff00,
			transparent: true,
			opacity: 0.9, // More visible
			side: THREE.DoubleSide
		});
		
		this.ladderIndicator = new THREE.Mesh(ringGeometry, ringMaterial);
		this.ladderIndicator.position.copy(ladderPos);
		this.ladderIndicator.position.y = 0.1; // Slightly above ground
		this.ladderIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
		
		// Add to scene
		this.scene.add(this.ladderIndicator);
		
		// Start pulsing animation
		this.animateLadderIndicator();
		
		console.log('Ladder indicator shown - press SPACE to climb!');
	}

	private hideLadderIndicator(): void {
		if (this.ladderIndicator) {
			this.scene.remove(this.ladderIndicator);
			this.ladderIndicator = null;
		}
	}

	private animateLadderIndicator(): void {
		if (!this.ladderIndicator) return;
		
		const animate = () => {
			if (!this.ladderIndicator || !this.nearLadder) return;
			
			// Pulsing scale effect
			const time = Date.now() * 0.003;
			const scale = 1 + Math.sin(time) * 0.2;
			this.ladderIndicator.scale.setScalar(scale);
			
			// Color pulsing effect
			const material = this.ladderIndicator.material as THREE.MeshBasicMaterial;
			const intensity = 0.5 + Math.sin(time * 2) * 0.3;
			material.color.setHex(0x00ff00);
			material.opacity = 0.6 + intensity * 0.4;
			
			// Continue animation
			requestAnimationFrame(animate);
		};
		
		animate();
	}

	private handleLadderClimbing(buildingTop: number, delta: number, ladderPos: THREE.Vector3): void {
		// Gradually climb up the ladder
		this.ladderClimbProgress += this.ladderClimbSpeed * delta;
		
		// Update player position during climbing
		const climbHeight = Math.min(this.ladderClimbProgress, buildingTop - 1);
		this.playerGroup.position.y = climbHeight;
		
		// Keep player aligned with ladder
		this.playerGroup.position.x = ladderPos.x;
		this.playerGroup.position.z = ladderPos.z;
		
		// Check if climbing is complete
		if (this.ladderClimbProgress >= buildingTop - 1) {
			// Finish climbing
			this.isClimbingLadder = false;
			this.playerOnGround = true;
			this.playerVelocity.y = 0;
			this.ladderClimbProgress = 0;
			
			// Position player on top of building
			this.playerGroup.position.y = buildingTop + 1;
			
			// Add climbing completion effect
			this.addClimbingEffect(this.playerGroup.position.clone());
			
			// Hide ladder indicator after climbing
			this.hideLadderIndicator();
			this.nearLadder = false;
			this.currentLadder = null;
		}
	}

	private startClimbing(buildingTop: number, ladderPos: THREE.Vector3): void {
		console.log('=== STARTING CLIMB ===');
		console.log('Building top:', buildingTop);
		console.log('Ladder position:', ladderPos);
		console.log('Player position before:', this.playerGroup.position);
		
		// Set climbing state FIRST
		this.isClimbingLadder = true;
		this.ladderClimbProgress = 0;
		this.ladderStartHeight = this.playerGroup.position.y;
		this.ladderClimbTarget = buildingTop + 1.5; // Climb to rooftop level (not above it)
		this.ladderClimbStartTime = this.clock.getElapsedTime(); // Track start time
		
		// IMMEDIATELY disable all physics and collision systems
		this.playerOnGround = false;
		this.playerVelocity.set(0, 0, 0); // Stop all movement
		this.isOnBuilding = false; // Clear building state
		this.currentBuildingHeight = 0;
		
		// IMMEDIATELY position player at the ladder (outside the building)
		// Ensure we're positioned correctly relative to the ladder
		this.playerGroup.position.x = ladderPos.x;
		this.playerGroup.position.z = ladderPos.z;
		// Start climbing from current height or slightly above ground if too low
		if (this.playerGroup.position.y < 1) {
			this.playerGroup.position.y = 1;
		}
		
		// Add climbing start effect
		this.addClimbingEffect(this.playerGroup.position.clone());
		
		console.log('Player position after setup:', this.playerGroup.position);
		console.log('Climbing target height:', this.ladderClimbTarget);
		console.log('=== CLIMB STARTED ===');
	}

	private continueClimbing(delta: number, ladderPos: THREE.Vector3): void {
		// Safety check - ensure we're actually climbing
		if (!this.isClimbingLadder || this.ladderClimbTarget <= 0) {
			console.warn('Invalid climbing state detected - stopping climb');
			this.stopClimbing();
			return;
		}
		
		// Check for climbing timeout - emergency unstuck
		const currentTime = this.clock.getElapsedTime();
		const timeClimbing = currentTime - this.ladderClimbStartTime;
		
		if (timeClimbing > this.ladderClimbTimeout) {
			console.warn('Climbing timeout detected - emergency unstuck');
			this.emergencyUnstuck(ladderPos);
			return;
		}
		
		// Calculate how much to climb this frame
		const climbAmount = this.ladderClimbSpeed * delta;
		const oldHeight = this.playerGroup.position.y;
		const newHeight = oldHeight + climbAmount;
		
		console.log(`Climbing: ${oldHeight.toFixed(2)} -> ${newHeight.toFixed(2)} (target: ${this.ladderClimbTarget.toFixed(2)})`);
		
		// Update player position - keep them at the ladder position (outside the building)
		this.playerGroup.position.y = newHeight;
		this.playerGroup.position.x = ladderPos.x; // This should be the ladder's x position (x + 3.5)
		this.playerGroup.position.z = ladderPos.z;
		
		// Keep velocity at zero during climbing to prevent physics interference
		this.playerVelocity.set(0, 0, 0);
		
		// Check if climbing is complete - climb well above the building
		if (newHeight >= this.ladderClimbTarget) {
			console.log('=== CLIMB COMPLETE ===');
			this.finishClimbing();
		}
	}

	private stopClimbing(): void {
		if (!this.isClimbingLadder) return;
		
		this.isClimbingLadder = false;
		this.ladderClimbProgress = 0;
		
		// Re-enable physics but keep player at current height
		this.playerOnGround = false;
		this.playerVelocity.set(0, 0, 0);
		
		// The physics system will handle falling if they're not on ground
	}

	private finishClimbing(): void {
		console.log('=== FINISHING CLIMB ===');
		console.log('Player position before finish:', this.playerGroup.position);

		// COMPLETELY reset climbing state
		this.isClimbingLadder = false;
		this.ladderClimbProgress = 0;
		this.ladderClimbTarget = 0; // Clear the target
		this.currentLadder = null; // Clear ladder reference
		this.nearLadder = false; // Clear ladder proximity

		// Find the building that was being climbed
		let targetBuilding: Building | null = null;
		let minDist = Infinity;
		
		console.log('=== BUILDING DETECTION DEBUG ===');
		console.log('Player position during finish:', this.playerGroup.position.x.toFixed(2), this.playerGroup.position.y.toFixed(2), this.playerGroup.position.z.toFixed(2));
		console.log('Total buildings:', this.buildings.length);
		
		// First, try to find the building by checking which one has a ladder near the player's position
		for (const building of this.buildings) {
			if (building.ladder) {
				const ladderDist = this.playerGroup.position.distanceTo(building.ladder.position);
				console.log('Building with ladder - distance to ladder:', ladderDist.toFixed(2), 'building height:', building.height);
				if (ladderDist < minDist) {
					minDist = ladderDist;
					targetBuilding = building;
				}
			}
		}
		
		console.log('Best ladder distance found:', minDist.toFixed(2));
		
		// If no building found by ladder proximity, find by general proximity
		if (!targetBuilding) {
			console.log('No building found by ladder proximity, trying general proximity...');
			minDist = Infinity;
			for (const building of this.buildings) {
				const dist = this.playerGroup.position.distanceTo(building.mesh.position);
				console.log('Building distance:', dist.toFixed(2), 'building height:', building.height);
				if (dist < minDist) {
					minDist = dist;
					targetBuilding = building;
				}
			}
		}
		
		console.log('Target building found:', targetBuilding ? 'YES' : 'NO');
		if (targetBuilding) {
			console.log('Target building height:', targetBuilding.height);
			console.log('Distance to target building:', minDist.toFixed(2));
		}
		
		// Fallback: If no building found but we have a ladder target height, find building by height
		if (!targetBuilding && this.ladderClimbTarget > 0) {
			console.log('Using ladder target height fallback:', this.ladderClimbTarget);
			for (const building of this.buildings) {
				if (Math.abs(building.height - this.ladderClimbTarget) < 1) {
					targetBuilding = building;
					minDist = this.playerGroup.position.distanceTo(building.mesh.position);
					console.log('Found building by target height:', building.height);
					break;
				}
			}
		}
		
		// Place player on the target building
		if (targetBuilding && minDist < 25) { // Increased from 15 to 25 for more generous detection
			this.isOnBuilding = true;
			this.currentBuildingHeight = targetBuilding.height;
			
			// Calculate direction from ladder to building center for proper positioning
			let directionToCenter: THREE.Vector3;
			if (targetBuilding.ladder) {
				// Use the ladder position to determine direction to building center
				directionToCenter = targetBuilding.mesh.position.clone().sub(targetBuilding.ladder.position).normalize();
				console.log('Using ladder position for direction calculation');
				console.log('Ladder position:', targetBuilding.ladder.position.x.toFixed(2), targetBuilding.ladder.position.y.toFixed(2), targetBuilding.ladder.position.z.toFixed(2));
				console.log('Building position:', targetBuilding.mesh.position.x.toFixed(2), targetBuilding.mesh.position.y.toFixed(2), targetBuilding.mesh.position.z.toFixed(2));
			} else {
				// Fallback: use current position to building center
				directionToCenter = targetBuilding.mesh.position.clone().sub(this.playerGroup.position).normalize();
				console.log('Using fallback direction calculation');
			}
			
			console.log('Direction to center:', directionToCenter.x.toFixed(2), directionToCenter.y.toFixed(2), directionToCenter.z.toFixed(2));
			
			// Place player in a much better position on the rooftop - further from center for more movement space
			const buildingRadius = 3; // Top width is 6, so radius is 3
			const safeDistance = buildingRadius * 0.6; // 60% of radius - much better distance from center
			
			// Use a random offset to avoid always placing in the same spot
			const randomAngle = Math.random() * Math.PI * 2;
			const randomOffset = new THREE.Vector3(
				Math.cos(randomAngle) * safeDistance,
				0,
				Math.sin(randomAngle) * safeDistance
			);
			
			// Place player at a good distance from building center
			this.playerGroup.position.copy(targetBuilding.mesh.position.clone().add(randomOffset));
			this.playerGroup.position.y = targetBuilding.height + 1.5;
			
			// Check if player is too close to any rooftop structures and adjust if needed
			const rooftopStructures = [
				{ x: -30, z: -30 }, // antenna
				{ x: 30, z: -30 },  // water_tank
				{ x: -30, z: 30 },  // antenna
				{ x: 30, z: 30 }    // helicopter_pad
			];
			
			for (const structure of rooftopStructures) {
				const structurePos = new THREE.Vector3(
					targetBuilding.mesh.position.x + structure.x,
					targetBuilding.height + 1.5,
					targetBuilding.mesh.position.z + structure.z
				);
				const distanceToStructure = this.playerGroup.position.distanceTo(structurePos);
				
				if (distanceToStructure < 2) {
					console.log('Player too close to rooftop structure, adjusting position...');
					// Move player away from structure
					const awayDirection = this.playerGroup.position.clone().sub(structurePos).normalize();
					this.playerGroup.position.copy(structurePos.clone().add(awayDirection.multiplyScalar(3)));
					this.playerGroup.position.y = targetBuilding.height + 1.5;
					break;
				}
			}
			
			// Reset all movement state to ensure player can move freely
			this.playerVelocity.set(0, 0, 0);
			this.playerOnGround = true;
			this.isMoving = false;
			
			// Ensure building state is properly set
			this.isOnBuilding = true;
			this.currentBuildingHeight = targetBuilding.height;
			
			this.addBuildingIndicator();
			console.log('Placed player on building at height', targetBuilding.height);
			console.log('Final player position:', this.playerGroup.position.x.toFixed(2), this.playerGroup.position.y.toFixed(2), this.playerGroup.position.z.toFixed(2));
			console.log('Player movement state reset - should be able to move freely');
		} else {
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
			this.playerGroup.position.y = 1;
			console.log('No building found - set to ground');
		}
		
		this.playerOnGround = true;
		this.playerVelocity.set(0, 0, 0);

		// Set grace period after climbing to prevent false stuck detection
		this.postClimbingGracePeriod = 5.0; // 5 seconds grace period - longer for stability
		this.stuckTimer = 0; // Reset stuck timer
		
		// Add a longer delay before enabling building collision detection to ensure player is stable
		this.buildingExitTimer = 2.0; // 2 second delay before building detection works - longer for stability
		
		// Force update the building state to ensure it's properly set
		if (this.isOnBuilding && this.currentBuildingHeight > 0) {
			console.log('Forcing building state update after climbing');
			// Ensure the building indicator is shown
			this.addBuildingIndicator();
		}

		// Add climbing completion effect
		this.addClimbingEffect(this.playerGroup.position.clone());

		// Hide ladder indicator after climbing
		this.hideLadderIndicator();
		this.nearLadder = false;
		this.currentLadder = null;

		console.log('Player position after finish:', this.playerGroup.position);
		console.log('Building height set to:', this.currentBuildingHeight);
		console.log('Player on ground:', this.playerOnGround);
		console.log('Player velocity:', this.playerVelocity.x.toFixed(2), this.playerVelocity.y.toFixed(2), this.playerVelocity.z.toFixed(2));
		console.log('=== CLIMB FINISHED ===');
		
		// Final validation - only correct height, don't move player position
		if (this.isOnBuilding && this.currentBuildingHeight > 0 && targetBuilding) {
			// Verify player is at the correct height
			const expectedHeight = this.currentBuildingHeight + 1.5;
			const heightDifference = Math.abs(this.playerGroup.position.y - expectedHeight);
			
			if (heightDifference > 1) {
				console.log('Correcting final player height...');
				this.playerGroup.position.y = expectedHeight;
			}
			
			// Log final position for debugging
			console.log('Final rooftop position:', this.playerGroup.position.x.toFixed(2), this.playerGroup.position.y.toFixed(2), this.playerGroup.position.z.toFixed(2));
			console.log('Distance from building center:', this.playerGroup.position.distanceTo(targetBuilding.mesh.position).toFixed(2));
		}
	}

	private checkForStuckClimbing(): void {
		// Check if player is stuck in a building
		if (this.isClimbingLadder && this.currentLadder && this.playerGroup.position.y < this.currentBuildingHeight) {
			console.warn('Player is stuck in a building - emergency unstuck');
			this.emergencyUnstuck(this.currentLadder.position);
		}
	}

	private manualUnstuck(): void {
		console.log('Manual unstuck requested');
		console.log('Current position:', this.playerGroup.position.x.toFixed(2), this.playerGroup.position.y.toFixed(2), this.playerGroup.position.z.toFixed(2));
		console.log('Is on building:', this.isOnBuilding, 'Building height:', this.currentBuildingHeight);
		
		// If climbing, force finish climbing
		if (this.isClimbingLadder && this.currentLadder) {
			console.log('Finishing climbing via emergency unstuck');
			this.emergencyUnstuck(this.currentLadder.position);
			return;
		}
		
		// Check if player is stuck at base of building (common issue after climbing)
		this.buildings.forEach(building => {
			if (building.climbable && building.ladder) {
				const buildingPos = building.mesh.position;
				const ladderPos = building.ladder.position;
				const distanceToBuilding = this.playerGroup.position.distanceTo(buildingPos);
				const distanceToLadder = this.playerGroup.position.distanceTo(ladderPos);
				
				// If player is near ladder but at ground level, they might be stuck
				if (distanceToLadder < 3 && this.playerGroup.position.y < 2) {
					console.log('Player appears stuck at base of building, moving to safe ground position');
					// Move player away from building to a safe ground position
					const awayDirection = this.playerGroup.position.clone().sub(buildingPos).normalize();
					this.playerGroup.position.copy(buildingPos.clone().add(awayDirection.multiplyScalar(5)));
					this.playerGroup.position.y = 1;
					this.playerOnGround = true;
					this.isOnBuilding = false;
					this.currentBuildingHeight = 0;
					this.playerVelocity.set(0, 0, 0);
					console.log('Moved player to safe ground position');
					return;
				}
			}
		});
		
		// If on a building but position doesn't match building height, fix it
		if (this.isOnBuilding) {
			const expectedHeight = this.currentBuildingHeight + 1.5; // Normal landing height on building
			const heightDifference = Math.abs(this.playerGroup.position.y - expectedHeight);
			
			if (heightDifference > 2) {
				console.log('Player on building but at wrong height, correcting...');
				this.playerGroup.position.y = expectedHeight;
				this.playerVelocity.set(0, 0, 0);
				console.log('Corrected building position to height:', expectedHeight);
				return;
			}
			
			// Special case: If player is on building but can't move, force enable movement
			if (this.playerVelocity.length() < 0.1 && this.playerOnGround) {
				console.log('Player on building but appears stuck - forcing movement enable');
				this.playerOnGround = true;
				this.playerVelocity.set(0, 0, 0);
				// Don't change position, just ensure movement is enabled
				return;
			}
			
			// Special case: If player is on building but too close to edge, move them to center
			const buildingRadius = 3; // Top width is 6, so radius is 3
			const distanceFromCenter = this.playerGroup.position.distanceTo(new THREE.Vector3(0, this.currentBuildingHeight, 0));
			
			if (distanceFromCenter > buildingRadius * 0.9) {
				console.log('Player too close to building edge - moving to safer position');
				// Find the building center and move player there
				const building = this.buildings.find(b => b.height === this.currentBuildingHeight);
				if (building) {
					const directionToCenter = building.mesh.position.clone().sub(this.playerGroup.position).normalize();
					const targetDistance = buildingRadius * 0.6; // 60% of radius - very safe distance
					this.playerGroup.position.copy(building.mesh.position.clone().add(directionToCenter.multiplyScalar(targetDistance)));
					this.playerGroup.position.y = this.currentBuildingHeight + 1.5;
					console.log('Moved player to safer rooftop position');
					return;
				}
			}
		}
		
		// If stuck in a building (high up but not on building), try to find the building
		if (this.playerGroup.position.y > 10 && !this.isOnBuilding) {
			console.log('Player high up but not on building - trying to find building...');
			
			// Find the closest building
			let closestBuilding: Building | null = null;
			let minDist = Infinity;
			for (const building of this.buildings) {
				const dist = this.playerGroup.position.distanceTo(building.mesh.position);
				if (dist < minDist) {
					minDist = dist;
					closestBuilding = building;
				}
			}
			
			if (closestBuilding && minDist < 10) {
				// Found a building - snap to it
				this.isOnBuilding = true;
				this.currentBuildingHeight = closestBuilding.height;
				this.playerGroup.position.y = closestBuilding.height + 1.5;
				this.playerVelocity.set(0, 0, 0);
				console.log('Found building and snapped to rooftop at height:', closestBuilding.height);
				return;
			} else {
				// No building found - move to ground
				this.playerGroup.position.y = 1;
				this.playerOnGround = true;
				this.isOnBuilding = false;
				this.currentBuildingHeight = 0;
				this.playerVelocity.set(0, 0, 0);
				console.log('No building found - moved player to ground level');
				return;
			}
		}
		
		// If stuck underground, move to ground
		if (this.playerGroup.position.y < 0) {
			this.playerGroup.position.y = 1;
			this.playerOnGround = true;
			this.playerVelocity.set(0, 0, 0);
			console.log('Moved player to ground level');
			return;
		}
		
		// If stuck in air, move to ground
		if (!this.playerOnGround && this.playerGroup.position.y > 5) {
			this.playerGroup.position.y = 1;
			this.playerOnGround = true;
			this.playerVelocity.set(0, 0, 0);
			console.log('Moved player to ground level');
			return;
		}
		
		// GENERAL UNSTUCK - If player is at ground level but still stuck, force move to safe position
		if (this.playerGroup.position.y <= 2 && this.playerOnGround) {
			console.log('Player at ground level but stuck - forcing move to safe position');
			
			// Try to find a safe position away from buildings
			let safePosition = new THREE.Vector3(0, 1, 0); // Default to center
			
			// Check if we're near any buildings and move away from them
			let totalDirection = new THREE.Vector3(0, 0, 0);
			let buildingCount = 0;
			
			for (const building of this.buildings) {
				const buildingPos = building.mesh.position;
				const distance = this.playerGroup.position.distanceTo(buildingPos);
				
				if (distance < 10) { // Within 10 units of a building
					const awayDirection = this.playerGroup.position.clone().sub(buildingPos).normalize();
					totalDirection.add(awayDirection);
					buildingCount++;
				}
			}
			
			if (buildingCount > 0) {
				// Move away from buildings
				totalDirection.divideScalar(buildingCount).normalize();
				safePosition = this.playerGroup.position.clone().add(totalDirection.multiplyScalar(8));
				safePosition.y = 1;
			} else {
				// No nearby buildings, move to a random safe position
				safePosition = new THREE.Vector3(
					(Math.random() - 0.5) * 20, // Random X within 20 units
					1, // Ground level
					(Math.random() - 0.5) * 20  // Random Z within 20 units
				);
			}
			
			// Ensure position is within map bounds
			safePosition.x = Math.max(-this.mapBounds, Math.min(this.mapBounds, safePosition.x));
			safePosition.z = Math.max(-this.mapBounds, Math.min(this.mapBounds, safePosition.z));
			
			// Move player to safe position
			this.playerGroup.position.copy(safePosition);
			this.playerOnGround = true;
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
			this.playerVelocity.set(0, 0, 0);
			
			console.log('Forced move to safe position:', safePosition.x.toFixed(2), safePosition.y.toFixed(2), safePosition.z.toFixed(2));
			return;
		}
		
		console.log('No unstuck action needed');
	}

	private addBuildingIndicator(): void {
		// Remove existing indicator
		if (this.buildingIndicator) {
			this.scene.remove(this.buildingIndicator);
		}
		
		// Create new indicator
		const indicatorGeometry = new THREE.RingGeometry(0.8, 1.2, 8);
		const indicatorMaterial = new THREE.MeshBasicMaterial({ 
			color: 0x00ff00,
			transparent: true,
			opacity: 0.7,
			side: THREE.DoubleSide
		});
		this.buildingIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
		this.buildingIndicator.position.copy(this.playerGroup.position);
		this.buildingIndicator.position.y += 0.1;
		this.buildingIndicator.rotation.x = -Math.PI / 2;
		this.scene.add(this.buildingIndicator);
		
		// Animate the indicator
		this.animateBuildingIndicator();
	}
	
	private animateBuildingIndicator(): void {
		if (!this.buildingIndicator) return;
		
		const time = this.clock.getElapsedTime();
		this.buildingIndicator.position.copy(this.playerGroup.position);
		this.buildingIndicator.position.y += 0.1;
		this.buildingIndicator.rotation.z = time * 2;
		
		requestAnimationFrame(() => this.animateBuildingIndicator());
	}
	
	private removeBuildingIndicator(): void {
		if (this.buildingIndicator) {
			this.scene.remove(this.buildingIndicator);
			this.buildingIndicator = null;
		}
	}
	
	private checkForStuckPlayer(delta: number): void {
		// Skip if player doesn't exist
		if (!this.playerGroup) return;
		
		// Skip stuck detection during climbing - climbing has its own stuck detection
		if (this.isClimbingLadder) {
			return;
		}
		
		// Skip stuck detection if player is actively moving (has input)
		const hasInput = this.keys.up || this.keys.down || this.keys.left || this.keys.right || this.keys.jump;
		if (hasInput) {
			this.stuckTimer = 0;
			this.lastPlayerPosition.copy(this.playerGroup.position.clone());
			return;
		}
		
		// Skip stuck detection if player is on a building and not moving (normal behavior)
		if (this.isOnBuilding && this.currentBuildingHeight > 0) {
			this.stuckTimer = 0;
			this.lastPlayerPosition.copy(this.playerGroup.position.clone());
			return;
		}
		
		// Skip stuck detection during post-climbing grace period
		if (this.postClimbingGracePeriod > 0) {
			this.stuckTimer = 0;
			this.lastPlayerPosition.copy(this.playerGroup.position.clone());
			return;
		}
		
		// Update grace period after climbing
		if (this.postClimbingGracePeriod > 0) {
			this.postClimbingGracePeriod -= delta;
		}
		
		// Calculate distance moved since last frame
		const currentPosition = this.playerGroup.position.clone();
		const distanceMoved = this.lastPlayerPosition.distanceTo(currentPosition);
		
		// IMPROVED stuck detection - only trigger if player is actually stuck in a problematic position
		if (distanceMoved < this.stuckThreshold) {
			this.stuckTimer += delta;
			
			// Log stuck detection
			if (this.stuckTimer > 0.5 && this.stuckTimer < 0.6) {
				console.warn(`Player appears to be stuck! Position: ${currentPosition.x.toFixed(2)}, ${currentPosition.y.toFixed(2)}, ${currentPosition.z.toFixed(2)}`);
			}
			
			// Auto-unstuck after max time, but only if player is in a problematic position
			if (this.stuckTimer > this.maxStuckTime) {
				// Check if player is actually in a problematic position before auto-unstucking
				const isProblematicPosition = this.isPlayerInProblematicPosition(currentPosition);
				
				if (isProblematicPosition) {
					console.warn('Auto-unstuck triggered! Moving player to safe position.');
					this.autoUnstuck();
					this.stuckTimer = 0;
				} else {
					// Player is stuck but in a safe position (like standing on a building), don't auto-unstuck
					console.log('Player stuck but in safe position - not auto-unstucking');
					this.stuckTimer = 0; // Reset timer to prevent spam
				}
			}
		} else {
			// Player is moving, reset stuck timer
			this.stuckTimer = 0;
		}
		
		// Update last position for next frame
		this.lastPlayerPosition.copy(currentPosition);
	}
	
	private isPlayerInProblematicPosition(position: THREE.Vector3): boolean {
		// Check if player is in a position that requires auto-unstucking
		
		// 1. Player is underground
		if (position.y < 0) {
			return true;
		}
		
		// 2. Player is stuck in air (high up but not on a building)
		if (position.y > 10 && !this.isOnBuilding) {
			return true;
		}
		
		// 3. Player is on a building but stuck in a wall or invalid position
		if (this.isOnBuilding && this.currentBuildingHeight > 0) {
			const expectedHeight = this.currentBuildingHeight + 1.5;
			const heightDifference = Math.abs(position.y - expectedHeight);
			
			// Only consider it problematic if player is significantly off the building surface
			if (heightDifference > 5) {
				return true;
			}
		}
		
		// 4. Player is at ground level but not near any building (might be stuck in geometry)
		if (position.y <= 2) {
			// Check if player is near any building
			let nearBuilding = false;
			for (const building of this.buildings) {
				const distance = position.distanceTo(building.mesh.position);
				if (distance < 20) { // Increased to 20 units - more generous
					nearBuilding = true;
					break;
				}
			}
			
			// If not near any building and at ground level, might be stuck
			// But only if they're not moving (velocity is very low)
			if (!nearBuilding && this.playerVelocity.length() < 0.1) {
				return true;
			}
		}
		
		// 5. Player is on a building but at wrong height (more than 5 units off - more lenient)
		if (this.isOnBuilding && this.currentBuildingHeight > 0) {
			const expectedHeight = this.currentBuildingHeight + 1.5;
			const heightDifference = Math.abs(position.y - expectedHeight);
			if (heightDifference > 5) { // Increased from 3 to 5 units
				return true;
			}
		}
		
		// 6. Player is outside map bounds
		if (Math.abs(position.x) > this.mapBounds || Math.abs(position.z) > this.mapBounds) {
			return true;
		}
		
		// Player is in a safe position
		return false;
	}
	
	private autoUnstuck(): void {
		if (!this.playerGroup) return;
		
		const currentPos = this.playerGroup.position.clone();
		console.log(`Auto-unstuck: Moving from ${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`);
		
		// Try to find a safe position
		let safePosition = null;
		
		// IMPROVED: Check if we're near a building and can land on it (more generous detection)
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = currentPos.distanceTo(buildingPos);
			const buildingTop = building.height;
			
			// More generous detection for landing on buildings
			if (distance < 10 && currentPos.y > buildingTop - 3 && currentPos.y < buildingTop + 5) {
				// Land on this building
				safePosition = new THREE.Vector3(
					buildingPos.x + (Math.random() - 0.5) * 3, // Slightly more random position on building
					buildingTop + 1.5,
					buildingPos.z + (Math.random() - 0.5) * 3
				);
			}
		});
		
		// If no building found, try to find a safe ground position away from buildings
		if (!safePosition) {
			// If player is at ground level, move away from nearby buildings
			if (currentPos.y <= 2) {
				let totalDirection = new THREE.Vector3(0, 0, 0);
				let buildingCount = 0;
				
				for (const building of this.buildings) {
					const buildingPos = building.mesh.position;
					const distance = currentPos.distanceTo(buildingPos);
					
					if (distance < 8) { // Within 8 units of a building
						const awayDirection = currentPos.clone().sub(buildingPos).normalize();
						totalDirection.add(awayDirection);
						buildingCount++;
					}
				}
				
				if (buildingCount > 0) {
					// Move away from buildings
					totalDirection.divideScalar(buildingCount).normalize();
					safePosition = currentPos.clone().add(totalDirection.multiplyScalar(6));
					safePosition.y = 1;
				} else {
					// No nearby buildings, move to a random safe position
					safePosition = new THREE.Vector3(
						(Math.random() - 0.5) * 20, // Random X within 20 units
						1, // Ground level
						(Math.random() - 0.5) * 20  // Random Z within 20 units
					);
				}
			} else {
				// Player is in air, move to ground level
				safePosition = new THREE.Vector3(
					currentPos.x + (Math.random() - 0.5) * 4, // Random position near current
					1, // Ground level
					currentPos.z + (Math.random() - 0.5) * 4
				);
			}
		}
		
		// Ensure position is within map bounds
		safePosition.x = Math.max(-this.mapBounds, Math.min(this.mapBounds, safePosition.x));
		safePosition.z = Math.max(-this.mapBounds, Math.min(this.mapBounds, safePosition.z));
		
		// Move player to safe position
		this.playerGroup.position.copy(safePosition);
		this.playerVelocity.set(0, 0, 0);
		this.playerOnGround = true;
		
		// IMPROVED: Update building state based on final position
		if (safePosition.y <= 2) {
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
			this.removeBuildingIndicator();
		} else {
			// Player is on a building, update building state
			this.isOnBuilding = true;
			// Find the building height for this position
			let closestBuilding: Building | null = null;
			let minDist = Infinity;
			for (const building of this.buildings) {
				const dist = safePosition.distanceTo(building.mesh.position);
				if (dist < minDist) {
					minDist = dist;
					closestBuilding = building;
				}
			}
			if (closestBuilding) {
				this.currentBuildingHeight = closestBuilding.height;
			}
		}
		
		// Set grace period after auto-unstuck to prevent immediate re-triggering
		this.postClimbingGracePeriod = 3.0; // Increased from 2.0 to 3.0 seconds
		
		console.log(`Auto-unstuck: Moved to ${safePosition.x.toFixed(2)}, ${safePosition.y.toFixed(2)}, ${safePosition.z.toFixed(2)}`);
	}

	private emergencyUnstuck(ladderPos: THREE.Vector3): void {
		// Move player away from ladder
		this.playerGroup.position.x = ladderPos.x + 2;
		this.playerGroup.position.z = ladderPos.z;

		// Find the closest building under the player with improved detection
		let closestBuilding: Building | null = null;
		let minDist = Infinity;
		for (const building of this.buildings) {
			const dist = this.playerGroup.position.distanceTo(building.mesh.position);
			if (dist < minDist) {
				minDist = dist;
				closestBuilding = building;
			}
		}
		
		// Improved building detection logic (same as finishClimbing)
		if (closestBuilding) {
			console.log('Emergency unstuck - closest building at distance:', minDist, 'height:', closestBuilding.height);
			
			// If player is high up (> 5 units), they're definitely on a building
			if (this.playerGroup.position.y > 5) {
				this.isOnBuilding = true;
				this.currentBuildingHeight = closestBuilding.height;
				this.playerGroup.position.y = closestBuilding.height + 1.5;
				this.playerVelocity.y = 0;
				console.log('Emergency unstuck - player high up, snapped to rooftop at height', closestBuilding.height);
			}
			// If player is close to building center (within 8 units), they're on the building
			else if (minDist < 8) {
				this.isOnBuilding = true;
				this.currentBuildingHeight = closestBuilding.height;
				this.playerGroup.position.y = closestBuilding.height + 1.5;
				this.playerVelocity.y = 0;
				console.log('Emergency unstuck - player close to building, snapped to rooftop at height', closestBuilding.height);
			}
			// If player is at ground level, they're on the ground
			else {
				this.isOnBuilding = false;
				this.currentBuildingHeight = 0;
				this.playerGroup.position.y = 1;
				console.log('Emergency unstuck - player at ground level, set to ground');
			}
		} else {
			// No building found - treat as ground
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
			this.playerGroup.position.y = 1;
			console.log('Emergency unstuck - no building found, set to ground');
		}
		
		this.isClimbingLadder = false;
		this.ladderClimbProgress = 0;
		this.nearLadder = false;
		this.currentLadder = null;
		this.playerOnGround = true;
		this.playerVelocity.set(0, 0, 0);

		// Hide ladder indicator
		this.hideLadderIndicator();

		console.log('Emergency unstuck completed - player moved to safe position at height:', this.playerGroup.position.y);
		console.log('Building height set to:', this.currentBuildingHeight);
	}

	// Add this method to the GameEngine class
	private createBench(x: number, z: number): void {
		// Bench seat
		const seatGeometry = new THREE.BoxGeometry(1.5, 0.2, 0.4);
		const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
		const seat = new THREE.Mesh(seatGeometry, seatMaterial);
		seat.position.set(x, 0.6, z);
		seat.castShadow = true;
		this.scene.add(seat);

		// Bench back
		const backGeometry = new THREE.BoxGeometry(1.5, 0.8, 0.1);
		const backMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
		const back = new THREE.Mesh(backGeometry, backMaterial);
		back.position.set(x, 1, z - 0.15);
		back.castShadow = true;
		this.scene.add(back);

		// Bench legs
		const legGeometry = new THREE.BoxGeometry(0.1, 0.6, 0.1);
		const legMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
		const leg1 = new THREE.Mesh(legGeometry, legMaterial);
		leg1.position.set(x - 0.6, 0.3, z);
		leg1.castShadow = true;
		this.scene.add(leg1);
		const leg2 = new THREE.Mesh(legGeometry, legMaterial);
		leg2.position.set(x + 0.6, 0.3, z);
		leg2.castShadow = true;
		this.scene.add(leg2);
	}

	// Add this method to the GameEngine class
	public getGameState(): GameState {
		return this.gameState;
	}

	// Add these missing methods to the GameEngine class
	public getPointerLockStatus(): boolean {
		return this.isPointerLocked;
	}

	private animate(): void {
		if (this.gameState.paused) {
			this.animationId = requestAnimationFrame(() => this.animate());
			return;
		}

		const delta = this.clock.getDelta();
		
		// Update attack cooldown
		if (this.attackCooldown > 0) {
			this.attackCooldown -= delta;
		}
		
		// Update damage animation
		if (this.isTakingDamage) {
			this.damageAnimationTimer -= delta;
			if (this.damageAnimationTimer <= 0) {
				this.isTakingDamage = false;
				// Reset player visual appearance
				this.resetPlayerVisualEffect();
			} else {
				// Visual feedback during damage animation
				this.updateDamageVisualEffect();
			}
		}

		// Update game time and difficulty
		this.gameTime += delta;
		this.gameState.survivalTime = Math.floor(this.gameTime);
		this.difficultyMultiplier = 1 + (this.gameTime / 60) * 0.5; // Increase difficulty over time

		// Handle input
		this.handleInput();

		// CLIMBING STATE - Completely isolated from other systems
		if (this.isClimbingLadder) {
			// Safety check - ensure climbing state is valid
			if (!this.currentLadder || this.ladderClimbTarget <= 0) {
				console.warn('Invalid climbing state detected in animation loop - forcing stop');
				this.stopClimbing();
				this.finishClimbing();
				return;
			}
			
			// Only update climbing logic and camera during climbing
			// Get the ladder position (should be at x + 3.5 from building)
			const ladderPos = this.currentLadder.position;
			
			// Continue climbing only if Space is held
			if (this.keys.jump) {
				this.continueClimbing(delta, ladderPos);
			} else {
				// Stop climbing if Space is released
				this.stopClimbing();
			}
			
			// Update camera during climbing
			this.updateCamera();
			
			// Update climbing animations only
			this.updatePlayerAnimation(delta);
			
			// Safety check for stuck climbing (but NOT general stuck detection during climbing)
			this.checkForStuckClimbing();
			
			// DO NOT run general stuck detection during climbing - it interferes with climbing completion
			
		} else {
			// NORMAL GAME STATE - All systems active
			// Update player physics and animation
			this.updatePlayerPhysics(delta);
			
			// Update player animations
			this.updatePlayerAnimation(delta);

			// Update character animations
			this.updateCharacterAnimations(delta);

			// Update zombies
			this.updateZombies(delta);

			// Update items
			this.updateItems(delta);
			
			// Anti-stuck monitoring
			this.checkForStuckPlayer(delta);
		}

		// Spawn new zombies (always active)
		this.zombieSpawnTimer += delta;
		if (this.zombieSpawnTimer >= this.zombieSpawnInterval / this.difficultyMultiplier) {
			this.spawnZombie();
			this.zombieSpawnTimer = 0;
		}

		// Spawn new items (always active)
		this.itemSpawnTimer += delta;
		if (this.itemSpawnTimer >= this.itemSpawnInterval) {
			this.spawnItem();
			this.itemSpawnTimer = 0;
		}

		// Check for game over
		if (this.playerHealth <= 0 && !this.gameState.gameOver) {
			this.gameState.gameOver = true;
		}

		// Render
		this.renderer.render(this.scene, this.camera);

		// Continue animation loop
		this.animationId = requestAnimationFrame(() => this.animate());
	}

	public togglePause(): void {
		this.gameState.paused = !this.gameState.paused;
		
		// Exit pointer lock when pausing
		if (this.gameState.paused && this.isPointerLocked) {
			document.exitPointerLock();
		}
	}

	public restart(): void {
		// Reset game state
		this.gameState = {
			survivalTime: 0,
			zombiesKilled: 0,
			gameOver: false,
			paused: false,
			itemsCollected: 0
		};

		// Reset player
		this.playerGroup.position.set(0, 1, 0);
		this.playerVelocity.set(0, 0, 0);
		this.playerOnGround = true;
		this.playerHealth = 100;
		this.isAttacking = false;
		this.attackCooldown = 0;

		// Clear zombies
		this.zombies.forEach(zombie => {
			this.scene.remove(zombie.mesh);
		});
		this.zombies = [];

		// Clear items
		this.items.forEach(item => {
			this.scene.remove(item.mesh);
		});
		this.items = [];

		// Reset timers
		this.zombieSpawnTimer = 0;
		this.itemSpawnTimer = 0;
		this.gameTime = 0;
		this.difficultyMultiplier = 1.0;

		// Reset camera
		this.cameraRotationX = 0;
		this.cameraRotationY = 0;

		// Reset animation state
		this.animationTime = 0;
		this.isMoving = false;

		// Reset ladder states
		this.nearLadder = false;
		this.currentLadder = null;
		this.isClimbingLadder = false;
		this.ladderClimbProgress = 0;
		this.ladderClimbTarget = 0;
		this.ladderStartHeight = 0;
		this.ladderClimbStartTime = 0;
		this.ladderClimbTimeout = 10;
		this.hideLadderIndicator();

		// Reset building states
		this.isOnBuilding = false;
		this.currentBuildingHeight = 0;
		this.buildingExitTimer = 0;
		this.removeBuildingIndicator();

		// Reset physics states
		this.coyoteTimeCounter = 0;
		this.jumpBufferCounter = 0;
		
		// Reset anti-stuck system
		this.stuckTimer = 0;
		this.postClimbingGracePeriod = 0;
		this.lastPlayerPosition.copy(this.playerGroup.position);

		// Start animation loop
		if (!this.animationId) {
			this.animate();
		}
	}

	public destroy(): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
		}
		
		// Clean up ladder indicators
		this.hideLadderIndicator();
		
		// Dispose renderer
		this.renderer.dispose();
	}

	private handleInput(): void {
		// Handle attack input with proper state management
		// Allow attack even when on buildings
		if (this.keys.attack && !this.isAttacking && this.attackCooldown <= 0) {
			console.log('Attack triggered - isOnBuilding:', this.isOnBuilding, 'currentBuildingHeight:', this.currentBuildingHeight);
			this.attack();
			// Reset attack key to prevent repeated triggering
			this.keys.attack = false;
		}
		
		// Emergency unstuck key (R key)
		if (this.keys.r) {
			this.manualUnstuck();
			// Reset R key to prevent repeated triggering
			this.keys.r = false;
		}
	}

	private checkZombieBuildingCollisions(zombie: Zombie): void {
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = zombie.mesh.position.distanceTo(buildingPos);
			
			// ALWAYS push zombie away from building if too close
			if (distance < 2.5) {
				const direction = zombie.mesh.position.clone().sub(buildingPos).normalize();
				zombie.mesh.position.copy(buildingPos.clone().add(direction.multiplyScalar(3)));
			}
		});
	}

	private spawnZombie(): void {
		// Spawn zombies at random positions around the map edges
		const spawnDistance = 45; // Spawn further out
		const angle = Math.random() * Math.PI * 2;
		const x = Math.cos(angle) * spawnDistance;
		const z = Math.sin(angle) * spawnDistance;
		
		// Create zombie group
		const zombieGroup = new THREE.Group();
		zombieGroup.position.set(x, 1, z);
		
		// Create zombie body
		const zombieGeometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
		const zombieMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x00ff00,
			emissive: 0x002200
		});
		const zombieMesh = new THREE.Mesh(zombieGeometry, zombieMaterial);
		zombieMesh.castShadow = true;
		zombieGroup.add(zombieMesh);

		// Add zombie details
		this.addZombieDetails(zombieGroup);
		
		this.scene.add(zombieGroup);

		// Create zombie object
		const zombie: Zombie = {
			mesh: zombieGroup,
			health: 3,
			speed: 2 + Math.random() * 2, // Random speed between 2-4
			target: this.playerGroup.position.clone()
		};

		this.zombies.push(zombie);
	}

	private addZombieDetails(zombieGroup: THREE.Group): void {
		// Zombie head
		const headGeometry = new THREE.SphereGeometry(0.25, 6, 6);
		const headMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x00cc00,
			emissive: 0x002200
		});
		const head = new THREE.Mesh(headGeometry, headMaterial);
		head.position.set(0, 0.8, 0);
		zombieGroup.add(head);
		
		// Zombie eyes (glowing red)
		const eyeGeometry = new THREE.SphereGeometry(0.03, 4, 4);
		const eyeMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xff0000,
			emissive: 0x660000
		});
		
		const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
		leftEye.position.set(-0.08, 0.85, 0.2);
		head.add(leftEye);
		
		const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
		rightEye.position.set(0.08, 0.85, 0.2);
		head.add(rightEye);
		
		// Zombie arms
		const armGeometry = new THREE.CapsuleGeometry(0.1, 0.6, 4, 6);
		const armMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x00cc00,
			emissive: 0x002200
		});
		
		const leftArm = new THREE.Mesh(armGeometry, armMaterial);
		leftArm.position.set(-0.4, 0.3, 0);
		leftArm.rotation.z = 0.5;
		zombieGroup.add(leftArm);
		
		const rightArm = new THREE.Mesh(armGeometry, armMaterial);
		rightArm.position.set(0.4, 0.3, 0);
		rightArm.rotation.z = -0.5;
		zombieGroup.add(rightArm);
	}

	private spawnItem(): void {
		const x = (Math.random() - 0.5) * this.mapSize;
		const z = (Math.random() - 0.5) * this.mapSize;
		
		// Don't spawn items on buildings
		let tooClose = false;
		this.buildings.forEach(building => {
			const itemPos = new THREE.Vector3(x, 0, z);
			if (building.mesh.position.distanceTo(itemPos) < 3) {
				tooClose = true;
			}
		});
		if (tooClose) return;

		const itemType = Math.random() < 0.7 ? 'weapon' : 'health';
		const itemGroup = new THREE.Group();
		itemGroup.position.set(x, 0.5, z);

		if (itemType === 'weapon') {
			// Weapon items with better visibility
			const weaponGeometry = new THREE.CylinderGeometry(0.05, 0.08, 1.0, 8);
			const weaponMaterial = new THREE.MeshLambertMaterial({ 
				color: 0x8B4513,
				emissive: 0x222222
			});
			const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
			weapon.castShadow = true;
			itemGroup.add(weapon);

			// Add glow effect
			const glowGeometry = new THREE.SphereGeometry(0.8, 8, 8);
			const glowMaterial = new THREE.MeshBasicMaterial({ 
				color: 0x8B4513,
				transparent: true,
				opacity: 0.3
			});
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			glow.position.set(0, 0, 0);
			itemGroup.add(glow);

			// Add floating animation
			itemGroup.userData = { type: 'weapon', animation: 0 };
		} else {
			// Health items with better visibility
			const healthGeometry = new THREE.SphereGeometry(0.3, 8, 8);
			const healthMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xff0000,
				emissive: 0x330000
			});
			const health = new THREE.Mesh(healthGeometry, healthMaterial);
			health.castShadow = true;
			itemGroup.add(health);

			// Add cross symbol
			const crossGeometry = new THREE.BoxGeometry(0.1, 0.4, 0.1);
			const crossMaterial = new THREE.MeshLambertMaterial({ 
				color: 0xffffff,
				emissive: 0x111111
			});
			const cross1 = new THREE.Mesh(crossGeometry, crossMaterial);
			cross1.position.set(0, 0, 0);
			itemGroup.add(cross1);
			
			const cross2 = new THREE.Mesh(crossGeometry, crossMaterial);
			cross2.position.set(0, 0, 0);
			cross2.rotation.z = Math.PI / 2;
			itemGroup.add(cross2);

			// Add glow effect
			const glowGeometry = new THREE.SphereGeometry(0.6, 8, 8);
			const glowMaterial = new THREE.MeshBasicMaterial({ 
				color: 0xff0000,
				transparent: true,
				opacity: 0.3
			});
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			glow.position.set(0, 0, 0);
			itemGroup.add(glow);

			itemGroup.userData = { type: 'health', animation: 0 };
		}

		this.scene.add(itemGroup);
		this.items.push({ mesh: itemGroup, type: itemType });
	}

	private updatePlayerAnimation(deltaTime: number): void {
		if (!this.playerParts || !this.playerGroup) return;
		
		// CLIMBING ANIMATION - Priority over all other animations
		if (this.isClimbingLadder) {
			const climbSpeed = 4; // Slower for more realistic climbing
			const climbAmplitude = 0.3;
			const time = this.clock.getElapsedTime();
			
			// Alternating arm movement for realistic climbing
			const leftArmPhase = Math.sin(time * climbSpeed);
			const rightArmPhase = Math.sin(time * climbSpeed + Math.PI); // Opposite phase
			
			// Animate arms for climbing with more realistic motion
			this.playerParts.leftArm.rotation.x = leftArmPhase * climbAmplitude;
			this.playerParts.rightArm.rotation.x = rightArmPhase * climbAmplitude;
			
			// Add slight arm movement in Z for more realistic climbing
			this.playerParts.leftArm.rotation.z = leftArmPhase * 0.15;
			this.playerParts.rightArm.rotation.z = rightArmPhase * 0.15;
			
			// Keep legs straight but add slight movement for balance
			this.playerParts.leftLeg.rotation.x = leftArmPhase * 0.1;
			this.playerParts.rightLeg.rotation.x = rightArmPhase * 0.1;
			this.playerParts.leftShoe.rotation.x = this.playerParts.leftLeg.rotation.x;
			this.playerParts.rightShoe.rotation.x = this.playerParts.rightLeg.rotation.x;
			
			// Add slight body movement during climbing
			this.playerParts.body.rotation.z = Math.sin(time * climbSpeed * 0.5) * 0.05;
			
			// Keep body at climbing height
			this.playerParts.body.position.y = 1.8;
			
			return; // Exit early - no other animations during climbing
		}
		
		// NORMAL ANIMATIONS - Only when not climbing
		// Only animate if player is moving
		const isMoving = this.keys.up || this.keys.down || this.keys.left || this.keys.right;
		
		if (isMoving) {
			// More natural walking animation with better timing
			const walkSpeed = 6; // Slower for more natural movement
			const walkAmplitude = 0.25; // Reduced amplitude for subtlety
			const time = this.clock.getElapsedTime();
			
			// Use different frequencies for arms and legs to create more natural movement
			const armFrequency = walkSpeed * 0.8; // Arms move slightly slower
			const legFrequency = walkSpeed * 1.2; // Legs move slightly faster
			
			// Add phase offset for more realistic movement
			const armPhase = Math.sin(time * armFrequency);
			const legPhase = Math.sin(time * legFrequency + Math.PI * 0.1); // Slight offset
			
			// Animate arms with more natural movement
			this.playerParts.leftArm.rotation.x = armPhase * walkAmplitude;
			this.playerParts.rightArm.rotation.x = -armPhase * walkAmplitude;
			
			// Add slight arm swing in Z direction for more realism
			this.playerParts.leftArm.rotation.z = armPhase * 0.1;
			this.playerParts.rightArm.rotation.z = -armPhase * 0.1;
			
			// Animate legs with more natural movement
			this.playerParts.leftLeg.rotation.x = -legPhase * walkAmplitude;
			this.playerParts.rightLeg.rotation.x = legPhase * walkAmplitude;
			
			// Animate shoes with legs
			this.playerParts.leftShoe.rotation.x = this.playerParts.leftLeg.rotation.x;
			this.playerParts.rightShoe.rotation.x = this.playerParts.rightLeg.rotation.x;
			
			// More subtle body bob with different frequency
			const bodyBobFrequency = walkSpeed * 1.5;
			const bodyBobAmplitude = 0.03; // Much more subtle
			this.playerParts.body.position.y = 1.8 + Math.sin(time * bodyBobFrequency) * bodyBobAmplitude;
			
			// Add slight body rotation for more natural movement
			this.playerParts.body.rotation.z = Math.sin(time * walkSpeed * 0.5) * 0.02;
			
		} else {
			// Smooth transition back to idle position
			const idleSpeed = 0.1; // Slower transition for smoother movement
			
			// Gradually return arms to idle
			this.playerParts.leftArm.rotation.x *= (1 - idleSpeed);
			this.playerParts.rightArm.rotation.x *= (1 - idleSpeed);
			this.playerParts.leftArm.rotation.z *= (1 - idleSpeed);
			this.playerParts.rightArm.rotation.z *= (1 - idleSpeed);
			
			// Gradually return legs to idle
			this.playerParts.leftLeg.rotation.x *= (1 - idleSpeed);
			this.playerParts.rightLeg.rotation.x *= (1 - idleSpeed);
			this.playerParts.leftShoe.rotation.x *= (1 - idleSpeed);
			this.playerParts.rightShoe.rotation.x *= (1 - idleSpeed);
			
			// Return body to idle position
			this.playerParts.body.position.y = 1.8;
			this.playerParts.body.rotation.z *= (1 - idleSpeed);
		}
	}

} 