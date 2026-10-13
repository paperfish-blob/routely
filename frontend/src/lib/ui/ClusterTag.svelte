<script lang="ts">
	import type { ClusterStyle } from '../clusters.ts';

	let { cluster }: { cluster: ClusterStyle } = $props();
</script>

<span class="ctag {cluster.colorClass}" title="Cluster {cluster.letter}">{cluster.letter}</span>
