<script lang="ts">
	import type { ClusterStyle } from '../clusters.ts';
	import { badgeClass } from './classes.ts';

	let {
		n,
		cluster,
		small = false
	}: { n: number | string; cluster: ClusterStyle; small?: boolean } = $props();
</script>

<span class="{badgeClass(cluster, small)} num">{n}</span>
