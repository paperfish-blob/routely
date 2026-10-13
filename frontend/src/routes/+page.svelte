<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/api.ts';
	import BottomSheet, { type SheetState } from '#lib/components/BottomSheet.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ItineraryName from '#lib/components/ItineraryName.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import MapControls from '#lib/components/MapControls.svelte';
	import MapLegend from '#lib/components/MapLegend.svelte';
	import MapToolbar from '#lib/components/MapToolbar.svelte';
	import MapView, { type LegChip, type MapLine, type PopupInfo } from '#lib/components/MapView.svelte';
	import SearchBox from '#lib/components/SearchBox.svelte';
	import StopList from '#lib/components/StopList.svelte';
	import SuggestOrderPanel from '#lib/components/SuggestOrderPanel.svelte';
	import SummaryCard from '#lib/components/SummaryCard.svelte';
	import ToastHost from '#lib/components/ToastHost.svelte';
	import { durationParts, formatKm, formatKmValue, orderBy, placeSubtitle, stopFromCandidate } from '#lib/format.ts';
	import { midpoint, nearestOnLine, type LngLat } from '#lib/map/geo.ts';
	import { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { toasts } from '#lib/state/toasts.svelte.ts';
	import { createStore } from '#lib/storage/index.ts';
	import type { GeocodeCandidate, RouteMode } from '#lib/types.ts';
	import { Banner, Button, Icon, IconButton, SegmentedControl, type SegmentOption } from '#lib/ui/index.ts';

	const EXAMPLE_PLACES = ['Kuala Lumpur', 'Malacca', 'Penang'];
	const MOBILE_MAX = 768;
	const SHEET_PX = { collapsed: 112, half: 430 } as const;

	const itinerary = new ItineraryState(createStore());
	onMount(() => itinerary.init());

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
			? { top: 110, bottom: sheetPx + 56, left: 40, right: 40 }
			: { top: 140, bottom: 70, left: 60, right: itinerary.suggestOpen ? 500 : 60 }
	);

	// ── map inputs ───────────────────────────────────────────────────────
	const stopCoords = $derived(itinerary.stops.map((s) => [s.lng, s.lat] as LngLat));
	const previewing = $derived(itinerary.suggestOpen && itinerary.activeProposal !== null && itinerary.proposalChangesOrder);

	const line = $derived<MapLine | null>(
		itinerary.stops.length < 2
			? null
			: itinerary.roadGeometry
				? { coordinates: itinerary.roadGeometry, kind: previewing ? 'current' : 'road' }
				: { coordinates: stopCoords, kind: previewing ? 'current' : 'straight' }
	);

	const suggestedLine = $derived<LngLat[] | null>(
		previewing && itinerary.activeProposal
			? orderBy(itinerary.stops, itinerary.activeProposal.order).map((s) => [s.lng, s.lat] as LngLat)
			: null
	);

	const legChips = $derived<LegChip[]>(
		itinerary.stops.slice(0, -1).flatMap((stop, i) => {
			const leg = itinerary.legAfter(stop.id);
			if (!leg) return [];
			const next = itinerary.stops[i + 1];
			const mid = midpoint([stop.lng, stop.lat], [next.lng, next.lat]);
			const position = itinerary.roadGeometry ? nearestOnLine(itinerary.roadGeometry as LngLat[], mid) : mid;
			return [{ id: stop.id, position, text: `${leg.approx ? '≈ ' : ''}${formatKm(leg.km)}` }];
		})
	);

	const popup = $derived.by<PopupInfo | null>(() => {
		const stop = itinerary.selected;
		if (!stop) return null;
		const nearest = itinerary.nearestOf(stop.id);
		const other = nearest ? itinerary.stopById(nearest.nearest_id) : undefined;
		return {
			title: stop.name,
			cluster: itinerary.styleOf(stop.id),
			subtitle: placeSubtitle(stop.address, stop.name),
			nearest: nearest && other ? { name: other.name, distance: formatKm(nearest.distance_km) } : null
		};
	});

	const routingMessage = $derived(
		itinerary.activeRoute?.fallback_reason === 'no_route'
			? 'No road route exists between these stops, showing straight-line distances instead.'
			: 'Couldn’t get road directions, showing straight-line distances instead.'
	);

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

	const time = $derived(itinerary.totalSeconds === null ? null : durationParts(itinerary.totalSeconds));
	const canSuggest = $derived(itinerary.stops.length >= 3);

	/** Bias place search toward the end of the route, so "Union Square" means the one near your trip. */
	const searchNear = $derived.by(() => {
		const last = itinerary.stops.at(-1);
		return last ? { lat: last.lat, lng: last.lng } : null;
	});

	function onWindowKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (itinerary.suggestOpen) itinerary.closeSuggest();
		else itinerary.select(null);
	}
