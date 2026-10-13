<script lang="ts">
	import { formatKm } from '#lib/format.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	const summary = $derived(itinerary.summary);
	const name = (id: string) => itinerary.stopById(id)?.name ?? '?';
	const numberOf = (id: string) => itinerary.stops.findIndex((s) => s.id === id) + 1;
	const groups = $derived((summary?.clusters ?? []).filter((c) => c.stop_ids.length > 1));
</script>

<section class="summary" aria-label="Trip summary" aria-busy={itinerary.summaryLoading}>
	<h2>
		Summary
		{#if itinerary.summaryLoading}<span class="spinner" role="status" aria-label="Updating"></span>{/if}
	</h2>

	{#if itinerary.stops.length < 2}
		<p class="muted">Add at least two stops to see distances.</p>
	{:else}
		{#if itinerary.summaryError}
			<p class="error" role="alert">Couldn’t update distances: {itinerary.summaryError}</p>
		{/if}

		{#if summary}
			<div class="total">
				<span class="label">Total distance</span>
				<span class="value">{formatKm(summary.total_km)}</span>
				<span class="note">straight-line, in stop order</span>
			</div>

			<h3>Legs</h3>
			<ul class="legs">
				{#each summary.legs as leg (leg.from_id)}
					<li>
						<span class="path">{numberOf(leg.from_id)} {name(leg.from_id)} → {numberOf(leg.to_id)} {name(leg.to_id)}</span>
						<span class="km">{formatKm(leg.distance_km)}</span>
					</li>
				{/each}
			</ul>

			<h3>Nearby groups <span class="muted">(within {summary.cluster_threshold_km} km)</span></h3>
			{#if groups.length === 0}
				<p class="muted">No stops are within {summary.cluster_threshold_km} km of each other.</p>
			{:else}
				<ul class="groups">
					{#each groups as g, i (g.id)}
						<li>
							<span class="gname">Group {i + 1}</span>
							{g.stop_ids.map((id) => `${numberOf(id)} ${name(id)}`).join(', ')}
						</li>
					{/each}
				</ul>
			{/if}
		{:else if !itinerary.summaryError}
			<p class="muted">Calculating…</p>
		{/if}
	{/if}
</section>

<style>
	.summary {
		margin-top: 1rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		margin: 0.5rem 0;
	}
	h3 {
		font-size: 0.82rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 1rem 0 0.35rem;
	}
	.muted {
		color: var(--muted);
		font-size: 0.85rem;
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}
	p {
		margin: 0.3rem 0;
	}
	.error {
		padding: 0.5rem 0.65rem;
		border-radius: var(--radius);
		background: #fef2f2;
		color: var(--danger);
		font-size: 0.85rem;
	}
	.total {
		display: grid;
		gap: 0.1rem;
		padding: 0.7rem 0.85rem;
		border-radius: var(--radius);
		background: var(--brand-soft);
	}
	.total .label {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.total .value {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--brand);
	}
	.total .note {
		font-size: 0.74rem;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.85rem;
	}
	.legs li {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--border);
	}
	.path {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.km {
		flex: none;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.groups li {
		padding: 0.3rem 0;
	}
	.gname {
		display: inline-block;
		margin-right: 0.4rem;
		padding: 0 0.4rem;
		border-radius: 4px;
		background: var(--accent-soft);
		font-weight: 600;
		font-size: 0.78rem;
	}
	.spinner {
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid var(--border);
		border-top-color: var(--brand);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
