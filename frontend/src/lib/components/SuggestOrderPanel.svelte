<script lang="ts">
	import { clusterStyleAt } from '#lib/clusters.ts';
	import { formatKm } from '#lib/format.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Badge, Banner, Button, Icon, IconButton, Skeleton } from '#lib/ui/index.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	const proposal = $derived(itinerary.activeProposal);
	const changes = $derived(itinerary.proposalChangesOrder);
	const stops = $derived(itinerary.stops);
	const nameOf = (id: string) => itinerary.stopById(id)?.name ?? '?';
	const numberOf = (id: string) => stops.findIndex((s) => s.id === id) + 1;

	/** Straight-line distance between two stops, from the already-fetched matrix. */
	function leg(a: string, b: string): number | null {
		const s = itinerary.summary;
		if (!s) return null;
		const i = s.stop_ids.indexOf(a);
		const j = s.stop_ids.indexOf(b);
		return i < 0 || j < 0 ? null : s.matrix_km[i][j];
	}

	const percent = $derived(
		proposal && proposal.original_total_km > 0
			? Math.round((proposal.km_saved / proposal.original_total_km) * 100)
			: 0
	);

	/** Minutes saved, estimated from the current road route's time per straight-line km. */
	const minutesFaster = $derived.by(() => {
		const secs = itinerary.totalSeconds;
		const straight = itinerary.summary?.total_km;
		if (!proposal || !secs || !straight) return null;
		const m = Math.round(((secs / straight) * proposal.km_saved) / 60);
		return m >= 1 ? m : null;
	});

	const suggestedOrder = $derived(proposal?.order ?? []);
	const movedIds = $derived(
		new Set(suggestedOrder.filter((id, i) => stops[i]?.id !== id))
	);
	const styleOf = (id: string) => itinerary.styleOf(id) ?? clusterStyleAt(0);
</script>

<div class="panel auto" role="dialog" aria-labelledby="sug-title" data-name="SuggestOrderPanel">
	<div class="panel-h">
		<div style="flex: 1">
			<h2 id="sug-title">Suggested order</h2>
			<p>
				Shortest straight-line distance across all {stops.length} stops.
				{#if proposal && changes && suggestedOrder[0] !== stops[0]?.id}
					The start moves to {nameOf(suggestedOrder[0])}.
				{/if}
			</p>
		</div>
		<IconButton label="Close preview" icon="close" onclick={() => itinerary.closeSuggest()} />
	</div>

	<div class="panel-sec">
		<label>
			<input
				type="checkbox"
				checked={itinerary.suggestKeepStart}
				disabled={itinerary.optimizing}
				onchange={(e) => itinerary.setSuggestKeepStart(e.currentTarget.checked)}
			/>
			Keep {stops[0] ? stops[0].name : 'the first stop'} as the start
		</label>
	</div>

	{#if itinerary.optimizing}
		<div role="status" aria-label="Finding a better order" style="padding: var(--sp-18) var(--sp-22); display: flex; flex-direction: column; gap: var(--sp-12)">
			<Skeleton width="100%" height="76px" radius="var(--r-xl)" />
			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-14)">
				{#each [0, 1] as c (c)}
					<div style="display: flex; flex-direction: column; gap: var(--sp-8)">
						{#each [0, 1, 2, 3] as r (r)}<Skeleton width="100%" height="38px" radius="var(--r-md)" />{/each}
					</div>
				{/each}
			</div>
		</div>
	{:else if itinerary.optimizeError}
		<div style="padding: var(--sp-18) var(--sp-22)">
			<Banner variant="err">
				Couldn’t optimise: {itinerary.optimizeError}
				{#snippet actions()}
					<Button variant="secondary" size="sm" onclick={() => itinerary.openSuggest()}>Retry</Button>
				{/snippet}
			</Banner>
		</div>
	{:else if proposal && !changes}
		<div style="padding: var(--sp-18) var(--sp-22)">
			<Banner variant="ok">Your order is already the shortest we can find.</Banner>
		</div>
	{:else if proposal}
		<div class="saving" data-name="SavingsHighlight">
			<span class="ic"><Icon name="sparkles" /></span>
			<div>
				<div class="big num">Saves {formatKm(proposal.km_saved)}{percent > 0 ? ` · ${percent}%` : ''}</div>
				<div class="sub num">
					{formatKm(proposal.original_total_km)} → {formatKm(proposal.new_total_km)}{#if minutesFaster} · about {minutesFaster} min faster{/if}
				</div>
			</div>
		</div>
		<div class="cmp" data-name="OrderComparison">
			<div class="col" data-name="CurrentOrder">
				<h3>CURRENT ORDER</h3>
				{#each stops as stop, i (stop.id)}
					<div class="mrow">
						<Badge n={i + 1} cluster={styleOf(stop.id)} small /><span class="n">{stop.name}</span>
					</div>
					{#if i < stops.length - 1}
						<div class="mleg num"><span>{formatKm(leg(stop.id, stops[i + 1].id) ?? 0)}</span></div>
					{/if}
				{/each}
				<div class="num" style="margin-top: var(--sp-12); font-weight: var(--fw-extrabold); font-size: var(--fs-body-lg)">
					{formatKm(proposal.original_total_km)}
				</div>
			</div>
			<div class="col" data-name="SuggestedOrder">
				<h3>SUGGESTED ORDER</h3>
				{#each suggestedOrder as id, i (id)}
					{@const was = numberOf(id)}
					<div class="mrow {movedIds.has(id) ? 'moved' : ''}">
						<Badge n={i + 1} cluster={styleOf(id)} small /><span class="n">{nameOf(id)}</span>
						{#if movedIds.has(id)}
							<span class="mv">
								<Icon name={was > i + 1 ? 'arrow-up' : 'arrow-down'} size="sm" />
								<span class="sr">moved {was > i + 1 ? 'up' : 'down'} from {was}</span>
							</span>
						{/if}
					</div>
					{#if i < suggestedOrder.length - 1}
						<div class="mleg num"><span>{formatKm(leg(id, suggestedOrder[i + 1]) ?? 0)}</span></div>
					{/if}
				{/each}
				<div class="num" style="margin-top: var(--sp-12); font-weight: var(--fw-extrabold); font-size: var(--fs-body-lg)">
					{formatKm(proposal.new_total_km)}
				</div>
			</div>
		</div>
	{/if}

	<div class="panel-f">
		<Button variant="secondary" data-name="KeepCurrentButton" onclick={() => itinerary.closeSuggest()}>Keep current</Button>
		<Button icon="check" data-name="ApplyNewOrderButton" disabled={!proposal || !changes || itinerary.optimizing} onclick={() => itinerary.applyProposal()}>
			Apply new order
		</Button>
	</div>
</div>
