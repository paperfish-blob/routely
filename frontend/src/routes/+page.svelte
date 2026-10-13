<script lang="ts">
	import { onMount } from 'svelte';
	import MapView, { type MapLine, type PopupInfo } from '#lib/components/MapView.svelte';
	import OptimizePanel from '#lib/components/OptimizePanel.svelte';
	import RouteControls from '#lib/components/RouteControls.svelte';
	import SearchBox from '#lib/components/SearchBox.svelte';
	import StopList from '#lib/components/StopList.svelte';
	import SummaryPanel from '#lib/components/SummaryPanel.svelte';
	import { formatKm, orderBy, stopFromCandidate } from '#lib/format.ts';
	import { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { createStore } from '#lib/storage/index.ts';

	const itinerary = new ItineraryState(createStore());
	onMount(() => itinerary.init());

	// --- responsive bottom sheet -------------------------------------------
	type Sheet = 'peek' | 'half' | 'full';
	const SHEET_ORDER: Sheet[] = ['peek', 'half', 'full'];
	const SHEET_FRACTION: Record<Sheet, number> = { peek: 0, half: 0.5, full: 0.88 };
	const PEEK_PX = 132; // grabber + title + search; everything else is hidden when collapsed
	const MOBILE_MAX = 768;

	let innerWidth = $state(1024);
	let innerHeight = $state(768);
	let sheet = $state<Sheet>('peek');
	const isMobile = $derived(innerWidth <= MOBILE_MAX);
	const bottomInset = $derived(
		isMobile ? Math.max(PEEK_PX, SHEET_FRACTION[sheet] * innerHeight) : 0
	);

	function stepSheet(delta: number) {
		const i = SHEET_ORDER.indexOf(sheet) + delta;
		sheet = SHEET_ORDER[Math.min(SHEET_ORDER.length - 1, Math.max(0, i))];
	}

	let dragStartY: number | null = null;
	function grabStart(e: PointerEvent) {
		dragStartY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function grabEnd(e: PointerEvent) {
		if (dragStartY === null) return;
		const dy = e.clientY - dragStartY;
		dragStartY = null;
		if (Math.abs(dy) < 12) stepSheet(sheet === 'full' ? -2 : 1); // tap: expand / collapse
		else stepSheet(dy < 0 ? 1 : -1);
	}

	// --- map inputs ---------------------------------------------------------
	const line = $derived<MapLine | null>(
		itinerary.stops.length < 2
			? null
			: itinerary.roadGeometry
				? { coordinates: itinerary.roadGeometry, kind: 'road' }
				: { coordinates: itinerary.stops.map((s) => [s.lng, s.lat]), kind: 'straight' }
	);

	const previewLine = $derived<[number, number][] | null>(
		itinerary.activeProposal && itinerary.proposalChangesOrder
			? orderBy(itinerary.stops, itinerary.activeProposal.order).map((s) => [s.lng, s.lat])
			: null
	);

	const nearest = $derived(itinerary.nearestOf(itinerary.selectedId));
	const nearestStop = $derived(nearest ? itinerary.stopById(nearest.nearest_id) : undefined);

	const nearestLink = $derived<[[number, number], [number, number]] | null>(
		itinerary.selected && nearestStop
			? [
					[itinerary.selected.lng, itinerary.selected.lat],
					[nearestStop.lng, nearestStop.lat]
				]
			: null
	);

	const popup = $derived<PopupInfo | null>(
		itinerary.selected
			? {
					title: itinerary.selected.name,
					detail:
						nearest && nearestStop
							? `Nearest: ${nearestStop.name} · ${formatKm(nearest.distance_km)}`
							: 'Add another stop to see its nearest neighbour.'
				}
			: null
	);

	function confirmClear() {
		if (confirm('Remove all stops from this itinerary?')) itinerary.clear();
	}
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="app">
	<aside class="sidebar" data-sheet={sheet}>
		<div
			class="grabber"
			role="button"
			tabindex="0"
			aria-label="Resize panel"
			onpointerdown={grabStart}
			onpointerup={grabEnd}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') stepSheet(sheet === 'full' ? -2 : 1);
			}}
		>
			<span></span>
		</div>

		<header>
			<h1>Routely</h1>
			{#if itinerary.stops.length > 0}
				<button class="link" onclick={confirmClear}>Clear all</button>
			{/if}
		</header>

		<SearchBox
			disabled={!itinerary.canAdd()}
			onfocus={() => {
				if (isMobile && sheet === 'peek') sheet = 'half';
			}}
			onselect={(c) => itinerary.addStop(stopFromCandidate(c))}
		/>

		<div class="rest">
			<RouteControls {itinerary} />
			<OptimizePanel {itinerary} />

			<div class="scroll">
				{#if !itinerary.loaded}
					<p class="muted">Loading your itinerary…</p>
				{:else}
					<StopList {itinerary} />
					<SummaryPanel {itinerary} />
				{/if}
			</div>
		</div>
	</aside>

	<main class="map-wrap">
		<MapView
			stops={itinerary.stops}
			selectedId={itinerary.selectedId}
			{line}
			{previewLine}
			{nearestLink}
			{popup}
			{bottomInset}
			onselect={(id) => itinerary.select(id)}
		/>
	</main>
</div>

<style>
	.app {
		display: grid;
		grid-template-columns: 390px 1fr;
		height: 100dvh;
	}
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 0;
		padding: 1rem;
		background: var(--bg);
		border-right: 1px solid var(--border);
		z-index: 5;
	}
	.rest {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 0;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: 1rem;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		letter-spacing: -0.02em;
		color: var(--brand);
	}
	.link {
		border: 0;
		background: none;
		color: var(--muted);
		font-size: 0.82rem;
		text-decoration: underline;
		cursor: pointer;
	}
	.muted {
		color: var(--muted);
		font-size: 0.88rem;
	}
	.map-wrap {
		min-width: 0;
		height: 100%;
	}
	.grabber {
		display: none;
	}

	@media (max-width: 768px) {
		.app {
			grid-template-columns: 1fr;
		}
		.map-wrap {
			position: fixed;
			inset: 0;
		}
		.sidebar {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			height: 132px;
			padding: 0 1rem 0.75rem;
			border-right: 0;
			border-radius: 18px 18px 0 0;
			box-shadow: 0 -6px 24px rgb(15 30 40 / 0.22);
			transition: height 0.25s ease;
			overflow: hidden;
		}
		.sidebar[data-sheet='peek'] .rest {
			display: none;
		}
		.sidebar[data-sheet='half'] {
			height: 50dvh;
		}
		.sidebar[data-sheet='full'] {
			height: 88dvh;
		}
		.grabber {
			display: flex;
			justify-content: center;
			padding: 0.65rem 0 0.2rem;
			margin: 0 -1rem;
			cursor: grab;
			touch-action: none;
		}
		.grabber span {
			width: 42px;
			height: 5px;
			border-radius: 3px;
			background: var(--border);
		}
		.scroll {
			overscroll-behavior: contain;
		}
	}
</style>
