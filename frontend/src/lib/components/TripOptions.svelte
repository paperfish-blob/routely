<script lang="ts">
	import { formatTripRange } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { IconButton, Menu, MenuItem } from '#lib/ui/index.ts';

	let { itinerary, ontripdates, onaddday }: { itinerary: ItineraryState; ontripdates: () => void; onaddday: () => void } = $props();

	let open = $state(false);
	let trigger = $state<HTMLElement | null>(null);

	const act = (fn: () => void) => () => {
		open = false;
		fn();
	};
	function clearAll() {
		if (confirm('Remove all days and stops from this trip?')) itinerary.clear();
	}
</script>

<span bind:this={trigger} style="display: inline-flex">
	<IconButton label="Trip options" icon="sliders" aria-haspopup="menu" aria-expanded={open} class={open ? 'hov' : ''} onclick={() => (open = !open)} />
</span>
<Menu {open} onclose={() => (open = false)} label="Trip options" anchor={trigger}>
	<MenuItem icon="calendar" hint={formatTripRange(itinerary.startDate, itinerary.days.length) ?? 'Not set'} onclick={act(ontripdates)}>Trip dates…</MenuItem>
	<MenuItem icon="plus" onclick={act(onaddday)}>Add a day…</MenuItem>
	<MenuItem icon="home" checked={itinerary.useBase} onclick={() => itinerary.setUseBase(!itinerary.useBase)}>Fixed start and end points</MenuItem>
	<div class="msep"></div>
	<MenuItem icon="trash" danger disabled={itinerary.totalStopCount === 0 && itinerary.days.length < 2} onclick={act(clearAll)}>Clear whole trip</MenuItem>
</Menu>
