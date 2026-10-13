<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	let { icon, dashed = false, children }: { icon?: IconName; dashed?: boolean; children: Snippet } = $props();
</script>

<span class="pill num {dashed ? 'dash' : ''}">
	{#if icon}<Icon name={icon} />{/if}
	{@render children()}
</span>
