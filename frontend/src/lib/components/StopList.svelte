<script lang="ts">
	import { tick } from 'svelte';
	import { formatDuration, formatKm, moveItem } from '#lib/format.ts';
	import { sortable } from '#lib/sortable.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	let listEl: HTMLOListElement | undefined = $state();

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

{#if itinerary.stops.length === 0}
	<div class="empty">
		<p><strong>No stops yet.</strong></p>
		<p>Search for a place above to start building your itinerary.</p>
	</div>
{:else}
	<ol class="stops" bind:this={listEl} use:sortable={{ handle: '.grip', onMove: move }}>
		{#each itinerary.stops as stop, i (stop.id)}
			{@const selected = stop.id === itinerary.selectedId}
			{@const nearest = selected ? itinerary.nearestOf(stop.id) : null}
			{@const next = itinerary.legAfter(stop.id)}
			<li data-id={stop.id} class:selected>
				<div class="row">
					<button
						class="grip"
						aria-label={`Reorder ${stop.name}. Use arrow keys or drag.`}
						onkeydown={(e) => onGripKey(e, i, stop.id)}>⠿</button
					>
					<span class="num" aria-hidden="true">{i + 1}</span>
					<button
						class="body"
						aria-pressed={selected}
						onclick={() => itinerary.select(selected ? null : stop.id)}
					>
						<span class="name">{stop.name}</span>
						{#if stop.address && stop.address !== stop.name}
							<span class="addr">{stop.address}</span>
						{/if}
					</button>
					<button
						class="del"
						aria-label={`Remove ${stop.name}`}
						onclick={() => itinerary.removeStop(stop.id)}>✕</button
					>
				</div>
				{#if nearest}
					{@const other = itinerary.stopById(nearest.nearest_id)}
					<p class="nearest">
						Nearest stop: <strong>{other?.name ?? '—'}</strong> · {formatKm(nearest.distance_km)}
					</p>
				{/if}
				{#if next}
					<p class="leg" aria-label={`Distance to next stop ${formatKm(next.km)}`}>
						↓ {formatKm(next.km)}{next.seconds !== null ? ` · ${formatDuration(next.seconds)}` : ''}
					</p>
				{/if}
			</li>
		{/each}
	</ol>
{/if}

<style>
	.empty {
		padding: 1.25rem 0.5rem;
		text-align: center;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.empty p {
		margin: 0.2rem 0;
	}
	.stops {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		margin-bottom: 0.25rem;
	}
	li.selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-soft);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.4rem 0.4rem 0.2rem;
	}
	.grip {
		flex: none;
		width: 1.6rem;
		height: 2rem;
		border: 0;
		background: none;
		color: var(--muted);
		cursor: grab;
		touch-action: none;
		font-size: 1.1rem;
		border-radius: 6px;
	}
	.grip:hover {
		background: var(--brand-soft);
	}
	.num {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 0.78rem;
		font-weight: 700;
	}
	.selected .num {
		background: var(--accent);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		border: 0;
		background: none;
		padding: 0.15rem 0.2rem;
		cursor: pointer;
		font: inherit;
		color: inherit;
	}
	.name {
		font-weight: 600;
		font-size: 0.92rem;
	}
	.addr {
		max-width: 100%;
		font-size: 0.76rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.del {
		flex: none;
		width: 2rem;
		height: 2rem;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.del:hover {
		background: #fee2e2;
		color: var(--danger);
	}
	.nearest {
		margin: 0;
		padding: 0.1rem 0.8rem 0.55rem 3.9rem;
		font-size: 0.82rem;
		color: var(--text);
	}
	.leg {
		margin: 0;
		padding: 0 0.8rem 0.35rem 3.9rem;
		font-size: 0.74rem;
		color: var(--muted);
	}
	:global(.drag-ghost) {
		opacity: 0.4;
	}
	:global(.drag-chosen) {
		box-shadow: var(--shadow);
	}
</style>
