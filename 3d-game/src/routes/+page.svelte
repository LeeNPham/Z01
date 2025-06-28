<script lang="ts">
	import Game from '$lib/components/Game.svelte';
</script>

<svelte:head>
	<title>3D Runner Game</title>
	<meta name="description" content="A fun 3D runner game built with SvelteKit and Three.js" />
</svelte:head>

<main>
	<Game />
</main>

<style>
	main {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
	}
</style> 