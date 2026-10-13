<script lang="ts">
	import { describeCluster } from '#lib/clusters.ts';
	import { durationParts, formatKmValue } from '#lib/format.ts';
	import { CLUSTER_PRESETS_KM, type ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Banner, Button, ClusterChip, Icon, SegmentedControl, Skeleton } from '#lib/ui/index.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	const day = $derived(itinerary.activeDay);
	const stopCount = $derived(itinerary.stops.length);
	const summary = $derived(itinerary.summary);
	const stats = $derived(day ? itinerary.dayStats(day) : null);
	const time = $derived(stats?.seconds == null ? null : durationParts(stats.seconds));
	const timeLabel = $derived(
		itinerary.routeMode === 'walking' ? 'WALK TIME' : itinerary.routeMode === 'driving' ? 'DRIVE TIME' : 'TRAVEL TIME'
	);
	const presets = CLUSTER_PRESETS_KM.map((n) => ({ value: String(n), label: `${n} km` }));
	const trip = $derived(itinerary.tripTotals);
	/** "A → B" when the day ends somewhere other than where it started. */
	const routeText = $derived.by(() => {
		if (!day) return '';
		const e = itinerary.endsOf(day);
		return e.start && e.end && day.end.kind !== 'start' ? `${e.start.name} → ${e.end.name}` : '';
	});
	const tripTime = $derived(trip.seconds === null ? null : durationParts(trip.seconds));

	/** Clusters need two stops; a lone stop (with a base) still has distances to show. */
	const showClusters = $derived(stopCount >= 2 && itinerary.clusterInfos.length > 0);
	const loading = $derived(!itinerary.loaded || (stopCount >= 2 && !summary && !itinerary.summaryError));
	/** One stop has no distances to show, unless a base gives it a leg there and back. */
	const hasNumbers = $derived(stats !== null && stats.km !== null && (stopCount >= 2 || (stopCount === 1 && itinerary.hasBase)));
</script>

{#if itinerary.summaryError && !summary && stopCount >= 2}
	<div style="margin: 0 var(--sp-16) var(--sp-16)">
		<Banner variant="err">
			Couldn’t calculate distances. {itinerary.summaryError}
			{#snippet actions()}
				<Button variant="secondary" size="sm" onclick={() => itinerary.retrySummary()}>Retry</Button>
			{/snippet}
		</Banner>
	</div>
{:else if loading}
	<section class="sum" role="status" aria-label="Calculating trip summary" data-name="SummaryCard/Loading" style="box-shadow: none">
		<div class="sum-row">
			{#each [[70, 90], [60, 80], [50, 40]] as [a, b], n (n)}
				<div style="display: flex; flex-direction: column; gap: var(--sp-8)">
					<Skeleton width="{a}%" height="10px" />
					<Skeleton width="{b}%" height="22px" />
				</div>
			{/each}
		</div>
		<div style="display: flex; gap: var(--sp-8)">
			<Skeleton width="130px" height="32px" radius="var(--r-pill)" />
			<Skeleton width="110px" height="32px" radius="var(--r-pill)" />
		</div>
	</section>
{:else if hasNumbers && stats}
	<section class="sum" aria-label={itinerary.multiDay ? 'Day summary' : 'Trip summary'} aria-busy={itinerary.summaryLoading} data-name="SummaryCard">
		{#if itinerary.summaryError}
			<Banner variant="err">
				Couldn’t update distances. {itinerary.summaryError}
				{#snippet actions()}
					<Button variant="secondary" size="sm" onclick={() => itinerary.retrySummary()}>Retry</Button>
				{/snippet}
			</Banner>
		{/if}
		<div class="sum-row">
			<div class="stat">
				<div class="k">{itinerary.multiDay ? 'DAY DISTANCE' : 'TOTAL DISTANCE'}</div>
				<div class="v num">{stats.approx ? '≈ ' : ''}{formatKmValue(stats.km ?? 0)} <small>km</small></div>
			</div>
			<div class="stat">
				<div class="k">{timeLabel}</div>
				{#if time}
					<div class="v num">{time.main} <small>{time.unit}</small></div>
				{:else}
					<div class="v num" title="Switch to Driving or Walking for travel time">—</div>
				{/if}
			</div>
			<div class="stat">
				<div class="k">STOPS</div>
				<div class="v num">{stopCount}</div>
			</div>
		</div>
		{#if showClusters}
			<div style="display: flex; flex-direction: column; gap: var(--sp-8)">
				<div class="row-between">
					<span class="lbl">PROXIMITY CLUSTERS</span>
					<SegmentedControl
						size="sm"
						label="Group stops within this distance"
						options={presets}
						value={String(itinerary.clusterThresholdKm)}
						onchange={(v) => itinerary.setClusterThreshold(Number(v))}
					/>
				</div>
				<div class="chips">
					{#each itinerary.clusterInfos as info (info.id)}
						<ClusterChip cluster={info.style} text={describeCluster(info)} />
					{/each}
				</div>
			</div>
		{/if}
		{#if routeText}
			<div class="tripline" data-name="RouteLine"><span>Day runs <b>{routeText}</b></span></div>
		{/if}
		{#if itinerary.multiDay}
			<div class="tripline" data-name="TripLine">
				<span>
					Whole trip <b class="num">{trip.ready ? `${trip.approx ? '≈ ' : ''}${formatKmValue(trip.km ?? 0)} km` : '…'}</b>
					{#if tripTime}· <span class="num">{tripTime.main}{tripTime.unit ? ` ${tripTime.unit}` : ''}</span>{/if}
				</span>
				<a href="#all-days" onclick={(e) => { e.preventDefault(); itinerary.setActive(null); }}>All days<Icon name="chevron-right" size="sm" /></a>
			</div>
		{/if}
	</section>
{/if}
