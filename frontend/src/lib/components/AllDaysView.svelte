<script lang="ts">
	import { dayCaption, dayClass, placeIcon } from '#lib/days.ts';
	import { durationParts, formatKm, formatKmValue, moveItem } from '#lib/format.ts';
	import { sortable } from '#lib/sortable.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Badge, Icon, IconButton, Pill } from '#lib/ui/index.ts';

	let { itinerary, onadd, compact = false }: { itinerary: ItineraryState; onadd?: () => void; compact?: boolean } = $props();

	let collapsed = $state<Record<string, boolean>>({});
	const trip = $derived(itinerary.tripTotals);
	const tripTime = $derived(trip.seconds === null ? null : durationParts(trip.seconds));
	const timeLabel = $derived(
		itinerary.routeMode === 'walking' ? 'WALK TIME' : itinerary.routeMode === 'driving' ? 'DRIVE TIME' : 'TRAVEL TIME'
	);

	const pillIcon = (approx: boolean) => (approx || itinerary.routeMode === 'straight' ? 'line' : itinerary.routeMode === 'walking' ? 'walk' : 'car');
	const dur = (s: number | null) => {
		if (s === null) return '';
		const t = durationParts(s);
		return ` · ${t.main}${t.unit ? ` ${t.unit}` : ''}`;
	};
</script>

{#if !compact}
<div class="tripstats" data-name="TripTotals">
	<div class="stat">
		<div class="k">TRIP DISTANCE</div>
		<div class="v num">{trip.ready ? `${trip.approx ? '≈ ' : ''}${formatKmValue(trip.km ?? 0)}` : '…'} <small>km</small></div>
	</div>
	<div class="stat">
		<div class="k">{timeLabel}</div>
		{#if tripTime}
			<div class="v num">{tripTime.main} <small>{tripTime.unit}</small></div>
		{:else}
			<div class="v num" title="Switch to Driving or Walking for travel time">—</div>
		{/if}
	</div>
	<div class="stat">
		<div class="k">STOPS</div>
		<div class="v num">{itinerary.totalStopCount}</div>
	</div>
</div>
{/if}

<div class="side-scroll is-all" data-name="AllDays">
	{#each itinerary.days as day, i (day.id)}
		{@const stats = itinerary.dayStats(day)}
		{@const transfer = itinerary.transferAfter(day.id)}
		{@const shut = collapsed[day.id] === true}
		{@const ends = itinerary.endsOf(day)}
		{@const loop = day.end.kind === 'start'}
		{@const chained = itinerary.nextChainsFrom(day.id)}
		{@const route = ends.start && ends.end && !loop ? `${ends.start.name} → ${ends.end.name}` : ''}
		<section class="daysec {dayClass(i)} {itinerary.dropDayId === day.id ? 'drop' : ''}" aria-label="Day {i + 1}" data-drop-day={day.id}>
			<div class="daysec-h">
				<IconButton
					label="{shut ? 'Expand' : 'Collapse'} Day {i + 1}"
					icon={shut ? 'chevron-right' : 'chevron-down'}
					aria-expanded={!shut}
					onclick={() => (collapsed[day.id] = !shut)}
				/>
				<button class="daysec-open" onclick={() => itinerary.setActive(day.id)} aria-label="Open Day {i + 1}">
					<span class="dtag">D{i + 1}</span>
					<span class="t">
						<b>{day.title || `Day ${i + 1}`}</b>
						<span>{[dayCaption(itinerary.startDate, i, day.stops.length) + (itinerary.startDate ? ` · ${day.stops.length} ${day.stops.length === 1 ? 'stop' : 'stops'}` : ''), route].filter(Boolean).join(' · ')}</span>
					</span>
					{#if day.stops.length > 0 && stats.ready && stats.km !== null}
						<span class="st num">{stats.approx ? '≈ ' : ''}{formatKm(stats.km)}{#if stats.seconds}<br />{durationParts(stats.seconds).main} {durationParts(stats.seconds).unit}{/if}</span>
					{/if}
				</button>
			</div>
			{#if !shut}
				<div
					data-day-id={day.id}
					use:sortable={{
						item: '[data-id]',
						handle: '.grip',
						group: 'all-days',
						onMove: (from, to) => itinerary.reorder(moveItem(day.stops.map((s) => s.id), from, to), day.id),
						onTransfer: (old, at, fromId, toId) => {
							const from = itinerary.days.find((d) => d.id === fromId);
							if (from && toId) itinerary.moveStop(from.stops[old].id, toId, at);
						}
					}}
				>
					{#if itinerary.useBase && ends.start}
						<div class="srow base"><span class="base-ico"><Icon name={placeIcon(ends.start.name, 'home')} /></span><span class="nm">{loop ? `Starts & ends at ${ends.start.name}` : `Start · ${ends.start.name}`}</span></div>
					{/if}
					{#each day.stops as stop, n (stop.id)}
						{@const leg = itinerary.legAfterIn(day, stop.id)}
						<div class="srow {stop.id === itinerary.selectedId ? 'sel' : ''}" data-id={stop.id}>
							<button class="grip" aria-label="Move {stop.name}" style="width: 24px; height: 32px"><Icon name="grip" size="sm" /></button>
							<Badge n={n + 1} cluster={{ letter: '', colorClass: dayClass(i) as never, shapeClass: '' }} small />
							<button class="nm" onclick={() => itinerary.select(stop.id)}>{stop.name}</button>
							{#if leg}<span class="km num">{leg.approx ? '≈ ' : ''}{formatKm(leg.km)}</span>{/if}
						</div>
					{:else}
						<div class="srow" style="color: var(--ink-3); font-size: var(--fs-small)">No stops yet</div>
					{/each}
					{#if itinerary.useBase && ends.end && !loop && day.stops.length > 0}
						<div class="srow base"><span class="base-ico end"><Icon name={placeIcon(ends.end.name, 'flag')} /></span><span class="nm">End · {ends.end.name}</span></div>
					{/if}
				</div>
			{/if}
		</section>
		{#if chained && !transfer}
			<div class="xfer linked"><span class="linkchip"><Icon name="link" />Day {i + 2} starts where Day {i + 1} ends{chained && itinerary.endsOf(chained).start ? ` · ${itinerary.endsOf(chained).start?.name}` : ''}</span></div>
		{/if}
		{#if transfer}
			<div class="xfer"><Pill dashed icon={pillIcon(transfer.approx)}>Overnight · {transfer.approx ? '≈ ' : ''}{formatKm(transfer.km)}{dur(transfer.seconds)}</Pill></div>
		{/if}
	{/each}
	{#if onadd}
		<button class="dtab add" style="margin: var(--sp-4) var(--sp-16) var(--sp-16); width: calc(100% - 32px)" onclick={onadd}><Icon name="plus" size="sm" />Add day</button>
	{/if}
</div>
