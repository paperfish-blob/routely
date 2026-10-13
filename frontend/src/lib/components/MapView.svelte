<script lang="ts" module>
	import type { ClusterStyle } from '#lib/clusters.ts';

	export type LineKind = 'road' | 'straight' | 'current';
	export interface MapLine {
		coordinates: [number, number][];
		kind: LineKind;
	}
	export interface LegChip {
		id: string;
		position: [number, number];
		text: string;
	}
	export interface PopupInfo {
		title: string;
		cluster: ClusterStyle;
		subtitle: string;
		/** Pre-formatted nearest-neighbour line parts. */
		nearest: { name: string; distance: string } | null;
	}
</script>

<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as maplibregl from 'maplibre-gl';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
	import { onMount, type Snippet } from 'svelte';
	import type { ClusterInfo } from '#lib/clusters.ts';
	import { clusterOutline, niceScale, paddingFor, type LngLat } from '#lib/map/geo.ts';
	import { readMapTheme, type MapTheme } from '#lib/map/theme.ts';
	import { toasts } from '#lib/state/toasts.svelte.ts';
	import type { Stop } from '#lib/types.ts';
	import { badgeClass, ICONS } from '#lib/ui/index.ts';

	interface Props {
		stops: Stop[];
		/** Cluster style per stop id. */
		styleOf: (id: string) => ClusterStyle;
		clusters: ClusterInfo[];
		selectedId: string | null;
		line: MapLine | null;
		/** The suggested route (amber), drawn above the current one while previewing. */
		suggestedLine?: LngLat[] | null;
		legChips?: LegChip[];
		/** Hide the scale bar (the suggest legend takes its place). */
		showScale?: boolean;
		popup: PopupInfo | null;
		/** Padding (px) kept clear around fitted stops: room for overlays such as the toolbar, panel and sheet. */
		insets?: { top?: number; bottom?: number; left?: number; right?: number };
		onselect: (id: string | null) => void;
		children?: Snippet;
	}

	let {
		stops,
		styleOf,
		clusters,
		selectedId,
		line,
		suggestedLine = null,
		legChips = [],
		showScale = true,
		popup,
		insets = {},
		onselect,
		children
	}: Props = $props();

	const OSM_STYLE: maplibregl.StyleSpecification = {
		version: 8,
		sources: {
			osm: {
				type: 'raster',
				tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
				maxzoom: 19
			}
		},
		layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
	};

	const emptyLine = (): Feature<LineString> => ({
		type: 'Feature',
		properties: {},
		geometry: { type: 'LineString', coordinates: [] }
	});

	let container: HTMLDivElement;
	let map: maplibregl.Map | undefined;
	let ready = $state(false);
	let scale = $state({ km: 0, px: 0 });
	let locateMarker: maplibregl.Marker | undefined;
	const markers = new Map<string, { marker: maplibregl.Marker; el: HTMLElement; label: HTMLElement }>();
	const chipMarkers = new Map<string, maplibregl.Marker>();
	let popupMarker: maplibregl.Marker | undefined;
	let theme: MapTheme;

	// ── public controls (used by MapControls) ───────────────────────────
	export function zoomIn() {
		map?.zoomIn();
	}
	export function zoomOut() {
		map?.zoomOut();
	}
	export function fit(animate = true) {
		if (!map || stops.length === 0) return;
		const bounds = new maplibregl.LngLatBounds();
		for (const s of stops) bounds.extend([s.lng, s.lat]);
		for (const c of line?.coordinates ?? []) bounds.extend(c);
		map.resize(); // the container may have just changed size (mobile sheet / rotation)
		map.fitBounds(bounds, {
			padding: {
				top: insets.top ?? 70,
				left: insets.left ?? 60,
				right: insets.right ?? 60,
				bottom: insets.bottom ?? 70
			},
			maxZoom: 14,
			duration: animate ? 600 : 0
		});
	}
	export function locate() {
		if (!navigator.geolocation) {
			toasts.push('Your browser can’t share your location.');
			return;
		}
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				if (!map) return;
				locateMarker?.remove();
				const el = document.createElement('div');
				el.className = 'locate-dot';
				el.setAttribute('role', 'img');
				el.setAttribute('aria-label', 'Your location');
				locateMarker = new maplibregl.Marker({ element: el }).setLngLat([coords.longitude, coords.latitude]).addTo(map);
				map.flyTo({ center: [coords.longitude, coords.latitude], zoom: Math.max(map.getZoom(), 13) });
			},
			() => toasts.push('Couldn’t get your location. Check your browser’s location permission.'),
			{ enableHighAccuracy: false, timeout: 10_000 }
		);
	}

	// ── setup ───────────────────────────────────────────────────────────
	onMount(() => {
		{
			// maplibre derives its default worker URL from import.meta.url, which breaks once
			// Vite pre-bundles/hashes it. Point it at a worker bundled by Vite instead.
			maplibregl.setWorkerUrl(workerUrl);
			theme = readMapTheme();
			map = new maplibregl.Map({
				container,
				style: OSM_STYLE,
				center: [10, 30],
				zoom: 1.5,
				attributionControl: false
			});
			map.on('click', () => onselect(null));
			map.on('move', updateScale);
			map.on('moveend', placeLabels);
			map.on('load', () => {
				addLayers(map!);
				updateScale();
				ready = true;
			});
			return () => {
				popupMarker?.remove();
				locateMarker?.remove();
				for (const { marker } of markers.values()) marker.remove();
				for (const marker of chipMarkers.values()) marker.remove();
				markers.clear();
				chipMarkers.clear();
				map?.remove();
				map = undefined;
				ready = false;
			};
		}
	});

	function addLayers(m: maplibregl.Map) {
		const cluster = ['match', ['get', 'c'], 'cA', theme.clusters.cA, 'cB', theme.clusters.cB, 'cC', theme.clusters.cC, theme.clusters.cD] as maplibregl.ExpressionSpecification;
		const kindIs = (k: string): maplibregl.FilterSpecification => ['==', ['get', 'kind'], k];
		const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
		m.addSource('hulls', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
		m.addSource('line', { type: 'geojson', data: emptyLine() });
		m.addSource('suggested', { type: 'geojson', data: emptyLine() });
		m.addLayer({ id: 'hull-fill', type: 'fill', source: 'hulls', paint: { 'fill-color': cluster, 'fill-opacity': 0.1 } });
		m.addLayer({ id: 'hull-line', type: 'line', source: 'hulls', layout: round, paint: { 'line-color': cluster, 'line-opacity': 0.8, 'line-width': 2, 'line-dasharray': [1, 3.5] } });
		m.addLayer({ id: 'line-current', type: 'line', source: 'line', filter: kindIs('current'), layout: { 'line-join': 'round' }, paint: { 'line-color': theme.routeDash, 'line-width': 4, 'line-dasharray': [2.5, 2.25] } });
		m.addLayer({ id: 'line-casing', type: 'line', source: 'line', filter: ['!=', ['get', 'kind'], 'current'], layout: round, paint: { 'line-color': theme.casing, 'line-width': 10 } });
		m.addLayer({ id: 'line-road', type: 'line', source: 'line', filter: kindIs('road'), layout: round, paint: { 'line-color': theme.primary, 'line-width': 5 } });
		m.addLayer({ id: 'line-straight', type: 'line', source: 'line', filter: kindIs('straight'), layout: round, paint: { 'line-color': theme.primary, 'line-width': 5, 'line-dasharray': [0.01, 2] } });
		m.addLayer({ id: 'suggested-casing', type: 'line', source: 'suggested', layout: round, paint: { 'line-color': theme.casing, 'line-width': 10 } });
		m.addLayer({ id: 'suggested-line', type: 'line', source: 'suggested', layout: round, paint: { 'line-color': theme.accentRoute, 'line-width': 5 } });
	}

	function updateScale() {
		if (!map) return;
		scale = niceScale(map.getZoom(), map.getCenter().lat);
	}

	// ── markers ─────────────────────────────────────────────────────────
	function svg(name: keyof typeof ICONS): string {
		return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
	}

	function makeMarker(stop: Stop) {
		const el = document.createElement('div');
		el.className = 'mk';
		el.innerHTML = '<button type="button" class="badge"></button><span class="lt"></span><span class="ml"></span>';
		el.firstElementChild!.addEventListener('click', (e) => {
			e.stopPropagation(); // don't trigger the map's deselect-on-click
			onselect(stop.id);
		});
		const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(map!);
		return { marker, el, label: el.querySelector<HTMLElement>('.ml')! };
	}

	/** Put each name label on the side with more room, so they don't run off the map. */
	function placeLabels() {
		if (!map) return;
		const width = map.getContainer().clientWidth;
		for (const { marker, label } of markers.values()) {
			const x = map.project(marker.getLngLat()).x;
			label.classList.toggle('l', x > width * 0.6);
		}
	}

	$effect(() => {
		if (!ready || !map) return;
		const live = new Set(stops.map((s) => s.id));
		for (const [id, { marker }] of markers) {
			if (!live.has(id)) {
				marker.remove();
				markers.delete(id);
			}
		}
		stops.forEach((stop, i) => {
			let entry = markers.get(stop.id);
			if (!entry) {
				entry = makeMarker(stop);
				markers.set(stop.id, entry);
			}
			const style = styleOf(stop.id);
			const selected = stop.id === selectedId;
			entry.marker.setLngLat([stop.lng, stop.lat]);
			entry.el.className = `mk ${style.colorClass} ${selected ? 'sel' : ''}`;
			entry.el.style.zIndex = selected ? '2' : '1';
			const badge = entry.el.querySelector<HTMLElement>('.badge')!;
			badge.className = badgeClass(style);
			badge.textContent = String(i + 1);
			badge.setAttribute('aria-label', `Stop ${i + 1}, ${stop.name}, cluster ${style.letter}${selected ? ', selected' : ''}`);
			badge.setAttribute('aria-pressed', String(selected));
			entry.el.querySelector('.lt')!.textContent = style.letter;
			entry.label.textContent = selected ? '' : stop.name;
			entry.label.hidden = selected;
		});
		placeLabels();
	});

	// ── cluster outlines + route lines + leg chips ──────────────────────
	$effect(() => {
		if (!ready || !map) return;
		const features: Feature<Polygon>[] = [];
		for (const info of clusters) {
			if (info.stopIds.length < 2) continue;
			const pts = info.stopIds
				.map((id) => stops.find((s) => s.id === id))
				.filter((s): s is Stop => !!s)
				.map((s) => [s.lng, s.lat] as LngLat);
			if (pts.length < 2) continue;
			features.push({
				type: 'Feature',
				properties: { c: info.style.colorClass },
				geometry: { type: 'Polygon', coordinates: [clusterOutline(pts, paddingFor(pts))] }
			});
		}
		const collection: FeatureCollection<Polygon> = { type: 'FeatureCollection', features };
		(map.getSource('hulls') as maplibregl.GeoJSONSource | undefined)?.setData(collection);
	});

	function setLine(name: string, coordinates: LngLat[], kind?: LineKind) {
		(map?.getSource(name) as maplibregl.GeoJSONSource | undefined)?.setData({
			type: 'Feature',
			properties: kind ? { kind } : {},
			geometry: { type: 'LineString', coordinates }
		});
	}
	$effect(() => {
		if (!ready) return;
		setLine('line', line?.coordinates ?? [], line?.kind);
	});
	$effect(() => {
		if (!ready) return;
		setLine('suggested', suggestedLine ?? []);
	});

	$effect(() => {
		if (!ready || !map) return;
		const live = new Set(legChips.map((c) => c.id));
		for (const [id, marker] of chipMarkers) {
			if (!live.has(id)) {
				marker.remove();
				chipMarkers.delete(id);
			}
		}
		for (const chip of legChips) {
			let marker = chipMarkers.get(chip.id);
			if (!marker) {
				const wrap = document.createElement('div');
				wrap.className = 'legwrap';
				wrap.innerHTML = '<span class="legchip num"></span>';
				marker = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat(chip.position).addTo(map!);
				chipMarkers.set(chip.id, marker);
			}
			marker.setLngLat(chip.position);
			marker.getElement().firstElementChild!.textContent = chip.text;
		}
	});

	// ── popup for the selected stop ─────────────────────────────────────
	$effect(() => {
		if (!ready || !map) return;
		popupMarker?.remove();
		popupMarker = undefined;
		const stop = stops.find((s) => s.id === selectedId);
		if (!stop || !popup) return;
		const wrap = document.createElement('div');
		wrap.className = 'popupwrap';
		const card = document.createElement('div');
		card.className = 'popup';
		card.setAttribute('role', 'dialog');
		card.setAttribute('aria-label', `${popup.title} details`);
		const title = document.createElement('div');
		title.className = 'pt';
		title.append(popup.title + ' ');
		const tag = document.createElement('span');
		tag.className = `ctag ${popup.cluster.colorClass}`;
		tag.textContent = popup.cluster.letter;
		title.append(tag);
		card.append(title);
		if (popup.subtitle) {
			const sub = document.createElement('div');
			sub.className = 'ps';
			sub.textContent = popup.subtitle;
			card.append(sub);
		}
		if (popup.nearest) {
			const row = document.createElement('div');
			row.className = 'pn';
			row.innerHTML = svg('pin');
			const text = document.createElement('span');
			text.append('Nearest stop: ');
			const b = document.createElement('b');
			b.textContent = popup.nearest.name;
			const d = document.createElement('span');
			d.className = 'num';
			d.textContent = popup.nearest.distance;
			text.append(b, ' · ', d);
			row.append(text);
			card.append(row);
		}
		const width = map.getContainer().clientWidth;
		const { x, y } = map.project([stop.lng, stop.lat]);
		if (width < 520) {
			// Narrow screens: above the marker (below it when there is no room), kept inside the viewport.
			const cardWidth = 240;
			card.classList.add(y < 170 ? 'below' : 'above');
			card.style.left = `${Math.min(Math.max(x - cardWidth / 2, 8), width - cardWidth - 8) - x}px`;
		} else {
			// Flip to the left near the right edge; never poke out of the top.
			card.classList.toggle('flip', x > width - 300);
			card.style.top = `${Math.max(-52, 8 - y)}px`;
		}
		wrap.append(card);
		wrap.addEventListener('click', (e) => e.stopPropagation());
		popupMarker = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(map);
	});

	// ── auto-fit when stop positions or the drawn line change (not on selection) ──
	const fitKey = $derived(
		stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join('|') + `#${line?.kind}:${line?.coordinates.length ?? 0}`
	);
	$effect(() => {
		void fitKey;
		void insets.bottom;
		void insets.top;
		void insets.right;
		if (!ready) return;
		fit();
	});
</script>

<main class="map" data-name="Map" aria-label="Itinerary map">
	<div class="map-canvas">
		<div class="map-gl" bind:this={container} role="application" aria-label="Interactive map"></div>
	</div>
	{@render children?.()}
	{#if showScale && scale.km > 0}
		<div class="scalebar num" aria-hidden="true">
			<i style="width: {Math.round(scale.px)}px"></i>{scale.km >= 1 ? scale.km : scale.km * 1000} {scale.km >= 1 ? 'km' : 'm'}
		</div>
	{/if}
	<div class="attrib">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors</div>
</main>
