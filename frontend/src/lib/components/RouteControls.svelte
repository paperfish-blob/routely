<script lang="ts">
	import { describeFallback, formatDuration, formatKm } from '#lib/format.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import type { RouteMode } from '#lib/types.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	const MODES: { value: RouteMode; label: string }[] = [
		{ value: 'straight', label: 'Straight line' },
		{ value: 'driving', label: 'Driving' },
		{ value: 'walking', label: 'Walking' }
	];

	const route = $derived(itinerary.activeRoute);
	const enabled = $derived(itinerary.stops.length >= 2);
</script>

<section class="controls" aria-label="Route display">
	<div class="segmented" role="radiogroup" aria-label="Route type">
		{#each MODES as m (m.value)}
			<button
				type="button"
				role="radio"
				aria-checked={itinerary.routeMode === m.value}
				class:on={itinerary.routeMode === m.value}
				onclick={() => itinerary.setRouteMode(m.value)}>{m.label}</button
			>
		{/each}
	</div>

	{#if enabled && itinerary.routeMode !== 'straight'}
		<div class="status" aria-live="polite">
			{#if itinerary.routeError}
				<p class="warn" role="alert">
					Couldn’t get a road route ({itinerary.routeError}). Showing straight lines.
				</p>
			{:else if itinerary.routeLoading && !route}
				<p class="info"><span class="spinner" aria-hidden="true"></span> Finding {itinerary.routeMode} route…</p>
			{:else if route?.fallback}
				<p class="warn" role="alert">
					Showing straight lines: {describeFallback(route.fallback_reason)}. Distance is a straight-line
					estimate, not a road route.
				</p>
			{:else if route}
				<p class="info">
					<strong>{formatKm(route.distance_km)}</strong> · {formatDuration(route.duration_s)}
					{route.mode === 'walking' ? 'on foot' : 'by car'}
					{#if itinerary.routeLoading}<span class="spinner" aria-label="Updating"></span>{/if}
				</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	.segmented {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 3px;
		gap: 3px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	button {
		padding: 0.4rem 0.3rem;
		border: 0;
		border-radius: 7px;
		background: none;
		font-size: 0.82rem;
		color: var(--muted);
		cursor: pointer;
	}
	button.on {
		background: var(--brand);
		color: #fff;
		font-weight: 600;
	}
	.status p {
		margin: 0.5rem 0 0;
		padding: 0.5rem 0.65rem;
		border-radius: var(--radius);
		font-size: 0.83rem;
	}
	.info {
		background: var(--brand-soft);
	}
	.warn {
		background: var(--accent-soft);
		color: #7c4a03;
	}
	.spinner {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		vertical-align: -0.1rem;
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
