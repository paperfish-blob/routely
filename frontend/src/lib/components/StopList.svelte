<script lang="ts">
	import { tick } from 'svelte';
	import { moveItem } from '#lib/format.ts';
	import { sortable } from '#lib/sortable.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Skeleton } from '#lib/ui/index.ts';
	import LegConnector from './LegConnector.svelte';
	import StopRow from './StopRow.svelte';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	let listEl = $state<HTMLDivElement>();
	const ids = $derived(itinerary.stops.map((s) => s.id));

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
{:else}
	<div
		class="stops"
		role="list"
		aria-label="Itinerary stops"
		data-name="StopList"
		bind:this={listEl}
		use:sortable={{ item: '.stop', handle: '.grip', onMove: move }}
	>
		{#each itinerary.stops as stop, i (stop.id)}
			<StopRow
				{stop}
				index={i}
				cluster={itinerary.styleOf(stop.id)}
				selected={stop.id === itinerary.selectedId}
				onselect={() => itinerary.select(stop.id === itinerary.selectedId ? null : stop.id)}
				onremove={() => itinerary.removeStop(stop.id)}
				onkeymove={(e) => onGripKey(e, i, stop.id)}
			/>
			{#if i < itinerary.stops.length - 1}
				{@const leg = itinerary.legAfter(stop.id)}
				{#if leg}
					<LegConnector km={leg.km} seconds={leg.seconds} approx={leg.approx} mode={itinerary.effectiveMode} />
				{:else}
					<div class="leg"><Skeleton width="112px" height="22px" radius="var(--r-pill)" /></div>
				{/if}
			{/if}
		{/each}
	</div>
{/if}
