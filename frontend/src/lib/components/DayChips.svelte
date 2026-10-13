<script lang="ts">
	import { dayCaption, dayClass } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Icon } from '#lib/ui/index.ts';

	let { itinerary, onadd }: { itinerary: ItineraryState; onadd: () => void } = $props();
</script>

<div class="mdays" role="tablist" aria-label="Trip days" data-name="DayChips">
	<button class="dchip {itinerary.isAll ? 'sel' : ''}" role="tab" aria-selected={itinerary.isAll} onclick={() => itinerary.setActive(null)}>
		<Icon name="layers" size="sm" />All
	</button>
	{#each itinerary.days as day, i (day.id)}
		{@const sel = day.id === itinerary.activeId}
		<button
			class="dchip {dayClass(i)} {sel ? 'sel' : ''} {itinerary.dropDayId === day.id ? 'drop' : ''}"
			role="tab"
			aria-selected={sel}
			data-drop-day={day.id}
			onclick={() => itinerary.setActive(day.id)}
		>
			<span class="dtag">D{i + 1}</span>{dayCaption(itinerary.startDate, i, day.stops.length).replace(/^(\w{3}) (\d+) \w{3}$/, '$1 $2')}
		</button>
	{/each}
	<button class="dchip add" aria-label="Add a day" onclick={onadd}><Icon name="plus" size="sm" /></button>
</div>
