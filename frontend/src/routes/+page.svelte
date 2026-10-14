<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.ts';
	import AddDayDialog from '#lib/components/AddDayDialog.svelte';
	import AllDaysView from '#lib/components/AllDaysView.svelte';
	import BottomSheet, { type SheetState } from '#lib/components/BottomSheet.svelte';
	import DayChips from '#lib/components/DayChips.svelte';
	import DayHeader from '#lib/components/DayHeader.svelte';
	import DayTabs from '#lib/components/DayTabs.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ItineraryName from '#lib/components/ItineraryName.svelte';
	import RouteEndsRow from '#lib/components/RouteEndsRow.svelte';
	import StartEndCard from '#lib/components/StartEndCard.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import MapControls from '#lib/components/MapControls.svelte';
	import MapLegend from '#lib/components/MapLegend.svelte';
	import MapToolbar from '#lib/components/MapToolbar.svelte';
	import MapView, {
		type LegChip,
		type MapHull,
		type MapLine,
		type MapMarker,
		type WeatherPin,
		type PopupInfo
	} from '#lib/components/MapView.svelte';
	import SearchBox, { type AddTarget } from '#lib/components/SearchBox.svelte';
	import StopList from '#lib/components/StopList.svelte';
	import SuggestOrderPanel from '#lib/components/SuggestOrderPanel.svelte';
	import SummaryCard from '#lib/components/SummaryCard.svelte';
	import ToastHost from '#lib/components/ToastHost.svelte';
	import TripDatesDialog from '#lib/components/TripDatesDialog.svelte';
	import TripOptions from '#lib/components/TripOptions.svelte';
	import WeatherCard from '#lib/components/WeatherCard.svelte';
	import { dayCaption, dayClass, dayDate, formatDayLong, formatTripRange, placeIcon, waypointsOf } from '#lib/days.ts';
	import { durationParts, formatKm, formatKmValue, orderBy, placeSubtitle, stopFromCandidate } from '#lib/format.ts';
	import { midpoint, nearestOnLine, type LngLat } from '#lib/map/geo.ts';
	import { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { toasts } from '#lib/state/toasts.svelte.ts';
	import { createStore } from '#lib/storage/index.ts';
	import type { Day, GeocodeCandidate, RouteMode, Stop } from '#lib/types.ts';
	import { formatTemp, iconName, tone } from '#lib/weather.ts';
	import { Banner, Button, Dialog, Icon, IconButton, SegmentedControl, type SegmentOption } from '#lib/ui/index.ts';

	const EXAMPLE_PLACES = ['Kuala Lumpur', 'Malacca', 'Penang'];
	const MOBILE_MAX = 768;
	const SHEET_PX = { collapsed: 112, half: 430 } as const;

	const itinerary = new ItineraryState(createStore());
	onMount(() => itinerary.init());

	let addDayOpen = $state(false);
	let datesOpen = $state(false);

	// ── responsive layout ────────────────────────────────────────────────
	let innerWidth = $state(typeof window === 'undefined' ? 1280 : window.innerWidth);
	let innerHeight = $state(typeof window === 'undefined' ? 800 : window.innerHeight);
	let sheet = $state<SheetState>('collapsed');
	let mapView = $state<ReturnType<typeof MapView>>();

	const isMobile = $derived(innerWidth <= MOBILE_MAX);
	const sheetPx = $derived(
		sheet === 'full'
			? Math.round(innerHeight * 0.88)
			: Math.min(SHEET_PX[sheet], Math.round(innerHeight * 0.6))
	);
	const insets = $derived(
		isMobile
			? { top: 110, bottom: sheetPx + 110, left: 40, right: 40 }
			: { top: 140, bottom: 70, left: 60, right: itinerary.suggestOpen ? 500 : 60 }
	);

	// ── helpers ──────────────────────────────────────────────────────────
	const coord = (s: { lat: number; lng: number }) => [s.lng, s.lat] as LngLat;
	const day0 = $derived(itinerary.activeDay);
	const previewing = $derived(itinerary.suggestOpen && itinerary.activeProposal !== null && itinerary.proposalChangesOrder);

	/** The straight-line path of a day: base → stops → base. */
	const straightPath = (day: Day): LngLat[] => waypointsOf(day, itinerary.endsOf(day)).list.map(coord);
	const pathOf = (day: Day): LngLat[] => (itinerary.dayRoad(day) as LngLat[] | null) ?? straightPath(day);

	// ── map inputs ───────────────────────────────────────────────────────
	const markers = $derived.by<MapMarker[]>(() => {
		const out: MapMarker[] = [];
		const places = new Map<string, { place: Stop; roles: Set<'start' | 'end'>; dayId: string }>();
		itinerary.days.forEach((day, di) => {
			const current = day.id === itinerary.activeId;
			day.stops.forEach((s, n) => {
				const base = { id: s.id, lat: s.lat, lng: s.lng, n: n + 1, name: s.name, selected: s.id === itinerary.selectedId } as const;
				if (itinerary.isAll) {
					out.push({ ...base, variant: 'day', colorClass: dayClass(di), shapeClass: '', tag: `D${di + 1}`, label: true, aria: `Day ${di + 1}, stop ${n + 1}, ${s.name}` });
				} else if (current) {
					const style = itinerary.styleOf(s.id);
					out.push({ ...base, variant: 'cluster', colorClass: style.colorClass, shapeClass: style.shapeClass, tag: style.letter, label: true, aria: `Stop ${n + 1}, ${s.name}, cluster ${style.letter}${base.selected ? ', selected' : ''}` });
				} else {
					out.push({ ...base, variant: 'dim', colorClass: dayClass(di), shapeClass: '', tag: `D${di + 1}`, label: false, aria: `Day ${di + 1}, stop ${n + 1}, ${s.name}` });
				}
			});
			if (itinerary.useBase && (itinerary.isAll || current)) {
				const e = itinerary.endsOf(day);
				for (const [p, role] of [[e.start, 'start'], [e.end, 'end']] as const) {
					if (!p) continue;
					const key = `${p.lat},${p.lng}`;
					const known = places.get(key);
					if (known) known.roles.add(role);
					else places.set(key, { place: p, roles: new Set([role]), dayId: day.id });
				}
			}
		});
		for (const { place, roles, dayId } of places.values()) {
			const onlyEnd = roles.size === 1 && roles.has('end');
			out.push({ id: `end:${dayId}:${place.lat},${place.lng}`, lat: place.lat, lng: place.lng, n: 0, name: place.name, variant: 'base', colorClass: '', shapeClass: '', tag: '', icon: placeIcon(place.name, onlyEnd ? 'flag' : 'home'), endpoint: onlyEnd, label: true, aria: `${onlyEnd ? 'End point' : 'Start point'}, ${place.name}` });
		}
		return out;
	});

	const lines = $derived.by<MapLine[]>(() => {
		const out: MapLine[] = [];
		itinerary.days.forEach((day, di) => {
			if (day.stops.length === 0) return;
			const road = itinerary.dayRoad(day) !== null;
			if (itinerary.isAll) {
				out.push({ id: day.id, coordinates: pathOf(day), kind: road ? 'road' : 'straight', dayIndex: di });
			} else if (day.id === itinerary.activeId) {
				out.push({ id: day.id, coordinates: pathOf(day), kind: previewing ? 'current' : road ? 'road' : 'straight' });
			} else {
				out.push({ id: day.id, coordinates: pathOf(day), kind: 'dim' });
			}
		});
		for (const t of itinerary.transfers) {
			if (itinerary.isAll || t.fromDayId === itinerary.activeId || t.toDayId === itinerary.activeId) {
				out.push({ id: `t:${t.key}`, coordinates: (t.geometry as LngLat[] | null) ?? [coord(t.from), coord(t.to)], kind: 'transfer' });
			}
		}
		return out;
	});

	const hulls = $derived<MapHull[]>(
		itinerary.isAll
			? []
			: itinerary.clusterInfos
					.filter((c) => c.stopIds.length > 1)
					.map((c) => ({
						id: String(c.id),
						colorClass: c.style.colorClass,
						points: c.stopIds.flatMap((id) => {
							const s = itinerary.stopAny(id);
							return s ? [coord(s)] : [];
						})
					}))
	);

	const suggestedLine = $derived.by<LngLat[] | null>(() => {
		const proposal = itinerary.activeProposal;
		const day = day0;
		if (!previewing || !proposal || !day) return null;
		const ordered = orderBy(itinerary.stops, proposal.order);
		const list = waypointsOf({ ...day, stops: ordered }, itinerary.endsOf(day)).list;
		return list.map(coord);
	});

	const legChips = $derived.by<LegChip[]>(() => {
		const out: LegChip[] = [];
		const shown = itinerary.isAll ? itinerary.days : day0 ? [day0] : [];
		for (const day of shown) {
			const road = itinerary.dayRoad(day) as LngLat[] | null;
			day.stops.slice(0, -1).forEach((from, i) => {
				const leg = itinerary.legAfterIn(day, from.id);
				if (!leg) return;
				const mid = midpoint(coord(from), coord(day.stops[i + 1]));
				out.push({ id: `${day.id}:${from.id}`, position: road ? nearestOnLine(road, mid) : mid, text: `${leg.approx ? '≈ ' : ''}${formatKm(leg.km)}` });
			});
		}
		if (itinerary.isAll) {
			for (const t of itinerary.transfers) {
				const mid = midpoint(coord(t.from), coord(t.to));
				out.push({ id: `t:${t.key}`, position: t.geometry ? nearestOnLine(t.geometry as LngLat[], mid) : mid, text: `${t.approx ? '≈ ' : ''}${formatKm(t.km)}`, dashed: true });
			}
		}
		return out;
	});

	/** Weather at each day's start and end (the active day, or every day in the all-days view). */
	const weatherPins = $derived.by<WeatherPin[]>(() => {
		const out: WeatherPin[] = [];
		itinerary.days.forEach((day, di) => {
			if (!itinerary.isAll && day.id !== itinerary.activeId) return;
			for (const r of itinerary.dayWeather(day).readings) {
				const where = r.role === 'day' ? 'day' : r.role;
				out.push({
					id: `${day.id}:${r.role}`,
					position: coord(r.place),
					text: formatTemp(r.wx.temp_max_c, itinerary.tempUnit),
					icon: iconName(r.wx.icon),
					tone: `wx-${tone(r.wx.icon)}`,
					colorClass: dayClass(di),
					label: `Day ${di + 1} ${where === 'day' ? '' : `${where} `}weather at ${r.place.name}: ${r.wx.summary}, ${formatTemp(r.wx.temp_max_c, itinerary.tempUnit)}`
				});
			}
		});
		return out;
	});

	const popup = $derived.by<PopupInfo | null>(() => {
		const stop = itinerary.selected;
		if (!stop) return null;
		const owner = itinerary.dayOfStop(stop.id);
		const di = owner ? itinerary.dayIndex(owner.id) : -1;
		const inActive = owner?.id === itinerary.activeId;
		const nearest = inActive ? itinerary.nearestOf(stop.id) : null;
		const other = nearest ? itinerary.stopAny(nearest.nearest_id) : undefined;
		const place = placeSubtitle(stop.address, stop.name);
		const position = owner ? owner.stops.findIndex((s) => s.id === stop.id) + 1 : 0;
		return {
			title: stop.name,
			at: coord(stop),
			cluster: inActive ? itinerary.styleOf(stop.id) : undefined,
			dayTag: itinerary.multiDay && di >= 0 ? { text: `D${di + 1}`, colorClass: dayClass(di) } : undefined,
			subtitle: [place, itinerary.multiDay && di >= 0 ? `Day ${di + 1}, stop ${position}` : ''].filter(Boolean).join(' · '),
			nearest: nearest && other ? { name: other.name, distance: formatKm(nearest.distance_km) } : null
		};
	});

	/** Everything the map should frame for the current view, with a cheap key that changes when it should refit. */
	const framing = $derived.by(() => {
		const pts: LngLat[] = [];
		let key = String(itinerary.activeId);
		// An empty day has nothing of its own to frame, so show the whole trip for context.
		const targets = itinerary.isAll || !day0 || day0.stops.length === 0 ? itinerary.days : [day0];
		for (const d of targets) {
			for (const s of d.stops) {
				pts.push(coord(s));
				key += `|${s.lat},${s.lng}`;
			}
			const e = itinerary.endsOf(d);
			for (const p of [e.start, e.end]) {
				if (!p) continue;
				pts.push(coord(p));
				key += `|e${p.lat},${p.lng}`;
			}
			const road = itinerary.dayRoad(d);
			if (road) {
				pts.push(...(road as LngLat[]));
				key += `|r${road.length}`;
			}
		}
		return { pts, key };
	});

	const routingMessage = $derived(
		itinerary.routingFallbackReason === 'no_route'
			? 'No road route exists between these stops, showing straight-line distances instead.'
			: 'Couldn’t get road directions, showing straight-line distances instead.'
	);

	// ── search target ("Adding to Day 2") ────────────────────────────────
	const target = $derived.by<AddTarget | null>(() => {
		if (!itinerary.multiDay) return null;
		const t = itinerary.addTarget;
		const ti = itinerary.dayIndex(t.id);
		return {
			current: { id: t.id, label: `Day ${ti + 1}`, dayClass: dayClass(ti) },
			options: itinerary.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1}`, caption: dayCaption(itinerary.startDate, i, d.stops.length), dayClass: dayClass(i), tag: `D${i + 1}` })),
			onpick: (id) => itinerary.setAddTarget(id)
		};
	});

	/** Bias place search toward where the trip is: the target day's last stop, else the last stop anywhere. */
	const searchNear = $derived.by(() => {
		const t = itinerary.addTarget;
		const p = t?.stops.at(-1) ?? (t ? itinerary.endsOf(t).start : null) ?? itinerary.allStops.at(-1);
		return p ? { lat: p.lat, lng: p.lng } : null;
	});

	// ── actions ──────────────────────────────────────────────────────────
	function addCandidate(c: GeocodeCandidate) {
		itinerary.addStop(stopFromCandidate(c));
	}

	async function addFromQuery(query: string) {
		try {
			const [first] = await api.geocode(query, searchNear);
			if (first) addCandidate(first);
			else toasts.push(`No places found for “${query}”.`);
		} catch {
			toasts.push(`Couldn’t search for “${query}”. Try again in a moment.`);
		}
	}

	const MODE_SHORT: SegmentOption<RouteMode>[] = $derived([
		{ value: 'straight', label: 'Line', icon: 'line' },
		{ value: 'driving', label: 'Drive', icon: 'car', disabled: itinerary.routingDegraded },
		{ value: 'walking', label: 'Walk', icon: 'walk', disabled: itinerary.routingDegraded }
	]);

	const sheetStats = $derived(itinerary.isAll ? itinerary.tripTotals : day0 ? itinerary.dayStats(day0) : null);
	const sheetTime = $derived(sheetStats?.seconds == null ? null : durationParts(sheetStats.seconds));
	const sheetCount = $derived(itinerary.isAll ? itinerary.totalStopCount : itinerary.stops.length);
	const canSuggest = $derived(!itinerary.isAll && itinerary.stops.length >= 3);
	const tripRange = $derived(formatTripRange(itinerary.startDate, itinerary.days.length));
	const showHeaderSearch = $derived(itinerary.loaded && (itinerary.totalStopCount > 0 || itinerary.multiDay));
	const dayNumber = $derived(day0 ? itinerary.dayIndex(day0.id) + 1 : 1);
	const emptyDayText = $derived.by(() => {
		const d = day0 ? dayDate(itinerary.startDate, itinerary.dayIndex(day0.id)) : null;
		return `Add places for ${d ? formatDayLong(d) : `Day ${dayNumber}`}. Searches start near where your trip is.`;
	});

	function onWindowKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (itinerary.suggestOpen) itinerary.closeSuggest();
		else itinerary.select(null);
	}
</script>

<svelte:window bind:innerWidth bind:innerHeight onkeydown={onWindowKey} />

{#snippet weatherDesktop()}
	<WeatherCard {itinerary} ontripdates={() => (datesOpen = true)} />
{/snippet}
{#snippet weatherMobile()}
	<WeatherCard {itinerary} compact ontripdates={() => (datesOpen = true)} />
{/snippet}

{#snippet emptyDay()}
	{#if itinerary.multiDay}
		<EmptyState title="Plan Day {dayNumber}" text={emptyDayText}>
			{#snippet search()}
				{#if isMobile}
					<p class="help info"><Icon name="search" size="sm" />Use the search bar above to add a stop.</p>
				{:else}
					<SearchBox {target} near={searchNear} disabled={!itinerary.canAdd()} onselect={addCandidate} placeholder="Search for a place" />
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<EmptyState examples={EXAMPLE_PLACES} ontry={addFromQuery}>
			{#snippet search()}
				{#if isMobile}
					<p class="help info"><Icon name="search" size="sm" />Use the search bar above to add a stop.</p>
				{:else}
					<SearchBox onselect={addCandidate} near={searchNear} autofocus />
				{/if}
			{/snippet}
		</EmptyState>
	{/if}
{/snippet}

<div class="app {isMobile ? 'is-mobile' : ''} {itinerary.isAll ? 'is-all-days' : ''}" style="--sheet-h: {isMobile ? sheetPx : 0}px">
	{#if !isMobile}
		<aside class="side" aria-label="Itinerary" data-name="Sidebar">
			<div class="side-head" data-name="Sidebar/Header">
				<div class="brand-row">
					<Logo />
					<TripOptions {itinerary} ontripdates={() => (datesOpen = true)} onaddday={() => (addDayOpen = true)} />
				</div>
				<ItineraryName value={itinerary.name} onchange={(v) => itinerary.setName(v)} />
				{#if itinerary.loaded}
					<div class="meta-row">
						<button class="meta" onclick={() => (datesOpen = true)} aria-label="Change trip dates">
							<Icon name="calendar" />
							{tripRange ?? 'Add trip dates'}{itinerary.multiDay ? ` · ${itinerary.days.length} days` : ''}
						</button>
						{#if !itinerary.multiDay && itinerary.totalStopCount > 0}
							<button class="meta" onclick={() => (addDayOpen = true)}><Icon name="plus" />Plan by day</button>
						{/if}
					</div>
				{/if}
				{#if showHeaderSearch}
					<SearchBox {target} near={searchNear} disabled={!itinerary.canAdd()} onselect={addCandidate} placeholder="Search for a place" />
				{/if}
			</div>

			{#if itinerary.multiDay}<DayTabs {itinerary} onadd={() => (addDayOpen = true)} />{/if}

			{#if itinerary.isAll}
				<AllDaysView {itinerary} onadd={() => (addDayOpen = true)} />
			{:else}
				{#if itinerary.multiDay}<DayHeader {itinerary} ontripdates={() => (datesOpen = true)} />{/if}
				<StopList {itinerary} empty={emptyDay} top={weatherDesktop} />
				{#if itinerary.loaded && itinerary.stops.length === 1 && !itinerary.hasBase}
					<p class="help info hint"><Icon name="info" size="sm" />Add one more stop to see distances and routes.</p>
				{/if}
				<SummaryCard {itinerary} />
			{/if}
		</aside>
	{:else}
		<SearchBox variant="float" {target} near={searchNear} disabled={!itinerary.canAdd()} onselect={addCandidate} />
	{/if}

	<MapView
		bind:this={mapView}
		{markers}
		{lines}
		{hulls}
		{suggestedLine}
		{legChips}
		{weatherPins}
		showScale={!previewing}
		{popup}
		fitPoints={framing.pts}
		fitKey={framing.key}
		{insets}
		onselect={(id) => itinerary.select(id)}
	>
		{#if !isMobile}
			<MapToolbar {itinerary} />
			<MapControls
				onzoomin={() => mapView?.zoomIn()}
				onzoomout={() => mapView?.zoomOut()}
				onfit={framing.pts.length > 0 ? () => mapView?.fit() : undefined}
				onlocate={() => mapView?.locate()}
			/>
			{#if previewing}
				<MapLegend mode="suggest" {itinerary} />
			{:else if itinerary.isAll}
				<MapLegend mode="all" {itinerary} />
			{:else if itinerary.multiDay && itinerary.stops.length > 0}
				<MapLegend mode="day" {itinerary} />
			{/if}
		{/if}

		{#if itinerary.routingBannerVisible}
			<div class="map-banner">
				<Banner variant="warn" onclose={() => itinerary.dismissRoutingBanner()}>
					{routingMessage}
					{#snippet actions()}
						<Button variant="secondary" size="sm" style="margin: -4px 0" onclick={() => itinerary.retryRoute()}>Retry</Button>
					{/snippet}
				</Banner>
			</div>
		{:else if itinerary.notice}
			<div class="map-banner">
				<Banner variant={itinerary.notice.variant} onclose={() => itinerary.dismissNotice()}>{itinerary.notice.message}</Banner>
			</div>
		{/if}
	</MapView>

	<!-- Outside <MapView>: the map is its own stacking context, so the panel could not rise above the mobile sheet from inside it. -->
	{#if itinerary.suggestOpen}
		<SuggestOrderPanel {itinerary} />
	{/if}

	{#if isMobile}
		<MapControls variant="mobile" onfit={() => mapView?.fit()} onlocate={() => mapView?.locate()} />
		<div class="m-seg" data-name="ModeToggle">
			<SegmentedControl
				size="lg"
				label="Travel mode"
				options={MODE_SHORT}
				value={itinerary.effectiveMode}
				onchange={(m) => itinerary.setRouteMode(m)}
			/>
		</div>
		<BottomSheet state={sheet} onstate={(s) => (sheet = s)} label={sheet === 'collapsed' ? 'Itinerary summary' : 'Itinerary'}>
			{#if sheet !== 'collapsed'}
				<div class="sheet-head">
					<label class="sr" for="sheet-name">Itinerary name</label>
					<input id="sheet-name" value={itinerary.name} placeholder="Untitled itinerary" maxlength="80" oninput={(e) => itinerary.setName(e.currentTarget.value)} />
					<TripOptions {itinerary} ontripdates={() => (datesOpen = true)} onaddday={() => (addDayOpen = true)} />
					<IconButton label="Suggest better order" icon="sparkles" accent disabled={!canSuggest} onclick={() => itinerary.openSuggest()} />
				</div>
				{#if itinerary.multiDay}
					<div style="padding-top: var(--sp-4)"><DayChips {itinerary} onadd={() => (addDayOpen = true)} /></div>
				{/if}
			{/if}
			<div class="sheet-sum num" data-name="SummaryRow" style={sheet === 'collapsed' ? 'padding-right: var(--sp-12)' : 'padding-top: var(--sp-2)'}>
				<span class="v">{sheetStats?.km == null ? '—' : `${sheetStats.approx ? '≈ ' : ''}${formatKmValue(sheetStats.km)}`} <small>km</small></span>
				<span class="sep"></span>
				<span class="v">{sheetCount} <small>{sheetCount === 1 ? 'stop' : 'stops'}</small></span>
				{#if sheet !== 'collapsed'}
					<span class="sep"></span>
					<span class="v">{sheetTime ? sheetTime.main : '—'} <small>{sheetTime?.unit ?? ''}</small></span>
				{:else}
					<IconButton label="Suggest better order" icon="sparkles" accent disabled={!canSuggest} onclick={() => itinerary.openSuggest()} />
				{/if}
			</div>
			{#if sheet !== 'collapsed'}
				{#if itinerary.isAll}
					<AllDaysView {itinerary} compact onadd={() => (addDayOpen = true)} />
				{:else}
					{#if itinerary.multiDay}<DayHeader {itinerary} ontripdates={() => (datesOpen = true)} />{/if}
					{#if itinerary.useBase}<RouteEndsRow {itinerary} />{/if}
					<StopList {itinerary} empty={emptyDay} top={weatherMobile} compact />
				{/if}
			{/if}
		</BottomSheet>
	{/if}

	{#if isMobile && itinerary.endsEditor}
		<Dialog open title="Start and end" description="Where does this day begin and finish?" onclose={() => itinerary.closeEndsEditor()}>
			<StartEndCard embedded {itinerary} dayId={itinerary.endsEditor.dayId} focus={itinerary.endsEditor.focus} onclose={() => itinerary.closeEndsEditor()} />
		</Dialog>
	{/if}
	<AddDayDialog {itinerary} open={addDayOpen} onclose={() => (addDayOpen = false)} />
	<TripDatesDialog {itinerary} open={datesOpen} onclose={() => (datesOpen = false)} />
	<ToastHost />
</div>
