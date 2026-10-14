<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClusterStyle } from '../clusters.ts';

	let { cluster, text, children }: { cluster: ClusterStyle; text: string; children?: Snippet } = $props();
</script>

<span class="chip {cluster.colorClass}">
	<span class="l {cluster.shapeClass}">{cluster.letter}</span>
	{text}
	{@render children?.()}
</span>
