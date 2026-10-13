<script lang="ts">
	import { dayCaption, dayClass } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Icon } from '#lib/ui/index.ts';

	let { itinerary, onadd }: { itinerary: ItineraryState; onadd: () => void } = $props();

	let strip = $state<HTMLDivElement>();

	// Keep the active tab in view when the strip scrolls.
	$effect(() => {
		void itinerary.activeId;
		strip?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
	});

	function onkeydown(e: KeyboardEvent) {
		const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!delta) return;
		const tabs = Array.from(strip?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
		const i = tabs.indexOf(document.activeElement as HTMLElement);
		if (i < 0) return;
		e.preventDefault();
		const next = tabs[(i + delta + tabs.length) % tabs.length];
		next.focus();
		next.click();
	}
</script>

<div class="daystrip" data-name="DayTabs">
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div class="days" role="tablist" aria-label="Trip days" tabindex="-1" bind:this={strip} {onkeydown}>
		<button
			class="dtab {itinerary.isAll ? 'sel' : ''}"
			role="tab"
			aria-selected={itinerary.isAll}
			tabindex={itinerary.isAll ? 0 : -1}
			onclick={() => itinerary.setActive(null)}
		>
			<b><Icon name="layers" size="sm" />All</b>
			<span>{itinerary.days.length} days · {itinerary.totalStopCount} {itinerary.totalStopCount === 1 ? 'stop' : 'stops'}</span>
		</button>
		{#each itinerary.days as day, i (day.id)}
			{@const sel = day.id === itinerary.activeId}
			<button
				class="dtab {dayClass(i)} {sel ? 'sel' : ''} {itinerary.dropDayId === day.id ? 'drop' : ''}"
				role="tab"
				aria-selected={sel}
				tabindex={sel ? 0 : -1}
				data-drop-day={day.id}
				onclick={() => itinerary.setActive(day.id)}
			>
				<b><i></i>Day {i + 1}</b>
				<span>{dayCaption(itinerary.startDate, i, day.stops.length)}</span>
			</button>
		{/each}
		<button class="dtab add" aria-label="Add a day" onclick={onadd}>
			<Icon name="plus" size="sm" />Add day
		</button>
	</div>
</div>
