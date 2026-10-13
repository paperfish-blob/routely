<script lang="ts">
	import { placeIcon } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Icon } from '#lib/ui/index.ts';

	/** Mobile: start and end collapse into one tappable row that opens the editor. */
	let { itinerary }: { itinerary: ItineraryState } = $props();

	const day = $derived(itinerary.activeDay);
	const ends = $derived(day ? itinerary.endsOf(day) : { start: null, end: null });
	const loop = $derived(day?.end.kind === 'start');
	const label = $derived(
		`Day ${day ? itinerary.dayIndex(day.id) + 1 : ''} runs from ${ends.start?.name ?? 'no start'} to ${day?.end.kind === 'open' ? 'the last stop' : (ends.end?.name ?? 'no end')}. Edit start and end`
	);
</script>

{#if day}
	<div style="padding: 0 var(--sp-16) var(--sp-8); flex: none">
		<button class="route-ends" data-name="RouteEnds" aria-label={label} onclick={() => itinerary.openEndsEditor(day.id, ends.start ? 'end' : 'start')}>
			{#if ends.start}
				<span class="base-ico"><Icon name={placeIcon(ends.start.name, 'home')} /></span>
				<span class="re-t">
					<span class="cap">{loop ? 'START & END' : 'START'}</span>
					<span class="nm">{ends.start.name}</span>
				</span>
				{#if !loop}
					<Icon name="arrow-right" class="arrow" />
					{#if ends.end}
						<span class="base-ico end"><Icon name={placeIcon(ends.end.name, 'flag')} /></span>
						<span class="re-t">
							<span class="cap">END</span>
							<span class="nm">{ends.end.name}</span>
						</span>
					{:else}
						<span class="re-t"><span class="cap">END</span><span class="nm">Last stop</span></span>
					{/if}
				{/if}
			{:else}
				<span class="base-ico"><Icon name="home" /></span>
				<span class="re-t">
					<span class="cap">START &amp; END</span>
					<span class="nm">Where does Day {itinerary.dayIndex(day.id) + 1} begin?</span>
				</span>
			{/if}
			<Icon name="chevron-right" class="arrow" />
		</button>
	</div>
{/if}
