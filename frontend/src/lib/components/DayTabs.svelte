<script lang="ts">
	import { dayCaption, dayClass } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Icon } from '#lib/ui/index.ts';
	import { formatTemp, glance } from '#lib/weather.ts';
	import DayGlance from './DayGlance.svelte';

	let { itinerary, onadd }: { itinerary: ItineraryState; onadd: () => void } = $props();

	let strip = $state<HTMLDivElement>();

	/** Trip-wide range for the All tab, once every day has its weather. */
	const tripGlance = $derived.by(() => {
		const all = itinerary.days.map((d) => itinerary.dayWeather(d)).filter((w) => w.kind !== 'hidden');
		if (all.length === 0 || all.some((w) => w.kind !== 'ok')) return null;
		return glance(all.flatMap((w) => w.readings));
	});
	const weatherOn = $derived(!!itinerary.startDate);

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
			class="dtab {weatherOn ? 'wxon' : ''} {itinerary.isAll ? 'sel' : ''}"
			role="tab"
			aria-selected={itinerary.isAll}
			tabindex={itinerary.isAll ? 0 : -1}
			onclick={() => itinerary.setActive(null)}
		>
			<b><Icon name="layers" size="sm" />All</b>
			<span>{itinerary.days.length} days · {itinerary.totalStopCount} {itinerary.totalStopCount === 1 ? 'stop' : 'stops'}</span>
			{#if weatherOn}
				<span class="wx">{#if tripGlance}{formatTemp(tripGlance.low, itinerary.tempUnit)}–{formatTemp(tripGlance.high, itinerary.tempUnit)}{:else}&nbsp;{/if}</span>
			{/if}
		</button>
		{#each itinerary.days as day, i (day.id)}
			{@const sel = day.id === itinerary.activeId}
			<button
				class="dtab {weatherOn ? 'wxon' : ''} {dayClass(i)} {sel ? 'sel' : ''} {itinerary.dropDayId === day.id ? 'drop' : ''}"
				role="tab"
				aria-selected={sel}
				tabindex={sel ? 0 : -1}
				data-drop-day={day.id}
				onclick={() => itinerary.setActive(day.id)}
			>
				<b><i></i>Day {i + 1}</b>
				<span>{dayCaption(itinerary.startDate, i, day.stops.length)}</span>
				{#if weatherOn}<DayGlance {itinerary} {day} />{/if}
			</button>
		{/each}
		<button class="dtab add {weatherOn ? 'wxon' : ''}" aria-label="Add a day" onclick={onadd}>
			<Icon name="plus" size="sm" />Add day
		</button>
	</div>
</div>
