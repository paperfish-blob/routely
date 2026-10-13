<script lang="ts">
	import { describeCluster } from '#lib/clusters.ts';
	import { durationParts, formatKmValue } from '#lib/format.ts';
	import { CLUSTER_PRESETS_KM, type ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Banner, Button, ClusterChip, SegmentedControl, Skeleton } from '#lib/ui/index.ts';

	let { itinerary }: { itinerary: ItineraryState } = $props();

	const summary = $derived(itinerary.summary);
	const road = $derived(itinerary.roadGeometry !== null);
	const km = $derived(itinerary.totalKm);
	const time = $derived(itinerary.totalSeconds === null ? null : durationParts(itinerary.totalSeconds));
	const timeLabel = $derived(
		itinerary.routeMode === 'walking' ? 'WALK TIME' : itinerary.routeMode === 'driving' ? 'DRIVE TIME' : 'TRAVEL TIME'
	);
	const presets = CLUSTER_PRESETS_KM.map((n) => ({ value: String(n), label: `${n} km` }));
</script>

{#if itinerary.summaryError && !summary}
	<div style="margin: 0 var(--sp-16) var(--sp-16)">
		<Banner variant="err">
			Couldn’t calculate distances. {itinerary.summaryError}
			{#snippet actions()}
				<Button variant="secondary" size="sm" onclick={() => itinerary.retrySummary()}>Retry</Button>
			{/snippet}
		</Banner>
	</div>
{:else if !summary}
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
{:else}
	<section class="sum" aria-label="Trip summary" aria-busy={itinerary.summaryLoading} data-name="SummaryCard">
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
				<div class="k">TOTAL DISTANCE</div>
				<div class="v num">{road ? '' : '≈ '}{km === null ? '—' : formatKmValue(km)} <small>km</small></div>
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
				<div class="v num">{itinerary.stops.length}</div>
			</div>
		</div>
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
	</section>
{/if}
