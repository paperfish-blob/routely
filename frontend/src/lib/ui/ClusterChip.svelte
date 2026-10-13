<script lang="ts">
	import type { ClusterStyle } from '../clusters.ts';

	let { cluster, text }: { cluster: ClusterStyle; text: string } = $props();
</script>

<span class="chip {cluster.colorClass}">
	<span class="l {cluster.shapeClass}">{cluster.letter}</span>
	{text}
</span>
