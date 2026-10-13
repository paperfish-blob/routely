<script lang="ts">
	import { formatKm } from '#lib/format.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	let keepStart = $state(true);

	const proposal = $derived(itinerary.activeProposal);
	const name = (id: string) => itinerary.stopById(id)?.name ?? '?';
	const canSuggest = $derived(itinerary.stops.length >= 3 && !itinerary.optimizing);
</script>

{#if itinerary.stops.length >= 3}
	<section class="optimize" aria-label="Suggest a better order" aria-live="polite">
		{#if proposal}
			<div class="card">
				{#if itinerary.proposalChangesOrder}
					<p class="headline">
						Saves <strong>{formatKm(proposal.km_saved)}</strong>
						<span class="sub">{formatKm(proposal.original_total_km)} → {formatKm(proposal.new_total_km)} straight-line</span>
					</p>
					<ol class="preview">
						{#each proposal.order as id (id)}
							<li>{name(id)}</li>
						{/each}
					</ol>
					<p class="hint">Previewed on the map as the amber dashed line.</p>
					<div class="actions">
						<button class="primary" onclick={() => itinerary.acceptProposal()}>Accept order</button>
						<button onclick={() => itinerary.discardProposal()}>Discard</button>
					</div>
				{:else}
					<p class="headline">Your order is already the shortest we can find.</p>
					<div class="actions">
						<button onclick={() => itinerary.discardProposal()}>Dismiss</button>
					</div>
				{/if}
			</div>
		{:else}
			<button class="suggest" disabled={!canSuggest} onclick={() => itinerary.suggestOrder(keepStart)}>
				{#if itinerary.optimizing}
					<span class="spinner" aria-hidden="true"></span> Finding a better order…
				{:else}
					Suggest better order
				{/if}
			</button>
			<label class="keep">
				<input type="checkbox" bind:checked={keepStart} />
				Keep the first stop as the start
			</label>
			{#if itinerary.optimizeError}
				<p class="error" role="alert">Couldn’t optimize: {itinerary.optimizeError}</p>
			{/if}
		{/if}
	</section>
{/if}

<style>
	.optimize {
		display: grid;
		gap: 0.4rem;
	}
	.suggest {
		display: inline-flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: #7c4a03;
		font-weight: 600;
		cursor: pointer;
	}
	.suggest:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.keep {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.card {
		padding: 0.75rem;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.headline {
		margin: 0 0 0.4rem;
		font-size: 0.95rem;
	}
	.sub {
		display: block;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.preview {
		max-height: 9rem;
		overflow-y: auto;
		margin: 0;
		padding: 0.4rem 0.4rem 0.4rem 1.6rem;
		border-radius: 8px;
		background: var(--bg);
		font-size: 0.85rem;
	}
	.hint {
		margin: 0.4rem 0;
		font-size: 0.76rem;
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.actions button {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		cursor: pointer;
	}
	.actions .primary {
		border-color: var(--brand);
		background: var(--brand);
		color: #fff;
		font-weight: 600;
	}
	.error {
		margin: 0;
		padding: 0.5rem 0.65rem;
		border-radius: var(--radius);
		background: #fef2f2;
		color: var(--danger);
		font-size: 0.83rem;
	}
	.spinner {
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid #e8c88a;
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
