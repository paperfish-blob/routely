<script lang="ts" module>
	import type { ClusterStyle } from '#lib/clusters.ts';

	/** What a marker looks like: cluster (day view), day (all-days view), dim (other days) or base (hotel). */
	export type MarkerVariant = 'cluster' | 'day' | 'dim' | 'base';

	export interface MapMarker {
		id: string;
		lat: number;
		lng: number;
		/** The number in the badge (position within its day). */
		n: number;
		name: string;
		variant: MarkerVariant;
		/** Colour class (cA…cD or day1…day3) and badge shape class. */
		colorClass: string;
		shapeClass: string;
		/** Small tag at the badge's corner: the cluster letter or "D2". */
		tag: string;
		selected?: boolean;
		/** For 'base' markers: which glyph to show, and whether it is the (different) end point. */
		icon?: 'home' | 'flag' | 'plane';
		endpoint?: boolean;
		/** Show the name label next to the badge. */
		label?: boolean;
		aria: string;
	}

	export type LineKind = 'road' | 'straight' | 'current' | 'dim' | 'transfer';
	export interface MapLine {
		id: string;
		coordinates: [number, number][];
		kind: LineKind;
		/** Use this day's colour (0–2) instead of the primary teal. */
		dayIndex?: number;
	}
	export interface MapHull {
		id: string;
		colorClass: string;
		points: [number, number][];
		/** Drawn heavier: the area opened in the weather card. */
		strong?: boolean;
	}
	export interface LegChip {
		id: string;
		position: [number, number];
		text: string;
		dashed?: boolean;
	}
	/** The weather at a place, drawn beside its marker. */
	export interface WeatherPin {
		id: string;
		position: [number, number];
		text: string;
		/** Weather glyph and its tone class (wx-sun, wx-rainy, wx-cloudy). */
		icon: keyof typeof ICONS;
		tone: string;
		/** Day colour class (day1…day3) for the pin's outline. */
		colorClass: string;
		label: string;
		/** The area opened in the weather card. */
		strong?: boolean;
	}
	export interface PopupInfo {
		title: string;
		at: [number, number];
		cluster?: ClusterStyle;
		dayTag?: { text: string; colorClass: string };
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
	import { clusterOutline, niceScale, paddingFor, type LngLat } from '#lib/map/geo.ts';
	import { readMapTheme, type MapTheme } from '#lib/map/theme.ts';
	import { toasts } from '#lib/state/toasts.svelte.ts';
	import { ICONS } from '#lib/ui/index.ts';

	interface Props {
		markers: MapMarker[];
		lines: MapLine[];
		hulls?: MapHull[];
		/** The suggested route (amber), drawn above the others while previewing. */
		suggestedLine?: LngLat[] | null;
		legChips?: LegChip[];
		weatherPins?: WeatherPin[];
		/** Hide the scale bar (the suggest legend takes its place). */
		showScale?: boolean;
		popup: PopupInfo | null;
		/** Everything the view should frame, and a key that changes when the framing should be redone. */
		fitPoints: LngLat[];
		fitKey: string;
		/** Padding (px) kept clear around fitted points: room for overlays such as the toolbar, panel and sheet. */
		insets?: { top?: number; bottom?: number; left?: number; right?: number };
		onselect: (id: string | null) => void;
		children?: Snippet;
	}

	let {
		markers,
		lines,
		hulls = [],
		suggestedLine = null,
		legChips = [],
		weatherPins = [],
		showScale = true,
		popup,
		fitPoints,
		fitKey,
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
	const markerEls = new Map<string, { marker: maplibregl.Marker; el: HTMLElement; badge: HTMLElement; tag: HTMLElement; label: HTMLElement }>();
	const chipMarkers = new Map<string, maplibregl.Marker>();
	const pinMarkers = new Map<string, maplibregl.Marker>();
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
		if (!map || fitPoints.length === 0) return;
		const bounds = new maplibregl.LngLatBounds();
		for (const p of fitPoints) bounds.extend(p);
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
		// The sidebar can be dragged wider or narrower: keep the canvas matched to its box.
		let frame = 0;
		const resizer = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => map?.resize());
		});
		resizer.observe(container);
		map.on('click', () => onselect(null));
		map.on('move', updateScale);
		map.on('moveend', placeLabels);
		map.on('load', () => {
			addLayers(map!);
			updateScale();
			ready = true;
		});
		return () => {
			resizer.disconnect();
			cancelAnimationFrame(frame);
			popupMarker?.remove();
			locateMarker?.remove();
			for (const { marker } of markerEls.values()) marker.remove();
			for (const marker of chipMarkers.values()) marker.remove();
			for (const marker of pinMarkers.values()) marker.remove();
			pinMarkers.clear();
			markerEls.clear();
			chipMarkers.clear();
			map?.remove();
			map = undefined;
			ready = false;
		};
	});

	function addLayers(m: maplibregl.Map) {
		const cluster = ['match', ['get', 'c'], 'cA', theme.clusters.cA, 'cB', theme.clusters.cB, 'cC', theme.clusters.cC, theme.clusters.cD] as maplibregl.ExpressionSpecification;
		const kindIs = (k: string): maplibregl.FilterSpecification => ['==', ['get', 'kind'], k];
		const routed: maplibregl.FilterSpecification = ['in', ['get', 'kind'], ['literal', ['road', 'straight']]];
		const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
		const color = ['get', 'color'] as maplibregl.ExpressionSpecification;
		const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
		m.addSource('hulls', { type: 'geojson', data: empty });
		m.addSource('lines', { type: 'geojson', data: empty });
		m.addSource('suggested', { type: 'geojson', data: emptyLine() });
		m.addLayer({ id: 'hull-fill', type: 'fill', source: 'hulls', paint: { 'fill-color': cluster, 'fill-opacity': ['case', ['==', ['get', 's'], 1], 0.22, 0.1] as maplibregl.ExpressionSpecification } });
		m.addLayer({ id: 'hull-line', type: 'line', source: 'hulls', layout: round, paint: { 'line-color': cluster, 'line-opacity': 0.8, 'line-width': ['case', ['==', ['get', 's'], 1], 3.5, 2] as maplibregl.ExpressionSpecification, 'line-dasharray': [1, 3.5] } });
		m.addLayer({ id: 'line-dim', type: 'line', source: 'lines', filter: kindIs('dim'), layout: { 'line-join': 'round' }, paint: { 'line-color': theme.routeDash, 'line-width': 4, 'line-opacity': 0.7, 'line-dasharray': [2.5, 2.25] } });
		m.addLayer({ id: 'line-transfer', type: 'line', source: 'lines', filter: kindIs('transfer'), layout: round, paint: { 'line-color': theme.routeDash, 'line-width': 3, 'line-dasharray': [0.01, 3] } });
		m.addLayer({ id: 'line-current', type: 'line', source: 'lines', filter: kindIs('current'), layout: { 'line-join': 'round' }, paint: { 'line-color': theme.routeDash, 'line-width': 4, 'line-dasharray': [2.5, 2.25] } });
		m.addLayer({ id: 'line-casing', type: 'line', source: 'lines', filter: routed, layout: round, paint: { 'line-color': theme.casing, 'line-width': 10 } });
		m.addLayer({ id: 'line-road', type: 'line', source: 'lines', filter: kindIs('road'), layout: round, paint: { 'line-color': color, 'line-width': 5 } });
		m.addLayer({ id: 'line-straight', type: 'line', source: 'lines', filter: kindIs('straight'), layout: round, paint: { 'line-color': color, 'line-width': 5, 'line-dasharray': [0.01, 2] } });
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

	function makeMarker(m: MapMarker) {
		const el = document.createElement('div');
		el.innerHTML = '<button type="button" class="badge"></button><span></span><span class="ml"></span>';
		const badge = el.children[0] as HTMLElement;
		const tag = el.children[1] as HTMLElement;
		const label = el.children[2] as HTMLElement;
		badge.addEventListener('click', (e) => {
			e.stopPropagation(); // don't trigger the map's deselect-on-click
			onselect(m.id);
		});
		const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([m.lng, m.lat]).addTo(map!);
		return { marker, el, badge, tag, label };
	}

	/** Put each name label on the side with more room, so they don't run off the map. */
	function placeLabels() {
		if (!map) return;
		const width = map.getContainer().clientWidth;
		for (const { marker, label } of markerEls.values()) {
			label.classList.toggle('l', map.project(marker.getLngLat()).x > width * 0.6);
		}
	}

	$effect(() => {
		if (!ready || !map) return;
		const live = new Set(markers.map((m) => m.id));
		for (const [id, { marker }] of markerEls) {
			if (!live.has(id)) {
				marker.remove();
				markerEls.delete(id);
			}
		}
		for (const m of markers) {
			let entry = markerEls.get(m.id);
			if (!entry) {
				entry = makeMarker(m);
				markerEls.set(m.id, entry);
			}
			const { marker, el, badge, tag, label } = entry;
			marker.setLngLat([m.lng, m.lat]);
			el.className = ['mk', m.variant === 'dim' ? 'dim' : '', m.variant === 'base' ? 'base' : '', m.endpoint ? 'endpt' : '', m.colorClass, m.selected ? 'sel' : ''].filter(Boolean).join(' ');
			el.style.zIndex = m.selected ? '3' : m.variant === 'dim' ? '0' : '1';
			badge.className = ['badge', m.colorClass, m.shapeClass].filter(Boolean).join(' ');
			if (m.variant === 'base') badge.innerHTML = svg(m.icon ?? 'home');
			else badge.textContent = String(m.n);
			badge.setAttribute('aria-label', m.aria);
			badge.setAttribute('aria-pressed', String(!!m.selected));
			badge.tabIndex = m.variant === 'base' ? -1 : 0;
			tag.className = m.variant === 'cluster' ? 'lt' : 'dt';
			tag.textContent = m.variant === 'base' ? '' : m.tag;
			tag.hidden = m.variant === 'base' || !m.tag;
			label.textContent = m.name;
			label.hidden = !(m.label ?? m.variant !== 'dim') || !!m.selected;
		}
		placeLabels();
	});

	// ── cluster outlines + route lines + leg chips ──────────────────────
	$effect(() => {
		if (!ready || !map) return;
		const features: Feature<Polygon>[] = hulls
			.filter((h) => h.points.length >= 2)
			.map((h) => ({
				type: 'Feature',
				properties: { c: h.colorClass, s: h.strong ? 1 : 0 },
				geometry: { type: 'Polygon', coordinates: [clusterOutline(h.points, paddingFor(h.points))] }
			}));
		(map.getSource('hulls') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
	});

	$effect(() => {
		if (!ready || !map) return;
		const features: Feature<LineString>[] = lines
			.filter((l) => l.coordinates.length >= 2)
			.map((l) => ({
				type: 'Feature',
				properties: { kind: l.kind, color: l.dayIndex == null ? theme.primary : theme.days[l.dayIndex % 3] },
				geometry: { type: 'LineString', coordinates: l.coordinates }
			}));
		(map.getSource('lines') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
	});

	$effect(() => {
		if (!ready) return;
		(map?.getSource('suggested') as maplibregl.GeoJSONSource | undefined)?.setData({
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates: suggestedLine ?? [] }
		});
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
			const el = marker.getElement().firstElementChild as HTMLElement;
			el.textContent = chip.text;
			el.classList.toggle('dashed', !!chip.dashed);
		}
	});

	const escapeAttr = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

	// ── weather pins ────────────────────────────────────────────────────
	$effect(() => {
		if (!ready || !map) return;
		const live = new Set(weatherPins.map((p) => p.id));
		for (const [id, marker] of pinMarkers) {
			if (!live.has(id)) {
				marker.remove();
				pinMarkers.delete(id);
			}
		}
		for (const pin of weatherPins) {
			let marker = pinMarkers.get(pin.id);
			if (!marker) {
				const el = document.createElement('div');
				el.className = 'wxpin-wrap';
				marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, 44] }).setLngLat(pin.position).addTo(map!);
				pinMarkers.set(pin.id, marker);
			}
			marker.setLngLat(pin.position);
			const el = marker.getElement();
			el.innerHTML = `<span class="wxpin ${pin.colorClass}${pin.strong ? ' sel' : ''}" role="img" aria-label="${escapeAttr(pin.label)}"><svg class="ico ${pin.tone}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[pin.icon]}</svg>${pin.text}</span>`;
		}
	});

	// ── popup for the selected stop ─────────────────────────────────────
	$effect(() => {
		if (!ready || !map) return;
		popupMarker?.remove();
		popupMarker = undefined;
		if (!popup) return;
		const wrap = document.createElement('div');
		wrap.className = 'popupwrap';
		const card = document.createElement('div');
		card.className = 'popup';
		card.setAttribute('role', 'dialog');
		card.setAttribute('aria-label', `${popup.title} details`);
		const title = document.createElement('div');
		title.className = 'pt';
		title.append(popup.title + ' ');
		if (popup.cluster) {
			const tag = document.createElement('span');
			tag.className = `ctag ${popup.cluster.colorClass}`;
			tag.textContent = popup.cluster.letter;
			title.append(tag);
		}
		if (popup.dayTag) {
			const tag = document.createElement('span');
			tag.className = `dtag ${popup.dayTag.colorClass}`;
			tag.style.marginLeft = 'auto';
			tag.textContent = popup.dayTag.text;
			title.append(tag);
		}
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
		const { x, y } = map.project(popup.at);
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
		popupMarker = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat(popup.at).addTo(map);
	});

	// ── auto-fit when the framed points change (not on selection) ───────
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
