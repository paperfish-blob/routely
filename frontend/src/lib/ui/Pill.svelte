<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	let { icon, children }: { icon?: IconName; children: Snippet } = $props();
</script>

<span class="pill num">
	{#if icon}<Icon name={icon} />{/if}
	{@render children()}
</span>
