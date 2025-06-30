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
	private mapSize = 120; // Increased from 80 for massive city
	private mapBounds = 58; // Half of mapSize - 2 for safety
	
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
	private cameraDistance = 12;
	private cameraHeight = 8;
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
	private stuckThreshold = 0.1; // Distance threshold for stuck detection
	private maxStuckTime = 2.0; // Maximum time before auto-unstuck

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

		// Renderer setup - enhanced quality while keeping low-fidelity aesthetic
		this.renderer = new THREE.WebGLRenderer({ 
			antialias: true, // Better quality
			powerPreference: "default"
		});
		this.renderer.setSize(container.clientWidth, container.clientHeight);
		this.renderer.setPixelRatio(1.0); // Better resolution
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Better shadows
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // Better color grading
		this.renderer.toneMappingExposure = 1.2;
		container.appendChild(this.renderer.domElement);

		// Ground - much larger street
		const groundGeometry = new THREE.PlaneGeometry(this.mapSize, this.mapSize);
		const groundMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x222222
		});
		const ground = new THREE.Mesh(groundGeometry, groundMaterial);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.5;
		ground.receiveShadow = true;
		this.scene.add(ground);

		// Add street markings for larger map
		this.addStreetMarkings();

		// Handle window resize
		window.addEventListener('resize', () => {
			this.camera.aspect = container.clientWidth / container.clientHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(container.clientWidth, container.clientHeight);
		});
	}

	private addStreetMarkings(): void {
		// Center line - longer for larger map
		const lineGeometry = new THREE.PlaneGeometry(0.4, this.mapSize);
		const lineMaterial = new THREE.MeshLambertMaterial({ color: 0xffff00 });
		const centerLine = new THREE.Mesh(lineGeometry, lineMaterial);
		centerLine.rotation.x = -Math.PI / 2;
		centerLine.position.y = -0.4;
		this.scene.add(centerLine);

		// Side lines - multiple lanes
		const sideLineGeometry = new THREE.PlaneGeometry(0.2, this.mapSize);
		const sideLineMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
		
		// Multiple lanes
		const lanePositions = [-12, -6, 6, 12];
		lanePositions.forEach(x => {
			const leftLine = new THREE.Mesh(sideLineGeometry, sideLineMaterial);
			leftLine.rotation.x = -Math.PI / 2;
			leftLine.position.set(x, -0.4, 0);
			this.scene.add(leftLine);
		});

		// Crosswalks
		for (let i = -30; i <= 30; i += 15) {
			const crosswalkGeometry = new THREE.PlaneGeometry(8, 0.3);
			const crosswalkMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
			const crosswalk = new THREE.Mesh(crosswalkGeometry, crosswalkMaterial);
			crosswalk.rotation.x = -Math.PI / 2;
			crosswalk.position.set(0, -0.4, i);
			this.scene.add(crosswalk);
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
		// Create massive city with huge buildings - impressive scale
		const buildingPositions = [
			// Downtown area - massive skyscrapers with strategic spacing
			{ x: -30, z: -30, height: 35, climbable: true, type: 'skyscraper' },
			{ x: 30, z: -30, height: 42, climbable: true, type: 'skyscraper' },
			{ x: -30, z: 30, height: 28, climbable: true, type: 'skyscraper' },
			{ x: 30, z: 30, height: 45, climbable: true, type: 'skyscraper' },
			{ x: 0, z: -40, height: 38, climbable: true, type: 'skyscraper' },
			{ x: -40, z: 0, height: 32, climbable: true, type: 'skyscraper' },
			{ x: 40, z: 0, height: 25, climbable: true, type: 'skyscraper' },
			
			// Mid-rise buildings - well-spaced for parkour opportunities
			{ x: -18, z: -18, height: 20, climbable: true, type: 'office' },
			{ x: 18, z: -18, height: 24, climbable: true, type: 'apartment' },
			{ x: -18, z: 18, height: 16, climbable: false, type: 'shop' },
			{ x: 18, z: 18, height: 22, climbable: true, type: 'office' },
			{ x: -12, z: -28, height: 18, climbable: true, type: 'apartment' },
			{ x: 12, z: -28, height: 26, climbable: true, type: 'office' },
			{ x: -28, z: -12, height: 21, climbable: true, type: 'apartment' },
			{ x: 28, z: -12, height: 15, climbable: false, type: 'shop' },
			{ x: -28, z: 12, height: 23, climbable: true, type: 'office' },
			{ x: 28, z: 12, height: 19, climbable: true, type: 'apartment' },
			
			// Residential area - medium buildings with good spacing
			{ x: -50, z: -50, height: 12, climbable: true, type: 'house' },
			{ x: 50, z: -50, height: 10, climbable: true, type: 'house' },
			{ x: -50, z: 50, height: 11, climbable: true, type: 'house' },
			{ x: 50, z: 50, height: 9, climbable: true, type: 'house' },
			{ x: -55, z: 0, height: 13, climbable: true, type: 'house' },
			{ x: 55, z: 0, height: 8, climbable: true, type: 'house' },
			{ x: 0, z: -55, height: 14, climbable: true, type: 'house' },
			{ x: 0, z: 55, height: 7, climbable: true, type: 'house' },
			
			// Additional mid-rise buildings for more exploration - strategic positioning
			{ x: -9, z: 24, height: 19, climbable: true, type: 'apartment' },
			{ x: 9, z: 24, height: 13, climbable: false, type: 'shop' },
			{ x: -24, z: -9, height: 20, climbable: true, type: 'office' },
			{ x: 24, z: -9, height: 17, climbable: true, type: 'apartment' },
			{ x: -24, z: 9, height: 14, climbable: false, type: 'shop' },
			{ x: 24, z: 9, height: 25, climbable: true, type: 'office' },
			
			// Strategic corner buildings for parkour routes
			{ x: -21, z: -21, height: 27, climbable: true, type: 'office' },
			{ x: 21, z: -21, height: 18, climbable: true, type: 'apartment' },
			{ x: -21, z: 21, height: 16, climbable: false, type: 'shop' },
			{ x: 21, z: 21, height: 29, climbable: true, type: 'office' }
		];

		buildingPositions.forEach(pos => {
			this.createBuilding(pos);
		});

		// Add street lights throughout the larger map
		this.addStreetLights();

		// Add more decorative elements
		this.addDecorations();
		
		// Add rooftop structures for more exploration
		this.addRooftopStructures();
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
		
		// Main building structure - much larger for impressive scale
		const buildingGeometry = new THREE.BoxGeometry(4, height, 4); // Increased from 2x2 to 4x4
		const buildingMaterial = new THREE.MeshLambertMaterial({ 
			color: this.getBuildingColor(type)
		});
		const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
		building.position.set(x, height / 2, z);
		building.castShadow = true;
		building.receiveShadow = true;
		this.scene.add(building);

		// Add building details
		this.addBuildingDetails(building, type, height);

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

	private createLadder(x: number, z: number, buildingHeight: number): THREE.Mesh {
		// Create ladder geometry - much larger for 4x4 buildings
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
		
		// Position ladder properly outside the 4x4 building - much further out
		ladderGroup.position.set(x + 3.5, 0, z); // Much further from building to avoid collision
		ladderGroup.rotation.y = Math.PI / 2; // Rotate 90 degrees to face outward from building
		ladderGroup.castShadow = true;
		this.scene.add(ladderGroup);
		
		// Return the ladder group as a single mesh for collision detection
		return ladderGroup as any;
	}

	private getBuildingColor(type: string): number {
		switch (type) {
			case 'office': return 0x666666;
			case 'apartment': return 0x888888;
			case 'shop': return 0xaa6666;
			case 'skyscraper': return 0x444444;
			case 'house': return 0x886666;
			default: return 0x666666;
		}
	}

	private addBuildingDetails(building: THREE.Mesh, type: string, height: number): void {
		// Add windows - scaled for larger buildings
		const windowGeometry = new THREE.PlaneGeometry(0.6, 0.8); // Larger windows for bigger buildings
		const windowMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x87ceeb,
			emissive: 0x111111
		});

		// Add windows on each side - multiple windows per side for larger buildings
		for (let y = 0.5; y < height - 0.5; y += 0.8) {
			// Front windows - multiple windows per side
			for (let x = -1.5; x <= 1.5; x += 1.5) {
				const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				frontWindow.position.set(x, y, 2.01);
				building.add(frontWindow);

				// Back windows
				const backWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				backWindow.position.set(x, y, -2.01);
				backWindow.rotation.y = Math.PI;
				building.add(backWindow);
			}

			// Side windows - multiple windows per side
			for (let z = -1.5; z <= 1.5; z += 1.5) {
				const leftWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				leftWindow.position.set(-2.01, y, z);
				leftWindow.rotation.y = Math.PI / 2;
				building.add(leftWindow);

				const rightWindow = new THREE.Mesh(windowGeometry, windowMaterial);
				rightWindow.position.set(2.01, y, z);
				rightWindow.rotation.y = -Math.PI / 2;
				building.add(rightWindow);
			}
		}

		// Add roof details for taller buildings
		if (height > 3) {
			const roofGeometry = new THREE.BoxGeometry(4.2, 0.2, 4.2); // Larger roof for bigger buildings
			const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
			const roof = new THREE.Mesh(roofGeometry, roofMaterial);
			roof.position.y = height / 2 + 0.1;
			building.add(roof);
		}
	}

	private addStreetLights(): void {
		// Add street lights throughout the massive map - updated for new building layout
		const lightPositions = [
			// Main intersections - updated for new building positions
			{ x: -18, z: -18 }, { x: 18, z: -18 }, { x: -18, z: 18 }, { x: 18, z: 18 },
			{ x: -30, z: -30 }, { x: 30, z: -30 }, { x: -30, z: 30 }, { x: 30, z: 30 },
			{ x: 0, z: -40 }, { x: 0, z: 40 }, { x: -40, z: 0 }, { x: 40, z: 0 },
			
			// Additional lights for better coverage - updated positions
			{ x: -12, z: -28 }, { x: 12, z: -28 }, { x: -28, z: -12 }, { x: 28, z: -12 },
			{ x: -28, z: 12 }, { x: 28, z: 12 }, { x: -12, z: 28 }, { x: 12, z: 28 },
			{ x: -50, z: -50 }, { x: 50, z: -50 }, { x: -50, z: 50 }, { x: 50, z: 50 },
			{ x: -55, z: 0 }, { x: 55, z: 0 }, { x: 0, z: -55 }, { x: 0, z: 55 },
			
			// Strategic lighting for parkour routes
			{ x: -21, z: -21 }, { x: 21, z: -21 }, { x: -21, z: 21 }, { x: 21, z: 21 },
			{ x: -9, z: 24 }, { x: 9, z: 24 }, { x: -24, z: -9 }, { x: 24, z: -9 },
			{ x: -24, z: 9 }, { x: 24, z: 9 }
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
		for (let i = 0; i < 12; i++) {
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
		for (let i = 0; i < 8; i++) {
			this.createBench(
				Math.random() * this.mapSize - this.mapSize/2,
				Math.random() * this.mapSize - this.mapSize/2
			);
		}

		// Add some newspaper stands
		for (let i = 0; i < 6; i++) {
			this.createNewspaperStand(
				Math.random() * this.mapSize - this.mapSize/2,
				Math.random() * this.mapSize - this.mapSize/2
			);
		}

		// Add some fire hydrants
		for (let i = 0; i < 10; i++) {
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
		// Dark ambient lighting for spooky atmosphere
		const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
		this.scene.add(ambientLight);

		// Main directional light (moonlight)
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
		directionalLight.position.set(10, 10, 5);
		directionalLight.castShadow = true;
		directionalLight.shadow.mapSize.width = 512; // Low quality
		directionalLight.shadow.mapSize.height = 512;
		this.scene.add(directionalLight);

		// Add some spooky colored lights
		const redLight = new THREE.PointLight(0xff0000, 0.3, 10);
		redLight.position.set(-5, 2, -5);
		this.scene.add(redLight);

		const blueLight = new THREE.PointLight(0x0000ff, 0.3, 10);
		blueLight.position.set(5, 2, 5);
		this.scene.add(blueLight);
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
		
		// Store previous position for interpolation
		this.lastPosition.copy(this.playerGroup.position);
		this.lastVelocity.copy(this.playerVelocity);

		// Handle input-based movement
		const moveX = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
		const moveZ = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0);
		
		// Normalize diagonal movement
		const moveMagnitude = Math.sqrt(moveX * moveX + moveZ * moveZ);
		const normalizedMoveX = moveMagnitude > 0 ? moveX / moveMagnitude : 0;
		const normalizedMoveZ = moveMagnitude > 0 ? moveZ / moveMagnitude : 0;

		// Get camera direction for movement relative to camera
		const cameraDirection = new THREE.Vector3(0, 0, -1);
		cameraDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);
		
		const cameraRight = new THREE.Vector3(1, 0, 0);
		cameraRight.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);

		// Calculate movement speed
		const baseSpeed = this.playerOnGround ? 8 : 4; // Reduced air control
		const currentSpeed = baseSpeed * (this.isMoving ? 1.5 : 1); // Running speed

		// Calculate target velocity in camera-relative space
		const targetVelocityX = (cameraRight.x * normalizedMoveX + cameraDirection.x * normalizedMoveZ) * currentSpeed;
		const targetVelocityZ = (cameraRight.z * normalizedMoveX + cameraDirection.z * normalizedMoveZ) * currentSpeed;

		// Apply movement forces
		if (this.playerOnGround) {
			// Ground movement with friction
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

		// Handle jumping with improved physics
		if (this.keys.jump) {
			this.jumpBufferCounter = this.jumpBufferTime;
		}

		// Apply jump if conditions are met
		if (this.jumpBufferCounter > 0 && (this.playerOnGround || this.coyoteTimeCounter > 0)) {
			this.playerVelocity.y = 12; // Increased jump force
			this.playerOnGround = false;
			this.jumpBufferCounter = 0;
			this.coyoteTimeCounter = 0;
			
			// If jumping from a building, clear building state to prevent collision loops
			if (this.isOnBuilding) {
				this.isOnBuilding = false;
				this.currentBuildingHeight = 0;
			}
		}

		// Apply gravity with terminal velocity
		const gravity = 25; // Increased gravity
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

		// Apply velocity to position
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
			
			// IMPROVED BUILDING DETECTION - More generous and reliable
			const buildingRadius = 4.0; // Increased from 3.0 for better detection
			const landingHeight = buildingTop + 1.5; // Higher landing point for stability
			const isNearBuilding = distance < buildingRadius;
			const isAboveBuilding = playerHeight > buildingTop - 1 && playerHeight < buildingTop + 5;
			const isOnBuilding = isNearBuilding && isAboveBuilding && this.playerVelocity.y <= 0;
			
			// CASE 1: Player is already on this building - maintain position
			if (this.isOnBuilding && this.currentBuildingHeight === buildingTop && distance < buildingRadius + 1) {
				// Keep player on building unless they're actively jumping off
				if (this.playerVelocity.y <= 0) {
					this.playerGroup.position.y = landingHeight;
					this.playerVelocity.y = 0;
					this.playerOnGround = true;
					landedOnBuilding = true;
					
					// Show building indicator
					if (!this.buildingIndicator) {
						this.addBuildingIndicator();
					}
					
					// Debug logging
					if (Math.random() < 0.01) { // Log occasionally
						console.log(`Maintaining position on building at height ${buildingTop}, player height: ${playerHeight.toFixed(2)}`);
					}
				} else {
					// Player is jumping off - allow them to leave
					this.isOnBuilding = false;
					this.currentBuildingHeight = 0;
					this.buildingExitTimer = 0.5;
					this.removeBuildingIndicator();
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
				
				console.log(`Landed on building at height ${buildingTop}! Player height: ${playerHeight.toFixed(2)}, Distance: ${distance.toFixed(2)}`);
			}
			
			// CASE 3: Player is colliding with building side - push away gently
			else if (isNearBuilding && !isOnBuilding && distance < 2.0) { // Reduced from 2.5
				const direction = this.playerGroup.position.clone().sub(buildingPos).normalize();
				// Gentler push - only move player slightly away
				const pushDistance = 2.5; // Reduced from 3.0
				this.playerGroup.position.copy(buildingPos.clone().add(direction.multiplyScalar(pushDistance)));
				
				// Gentler velocity adjustment
				const velocity2D = new THREE.Vector3(this.playerVelocity.x, 0, this.playerVelocity.z);
				const velocityDot = velocity2D.dot(direction);
				if (velocityDot < 0) {
					// Only reduce velocity, don't completely stop it
					this.playerVelocity.x -= direction.x * velocityDot * 0.5;
					this.playerVelocity.z -= direction.z * velocityDot * 0.5;
				}
			}
			
			// CASE 4: Check for climbing only if not on any building
			if (!landedOnBuilding && !this.isOnBuilding && !this.isClimbingLadder) {
				this.checkClimbing(building, buildingPos, buildingTop, delta);
			}
		});

		// Check for building-to-building jumping only if not on a building
		if (!landedOnBuilding && !this.isOnBuilding) {
			this.checkBuildingToBuildingJumping();
		}
		
		// Reset building state if player falls below ground level
		if (!landedOnBuilding && this.playerGroup.position.y < 0.5) {
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
		const ladderDetectionRange = 8.0; // Increased range for better accessibility
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
		// Only check when player is in air and moving
		if (this.playerOnGround || (this.playerVelocity.x === 0 && this.playerVelocity.z === 0)) return;
		
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = this.playerGroup.position.distanceTo(buildingPos);
			const playerHeight = this.playerGroup.position.y;
			const buildingTop = building.height;
			
			// IMPROVED BUILDING-TO-BUILDING JUMPING - More generous detection
			const jumpDetectionRange = 8.0; // Increased from 6.0
			const heightRange = 3.0; // Increased from 2.0
			
			// Check if player is jumping toward a building
			if (distance < jumpDetectionRange && 
				playerHeight > buildingTop - heightRange && 
				playerHeight < buildingTop + heightRange + 2) {
				
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
		const cameraOffset = new THREE.Vector3(
			Math.sin(this.cameraRotationY) * this.cameraDistance,
			this.cameraHeight,
			Math.cos(this.cameraRotationY) * this.cameraDistance
		);
		
		this.camera.position.copy(this.playerGroup.position).add(cameraOffset);
		this.camera.lookAt(this.playerGroup.position);
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
				this.playerHealth -= 10 * delta;
				if (this.playerHealth <= 0) {
					this.gameState.gameOver = true;
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

	private attack(): void {
		if (this.isAttacking || this.attackCooldown > 0) return;
		
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
		this.ladderClimbTarget = buildingTop + 2; // Climb higher above the roof
		this.ladderClimbStartTime = this.clock.getElapsedTime(); // Track start time
		
		// IMMEDIATELY disable all physics and collision systems
		this.playerOnGround = false;
		this.playerVelocity.set(0, 0, 0); // Stop all movement
		this.isOnBuilding = false; // Clear building state
		this.currentBuildingHeight = 0;
		
		// IMMEDIATELY position player at the ladder (outside the building)
		this.playerGroup.position.x = ladderPos.x;
		this.playerGroup.position.z = ladderPos.z;
		// Don't change Y position yet - let continueClimbing handle that
		
		// Add climbing start effect
		this.addClimbingEffect(this.playerGroup.position.clone());
		
		console.log('Player position after setup:', this.playerGroup.position);
		console.log('Climbing target height:', this.ladderClimbTarget);
		console.log('=== CLIMB STARTED ===');
	}

	private continueClimbing(delta: number, ladderPos: THREE.Vector3): void {
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
		
		this.isClimbingLadder = false;
		this.ladderClimbProgress = 0;
		
		// Ensure player is at the target height (above the roof)
		this.playerGroup.position.y = this.ladderClimbTarget;
		
		// Move player slightly away from ladder to avoid getting stuck
		// Since ladder is at x + 3.5, move player further away from building
		const ladderDirection = new THREE.Vector3(1, 0, 0); // Away from building
		this.playerGroup.position.add(ladderDirection.multiplyScalar(2.0)); // Move further away
		
		// Re-enable physics
		this.playerOnGround = true;
		this.playerVelocity.set(0, 0, 0);
		this.isOnBuilding = true;
		this.currentBuildingHeight = this.ladderClimbTarget - 2; // Set building height
		
		// Add climbing completion effect
		this.addClimbingEffect(this.playerGroup.position.clone());
		
		// Hide ladder indicator after climbing
		this.hideLadderIndicator();
		this.nearLadder = false;
		this.currentLadder = null;
		
		console.log('Player position after finish:', this.playerGroup.position);
		console.log('=== CLIMB FINISHED ===');
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

		// Update game time and difficulty
		this.gameTime += delta;
		this.gameState.survivalTime = Math.floor(this.gameTime);
		this.difficultyMultiplier = 1 + (this.gameTime / 60) * 0.5; // Increase difficulty over time

		// Handle input
		this.handleInput();

		// CLIMBING STATE - Completely isolated from other systems
		if (this.isClimbingLadder) {
			// Only update climbing logic and camera during climbing
			if (this.currentLadder) {
				// Get the ladder position (should be at x + 3.5 from building)
				const ladderPos = this.currentLadder.position;
				
				// Continue climbing only if Space is held
				if (this.keys.jump) {
					this.continueClimbing(delta, ladderPos);
				} else {
					// Stop climbing if Space is released
					this.stopClimbing();
				}
			}
			
			// Update camera during climbing
			this.updateCamera();
			
			// Update climbing animations only
			this.updatePlayerAnimation(delta);
			
			// Safety check for stuck climbing
			this.checkForStuckClimbing();
			
			// Anti-stuck monitoring
			this.checkForStuckPlayer(delta);
			
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
		this.lastPlayerPosition.copy(this.playerGroup.position);

		// Start animation loop
		if (!this.animationId) {
			this.animate();
		}
	}

	public getGameState(): GameState {
		return this.gameState;
	}

	public getPointerLockStatus(): boolean {
		return this.isPointerLocked;
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
		// Handle attack input
		if (this.keys.attack) {
			this.attack();
		}
		
		// Emergency unstuck key (R key)
		if (this.keys.r) {
			this.manualUnstuck();
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

	private emergencyUnstuck(ladderPos: THREE.Vector3): void {
		// Force finish climbing by setting player to target height
		this.playerGroup.position.y = this.ladderClimbTarget;
		this.playerGroup.position.x = ladderPos.x + 2; // Move away from ladder
		this.playerGroup.position.z = ladderPos.z;
		
		// Reset all climbing state
		this.isClimbingLadder = false;
		this.ladderClimbProgress = 0;
		this.nearLadder = false;
		this.currentLadder = null;
		
		// Re-enable physics
		this.playerOnGround = true;
		this.playerVelocity.set(0, 0, 0);
		this.isOnBuilding = true;
		this.currentBuildingHeight = this.ladderClimbTarget - 2;
		
		// Hide ladder indicator
		this.hideLadderIndicator();
		
		console.log('Emergency unstuck completed - player moved to safe position');
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
		
		// If climbing, force finish climbing
		if (this.isClimbingLadder && this.currentLadder) {
			this.emergencyUnstuck(this.currentLadder.position);
			return;
		}
		
		// If stuck in a building, move to ground
		if (this.isOnBuilding && this.playerGroup.position.y > 10) {
			this.playerGroup.position.y = 1;
			this.playerOnGround = true;
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
			this.playerVelocity.set(0, 0, 0);
			console.log('Moved player to ground level');
			return;
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
		
		// Calculate distance moved since last frame
		const currentPosition = this.playerGroup.position.clone();
		const distanceMoved = this.lastPlayerPosition.distanceTo(currentPosition);
		
		// Check if player is stuck (not moving enough)
		if (distanceMoved < this.stuckThreshold) {
			this.stuckTimer += delta;
			
			// Log stuck detection
			if (this.stuckTimer > 0.5 && this.stuckTimer < 0.6) {
				console.warn(`Player appears to be stuck! Position: ${currentPosition.x.toFixed(2)}, ${currentPosition.y.toFixed(2)}, ${currentPosition.z.toFixed(2)}`);
			}
			
			// Auto-unstuck after max time
			if (this.stuckTimer > this.maxStuckTime) {
				console.warn('Auto-unstuck triggered! Moving player to safe position.');
				this.autoUnstuck();
				this.stuckTimer = 0;
			}
		} else {
			// Player is moving, reset stuck timer
			this.stuckTimer = 0;
		}
		
		// Update last position for next frame
		this.lastPlayerPosition.copy(currentPosition);
	}
	
	private autoUnstuck(): void {
		if (!this.playerGroup) return;
		
		const currentPos = this.playerGroup.position.clone();
		console.log(`Auto-unstuck: Moving from ${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)}, ${currentPos.z.toFixed(2)}`);
		
		// Try to find a safe position
		let safePosition = null;
		
		// Check if we're near a building and can land on it
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = currentPos.distanceTo(buildingPos);
			const buildingTop = building.height;
			
			if (distance < 6 && currentPos.y > buildingTop - 2 && currentPos.y < buildingTop + 3) {
				// Land on this building
				safePosition = new THREE.Vector3(
					buildingPos.x + (Math.random() - 0.5) * 2, // Random position on building
					buildingTop + 1.5,
					buildingPos.z + (Math.random() - 0.5) * 2
				);
			}
		});
		
		// If no building found, move to ground level
		if (!safePosition) {
			safePosition = new THREE.Vector3(
				currentPos.x + (Math.random() - 0.5) * 4, // Random position near current
				1, // Ground level
				currentPos.z + (Math.random() - 0.5) * 4
			);
		}
		
		// Move player to safe position
		this.playerGroup.position.copy(safePosition);
		this.playerVelocity.set(0, 0, 0);
		this.playerOnGround = true;
		
		// Reset building state if we moved to ground
		if (safePosition.y <= 2) {
			this.isOnBuilding = false;
			this.currentBuildingHeight = 0;
			this.removeBuildingIndicator();
		}
		
		console.log(`Auto-unstuck: Moved to ${safePosition.x.toFixed(2)}, ${safePosition.y.toFixed(2)}, ${safePosition.z.toFixed(2)}`);
	}
} 