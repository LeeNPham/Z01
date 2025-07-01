<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { GameEngine, type GameState } from '$lib/game/GameEngine';

	let gameContainer: HTMLDivElement;
	let gameEngine: GameEngine;
	let gameState: GameState = {
		survivalTime: 0,
		zombiesKilled: 0,
		gameOver: false,
		paused: false,
		itemsCollected: 0
	};
	let loadingError: string | null = null;
	let isLoading = true;

	onMount(() => {
		console.log('Game component mounted');
		if (gameContainer) {
			try {
				console.log('Starting game initialization...');
				console.log('Container dimensions:', gameContainer.clientWidth, 'x', gameContainer.clientHeight);
				console.log('Container element:', gameContainer);
				
				// Add a small delay to ensure container is ready
				setTimeout(() => {
					try {
						console.log('Creating GameEngine instance...');
						gameEngine = new GameEngine(gameContainer);
						console.log('Game engine created successfully');
						console.log('Game engine state:', gameEngine.getGameState());
						isLoading = false;
						
						// Update game state every frame
						const updateGameState = () => {
							if (gameEngine) {
								gameState = gameEngine.getGameState();
							}
							requestAnimationFrame(updateGameState);
						};
						updateGameState();
					} catch (error) {
						console.error('Error creating game engine:', error);
						console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
						loadingError = error instanceof Error ? error.message : 'Unknown error occurred';
						isLoading = false;
					}
				}, 100);
			} catch (error) {
				console.error('Error in onMount:', error);
				console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
				loadingError = error instanceof Error ? error.message : 'Unknown error occurred';
				isLoading = false;
			}
		} else {
			console.error('Game container not found');
			loadingError = 'Game container not found';
			isLoading = false;
		}
	});

	onDestroy(() => {
		if (gameEngine) {
			gameEngine.destroy();
		}
	});

	function handleRestart() {
		if (gameEngine) {
			gameEngine.restart();
		}
	}

	function handlePause() {
		if (gameEngine) {
			gameEngine.togglePause();
		}
	}

	// Format time as MM:SS
	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	// Handle keyboard input for attack
	function handleKeyDown(event: KeyboardEvent) {
		if (event.code === 'Escape') {
			// Let the game engine handle pause
		}
	}

	onMount(() => {
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div class="game-container">
	<div bind:this={gameContainer} class="game-canvas"></div>
	
	<div class="game-ui">
		{#if isLoading}
			<div class="start-screen">
				<h1>🧟 Zombie Survival Game</h1>
				<p>Loading game...</p>
				<div class="loading-spinner"></div>
			</div>
		{:else if loadingError}
			<div class="error-screen">
				<h1>🧟 Zombie Survival Game</h1>
				<p class="error-message">Error loading game: {loadingError}</p>
				<button class="retry-button" on:click={() => window.location.reload()}>
					Retry
				</button>
			</div>
		{:else if !gameEngine}
			<div class="start-screen">
				<h1>🧟 Zombie Survival Game</h1>
				<p>Initializing game...</p>
			</div>
		{:else if !gameState.gameOver}
			<div class="stats">
				<div class="stat">
					<span class="label">Survival Time:</span>
					<span class="value">{formatTime(gameState.survivalTime)}</span>
				</div>
				<div class="stat">
					<span class="label">Zombies Killed:</span>
					<span class="value">{gameState.zombiesKilled}</span>
				</div>
				<div class="stat">
					<span class="label">Items Collected:</span>
					<span class="value">{gameState.itemsCollected}</span>
				</div>
				<div class="stat">
					<span class="label">Current Weapon:</span>
					<span class="value">Baseball Bat</span>
				</div>
			</div>
			
			<div class="controls">
				<h3>Controls:</h3>
				<div class="control-group">
					<span class="control-label">Movement:</span>
					<span class="control-keys">WASD (camera relative)</span>
				</div>
				<div class="control-group">
					<span class="control-label">Jump:</span>
					<span class="control-keys">SPACE (while moving)</span>
				</div>
				<div class="control-group">
					<span class="control-label">Attack:</span>
					<span class="control-keys">LEFT CLICK</span>
				</div>
				<div class="control-group">
					<span class="control-label">Camera:</span>
					<span class="control-keys">MOUSE</span>
				</div>
				<div class="control-group">
					<span class="control-label">Lock Camera:</span>
					<span class="control-keys">CLICK GAME</span>
				</div>
				<div class="control-group">
					<span class="control-label">Pause:</span>
					<span class="control-keys">ESC</span>
				</div>
				<div class="control-group">
					<span class="control-label">Mid-Air Control:</span>
					<span class="control-keys">WASD (reduced speed)</span>
				</div>
				<div class="control-group">
					<span class="control-label">Unstuck:</span>
					<span class="control-keys">R (if stuck)</span>
				</div>
			</div>

			<div class="mouse-indicator">
				{#if gameEngine?.getPointerLockStatus()}
					<span class="indicator-text">🔒 Mouse Locked</span>
				{:else}
					<span class="indicator-text">🔓 Click to Lock Mouse</span>
				{/if}
			</div>

			<div class="movement-status">
				{#if gameState.survivalTime > 0}
					<span class="status-text">
						{#if !gameEngine?.getPointerLockStatus()}
							⚠️ Click game area to enable mouse control
						{:else}
							✅ Mouse control active
						{/if}
					</span>
				{/if}
			</div>

			<div class="legend">
				<h3>Game Legend</h3>
				<div class="legend-section">
					<h4>🎮 Characters</h4>
					<div class="legend-item">
						<span class="legend-color" style="background: #4169E1;"></span>
						<span class="legend-text">Blue Character - You (the player)</span>
					</div>
					<div class="legend-item">
						<span class="legend-color" style="background: #00ff00;"></span>
						<span class="legend-text">Green Zombies - Enemies (avoid or fight)</span>
					</div>
				</div>
				
				<div class="legend-section">
					<h4>🏢 Buildings & Structures</h4>
					<div class="legend-item">
						<span class="legend-color" style="background: #888888;"></span>
						<span class="legend-text">Gray Buildings - Climbable (jump near them)</span>
					</div>
					<div class="legend-item">
						<span class="legend-color" style="background: #ffff00;"></span>
						<span class="legend-text">Yellow Street Lights - Climbable (jump near them)</span>
					</div>
					<div class="legend-item">
						<span class="legend-color" style="background: #8B4513;"></span>
						<span class="legend-text">Brown Benches - Climbable (jump near them)</span>
					</div>
				</div>

				<div class="legend-section">
					<h4>🎒 Collectible Items</h4>
					<div class="legend-item">
						<span class="legend-color" style="background: #8B4513;"></span>
						<span class="legend-text">Brown Weapons - Upgrade your baseball bat</span>
					</div>
					<div class="legend-item">
						<span class="legend-color" style="background: #ff0000;"></span>
						<span class="legend-text">Red Health Packs - Restore health (+30 HP)</span>
					</div>
				</div>

				<div class="legend-section">
					<h4>💡 Tips</h4>
					<div class="tip-item">• Click the game area to lock mouse for camera control</div>
					<div class="tip-item">• Use WASD to move relative to camera direction</div>
					<div class="tip-item">• Hold SPACE while moving to jump and climb buildings/structures</div>
					<div class="tip-item">• You can move and jump at the same time for better control</div>
					<div class="tip-item">• Left-click to attack zombies with your baseball bat</div>
					<div class="tip-item">• Collect weapons to upgrade your attack power</div>
					<div class="tip-item">• Health packs restore your health when low</div>
					<div class="tip-item">• Zombies spawn faster over time - stay mobile!</div>
					<div class="tip-item">• Use buildings and structures to escape from zombies</div>
					<div class="tip-item">• Press ESC to unlock mouse and pause game</div>
					<div class="tip-item">• Press R if you get stuck while climbing or moving</div>
				</div>
			</div>
		{:else}
			<div class="game-over">
				<h2>Game Over!</h2>
				<p>You survived for {formatTime(gameState.survivalTime)}</p>
				<p>Zombies killed: {gameState.zombiesKilled}</p>
				<p>Items collected: {gameState.itemsCollected}</p>
				<button on:click={() => gameEngine?.restart()}>Play Again</button>
			</div>
		{/if}
		
		{#if gameState.paused}
			<div class="pause-overlay">
				<h2>Paused</h2>
				<p>Press P to resume</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.game-container {
		width: 100vw;
		height: 100vh;
		position: relative;
		overflow: hidden;
		background: #000;
	}

	.game-canvas {
		width: 100%;
		height: 100%;
		background: #000;
		display: block;
	}

	.game-ui {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 10;
	}

	.stats {
		position: absolute;
		top: 20px;
		left: 20px;
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		padding: 15px;
		border-radius: 10px;
		border: 2px solid #ff4444;
		pointer-events: auto;
	}

	.stat {
		margin: 5px 0;
		font-size: 16px;
		font-weight: bold;
	}

	.label {
		color: #ffaa00;
		margin-right: 10px;
	}

	.value {
		color: #00ff88;
	}

	.controls {
		position: absolute;
		top: 20px;
		right: 20px;
		background: rgba(0, 0, 0, 0.8);
		padding: 15px;
		border-radius: 10px;
		color: white;
		font-family: 'Courier New', monospace;
	}

	.control-group {
		margin: 8px 0;
		font-size: 14px;
	}

	.control-label {
		color: #ffaa00;
		margin-right: 10px;
	}

	.control-keys {
		color: #00ff88;
	}

	.legend {
		position: absolute;
		bottom: 20px;
		left: 20px;
		background: rgba(0, 0, 0, 0.9);
		padding: 20px;
		border-radius: 10px;
		color: white;
		font-family: 'Courier New', monospace;
		max-width: 400px;
		max-height: 500px;
		overflow-y: auto;
	}

	.legend h3 {
		margin: 0 0 15px 0;
		color: #ffaa00;
		text-align: center;
		font-size: 18px;
	}

	.legend-section {
		margin-bottom: 15px;
	}

	.legend-section h4 {
		margin: 0 0 8px 0;
		color: #4488ff;
		font-size: 14px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		margin: 5px 0;
		font-size: 12px;
	}

	.legend-color {
		width: 20px;
		height: 20px;
		border-radius: 3px;
		margin-right: 10px;
		border: 1px solid #666;
	}

	.legend-text {
		color: #ccc;
	}

	.tip-item {
		margin: 3px 0;
		font-size: 11px;
		color: #aaa;
		line-height: 1.3;
	}

	.game-over {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.9);
		padding: 40px;
		border-radius: 15px;
		text-align: center;
		color: white;
		font-family: 'Courier New', monospace;
	}

	.game-over h2 {
		margin: 0 0 20px 0;
		color: #ff4444;
		font-size: 2em;
	}

	.game-over p {
		margin: 10px 0;
		font-size: 1.2em;
	}

	.game-over button {
		background: #ff4444;
		color: white;
		border: none;
		padding: 15px 30px;
		font-size: 1.2em;
		border-radius: 10px;
		cursor: pointer;
		margin-top: 20px;
		transition: background 0.3s;
	}

	.game-over button:hover {
		background: #ff6666;
	}

	.pause-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.8);
		padding: 30px;
		border-radius: 10px;
		text-align: center;
		color: white;
		font-family: 'Courier New', monospace;
	}

	.pause-overlay h2 {
		margin: 0 0 20px 0;
		color: #4488ff;
	}

	.pause-overlay p {
		margin: 5px 0;
		font-size: 12px;
		color: #aaa;
	}

	.mouse-indicator {
		position: absolute;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		padding: 10px 15px;
		border-radius: 5px;
		color: white;
		font-family: 'Courier New', monospace;
		text-align: center;
	}

	.indicator-text {
		margin: 0 10px;
		font-size: 14px;
	}

	.start-screen {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.9);
		padding: 40px;
		border-radius: 15px;
		text-align: center;
		color: white;
		font-family: 'Courier New', monospace;
	}

	.start-screen h1 {
		margin: 0 0 20px 0;
		color: #ffaa00;
		font-size: 2.5em;
	}

	.start-screen p {
		margin: 10px 0;
		font-size: 1.2em;
		color: #ccc;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #333;
		border-top: 4px solid #ffaa00;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 20px auto;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.error-screen {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.9);
		padding: 40px;
		border-radius: 15px;
		text-align: center;
		color: white;
		font-family: 'Courier New', monospace;
	}

	.error-screen h1 {
		margin: 0 0 20px 0;
		color: #ff4444;
		font-size: 2.5em;
	}

	.error-message {
		margin: 20px 0;
		font-size: 1.1em;
		color: #ff6666;
		background: rgba(255, 0, 0, 0.1);
		padding: 15px;
		border-radius: 8px;
		border: 1px solid #ff4444;
	}

	.retry-button {
		background: #ff4444;
		color: white;
		border: none;
		padding: 15px 30px;
		font-size: 1.2em;
		border-radius: 10px;
		cursor: pointer;
		margin-top: 20px;
		transition: background 0.3s;
		font-family: 'Courier New', monospace;
	}

	.retry-button:hover {
		background: #ff6666;
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.stats {
			top: 10px;
			left: 10px;
			padding: 10px;
			font-size: 12px;
		}

		.controls {
			top: 10px;
			right: 10px;
			padding: 10px;
			font-size: 12px;
		}

		.control-group {
			font-size: 12px;
		}

		.legend {
			bottom: 10px;
			left: 10px;
			padding: 15px;
			max-width: 300px;
			max-height: 400px;
		}

		.legend h3 {
			font-size: 16px;
		}

		.legend-section h4 {
			font-size: 12px;
		}

		.legend-item {
			font-size: 11px;
		}

		.legend-color {
			width: 15px;
			height: 15px;
		}

		.tip-item {
			font-size: 10px;
		}

		.game-over {
			padding: 30px;
		}

		.game-over h2 {
			font-size: 2em;
		}

		.pause-overlay {
			padding: 20px;
		}

		.pause-overlay h2 {
			font-size: 18px;
		}

		.pause-overlay p {
			font-size: 11px;
		}

		.mouse-indicator {
			padding: 10px;
		}

		.indicator-text {
			font-size: 12px;
		}
	}

	.movement-status {
		position: absolute;
		top: 80px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		padding: 8px 15px;
		border-radius: 5px;
		color: white;
		font-family: 'Courier New', monospace;
		text-align: center;
		pointer-events: none;
	}

	.status-text {
		font-size: 12px;
		color: #ffaa00;
	}
</style> 