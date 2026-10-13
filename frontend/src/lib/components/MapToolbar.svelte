<script lang="ts">
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import type { RouteMode } from '#lib/types.ts';
	import { Button, SegmentedControl, type SegmentOption } from '#lib/ui/index.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	const options: SegmentOption<RouteMode>[] = $derived([
		{ value: 'straight', label: 'Straight line', icon: 'line' },
		{ value: 'driving', label: 'Driving', icon: 'car', disabled: itinerary.routingDegraded },
		{ value: 'walking', label: 'Walking', icon: 'walk', disabled: itinerary.routingDegraded }
	]);
</script>

<div class="toolbar" data-name="MapToolbar">
	<SegmentedControl
		label="Travel mode"
		{options}
		value={itinerary.effectiveMode}
		onchange={(m) => itinerary.setRouteMode(m)}
	/>
	{#if !itinerary.suggestOpen}
		<Button
			variant="accent"
			icon="sparkles"
			disabled={itinerary.isAll || itinerary.stops.length < 3}
			title={itinerary.isAll
				? 'Pick a day to optimise its order'
				: itinerary.stops.length < 3
					? 'Add at least three stops to optimise the order'
					: undefined}
			onclick={() => itinerary.openSuggest()}
		>
			{#if itinerary.multiDay}
				{itinerary.isAll ? 'Optimise a day' : `Optimise Day ${itinerary.dayIndex(itinerary.activeId ?? '') + 1}`}
			{:else}
				Suggest better order
			{/if}
		</Button>
	{/if}
</div>
