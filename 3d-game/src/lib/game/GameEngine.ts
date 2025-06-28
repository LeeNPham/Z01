import * as THREE from 'three';

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
	private currentWeapon = 'bat'; // Start with baseball bat
	private weaponMesh: THREE.Group | null = null;
	private isAttacking = false;
	private attackCooldown = 0;
	
	// Game mechanics - improved balance
	private zombieSpawnTimer = 0;
	private zombieSpawnInterval = 180; // Slower initial spawn rate
	private itemSpawnTimer = 0;
	private itemSpawnInterval = 120; // More frequent item spawning
	private gameTime = 0;
	private difficultyMultiplier = 1.0;
	
	// Map size - much larger
	private mapSize = 80; // Increased from 40
	private mapBounds = 38; // Half of mapSize - 2 for safety
	
	// Controls
	private keys = {
		left: false,
		right: false,
		up: false,
		down: false,
		jump: false,
		attack: false
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
	private leftArmGroup!: THREE.Group;
	private rightArmGroup!: THREE.Group;
	private leftLegGroup!: THREE.Group;
	private rightLegGroup!: THREE.Group;
	private playerHead!: THREE.Mesh;
	private playerNeck!: THREE.Mesh;
	private leftUpperArm!: THREE.Mesh;
	private rightUpperArm!: THREE.Mesh;
	private leftLowerArm!: THREE.Mesh;
	private rightLowerArm!: THREE.Mesh;
	private leftHand!: THREE.Mesh;
	private rightHand!: THREE.Mesh;
	private leftUpperLeg!: THREE.Mesh;
	private rightUpperLeg!: THREE.Mesh;
	private leftLowerLeg!: THREE.Mesh;
	private rightLowerLeg!: THREE.Mesh;
	private leftFoot!: THREE.Mesh;
	private rightFoot!: THREE.Mesh;
	private originalPositions!: {
		leftUpperArm: THREE.Vector3;
		rightUpperArm: THREE.Vector3;
		leftLowerArm: THREE.Vector3;
		rightLowerArm: THREE.Vector3;
		leftHand: THREE.Vector3;
		rightHand: THREE.Vector3;
		leftUpperLeg: THREE.Vector3;
		rightUpperLeg: THREE.Vector3;
		leftLowerLeg: THREE.Vector3;
		rightLowerLeg: THREE.Vector3;
		leftFoot: THREE.Vector3;
		rightFoot: THREE.Vector3;
	};
	private animationTime = 0;
	private isMoving = false;

	// Audio context
	private audioContext: AudioContext | null = null;

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
		
		console.log('Initializing player...');
		this.initPlayer();
		console.log('Player initialized');
		
		console.log('Initializing city...');
		this.initCity();
		console.log('City initialized');
		
		console.log('Initializing lighting...');
		this.initLighting();
		console.log('Lighting initialized');
		
		console.log('Initializing event listeners...');
		this.initEventListeners();
		console.log('Event listeners initialized');
		
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

	private initPlayer(): void {
		// Create player group for better organization
		this.playerGroup = new THREE.Group();
		this.playerGroup.position.set(0, 1, 0);
		this.scene.add(this.playerGroup);

		// Player body (torso)
		const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
		const bodyMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x4169E1,
			emissive: 0x111122
		});
		const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
		body.position.set(0, 0.4, 0);
		body.castShadow = true;
		this.playerGroup.add(body);

		// Player head
		const headGeometry = new THREE.SphereGeometry(0.2, 8, 8);
		const headMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xFFE4C4,
			emissive: 0x111111
		});
		const head = new THREE.Mesh(headGeometry, headMaterial);
		head.position.set(0, 1.1, 0);
		head.castShadow = true;
		this.playerGroup.add(head);

		// Neck
		const neckGeometry = new THREE.CapsuleGeometry(0.08, 0.15, 4, 6);
		const neckMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xFFE4C4,
			emissive: 0x111111
		});
		const neck = new THREE.Mesh(neckGeometry, neckMaterial);
		neck.position.set(0, 0.95, 0);
		neck.castShadow = true;
		this.playerGroup.add(neck);

		// Shoulders
		const shoulderGeometry = new THREE.CapsuleGeometry(0.12, 0.6, 4, 6);
		const shoulderMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x4169E1,
			emissive: 0x111122
		});
		const shoulders = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
		shoulders.position.set(0, 0.7, 0);
		shoulders.castShadow = true;
		this.playerGroup.add(shoulders);

		// Arms with detailed joints
		this.createDetailedArms();

		// Legs with detailed joints
		this.createDetailedLegs();

		// Add weapon
		this.addWeapon('bat');
	}

	private createDetailedArms(): void {
		// Left arm
		const leftArmGroup = new THREE.Group();
		leftArmGroup.position.set(-0.4, 0.7, 0);
		this.playerGroup.add(leftArmGroup);

		// Left upper arm
		const leftUpperArmGeometry = new THREE.CapsuleGeometry(0.08, 0.25, 4, 6);
		const armMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xFFE4C4,
			emissive: 0x111111
		});
		const leftUpperArm = new THREE.Mesh(leftUpperArmGeometry, armMaterial);
		leftUpperArm.position.set(0, -0.125, 0);
		leftUpperArm.castShadow = true;
		leftArmGroup.add(leftUpperArm);

		// Left elbow
		const leftElbowGeometry = new THREE.SphereGeometry(0.09, 6, 6);
		const elbowMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xFFE4C4,
			emissive: 0x111111
		});
		const leftElbow = new THREE.Mesh(leftElbowGeometry, elbowMaterial);
		leftElbow.position.set(0, -0.25, 0);
		leftElbow.castShadow = true;
		leftArmGroup.add(leftElbow);

		// Left lower arm
		const leftLowerArmGeometry = new THREE.CapsuleGeometry(0.07, 0.25, 4, 6);
		const leftLowerArm = new THREE.Mesh(leftLowerArmGeometry, armMaterial);
		leftLowerArm.position.set(0, -0.375, 0);
		leftLowerArm.castShadow = true;
		leftArmGroup.add(leftLowerArm);

		// Left hand
		const leftHandGeometry = new THREE.SphereGeometry(0.08, 6, 6);
		const handMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xFFE4C4,
			emissive: 0x111111
		});
		const leftHand = new THREE.Mesh(leftHandGeometry, handMaterial);
		leftHand.position.set(0, -0.5, 0);
		leftHand.castShadow = true;
		leftArmGroup.add(leftHand);

		// Right arm
		const rightArmGroup = new THREE.Group();
		rightArmGroup.position.set(0.4, 0.7, 0);
		this.playerGroup.add(rightArmGroup);

		// Right upper arm
		const rightUpperArmGeometry = new THREE.CapsuleGeometry(0.08, 0.25, 4, 6);
		const rightUpperArm = new THREE.Mesh(rightUpperArmGeometry, armMaterial);
		rightUpperArm.position.set(0, -0.125, 0);
		rightUpperArm.castShadow = true;
		rightArmGroup.add(rightUpperArm);

		// Right elbow
		const rightElbow = new THREE.Mesh(leftElbowGeometry, elbowMaterial);
		rightElbow.position.set(0, -0.25, 0);
		rightElbow.castShadow = true;
		rightArmGroup.add(rightElbow);

		// Right lower arm
		const rightLowerArmGeometry = new THREE.CapsuleGeometry(0.07, 0.25, 4, 6);
		const rightLowerArm = new THREE.Mesh(rightLowerArmGeometry, armMaterial);
		rightLowerArm.position.set(0, -0.375, 0);
		rightLowerArm.castShadow = true;
		rightArmGroup.add(rightLowerArm);

		// Right hand
		const rightHand = new THREE.Mesh(leftHandGeometry, handMaterial);
		rightHand.position.set(0, -0.5, 0);
		rightHand.castShadow = true;
		rightArmGroup.add(rightHand);

		// Store arm groups for animation
		this.leftArmGroup = leftArmGroup;
		this.rightArmGroup = rightArmGroup;
	}

	private createDetailedLegs(): void {
		// Left leg
		const leftLegGroup = new THREE.Group();
		leftLegGroup.position.set(-0.15, 0, 0);
		this.playerGroup.add(leftLegGroup);

		// Left upper leg (thigh)
		const leftUpperLegGeometry = new THREE.CapsuleGeometry(0.1, 0.3, 4, 6);
		const legMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x4169E1,
			emissive: 0x111122
		});
		const leftUpperLeg = new THREE.Mesh(leftUpperLegGeometry, legMaterial);
		leftUpperLeg.position.set(0, -0.15, 0);
		leftUpperLeg.castShadow = true;
		leftLegGroup.add(leftUpperLeg);

		// Left knee
		const leftKneeGeometry = new THREE.SphereGeometry(0.11, 6, 6);
		const kneeMaterial = new THREE.MeshLambertMaterial({ 
			color: 0xFFE4C4,
			emissive: 0x111111
		});
		const leftKnee = new THREE.Mesh(leftKneeGeometry, kneeMaterial);
		leftKnee.position.set(0, -0.3, 0);
		leftKnee.castShadow = true;
		leftLegGroup.add(leftKnee);

		// Left lower leg (calf)
		const leftLowerLegGeometry = new THREE.CapsuleGeometry(0.09, 0.3, 4, 6);
		const leftLowerLeg = new THREE.Mesh(leftLowerLegGeometry, legMaterial);
		leftLowerLeg.position.set(0, -0.45, 0);
		leftLowerLeg.castShadow = true;
		leftLegGroup.add(leftLowerLeg);

		// Left foot
		const leftFootGeometry = new THREE.BoxGeometry(0.18, 0.08, 0.25);
		const footMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x2F4F4F,
			emissive: 0x111111
		});
		const leftFoot = new THREE.Mesh(leftFootGeometry, footMaterial);
		leftFoot.position.set(0, -0.6, 0.05);
		leftFoot.castShadow = true;
		leftLegGroup.add(leftFoot);

		// Right leg
		const rightLegGroup = new THREE.Group();
		rightLegGroup.position.set(0.15, 0, 0);
		this.playerGroup.add(rightLegGroup);

		// Right upper leg (thigh)
		const rightUpperLegGeometry = new THREE.CapsuleGeometry(0.1, 0.3, 4, 6);
		const rightUpperLeg = new THREE.Mesh(rightUpperLegGeometry, legMaterial);
		rightUpperLeg.position.set(0, -0.15, 0);
		rightUpperLeg.castShadow = true;
		rightLegGroup.add(rightUpperLeg);

		// Right knee
		const rightKnee = new THREE.Mesh(leftKneeGeometry, kneeMaterial);
		rightKnee.position.set(0, -0.3, 0);
		rightKnee.castShadow = true;
		rightLegGroup.add(rightKnee);

		// Right lower leg (calf)
		const rightLowerLegGeometry = new THREE.CapsuleGeometry(0.09, 0.3, 4, 6);
		const rightLowerLeg = new THREE.Mesh(rightLowerLegGeometry, legMaterial);
		rightLowerLeg.position.set(0, -0.45, 0);
		rightLowerLeg.castShadow = true;
		rightLegGroup.add(rightLowerLeg);

		// Right foot
		const rightFoot = new THREE.Mesh(leftFootGeometry, footMaterial);
		rightFoot.position.set(0, -0.6, 0.05);
		rightFoot.castShadow = true;
		rightLegGroup.add(rightFoot);

		// Store leg groups for animation
		this.leftLegGroup = leftLegGroup;
		this.rightLegGroup = rightLegGroup;
	}

	private addWeapon(weaponType: string): void {
		// Remove existing weapon
		if (this.weaponMesh) {
			this.playerGroup.remove(this.weaponMesh);
		}

		// Create enhanced baseball bat
		const batGroup = new THREE.Group();
		
		// Bat handle (wooden)
		const handleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
		const handleMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x8B4513 // Brown wood
		});
		const handle = new THREE.Mesh(handleGeometry, handleMaterial);
		handle.position.y = 0.4;
		batGroup.add(handle);
		
		// Bat barrel (thicker part)
		const barrelGeometry = new THREE.CylinderGeometry(0.15, 0.08, 0.6, 8);
		const barrelMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x654321 // Darker brown
		});
		const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
		barrel.position.y = 0.8;
		batGroup.add(barrel);
		
		// Bat grip (leather)
		const gripGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8);
		const gripMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x2F1B14 // Dark leather
		});
		const grip = new THREE.Mesh(gripGeometry, gripMaterial);
		grip.position.y = 0.1;
		batGroup.add(grip);
		
		// Add some texture details
		const detailGeometry = new THREE.TorusGeometry(0.06, 0.01, 4, 8);
		const detailMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
		const detail = new THREE.Mesh(detailGeometry, detailMaterial);
		detail.position.y = 0.2;
		detail.rotation.x = Math.PI / 2;
		batGroup.add(detail);
		
		// Position the bat in character's right hand - more realistic positioning
		batGroup.position.set(0.5, 0.2, 0.2); // Positioned near right hand
		batGroup.rotation.z = -Math.PI / 6; // Slight downward angle
		batGroup.rotation.y = Math.PI / 8; // Slight outward angle
		batGroup.rotation.x = Math.PI / 12; // Slight forward tilt
		
		this.weaponMesh = batGroup;
		this.playerGroup.add(batGroup);
	}

	private initCity(): void {
		// Create much larger city with taller buildings
		const buildingPositions = [
			// Downtown area - tall skyscrapers
			{ x: -15, z: -15, height: 12, climbable: true, type: 'skyscraper' },
			{ x: 15, z: -15, height: 15, climbable: true, type: 'skyscraper' },
			{ x: -15, z: 15, height: 10, climbable: true, type: 'skyscraper' },
			{ x: 15, z: 15, height: 18, climbable: true, type: 'skyscraper' },
			{ x: 0, z: -20, height: 14, climbable: true, type: 'skyscraper' },
			{ x: -20, z: 0, height: 16, climbable: true, type: 'skyscraper' },
			{ x: 20, z: 0, height: 13, climbable: true, type: 'skyscraper' },
			
			// Mid-rise buildings
			{ x: -10, z: -10, height: 6, climbable: true, type: 'office' },
			{ x: 10, z: -10, height: 8, climbable: true, type: 'apartment' },
			{ x: -10, z: 10, height: 5, climbable: false, type: 'shop' },
			{ x: 10, z: 10, height: 7, climbable: true, type: 'office' },
			{ x: -5, z: -25, height: 6, climbable: true, type: 'apartment' },
			{ x: 5, z: -25, height: 9, climbable: true, type: 'office' },
			{ x: -25, z: -5, height: 7, climbable: true, type: 'apartment' },
			{ x: 25, z: -5, height: 5, climbable: false, type: 'shop' },
			{ x: -25, z: 5, height: 8, climbable: true, type: 'office' },
			{ x: 25, z: 5, height: 6, climbable: true, type: 'apartment' },
			
			// Residential area - smaller buildings
			{ x: -30, z: -30, height: 4, climbable: true, type: 'house' },
			{ x: 30, z: -30, height: 3, climbable: true, type: 'house' },
			{ x: -30, z: 30, height: 4, climbable: true, type: 'house' },
			{ x: 30, z: 30, height: 3, climbable: true, type: 'house' },
			{ x: -35, z: 0, height: 4, climbable: true, type: 'house' },
			{ x: 35, z: 0, height: 3, climbable: true, type: 'house' },
			{ x: 0, z: -35, height: 4, climbable: true, type: 'house' },
			{ x: 0, z: 35, height: 3, climbable: true, type: 'house' },
			
			// Additional mid-rise buildings for more exploration
			{ x: -8, z: 20, height: 6, climbable: true, type: 'apartment' },
			{ x: 8, z: 20, height: 5, climbable: false, type: 'shop' },
			{ x: -20, z: -8, height: 7, climbable: true, type: 'office' },
			{ x: 20, z: -8, height: 6, climbable: true, type: 'apartment' },
			{ x: -20, z: 8, height: 5, climbable: false, type: 'shop' },
			{ x: 20, z: 8, height: 8, climbable: true, type: 'office' },
			
			// Corner buildings for strategic positions
			{ x: -12, z: -12, height: 9, climbable: true, type: 'office' },
			{ x: 12, z: -12, height: 7, climbable: true, type: 'apartment' },
			{ x: -12, z: 12, height: 6, climbable: false, type: 'shop' },
			{ x: 12, z: 12, height: 10, climbable: true, type: 'office' }
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
		// Add some rooftop structures for more vertical gameplay
		const rooftopPositions = [
			{ x: -15, z: -15, height: 12, type: 'antenna' },
			{ x: 15, z: -15, height: 15, type: 'water_tank' },
			{ x: -15, z: 15, height: 10, type: 'antenna' },
			{ x: 15, z: 15, height: 18, type: 'helicopter_pad' }
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
		
		// Main building structure
		const buildingGeometry = new THREE.BoxGeometry(2, height, 2);
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

		this.buildings.push({
			mesh: building,
			climbable: climbable,
			height: height
		});
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
		// Add windows
		const windowGeometry = new THREE.PlaneGeometry(0.3, 0.4);
		const windowMaterial = new THREE.MeshLambertMaterial({ 
			color: 0x87ceeb,
			emissive: 0x111111
		});

		// Add windows on each side
		for (let y = 0.5; y < height - 0.5; y += 0.8) {
			// Front windows
			const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
			frontWindow.position.set(0, y, 1.01);
			building.add(frontWindow);

			// Back windows
			const backWindow = new THREE.Mesh(windowGeometry, windowMaterial);
			backWindow.position.set(0, y, -1.01);
			backWindow.rotation.y = Math.PI;
			building.add(backWindow);

			// Side windows
			const leftWindow = new THREE.Mesh(windowGeometry, windowMaterial);
			leftWindow.position.set(-1.01, y, 0);
			leftWindow.rotation.y = Math.PI / 2;
			building.add(leftWindow);

			const rightWindow = new THREE.Mesh(windowGeometry, windowMaterial);
			rightWindow.position.set(1.01, y, 0);
			rightWindow.rotation.y = -Math.PI / 2;
			building.add(rightWindow);
		}

		// Add roof details for taller buildings
		if (height > 3) {
			const roofGeometry = new THREE.BoxGeometry(2.2, 0.2, 2.2);
			const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
			const roof = new THREE.Mesh(roofGeometry, roofMaterial);
			roof.position.y = height / 2 + 0.1;
			building.add(roof);
		}
	}

	private addStreetLights(): void {
		// Add street lights throughout the larger map
		const lightPositions = [
			// Main intersections
			{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: -10, z: 10 }, { x: 10, z: 10 },
			{ x: -20, z: -20 }, { x: 20, z: -20 }, { x: -20, z: 20 }, { x: 20, z: 20 },
			{ x: 0, z: -15 }, { x: 0, z: 15 }, { x: -15, z: 0 }, { x: 15, z: 0 },
			
			// Additional lights for better coverage
			{ x: -5, z: -25 }, { x: 5, z: -25 }, { x: -25, z: -5 }, { x: 25, z: -5 },
			{ x: -25, z: 5 }, { x: 25, z: 5 }, { x: -5, z: 25 }, { x: 5, z: 25 },
			{ x: -30, z: -30 }, { x: 30, z: -30 }, { x: -30, z: 30 }, { x: 30, z: 30 },
			{ x: -35, z: 0 }, { x: 35, z: 0 }, { x: 0, z: -35 }, { x: 0, z: 35 }
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

		document.addEventListener('touchstart', (event) => {
			event.preventDefault();
			const touch = event.touches[0];
			touchStartX = touch.clientX;
			touchStartY = touch.clientY;
		});

		document.addEventListener('touchend', (event) => {
			event.preventDefault();
			const touch = event.changedTouches[0];
			const deltaX = touch.clientX - touchStartX;
			const deltaY = touch.clientY - touchStartY;
			const threshold = 30;

			// Reset all keys
			this.keys.left = false;
			this.keys.right = false;
			this.keys.up = false;
			this.keys.down = false;
			this.keys.jump = false;
			this.keys.attack = false;

			// Determine movement direction
			if (Math.abs(deltaX) > threshold) {
				if (deltaX > 0) {
					this.keys.right = true;
				} else {
					this.keys.left = true;
				}
			}

			if (Math.abs(deltaY) > threshold) {
				if (deltaY > 0) {
					this.keys.down = true;
				} else {
					this.keys.up = true;
					this.keys.jump = true;
				}
			}

			// Tap to attack
			if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
				this.keys.attack = true;
				setTimeout(() => this.keys.attack = false, 100);
			}
		});
	}

	private updatePlayerPhysics(delta: number): void {
		const moveSpeed = 6; // Slightly faster movement
		const airMoveSpeed = 4; // Reduced speed in air for better control
		const jumpForce = 18; // Higher jumps for better building access
		const gravity = 30; // Slightly stronger gravity for better control

		// Get camera direction for movement relative to camera
		const cameraDirection = new THREE.Vector3(0, 0, -1);
		cameraDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);
		
		const cameraRight = new THREE.Vector3(1, 0, 0);
		cameraRight.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotationY);

		// Handle movement relative to camera direction
		let moveX = 0;
		let moveZ = 0;

		if (this.keys.left) moveX -= 1;
		if (this.keys.right) moveX += 1;
		if (this.keys.up) moveZ += 1; // Fixed: W should move forward (positive Z)
		if (this.keys.down) moveZ -= 1; // Fixed: S should move backward (negative Z)

		// Normalize diagonal movement
		if (moveX !== 0 && moveZ !== 0) {
			moveX *= 0.707;
			moveZ *= 0.707;
		}

		// Apply movement relative to camera - different speeds for ground vs air
		const currentMoveSpeed = this.playerOnGround ? moveSpeed : airMoveSpeed;
		this.playerVelocity.x = (cameraRight.x * moveX + cameraDirection.x * moveZ) * currentMoveSpeed;
		this.playerVelocity.z = (cameraRight.z * moveX + cameraDirection.z * moveZ) * currentMoveSpeed;

		// Update movement state for animation
		this.isMoving = moveX !== 0 || moveZ !== 0;

		// Apply friction when not moving (less friction in air)
		if (moveX === 0 && moveZ === 0) {
			const friction = this.playerOnGround ? 0.8 : 0.95; // Less friction in air
			this.playerVelocity.x *= friction;
			this.playerVelocity.z *= friction;
		}

		// Handle jumping - allow jumping while moving
		if (this.keys.jump && this.playerOnGround) {
			this.playerVelocity.y = jumpForce;
			this.playerOnGround = false;
		}

		// Apply gravity
		if (!this.playerOnGround) {
			this.playerVelocity.y -= gravity * delta;
		}

		// Update position
		this.playerGroup.position.add(this.playerVelocity.clone().multiplyScalar(delta));

		// Check for ground collision and building surfaces
		this.checkGroundCollision();

		// Boundary collision - updated for larger map
		this.playerGroup.position.x = Math.max(-this.mapBounds, Math.min(this.mapBounds, this.playerGroup.position.x));
		this.playerGroup.position.z = Math.max(-this.mapBounds, Math.min(this.mapBounds, this.playerGroup.position.z));

		// Building collision and climbing with improved building-to-building jumping
		this.checkBuildingCollisions();

		// Update character rotation to face camera direction (even in air)
		this.updateCharacterRotation(moveX, moveZ);

		// Update running animation
		this.updateRunningAnimation(delta);

		// Update weapon animation
		this.updateWeaponAnimation(delta);

		// Update camera position based on mouse rotation
		this.updateCamera();
	}

	private checkGroundCollision(): void {
		// Check if player is on ground level
		if (this.playerGroup.position.y <= 1) {
			this.playerGroup.position.y = 1;
			this.playerVelocity.y = 0;
			this.playerOnGround = true;
		}
		
		// Check if player is falling and should be on ground
		if (this.playerVelocity.y < 0 && this.playerGroup.position.y <= 1.1) {
			this.playerGroup.position.y = 1;
			this.playerVelocity.y = 0;
			this.playerOnGround = true;
		}
	}

	private updateRunningAnimation(delta: number): void {
		if (!this.isMoving) {
			// Reset to idle position
			if (this.leftArmGroup) {
				this.leftArmGroup.rotation.z = 0;
			}
			if (this.rightArmGroup) {
				this.rightArmGroup.rotation.z = 0;
			}
			if (this.leftLegGroup) {
				this.leftLegGroup.rotation.z = 0;
			}
			if (this.rightLegGroup) {
				this.rightLegGroup.rotation.z = 0;
			}
			return;
		}

		// Update animation time
		this.animationTime += delta * 8; // Faster animation

		// Arm swinging animation
		if (this.leftArmGroup && this.rightArmGroup) {
			// Left arm swings forward when right leg steps forward
			this.leftArmGroup.rotation.z = Math.sin(this.animationTime) * 0.8;
			// Right arm swings backward when left leg steps forward
			this.rightArmGroup.rotation.z = -Math.sin(this.animationTime) * 0.8;
		}

		// Leg stepping animation
		if (this.leftLegGroup && this.rightLegGroup) {
			// Left leg steps forward
			this.leftLegGroup.rotation.z = Math.sin(this.animationTime) * 0.4;
			// Right leg steps backward
			this.rightLegGroup.rotation.z = -Math.sin(this.animationTime) * 0.4;
		}

		// Body bobbing effect
		if (this.playerGroup) {
			this.playerGroup.position.y = 1 + Math.sin(this.animationTime * 2) * 0.05;
		}
	}

	private updateCharacterRotation(moveX: number, moveZ: number): void {
		if (moveX === 0 && moveZ === 0) return;

		// Calculate target rotation based on movement direction
		const targetRotation = Math.atan2(moveX, moveZ);
		
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
		if (!this.weaponMesh) return;

		// Weapon follows player movement with natural positioning
		this.weaponMesh.position.copy(this.playerGroup.position);
		this.weaponMesh.position.x += 0.5; // Slightly to the right
		this.weaponMesh.position.y += 0.2; // At hand level
		this.weaponMesh.position.z += 0.2; // Slightly forward

		// Apply character rotation to weapon
		this.weaponMesh.rotation.y = this.playerGroup.rotation.y;

		// Weapon sways with movement
		if (this.isMoving) {
			// Natural swaying motion
			this.weaponMesh.rotation.z = -Math.PI / 6 + Math.sin(this.animationTime * 4) * 0.1;
			this.weaponMesh.rotation.x = Math.PI / 12 + Math.sin(this.animationTime * 2) * 0.05;
		} else {
			// Idle position
			this.weaponMesh.rotation.z = -Math.PI / 6;
			this.weaponMesh.rotation.x = Math.PI / 12;
		}

		// Attack animation
		if (this.isAttacking) {
			// Weapon swings during attack
			this.weaponMesh.rotation.z = -Math.PI / 6 + Math.sin(Date.now() * 0.02) * 0.5;
			this.weaponMesh.rotation.y += Math.sin(Date.now() * 0.03) * 0.3;
		}
	}

	private checkBuildingCollisions(): void {
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = this.playerGroup.position.distanceTo(buildingPos);
			
			// Check if player is on top of building
			const playerHeight = this.playerGroup.position.y;
			const buildingTop = building.height;
			const isOnBuilding = playerHeight > buildingTop - 0.5 && playerHeight < buildingTop + 2;
			
			if (isOnBuilding && distance < 3) {
				// Player is on top of building - snap to building surface
				this.playerGroup.position.y = buildingTop + 1;
				this.playerOnGround = true;
				this.playerVelocity.y = 0;
			} else if (distance < 2.5 && !isOnBuilding) {
				// Collision detected - push player away
				const direction = this.playerGroup.position.clone().sub(buildingPos).normalize();
				this.playerGroup.position.copy(buildingPos.clone().add(direction.multiplyScalar(3)));
			}
			
			// Check for climbing opportunity (even during jumps)
			if (building.climbable && this.keys.jump) {
				// More forgiving climbing detection
				const playerToBuilding = this.playerGroup.position.clone().sub(buildingPos);
				const buildingRadius = 4; // Increased radius for easier climbing
				
				if (playerToBuilding.length() < buildingRadius) {
					// Check if player is at the right height to climb
					const playerHeight = this.playerGroup.position.y;
					const buildingTop = building.height;
					
					// Allow climbing if player is near the building and jumping
					if (playerHeight < buildingTop + 4) {
						// Climb to building top
						this.playerGroup.position.y = buildingTop + 1;
						this.playerVelocity.y = 0;
						this.playerOnGround = true;
						
						// Add a small forward push to get on top
						const climbDirection = playerToBuilding.normalize();
						this.playerGroup.position.add(climbDirection.multiplyScalar(1));
						
						// Add climbing effect
						this.addClimbingEffect(this.playerGroup.position.clone());
					}
				}
			}
		});

		// Check for climbing on street lights and other structures
		this.checkClimbableStructures();
		
		// Check for building-to-building jumping with improved mid-air control
		this.checkBuildingToBuildingJumping();
	}

	private checkBuildingToBuildingJumping(): void {
		// Check if player is jumping from one building to another
		if (this.playerVelocity.y > 0 || !this.playerOnGround) {
			let closestBuilding = null;
			let closestDistance = Infinity;
			
			this.buildings.forEach(building => {
				const buildingPos = building.mesh.position;
				const distance = this.playerGroup.position.distanceTo(buildingPos);
				const playerHeight = this.playerGroup.position.y;
				const buildingTop = building.height;
				
				// Check if player is jumping toward a building
				if (distance < 6 && playerHeight > buildingTop - 1 && playerHeight < buildingTop + 3) {
					// Player is jumping toward this building
					const playerToBuilding = buildingPos.clone().sub(this.playerGroup.position).normalize();
					const jumpDirection = new THREE.Vector3(this.playerVelocity.x, 0, this.playerVelocity.z).normalize();
					
					// Check if player is jumping in the direction of the building
					const dotProduct = jumpDirection.dot(playerToBuilding);
					
					// Track closest building for visual feedback
					if (distance < closestDistance && dotProduct > 0.1) {
						closestDistance = distance;
						closestBuilding = building;
					}
					
					if (dotProduct > 0.2) { // More forgiving angle for landing
						// Land on the building
						this.playerGroup.position.y = buildingTop + 1;
						this.playerVelocity.y = 0;
						this.playerOnGround = true;
						
						// Add landing effect
						this.addLandingEffect(this.playerGroup.position.clone());
					}
				}
			});
			
			// Add visual feedback for closest building
			if (closestBuilding && !this.playerOnGround) {
				this.addBuildingTargetIndicator(closestBuilding);
			}
		}
	}

	private addBuildingTargetIndicator(building: Building): void {
		// Create a temporary visual indicator on the building
		const indicatorGeometry = new THREE.RingGeometry(2.2, 2.5, 8);
		const indicatorMaterial = new THREE.MeshBasicMaterial({ 
			color: 0x00ff00,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide
		});
		const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
		
		indicator.position.copy(building.mesh.position);
		indicator.position.y = building.height + 0.1;
		indicator.rotation.x = -Math.PI / 2;
		
		this.scene.add(indicator);
		
		// Animate the indicator
		const startTime = Date.now();
		const animateIndicator = () => {
			const elapsed = (Date.now() - startTime) / 1000;
			const pulse = Math.sin(elapsed * 4) * 0.3 + 0.7;
			
			indicator.material.opacity = 0.6 * pulse;
			indicator.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.1);
			
			if (this.playerOnGround || elapsed > 2) {
				this.scene.remove(indicator);
			} else {
				requestAnimationFrame(animateIndicator);
			}
		};
		animateIndicator();
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
		
		// Add weapon swing animation
		if (this.weaponMesh) {
			const startRotation = this.weaponMesh.rotation.z;
			const swingAnimation = () => {
				const progress = (0.3 - this.attackCooldown) / 0.3;
				if (progress < 1) {
					// Full 360-degree swing
					this.weaponMesh!.rotation.z = startRotation + progress * Math.PI * 2;
					this.weaponMesh!.rotation.y = Math.sin(progress * Math.PI * 4) * 0.3;
					requestAnimationFrame(swingAnimation);
				}
			};
			swingAnimation();
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
				const toZombie = zombie.mesh.position.clone().sub(this.playerGroup.position).normalize();
				zombie.mesh.position.sub(toZombie.multiplyScalar(zombie.speed * delta));
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

		// Update player physics and animation
		this.updatePlayerPhysics(delta);

		// Update zombies
		this.updateZombies(delta);

		// Update items
		this.updateItems(delta);

		// Spawn new zombies
		this.zombieSpawnTimer += delta;
		if (this.zombieSpawnTimer >= this.zombieSpawnInterval / this.difficultyMultiplier) {
			this.spawnZombie();
			this.zombieSpawnTimer = 0;
		}

		// Spawn new items
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
		this.currentWeapon = 'bat';
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

		// Add starting weapon
		this.addWeapon('bat');

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
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
		}
		this.renderer.dispose();
	}

	private handleInput(): void {
		// Handle attack input
		if (this.keys.attack) {
			this.attack();
		}
	}

	private checkClimbableStructures(): void {
		// Check if player is near any climbable structure and trying to jump
		if (this.keys.jump && this.playerVelocity.y > 0) {
			// Check street lights (they're at fixed positions)
			const streetLightPositions = [
				[-15, 0, -15], [15, 0, -15], [-15, 0, 15], [15, 0, 15],
				[-25, 0, -25], [25, 0, -25], [-25, 0, 25], [25, 0, 25],
				[-35, 0, -35], [35, 0, -35], [-35, 0, 35], [35, 0, 35]
			];

			streetLightPositions.forEach(pos => {
				const distance = this.playerGroup.position.distanceTo(new THREE.Vector3(pos[0], pos[1], pos[2]));
				if (distance < 5) { // Increased range for easier climbing
					// Climb onto street light
					this.playerGroup.position.y = 8; // Street light height
					this.playerVelocity.y = 0;
					this.playerOnGround = true;
				}
			});

			// Check for other climbable objects (benches, newspaper stands, etc.)
			const climbableObjects = [
				{ pos: [-10, 0, -10], height: 2 }, // Benches
				{ pos: [10, 0, 10], height: 2 },
				{ pos: [-20, 0, 20], height: 2 },
				{ pos: [20, 0, -20], height: 2 },
				{ pos: [-30, 0, -30], height: 3 }, // Newspaper stands
				{ pos: [30, 0, 30], height: 3 },
				{ pos: [-40, 0, 40], height: 3 },
				{ pos: [40, 0, -40], height: 3 }
			];

			climbableObjects.forEach(obj => {
				const distance = this.playerGroup.position.distanceTo(new THREE.Vector3(obj.pos[0], obj.pos[1], obj.pos[2]));
				if (distance < 4) { // Increased range for easier climbing
					// Climb onto object
					this.playerGroup.position.y = obj.height + 1;
					this.playerVelocity.y = 0;
					this.playerOnGround = true;
				}
			});
		}
		
		// Check if player is standing on climbable structures
		this.checkStandingOnStructures();
	}

	private checkStandingOnStructures(): void {
		// Check if player is standing on street lights
		const streetLightPositions = [
			[-15, 0, -15], [15, 0, -15], [-15, 0, 15], [15, 0, 15],
			[-25, 0, -25], [25, 0, -25], [-25, 0, 25], [25, 0, 25],
			[-35, 0, -35], [35, 0, -35], [-35, 0, 35], [35, 0, 35]
		];

		streetLightPositions.forEach(pos => {
			const distance = this.playerGroup.position.distanceTo(new THREE.Vector3(pos[0], pos[1], pos[2]));
			const playerHeight = this.playerGroup.position.y;
			const lightHeight = 8;
			
			if (distance < 2.5 && playerHeight > lightHeight - 0.5 && playerHeight < lightHeight + 1.5) {
				// Player is on street light - snap to surface
				this.playerGroup.position.y = lightHeight + 1;
				this.playerOnGround = true;
				this.playerVelocity.y = 0;
			}
		});

		// Check if player is standing on other climbable objects
		const climbableObjects = [
			{ pos: [-10, 0, -10], height: 2 }, // Benches
			{ pos: [10, 0, 10], height: 2 },
			{ pos: [-20, 0, 20], height: 2 },
			{ pos: [20, 0, -20], height: 2 },
			{ pos: [-30, 0, -30], height: 3 }, // Newspaper stands
			{ pos: [30, 0, 30], height: 3 },
			{ pos: [-40, 0, 40], height: 3 },
			{ pos: [40, 0, -40], height: 3 }
		];

		climbableObjects.forEach(obj => {
			const distance = this.playerGroup.position.distanceTo(new THREE.Vector3(obj.pos[0], obj.pos[1], obj.pos[2]));
			const playerHeight = this.playerGroup.position.y;
			
			if (distance < 2.5 && playerHeight > obj.height - 0.5 && playerHeight < obj.height + 1.5) {
				// Player is on object - snap to surface
				this.playerGroup.position.y = obj.height + 1;
				this.playerOnGround = true;
				this.playerVelocity.y = 0;
			}
		});
	}

	private checkZombieBuildingCollisions(zombie: Zombie): void {
		this.buildings.forEach(building => {
			const buildingPos = building.mesh.position;
			const distance = zombie.mesh.position.distanceTo(buildingPos);
			
			if (distance < 2) {
				// Push zombie away from building
				const direction = zombie.mesh.position.clone().sub(buildingPos).normalize();
				zombie.mesh.position.copy(buildingPos.clone().add(direction.multiplyScalar(2)));
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
					// Upgrade weapon
					this.currentWeapon = 'upgraded_bat';
					this.addWeapon('upgraded_bat');
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
		
		// Add weapon swing animation
		if (this.weaponMesh) {
			const startRotation = this.weaponMesh.rotation.z;
			const swingAnimation = () => {
				const progress = (0.3 - this.attackCooldown) / 0.3;
				if (progress < 1) {
					// Full 360-degree swing
					this.weaponMesh!.rotation.z = startRotation + progress * Math.PI * 2;
					this.weaponMesh!.rotation.y = Math.sin(progress * Math.PI * 4) * 0.3;
					requestAnimationFrame(swingAnimation);
				}
			};
			swingAnimation();
		}
	}
} 