</script>

<svelte:window bind:innerWidth bind:innerHeight onkeydown={onWindowKey} />

<div class="app {isMobile ? 'is-mobile' : ''}" style="--sheet-h: {isMobile ? sheetPx : 0}px">
	{#if !isMobile}
		<aside class="side" aria-label="Itinerary" data-name="Sidebar">
			<div class="side-head" data-name="Sidebar/Header">
				<Logo />
				<ItineraryName value={itinerary.name} onchange={(v) => itinerary.setName(v)} />
				{#if itinerary.loaded && itinerary.stops.length > 0}
					<SearchBox disabled={!itinerary.canAdd()} onselect={addCandidate} near={searchNear} placeholder="Search for a place" />
				{/if}
			</div>

			{#if itinerary.loaded && itinerary.stops.length === 0}
				<EmptyState examples={EXAMPLE_PLACES} ontry={addFromQuery}>
					{#snippet search()}
						<SearchBox onselect={addCandidate} autofocus />
					{/snippet}
				</EmptyState>
			{:else}
				<StopList {itinerary} />
				{#if itinerary.loaded && itinerary.stops.length === 1}
					<p class="help info hint"><Icon name="info" size="sm" />Add one more stop to see distances and routes.</p>
				{:else if itinerary.stops.length >= 2 || !itinerary.loaded}
					<SummaryCard {itinerary} />
				{/if}
			{/if}
		</aside>
	{:else}
		<SearchBox variant="float" disabled={!itinerary.canAdd()} onselect={addCandidate} near={searchNear} />
	{/if}

	<MapView
		bind:this={mapView}
		stops={itinerary.stops}
		styleOf={(id) => itinerary.styleOf(id)}
		clusters={itinerary.clusterInfos}
		selectedId={itinerary.selectedId}
		{line}
		{suggestedLine}
		{legChips}
		showScale={!previewing}
		{popup}
		{insets}
		onselect={(id) => itinerary.select(id)}
	>
		{#if !isMobile}
			<MapToolbar {itinerary} />
			<MapControls
				onzoomin={() => mapView?.zoomIn()}
				onzoomout={() => mapView?.zoomOut()}
				onfit={itinerary.stops.length > 0 ? () => mapView?.fit() : undefined}
				onlocate={() => mapView?.locate()}
			/>
			{#if previewing}<MapLegend />{/if}
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
					<IconButton label="Suggest better order" icon="sparkles" accent disabled={!canSuggest} onclick={() => itinerary.openSuggest()} />
				</div>
			{/if}
			<div class="sheet-sum num" data-name="SummaryRow" style={sheet === 'collapsed' ? 'padding-right: var(--sp-12)' : 'padding-top: var(--sp-2)'}>
				<span class="v">{itinerary.totalKm === null ? '—' : formatKmValue(itinerary.totalKm)} <small>km</small></span>
				<span class="sep"></span>
				<span class="v">{itinerary.stops.length} <small>{itinerary.stops.length === 1 ? 'stop' : 'stops'}</small></span>
				{#if sheet !== 'collapsed'}
					<span class="sep"></span>
					<span class="v">{time ? time.main : '—'} <small>{time?.unit ?? ''}</small></span>
				{:else}
					<IconButton label="Suggest better order" icon="sparkles" accent disabled={!canSuggest} onclick={() => itinerary.openSuggest()} />
				{/if}
			</div>
			{#if sheet !== 'collapsed'}
				{#if itinerary.loaded && itinerary.stops.length === 0}
					<EmptyState examples={EXAMPLE_PLACES} ontry={addFromQuery}>
						{#snippet search()}
							<p class="help info"><Icon name="search" size="sm" />Use the search bar above to add a stop.</p>
						{/snippet}
					</EmptyState>
				{:else}
					<StopList {itinerary} />
				{/if}
			{/if}
		</BottomSheet>
	{/if}

	<ToastHost />
</div>
