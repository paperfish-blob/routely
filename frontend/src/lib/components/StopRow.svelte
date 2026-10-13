<script lang="ts">
	import type { ClusterStyle } from '#lib/clusters.ts';
	import type { Stop } from '#lib/types.ts';
	import { placeSubtitle } from '#lib/format.ts';
	import { Badge, ClusterTag, Icon, IconButton } from '#lib/ui/index.ts';

	interface Props {
		stop: Stop;
		index: number;
		cluster: ClusterStyle;
		selected?: boolean;
		onselect: () => void;
		onremove: () => void;
		onkeymove: (e: KeyboardEvent) => void;
	}

	let { stop, index, cluster, selected = false, onselect, onremove, onkeymove }: Props = $props();
</script>

<div class="stop {selected ? 'sel' : ''}" data-id={stop.id} data-name={selected ? 'StopRow/Selected' : 'StopRow/Default'}>
	<button class="grip" aria-label="Reorder {stop.name}. Use arrow keys or drag." onkeydown={onkeymove}>
		<Icon name="grip" />
	</button>
	<Badge n={index + 1} {cluster} />
	<button class="txt" aria-pressed={selected} onclick={onselect}>
		<span class="nm">{stop.name}</span>
		<span class="sb">{placeSubtitle(stop.address, stop.name)}</span>
	</button>
	<ClusterTag {cluster} />
	<IconButton label="Remove {stop.name}" icon="trash" onclick={onremove} />
</div>
