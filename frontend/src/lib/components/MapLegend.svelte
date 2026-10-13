<script lang="ts">
	import { dayClass } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';

	/** 'suggest': current vs suggested route. 'day': the selected day vs others. 'all': one line per day. */
	let { mode, itinerary }: { mode: 'suggest' | 'day' | 'all'; itinerary: ItineraryState } = $props();
</script>

<div class="legend" data-name="MapLegend">
	{#if mode === 'suggest'}
		<div>
			<svg viewBox="0 0 34 8" aria-hidden="true"><path class="route cur" d="M1 4H33" /></svg>
			Current route
		</div>
		<div>
			<svg viewBox="0 0 34 8" aria-hidden="true"><path class="route sug" d="M1 4H33" /></svg>
			Suggested route
		</div>
	{:else if mode === 'day'}
		<div>
			<svg viewBox="0 0 34 8" aria-hidden="true"><path class="route" d="M1 4H33" /></svg>
			Day {itinerary.activeDay ? itinerary.dayIndex(itinerary.activeDay.id) + 1 : ''} (selected)
		</div>
		<div>
			<svg viewBox="0 0 34 8" aria-hidden="true"><path class="route dimmed" d="M1 4H33" /></svg>
			Other days
		</div>
		{#if itinerary.transfers.length > 0}
			<div>
				<svg viewBox="0 0 34 8" aria-hidden="true"><path class="route xf" d="M1 4H33" /></svg>
				Overnight transfer
			</div>
		{/if}
	{:else}
		{#each itinerary.days as day, i (day.id)}
			<div class={dayClass(i)}>
				<svg viewBox="0 0 34 8" aria-hidden="true"><path class="route rc" d="M1 4H33" /></svg>
				Day {i + 1}{day.title ? ` · ${day.title}` : ''}
			</div>
		{/each}
		{#if itinerary.transfers.length > 0}
			<div>
				<svg viewBox="0 0 34 8" aria-hidden="true"><path class="route xf" d="M1 4H33" /></svg>
				Overnight transfer
			</div>
		{/if}
	{/if}
</div>
