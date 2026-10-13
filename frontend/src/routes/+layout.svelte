<script lang="ts">
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import '#lib/styles/components.css';
	import '#lib/styles/layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>Routely</title>
	<meta name="description" content="Plan a multi-stop itinerary and see distances on a map." />
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
