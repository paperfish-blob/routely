<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as maplibregl from 'maplibre-gl';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import type { Feature, LineString } from 'geojson';
	import { onMount } from 'svelte';
	import type { Stop } from '#lib/types.ts';

	export type LineKind = 'straight' | 'road';
	export interface MapLine {
		coordinates: [number, number][];
		kind: LineKind;
	}
	export interface PopupInfo {
		title: string;
		detail: string;
	}

	interface Props {
		stops: Stop[];
		selectedId: string | null;
		line: MapLine | null;
		/** Proposed order from "Suggest better order", drawn until accepted or discarded. */
		previewLine?: [number, number][] | null;
		/** Dashed highlight from the selected stop to its nearest neighbour. */
		nearestLink: [[number, number], [number, number]] | null;
		popup: PopupInfo | null;
		/** Pixels at the bottom covered by the mobile sheet; keeps fit-bounds clear of it. */
		bottomInset?: number;
		onselect: (id: string | null) => void;
	}

	let {
		stops,
		selectedId,
		line,
		previewLine = null,
		nearestLink,
		popup,
		bottomInset = 0,
		onselect
	}: Props = $props();

	const OSM_STYLE: maplibregl.StyleSpecification = {
		version: 8,
		sources: {
			osm: {
				type: 'raster',
				tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
				maxzoom: 19,
				attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
	const markers = new Map<string, { marker: maplibregl.Marker; el: HTMLElement }>();
	let activePopup: maplibregl.Popup | undefined;

	onMount(() => {
		// maplibre derives its default worker URL from import.meta.url, which breaks once
		// Vite pre-bundles/hashes it. Point it at a worker bundled by Vite instead.
		maplibregl.setWorkerUrl(workerUrl);
		map = new maplibregl.Map({
			container,
			style: OSM_STYLE,
			center: [10, 30],
			zoom: 1.5,
			attributionControl: { compact: true }
		});
		map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
		map.on('click', () => onselect(null));
		map.on('load', () => {
			const m = map!;
			m.addSource('line', { type: 'geojson', data: emptyLine() });
			m.addSource('nearest', { type: 'geojson', data: emptyLine() });
			m.addSource('preview', { type: 'geojson', data: emptyLine() });
			m.addLayer({
				id: 'line-road-casing',
				type: 'line',
				source: 'line',
				filter: ['==', ['get', 'kind'], 'road'],
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': 0.9 }
			});
			m.addLayer({
				id: 'line-road',
				type: 'line',
				source: 'line',
				filter: ['==', ['get', 'kind'], 'road'],
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: { 'line-color': '#0f766e', 'line-width': 5 }
			});
			m.addLayer({
				id: 'line-straight',
				type: 'line',
				source: 'line',
				filter: ['==', ['get', 'kind'], 'straight'],
				layout: { 'line-join': 'round' },
				paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-dasharray': [2, 2] }
			});
			m.addLayer({
				id: 'preview-line',
				type: 'line',
				source: 'preview',
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: { 'line-color': '#d97706', 'line-width': 5, 'line-dasharray': [1.5, 1.5] }
			});
			m.addLayer({
				id: 'nearest-link',
				type: 'line',
				source: 'nearest',
				paint: { 'line-color': '#d97706', 'line-width': 3, 'line-dasharray': [1, 1.5] }
			});
			ready = true;
		});
		return () => {
			activePopup?.remove();
			for (const { marker } of markers.values()) marker.remove();
			markers.clear();
			map?.remove();
			map = undefined;
			ready = false;
		};
	});

	function makeMarkerEl(id: string): HTMLElement {
		const el = document.createElement('button');
		el.type = 'button';
		el.className = 'routely-marker';
		el.addEventListener('click', (e) => {
			e.stopPropagation(); // don't trigger the map's deselect-on-click
			onselect(id);
		});
		return el;
	}

	// Markers: numbered in itinerary order, selected one raised and recoloured.
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
				const el = makeMarkerEl(stop.id);
				const marker = new maplibregl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map!);
				entry = { marker, el };
				markers.set(stop.id, entry);
			}
			entry.marker.setLngLat([stop.lng, stop.lat]);
			entry.el.textContent = String(i + 1);
			entry.el.setAttribute('aria-label', `Stop ${i + 1}: ${stop.name}`);
			const selected = stop.id === selectedId;
			entry.el.classList.toggle('selected', selected);
			entry.el.style.zIndex = selected ? '2' : '1';
		});
	});

	function setSource(name: string, coordinates: [number, number][], kind?: LineKind) {
		const source = map?.getSource(name) as maplibregl.GeoJSONSource | undefined;
		source?.setData({
			type: 'Feature',
			properties: kind ? { kind } : {},
			geometry: { type: 'LineString', coordinates }
		});
	}

	$effect(() => {
		if (!ready) return;
		setSource('line', line?.coordinates ?? [], line?.kind);
	});

	$effect(() => {
		if (!ready) return;
		setSource('nearest', nearestLink ?? []);
	});

	$effect(() => {
		if (!ready) return;
		setSource('preview', previewLine ?? []);
	});

	// Popup for the selected stop (nearest neighbour info).
	$effect(() => {
		if (!ready || !map) return;
		activePopup?.remove();
		activePopup = undefined;
		const stop = stops.find((s) => s.id === selectedId);
		if (!stop || !popup) return;
		const content = document.createElement('div');
		const title = document.createElement('strong');
		title.textContent = popup.title;
		const detail = document.createElement('div');
		detail.textContent = popup.detail;
		content.append(title, detail);
		activePopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 22, maxWidth: '240px' })
			.setLngLat([stop.lng, stop.lat])
			.setDOMContent(content)
			.addTo(map);
	});

	// Auto fit-bounds when stop positions or the drawn line change (not on selection).
	const fitKey = $derived(
		stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join('|') +
			`#${line?.kind}:${line?.coordinates.length ?? 0}`
	);

	$effect(() => {
		void fitKey;
		const inset = bottomInset;
		if (!ready || !map || stops.length === 0) return;
		map.resize(); // the container may have just changed size (mobile sheet / rotation)
		const bounds = new maplibregl.LngLatBounds();
		for (const s of stops) bounds.extend([s.lng, s.lat]);
		for (const c of line?.coordinates ?? []) bounds.extend(c);
		map.fitBounds(bounds, {
			padding: { top: 70, left: 60, right: 60, bottom: 70 + inset },
			maxZoom: 14,
			duration: 600
		});
	});
</script>

<div class="map" bind:this={container} role="application" aria-label="Itinerary map"></div>

<style>
	.map {
		width: 100%;
		height: 100%;
	}
	:global(.routely-marker) {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 2px solid #fff;
		border-radius: 50%;
		background: var(--brand, #0f766e);
		color: #fff;
		font: 700 13px/1 system-ui, sans-serif;
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
		cursor: pointer;
	}
	:global(.routely-marker.selected) {
		background: var(--accent, #d97706);
		transform: scale(1.25);
	}
	:global(.maplibregl-popup-content) {
		font: 0.82rem/1.35 system-ui, sans-serif;
		padding: 0.5rem 0.7rem;
	}
</style>
