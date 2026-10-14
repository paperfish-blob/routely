<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { moveItem } from '#lib/format.ts';
	import { sortable } from '#lib/sortable.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Skeleton } from '#lib/ui/index.ts';
	import EndpointRow from './EndpointRow.svelte';
	import LegConnector from './LegConnector.svelte';
	import StartEndCard from './StartEndCard.svelte';
	import StopRow from './StopRow.svelte';

	/** `top` renders above the first row and scrolls with the list (the day's weather). `compact` (mobile) hides the start/end rows; the route row above the list stands in for them. */
	let { itinerary, empty, top, compact = false }: { itinerary: ItineraryState; empty?: Snippet; top?: Snippet; compact?: boolean } = $props();

	let listEl = $state<HTMLDivElement>();
	const day = $derived(itinerary.activeDay);
	const stops = $derived(itinerary.stops);
	const ids = $derived(stops.map((s) => s.id));
	const ends = $derived(day ? itinerary.endsOf(day) : null);
	/** Start/end rows appear once there is something to anchor: an end point, a first stop, or several days. */
	const withEnds = $derived(
		itinerary.useBase && !!day && !compact && (!!ends?.start || !!ends?.end || stops.length > 0 || itinerary.multiDay)
	);
	const editing = $derived(!!day && itinerary.endsEditor?.dayId === day.id);
	const shortName = (n: string) => (n.length > 14 ? `${n.slice(0, 13)}…` : n);

	function move(from: number, to: number) {
		itinerary.reorder(moveItem(ids, from, to));
	}

	async function onGripKey(e: KeyboardEvent, index: number, id: string) {
		const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
		if (!delta) return;
		e.preventDefault();
		move(index, index + delta);
		await tick();
		listEl?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .grip`)?.focus();
	}

	// Bring the selected row into view when selected from the map.
	$effect(() => {
		const id = itinerary.selectedId;
		if (!id) return;
		listEl
			?.querySelector(`[data-id="${CSS.escape(id)}"]`)
			?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});
</script>

{#if !itinerary.loaded}
	<div class="stops" role="status" aria-label="Loading itinerary" data-name="StopList/Loading">
		{#each [62, 48] as w, n (n)}
			<div class="stop" style="gap: var(--sp-12); padding: 0 var(--sp-12)">
				<Skeleton width="30px" height="30px" circle />
				<div style="flex: 1; display: flex; flex-direction: column; gap: var(--sp-8)">
					<Skeleton width="{w}%" height="12px" />
					<Skeleton width="{w - 24}%" height="10px" />
				</div>
				<Skeleton width="24px" height="24px" />
			</div>
			{#if n === 0}<div class="leg"><Skeleton width="112px" height="22px" radius="var(--r-pill)" /></div>{/if}
		{/each}
	</div>
{:else if day}
	<div
		class="stops"
		role="list"
		aria-label="Day {itinerary.dayIndex(day.id) + 1} stops"
		data-name="StopList"
		data-day-id={day.id}
		bind:this={listEl}
		use:sortable={{
			item: '[data-id]',
			handle: '.grip',
			onMove: move,
			onHoverDay: (id) => (itinerary.dropDayId = id),
			onDropDay: (old, dayId) => itinerary.moveStop(ids[old], dayId)
		}}
	>
		{@render top?.()}
		{#if withEnds}
			{#if editing}
				<StartEndCard {itinerary} dayId={day.id} focus={itinerary.endsEditor?.focus} onclose={() => itinerary.closeEndsEditor()} />
			{:else}
				<EndpointRow {itinerary} {day} position="start" />
			{/if}
		{/if}
		{#if stops.length > 0 && ends?.start}
			{@const lead = itinerary.startLegIn(day)}
			{#if lead}<LegConnector km={lead.km} seconds={lead.seconds} approx={lead.approx} mode={itinerary.effectiveMode} note={compact ? `from ${shortName(ends.start.name)}` : undefined} />{/if}
		{/if}

		{#each stops as stop, i (stop.id)}
			<StopRow
				{stop}
				index={i}
				cluster={itinerary.styleOf(stop.id)}
				selected={stop.id === itinerary.selectedId}
				{itinerary}
				onselect={() => itinerary.select(stop.id === itinerary.selectedId ? null : stop.id)}
				onkeymove={(e) => onGripKey(e, i, stop.id)}
			/>
			{#if i < stops.length - 1 || ends?.end}
				{@const leg = itinerary.legAfter(stop.id)}
				{@const last = i === stops.length - 1}
				{#if leg}
					<LegConnector km={leg.km} seconds={leg.seconds} approx={leg.approx} mode={itinerary.effectiveMode} note={compact && last && ends?.end ? `to ${shortName(ends.end.name)}` : undefined} />
				{:else}
					<div class="leg"><Skeleton width="112px" height="22px" radius="var(--r-pill)" /></div>
				{/if}
			{/if}
		{/each}

		{#if withEnds && stops.length > 0 && !editing && (ends?.end || day.end.kind === 'open')}
			<EndpointRow {itinerary} {day} position="end" />
		{/if}

		{#if stops.length === 0}{@render empty?.()}{/if}
	</div>
{/if}
