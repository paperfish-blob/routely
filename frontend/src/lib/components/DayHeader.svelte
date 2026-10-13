<script lang="ts">
	import { dayClass, dayDate, formatDayLong } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { IconButton, Menu, MenuItem } from '#lib/ui/index.ts';

	let { itinerary, ontripdates }: { itinerary: ItineraryState; ontripdates: () => void } = $props();

	const day = $derived(itinerary.activeDay);
	const index = $derived(day ? itinerary.dayIndex(day.id) : -1);
	const date = $derived(index >= 0 ? dayDate(itinerary.startDate, index) : null);
	const count = $derived(day?.stops.length ?? 0);
	const caption = $derived(
		[date ? formatDayLong(date) : null, count === 0 ? 'no stops yet' : `${count} ${count === 1 ? 'stop' : 'stops'}`]
			.filter(Boolean)
			.join(' · ')
	);

	let open = $state(false);
	let trigger = $state<HTMLElement | null>(null);
	let titleEl = $state<HTMLInputElement>();

	const act = (fn: () => void) => () => {
		open = false;
		fn();
	};
</script>

{#if day}
	<div class="dayhead {dayClass(index)}" data-name="DayHeader">
		<span class="dtag">D{index + 1}</span>
		<label class="sr" for="day-title">Day {index + 1} title</label>
		<input
			id="day-title"
			bind:this={titleEl}
			value={day.title}
			placeholder="Name this day (optional)"
			maxlength="80"
			oninput={(e) => itinerary.renameDay(day.id, e.currentTarget.value)}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
		/>
		<span bind:this={trigger} style="display: inline-flex">
			<IconButton
				label="Day {index + 1} options"
				icon="more"
				aria-haspopup="menu"
				aria-expanded={open}
				class={open ? 'hov' : ''}
				onclick={() => (open = !open)}
			/>
		</span>
		<Menu {open} onclose={() => (open = false)} label="Day {index + 1} options" anchor={trigger} class="day-menu">
			<MenuItem icon="pencil" onclick={act(() => titleEl?.focus())}>Rename day</MenuItem>
			<MenuItem icon="calendar" hint={itinerary.startDate ? undefined : 'Not set'} onclick={act(ontripdates)}>Trip dates…</MenuItem>
			<MenuItem icon="home" disabled={!itinerary.useBase} hint={itinerary.useBase ? undefined : 'Turned off'} onclick={act(() => itinerary.openEndsEditor(day.id, 'start'))}>Start &amp; end…</MenuItem>
			<MenuItem icon="arrow-left" disabled={index <= 0} onclick={act(() => itinerary.moveDay(day.id, -1))}>Move day earlier</MenuItem>
			<MenuItem icon="arrow-right" disabled={index >= itinerary.days.length - 1} onclick={act(() => itinerary.moveDay(day.id, 1))}>Move day later</MenuItem>
			<MenuItem icon="copy" onclick={act(() => itinerary.duplicateDayOf(day.id))}>Duplicate day</MenuItem>
			<div class="msep"></div>
			<MenuItem icon="sparkles" disabled={count < 3} hint={count < 3 ? 'Needs 3+ stops' : undefined} onclick={act(() => itinerary.openSuggest())}>
				Optimise this day’s order
			</MenuItem>
			<div class="msep"></div>
			<MenuItem icon="trash" disabled={count === 0} hint="Undo available" onclick={act(() => itinerary.clearDay(day.id))}>Clear stops</MenuItem>
			<MenuItem icon="trash" danger disabled={itinerary.days.length < 2} hint="Undo available" onclick={act(() => itinerary.removeDay(day.id))}>
				Delete day
			</MenuItem>
		</Menu>
	</div>
	<div class="daycap">{caption}</div>
{/if}
