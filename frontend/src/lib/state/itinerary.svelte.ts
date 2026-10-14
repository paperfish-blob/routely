import { untrack } from 'svelte';
import { api as defaultApi, ApiError } from '../api';
import { buildClusters, clusterStyleAt, type ClusterInfo, type ClusterStyle } from '../clusters';
import {
	copyStopToDay,
	duplicateDay,
	endLegsKm,
	findStop,
	haversineKm,
	MAX_STOPS_PER_DAY,
	moveStopToDay,
	newDay,
	resolveEnds,
	SAME_PLACE_KM,
	START_SUFFIX,
	waypointsOf
} from '../days';
import { formatKm, newId, orderBy } from '../format';
import type { ItineraryStore } from '../storage';
import type {
	Day,
	DistancesResponse,
	EndPoint,
	ResolvedEnds,
	StartPoint,
	TempUnit,
	NearestNeighbour,
	OptimizeResponse,
	RouteMode,
	RouteResponse,
	Stop
} from '../types';
import {
	areaDiffs,
	areaRows,
	isoDayDate,
	planAreas,
	weatherPoints,
	type AreaDiff,
	type AreaGroup,
	type AreaPlan,
	type AreaRowBase,
	type WeatherPoint,
	type WeatherReading
} from '../weather';
import { toasts } from './toasts.svelte';
import { WeatherState } from './weather.svelte';

type Api = typeof defaultApi;

export const MAX_STOPS = MAX_STOPS_PER_DAY;
/** Cluster threshold presets offered in the summary card (km). */
export const CLUSTER_PRESETS_KM = [5, 15, 30, 60] as const;
export const DEFAULT_CLUSTER_KM = 30;

const RECOMPUTE_DELAY_MS = 250;
const ROUTE_DELAY_MS = 400; // OSRM's public server is shared; don't hammer it while editing
const NOTICE_MS = 6000;

const stopsKey = (stops: Stop[]) => stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join(';');
const routeKey = (mode: RouteMode, stops: Stop[]) => `${mode}|${stopsKey(stops)}`;

function messageOf(err: unknown): string {
	return err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong';
}
const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

export interface Notice {
	variant: 'ok' | 'info';
	message: string;
}

/** One row of the weather-by-area view with its reading (or why it has none). */
export interface AreaRow extends AreaRowBase {
	status: 'ok' | 'loading' | 'error';
	reading: WeatherReading | null;
	diffs: AreaDiff[];
}

export type WeatherView = 'auto' | 'ends' | 'areas';

/** What the weather card shows for a day. */
export interface DayWeather {
	/** hidden: nothing to look up; nodates: the trip has no dates; loading / ok / error: the lookups' outcome. */
	kind: 'hidden' | 'nodates' | 'loading' | 'ok' | 'error';
	date: string | null;
	points: WeatherPoint[];
	readings: WeatherReading[];
}

export interface Leg {
	km: number;
	seconds: number | null;
	/** A straight-line estimate, shown as "≈ 9.4 km". */
	approx: boolean;
}

export interface DayStats {
	km: number | null;
	seconds: number | null;
	approx: boolean;
	/** False while the numbers are still being fetched. */
	ready: boolean;
}

export interface TransferInfo {
	key: string;
	fromDayId: string;
	toDayId: string;
	from: Stop;
	to: Stop;
	km: number;
	seconds: number | null;
	approx: boolean;
	geometry: [number, number][] | null;
}

interface DayCalc {
	summary: DistancesResponse | null;
	summaryLoading: boolean;
	summaryError: string | null;
	route: RouteResponse | null;
	/** The routeKey `route` was computed for, so a stale route is never shown. */
	routeFor: string | null;
	routeLoading: boolean;
	routeError: string | null;
}

interface TransferCalc {
	route: RouteResponse;
}

const emptyCalc = (): DayCalc => ({
	summary: null,
	summaryLoading: false,
	summaryError: null,
	route: null,
	routeFor: null,
	routeLoading: false,
	routeError: null
});

export class ItineraryState {
	name = $state('');
	/** ISO date of Day 1; later days follow from it. */
	startDate = $state<string | null>(null);
	/** Days start and end at a base (hotel). */
	useBase = $state(true);
	days = $state<Day[]>([newDay()]);
	/** The day being edited; null shows all days. */
	activeId = $state<string | null>(null);
	/** Where new stops go when it differs from the active day (the "Adding to" chip). */
	addToId = $state<string | null>(null);
	routeMode = $state<RouteMode>('driving');
	tempUnit = $state<TempUnit>('c');
	clusterThresholdKm = $state<number>(DEFAULT_CLUSTER_KM);
	selectedId = $state<string | null>(null);
	loaded = $state(false);

	/** Day tab currently under a dragged stop. */
	dropDayId = $state<string | null>(null);

	private calc = $state<Record<string, DayCalc>>({});
	private transferCalc = $state<Record<string, TransferCalc>>({});
	private nonce = $state(0);
	/** The route key whose fallback/error banner the user dismissed. */
	private dismissedFor = $state<string | null>(null);

	/** Suggest-order panel (for the active day). */
	suggestOpen = $state(false);
	suggestKeepStart = $state(false);
	private proposal = $state<(OptimizeResponse & { key: string }) | null>(null);
	optimizing = $state(false);
	optimizeError = $state<string | null>(null);

	notice = $state<Notice | null>(null);
	private noticeTimer: ReturnType<typeof setTimeout> | undefined;

	/** Non-reactive bookkeeping for the fetch scheduler. */
	private sigs = new Map<string, { summary?: string; route?: string }>();
	private transferSigs = new Set<string>();
	private pending = new Map<string, { timer: ReturnType<typeof setTimeout>; controller: AbortController }>();

	readonly maxStops = MAX_STOPS;

	readonly weather: WeatherState;

	constructor(
		private readonly store: ItineraryStore,
		private readonly api: Api = defaultApi
	) {
		this.weather = new WeatherState((lat, lng, date, signal) => this.api.weather(lat, lng, date, signal));
	}

	// ── days & the active day ───────────────────────────────────────────

	activeDay = $derived(this.days.find((d) => d.id === this.activeId) ?? null);
	/** Showing every day (only possible with more than one). */
	isAll = $derived(this.activeId === null && this.days.length > 1);
	multiDay = $derived(this.days.length > 1);

	/** The active day's stops (empty in the all-days view). Mutations apply to that day. */
	get stops(): Stop[] {
		return this.activeDay?.stops ?? [];
	}

	allStops = $derived(this.days.flatMap((d) => d.stops));
	totalStopCount = $derived(this.allStops.length);

	dayIndex(id: string): number {
		return this.days.findIndex((d) => d.id === id);
	}

	/** Where a new stop would go. */
	addTarget = $derived(
		this.days.find((d) => d.id === this.addToId) ??
			this.activeDay ??
			this.days[this.days.length - 1]
	);

	selected = $derived(this.stopAny(this.selectedId) ?? null);

	stopAny(id: string | null): Stop | undefined {
		if (!id) return undefined;
		return findStop(this.days, id)?.stop;
	}

	/** Alias kept for components that only care about stops. */
	stopById(id: string): Stop | undefined {
		return this.stopAny(id);
	}

	dayOfStop(id: string): Day | undefined {
		return findStop(this.days, id)?.day;
	}

	// ── per-day calculations ────────────────────────────────────────────

	private activeCalc = $derived(this.activeDay ? (this.calc[this.activeDay.id] ?? null) : null);
	summary = $derived(this.activeCalc?.summary ?? null);
	summaryLoading = $derived(this.activeCalc?.summaryLoading ?? false);
	summaryError = $derived(this.activeCalc?.summaryError ?? null);
	routeLoading = $derived(this.activeCalc?.routeLoading ?? false);
	routeError = $derived(this.activeCalc?.routeError ?? null);

	/** Every day's start and end after following chains (nothing when the feature is off). */
	resolved = $derived<ResolvedEnds[]>(
		this.useBase ? resolveEnds(this.days) : this.days.map(() => ({ start: null, end: null }))
	);

	endsOf(day: Day): ResolvedEnds {
		return this.resolved[this.dayIndex(day.id)] ?? { start: null, end: null };
	}

	routeKeyOf(day: Day): string {
		return routeKey(this.routeMode, waypointsOf(day, this.endsOf(day)).list);
	}

	/** The day's road route, only if it still matches the current mode, stops and start/end. */
	dayRoute(day: Day): RouteResponse | null {
		const c = this.calc[day.id];
		return c?.route && c.routeFor === this.routeKeyOf(day) ? c.route : null;
	}

	/** Road geometry for a day, or null when straight lines should be drawn. */
	dayRoad(day: Day): [number, number][] | null {
		const route = this.dayRoute(day);
		return route && !route.fallback ? route.geometry.coordinates : null;
	}

	/** The fetched route for the active day (kept under its old name for the summary/banner code). */
	activeRoute = $derived(this.activeDay ? this.dayRoute(this.activeDay) : null);
	roadGeometry = $derived(this.activeDay ? this.dayRoad(this.activeDay) : null);

	/** The summary matches the stops on screen (it lags briefly while recomputing). */
	private summaryFresh = $derived(
		this.summary !== null &&
			this.summary.stop_ids.join('|') === this.stops.map((s) => s.id).join('|')
	);

	clusterInfos = $derived<ClusterInfo[]>(
		this.summary && this.summaryFresh
			? buildClusters(this.summary.clusters, this.summary.stop_ids, this.summary.matrix_km)
			: []
	);

	dayStats(day: Day): DayStats {
		if (day.stops.length === 0) return { km: 0, seconds: 0, approx: false, ready: true };
		const route = this.dayRoute(day);
		if (this.routeMode !== 'straight' && route && !route.fallback) {
			return { km: route.distance_km, seconds: route.duration_s, approx: false, ready: true };
		}
		const legs = endLegsKm(day, this.endsOf(day));
		if (day.stops.length === 1) {
			return { km: legs.start + legs.end, seconds: null, approx: true, ready: true };
		}
		const s = this.calc[day.id]?.summary;
		const fresh = s && s.stop_ids.join('|') === day.stops.map((x) => x.id).join('|');
		if (!fresh) return { km: null, seconds: null, approx: true, ready: false };
		return { km: s.total_km + legs.start + legs.end, seconds: null, approx: true, ready: true };
	}

	/** Total distance for the active day: road distance when a road route is shown, else straight-line. */
	totalKm = $derived(this.activeDay ? this.dayStats(this.activeDay).km : null);
	/** Travel time for the active day's road route, or null (straight-line / loading / fallback). */
	totalSeconds = $derived(this.activeDay ? this.dayStats(this.activeDay).seconds : null);

	/** Distance/time for the leg after `stopId` within a day (the last stop's leg runs on to the end point). */
	legAfterIn(day: Day, stopId: string): Leg | null {
		const i = day.stops.findIndex((s) => s.id === stopId);
		if (i < 0) return null;
		const last = i === day.stops.length - 1;
		const end = this.endsOf(day).end;
		if (last && !end) return null;
		const road = this.dayRoute(day);
		if (this.routeMode !== 'straight' && road && !road.fallback) {
			const leg = road.legs.find((l) => l.from_id === stopId);
			if (leg) return { km: leg.distance_km, seconds: leg.duration_s, approx: false };
		}
		if (last) return { km: haversineKm(day.stops[i], end!), seconds: null, approx: true };
		const leg = this.calc[day.id]?.summary?.legs.find((l) => l.from_id === stopId);
		return leg ? { km: leg.distance_km, seconds: null, approx: true } : null;
	}

	/** The leg from the day's start point to its first stop. */
	startLegIn(day: Day): Leg | null {
		const start = this.endsOf(day).start;
		if (!start || day.stops.length === 0) return null;
		const road = this.dayRoute(day);
		if (this.routeMode !== 'straight' && road && !road.fallback) {
			const leg = road.legs.find((l) => l.from_id === start.id + START_SUFFIX);
			if (leg) return { km: leg.distance_km, seconds: leg.duration_s, approx: false };
		}
		return { km: haversineKm(start, day.stops[0]), seconds: null, approx: true };
	}

	legAfter(id: string): Leg | null {
		return this.activeDay ? this.legAfterIn(this.activeDay, id) : null;
	}

	nearestOf(id: string | null): NearestNeighbour | null {
		if (!id || !this.summary) return null;
		return this.summary.nearest.find((n) => n.stop_id === id) ?? null;
	}

	clusterOf(id: string): ClusterInfo | null {
		return this.clusterInfos.find((c) => c.stopIds.includes(id)) ?? null;
	}

	/** Cluster style for a stop; a placeholder (A) until the first summary arrives. */
	styleOf(id: string): ClusterStyle {
		return this.clusterOf(id)?.style ?? clusterStyleAt(0);
	}

	// ── overnight transfers and trip totals ─────────────────────────────

	private transferKey(a: Stop, b: Stop): string {
		return `${a.lat},${a.lng}>${b.lat},${b.lng}|${this.routeMode}`;
	}

	/** Travel between the end of one day and the start of the next (same place → none). */
	transfers = $derived.by<TransferInfo[]>(() => {
		const list: TransferInfo[] = [];
		const used = this.days.filter((d) => d.stops.length > 0);
		for (let i = 0; i < used.length - 1; i++) {
			const a = this.endsOf(used[i]);
			const b = this.endsOf(used[i + 1]);
			const from = a.end ?? used[i].stops[used[i].stops.length - 1];
			const to = b.start ?? used[i + 1].stops[0];
			if (!from || !to) continue;
			const straight = haversineKm(from, to);
			if (straight < SAME_PLACE_KM) continue;
			const key = this.transferKey(from, to);
			const route = this.transferCalc[key]?.route;
			const road = this.routeMode !== 'straight' && route && !route.fallback;
			list.push({
				key,
				fromDayId: used[i].id,
				toDayId: used[i + 1].id,
				from,
				to,
				km: road ? route.distance_km : straight,
				seconds: road ? route.duration_s : null,
				approx: !road,
				geometry: road ? route.geometry.coordinates : null
			});
		}
		return list;
	});

	transferAfter(dayId: string): TransferInfo | null {
		return this.transfers.find((t) => t.fromDayId === dayId) ?? null;
	}

	tripTotals = $derived.by<DayStats>(() => {
		let km = 0;
		let seconds: number | null = 0;
		let approx = false;
		let ready = true;
		for (const day of this.days) {
			const s = this.dayStats(day);
			if (!s.ready || s.km === null) ready = false;
			km += s.km ?? 0;
			approx ||= s.approx;
			seconds = seconds !== null && s.seconds !== null ? seconds + s.seconds : null;
		}
		for (const t of this.transfers) {
			km += t.km;
			approx ||= t.approx;
			seconds = seconds !== null && t.seconds !== null ? seconds + t.seconds : null;
		}
		return { km, seconds, approx, ready };
	});

	// ── weather ─────────────────────────────────────────────────────────

	/** ISO date of a day, or null when the trip has no dates. */
	dateOf(day: Day): string | null {
		return isoDayDate(this.startDate, this.dayIndex(day.id));
	}

	/** Weather at the day's start and end (one reading when they are close). */
	dayWeather(day: Day): DayWeather {
		const points = weatherPoints(day, this.endsOf(day));
		const date = this.dateOf(day);
		if (points.length === 0) return { kind: 'hidden', date, points, readings: [] };
		if (!date) return { kind: 'nodates', date, points, readings: [] };
		const readings: WeatherReading[] = [];
		let pending = false;
		for (const point of points) {
			const entry = this.weather.entry(point.place, date);
			if (entry?.status === 'ok') readings.push({ ...point, wx: entry.wx });
			else if (!entry || entry.status === 'loading') pending = true;
		}
		// A start or end that failed does not hide the other one's weather.
		const kind = pending ? 'loading' : readings.length > 0 ? 'ok' : 'error';
		return { kind, date, points, readings };
	}

	retryWeather(): void {
		this.weather.retry();
	}

	setTempUnit(unit: TempUnit): void {
		this.tempUnit = unit;
	}

	/** Which weather view the person chose; auto = by area whenever the day has areas far enough apart. */
	weatherView = $state<WeatherView>('auto');
	/** The area row opened by clicking it (a selected stop opens its own area when none is). */
	areaOpenId = $state<string | null>(null);

	/** The active day's clusters grouped into areas (30 km rule), once clusters and dates exist. */
	areaPlan = $derived.by<AreaPlan | null>(() => {
		const day = this.activeDay;
		if (!day || !this.startDate || this.clusterInfos.length === 0) return null;
		const ends = this.endsOf(day);
		return planAreas(this.clusterInfos, (id) => this.stopAny(id), ends.start, ends.end);
	});
	areasApplicable = $derived(this.areaPlan?.applicable ?? false);
	showAreas = $derived(this.areasApplicable && this.weatherView !== 'ends');

	setWeatherView(view: WeatherView): void {
		this.weatherView = view;
		this.areaOpenId = null;
	}

	/** Rows for the by-area view (empty unless it is showing). */
	areaRows = $derived.by<AreaRow[]>(() => {
		const day = this.activeDay;
		const plan = this.areaPlan;
		const date = day ? this.dateOf(day) : null;
		if (!day || !plan || !date || !this.showAreas) return [];
		const ends = this.endsOf(day);
		const base = areaRows(plan, ends.start, ends.end);
		const rows = base.map((r): AreaRow => {
			const entry = this.weather.entry(r.place, date);
			const role = r.outer ? (r.outer.role === 'both' ? 'day' : r.outer.role) : 'day';
			const reading: WeatherReading | null = entry?.status === 'ok' ? { role, place: r.place as never, wx: entry.wx } : null;
			return { ...r, reading, status: reading ? 'ok' : entry?.status === 'error' ? 'error' : 'loading', diffs: [] };
		});
		const all = rows.flatMap((r) => (r.reading ? [r.reading.wx] : []));
		for (const r of rows) {
			if (!r.reading) continue;
			r.diffs = areaDiffs(r.reading.wx, all.filter((w) => w !== r.reading!.wx), this.tempUnit);
		}
		return rows;
	});

	/** The row that is open: the one clicked, else the area of the selected stop. */
	openAreaId = $derived.by<string | null>(() => {
		if (this.areaOpenId) return this.areaOpenId;
		const id = this.selectedId;
		if (!id) return null;
		return this.areaPlan?.groups.find((g) => g.stops.some((s) => s.id === id))?.id ?? null;
	});

	/** Stops of the open area, to tint in the list and outline on the map. */
	areaStopIds = $derived.by<Set<string>>(() => {
		const g: AreaGroup | undefined = this.areaPlan?.groups.find((x) => x.id === this.openAreaId);
		return new Set(g?.stops.map((s) => s.id) ?? []);
	});

	toggleArea(id: string): void {
		this.areaOpenId = this.areaOpenId === id ? null : id;
		this.selectedId = null;
	}

	/** The area row a cluster belongs to (for the temperature on its chip). */
	areaOfCluster(clusterId: number): AreaRow | null {
		return this.areaRows.find((r) => r.group?.clusters.some((c) => c.id === clusterId)) ?? null;
	}

	private syncWeather(): void {
		const wants: { place: WeatherPoint['place']; date: string }[] = [];
		for (const day of this.days) {
			const date = this.dateOf(day);
			if (!date) continue;
			for (const { place } of weatherPoints(day, this.endsOf(day))) {
				wants.push({ place: { id: place.id, name: place.name, lat: place.lat, lng: place.lng }, date });
			}
		}
		// By area adds the area centres (and any far-away start/end) for the day being looked at.
		const active = this.activeDay;
		const activeDate = active ? this.dateOf(active) : null;
		if (active && activeDate && this.showAreas && this.areaPlan) {
			const ends = this.endsOf(active);
			for (const r of areaRows(this.areaPlan, ends.start, ends.end)) {
				wants.push({ place: { id: r.place.id, name: r.place.name, lat: r.place.lat, lng: r.place.lng }, date: activeDate });
			}
		}
		untrack(() => this.weather.want(wants));
	}

	// ── routing health ──────────────────────────────────────────────────

	private degradedDays = $derived(
		this.routeMode === 'straight'
			? []
			: (this.isAll ? this.days : this.activeDay ? [this.activeDay] : []).filter((d) => {
					if (waypointsOf(d, this.endsOf(d)).list.length < 2) return false;
					const c = this.calc[d.id];
					return c?.routeError != null || this.dayRoute(d)?.fallback === true;
				})
	);
	routingDegraded = $derived(this.degradedDays.length > 0);
	private degradedKey = $derived(
		this.isAll
			? `all|${this.days.map((d) => this.routeKeyOf(d)).join('#')}`
			: this.activeDay
				? this.routeKeyOf(this.activeDay)
				: ''
	);
	routingBannerVisible = $derived(this.routingDegraded && this.dismissedFor !== this.degradedKey);
	/** The first reason a route fell back, for the banner copy. */
	routingFallbackReason = $derived(
		this.degradedDays.map((d) => this.dayRoute(d)?.fallback_reason).find((r) => r) ?? null
	);
	/** What the mode toggle shows: Straight line while routing is degraded, as in the design. */
	effectiveMode = $derived<RouteMode>(this.routingDegraded ? 'straight' : this.routeMode);

	// ── suggest better order ────────────────────────────────────────────

	/** The pending suggestion, unless the stops (or base) changed since it was computed. */
	activeProposal = $derived(
		this.proposal && this.proposal.key === this.proposalKey() ? this.proposal : null
	);
	proposalChangesOrder = $derived(
		this.activeProposal
			? this.activeProposal.order.some((id, i) => id !== this.stops[i]?.id)
			: false
	);
	/** A fixed start exists, so "keep the first stop as the start" does not apply. */
	hasStart = $derived(!!(this.activeDay && this.endsOf(this.activeDay).start));
	hasEnd = $derived(!!(this.activeDay && this.endsOf(this.activeDay).end));
	/** Kept for components that only ask whether the day is anchored at its start. */
	hasBase = $derived(this.hasStart);

	private proposalKey(): string {
		const e = this.activeDay ? this.endsOf(this.activeDay) : { start: null, end: null };
		const at = (p: Stop | null) => (p ? `${p.lat},${p.lng}` : '');
		return `${this.activeId}|${at(e.start)}>${at(e.end)}|${stopsKey(this.stops)}`;
	}

	// ── lifecycle ───────────────────────────────────────────────────────

	/** Loads persisted state, then starts persistence + recompute effects. Returns a disposer. */
	init(): () => void {
		void this.store.load().then((saved) => {
			if (saved) {
				this.days = saved.days.map((d) => ({ ...d, stops: d.stops.slice(0, MAX_STOPS) }));
				this.routeMode = saved.routeMode;
				this.name = saved.name ?? '';
				this.startDate = saved.startDate ?? null;
				this.useBase = saved.useBase ?? true;
				this.tempUnit = saved.tempUnit ?? 'c';
				this.clusterThresholdKm = saved.clusterThresholdKm ?? DEFAULT_CLUSTER_KM;
			}
			const first = this.days.find((d) => d.stops.length > 0) ?? this.days[0];
			this.activeId = this.days.length > 1 && !first ? null : first.id;
			this.loaded = true;
		});
		const dispose = $effect.root(() => {
			$effect(() => this.persist());
			$effect(() => this.recomputeAll());
			$effect(() => this.syncWeather());
		});
		return () => {
			dispose();
			this.weather.dispose();
			for (const { timer, controller } of this.pending.values()) {
				clearTimeout(timer);
				controller.abort();
			}
			this.pending.clear();
		};
	}

	private persist(): void {
		const days = $state.snapshot(this.days);
		const { routeMode, name, clusterThresholdKm, startDate, useBase, tempUnit } = this;
		if (!this.loaded) return; // don't overwrite saved data before it is read
		const empty =
			days.length === 1 &&
			days[0].stops.length === 0 &&
			days[0].start.kind !== 'place' &&
			days[0].end.kind === 'start' &&
			!days[0].title &&
			!name.trim();
		if (empty && !startDate) void this.store.clear();
		else
			void this.store.save({
				version: 3,
				days,
				routeMode,
				name,
				clusterThresholdKm,
				useBase,
				tempUnit,
				...(startDate ? { startDate } : {})
			});
	}

	// ── fetching ────────────────────────────────────────────────────────

	private recomputeAll(): void {
		const days = $state.snapshot(this.days);
		const { routeMode: mode, clusterThresholdKm: threshold } = this;
		const ends = $state.snapshot(this.resolved) as ResolvedEnds[];
		void this.nonce;
		if (!this.loaded) return;
		untrack(() => this.syncCalc(days, mode, threshold, ends));
	}

	private schedule(key: string, delay: number, run: (signal: AbortSignal) => Promise<void>): void {
		const existing = this.pending.get(key);
		if (existing) {
			clearTimeout(existing.timer);
			existing.controller.abort();
		}
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				await run(controller.signal);
			} finally {
				if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
			}
		}, delay);
		this.pending.set(key, { timer, controller });
	}

	private cancel(key: string): void {
		const p = this.pending.get(key);
		if (!p) return;
		clearTimeout(p.timer);
		p.controller.abort();
		this.pending.delete(key);
	}

	private patch(dayId: string, change: Partial<DayCalc>): void {
		this.calc[dayId] = { ...(this.calc[dayId] ?? emptyCalc()), ...change };
	}

	private syncCalc(days: Day[], mode: RouteMode, threshold: number, ends: ResolvedEnds[]): void {
		const live = new Set(days.map((d) => d.id));
		for (const id of Object.keys(this.calc)) {
			if (live.has(id)) continue;
			this.cancel(`summary:${id}`);
			this.cancel(`route:${id}`);
			this.sigs.delete(id);
			delete this.calc[id];
		}

		days.forEach((day, i) => {
			const sig = this.sigs.get(day.id) ?? {};
			this.sigs.set(day.id, sig);
			this.syncSummary(day, threshold, sig);
			this.syncRoute(day, mode, ends[i], sig);
		});
		this.syncTransfers(days, mode, ends);
	}

	private syncSummary(day: Day, threshold: number, sig: { summary?: string }): void {
		const key = `summary:${day.id}`;
		if (day.stops.length < 2) {
			this.cancel(key);
			delete sig.summary;
			if (this.calc[day.id]?.summary || this.calc[day.id]?.summaryError) {
				this.patch(day.id, { summary: null, summaryError: null, summaryLoading: false });
			}
			return;
		}
		const next = `${threshold}|${stopsKey(day.stops)}`;
		if (sig.summary === next) return;
		sig.summary = next;
		this.patch(day.id, { summaryLoading: true });
		const stops = day.stops;
		this.schedule(key, RECOMPUTE_DELAY_MS, async (signal) => {
			try {
				const summary = await this.api.distances(stops, threshold, signal);
				this.patch(day.id, { summary, summaryError: null });
			} catch (err) {
				if (isAbort(err)) return;
				this.patch(day.id, { summaryError: messageOf(err) });
			} finally {
				if (!signal.aborted) this.patch(day.id, { summaryLoading: false });
			}
		});
	}

	private syncRoute(day: Day, mode: RouteMode, ends: ResolvedEnds, sig: { route?: string }): void {
		const key = `route:${day.id}`;
		const { list } = waypointsOf(day, ends);
		if (mode === 'straight' || list.length < 2) {
			this.cancel(key);
			delete sig.route;
			const c = this.calc[day.id];
			if (c && (c.route || c.routeError || c.routeLoading)) {
				this.patch(day.id, { route: null, routeFor: null, routeError: null, routeLoading: false });
			}
			return;
		}
		const next = routeKey(mode, list);
		if (sig.route === next) return;
		sig.route = next;
		this.patch(day.id, { routeLoading: true, routeError: null });
		this.schedule(key, ROUTE_DELAY_MS, async (signal) => {
			try {
				const route = await this.api.route(list, mode, signal);
				this.patch(day.id, { route, routeFor: next, routeError: null });
			} catch (err) {
				if (isAbort(err)) return;
				this.patch(day.id, { route: null, routeFor: null, routeError: messageOf(err) });
			} finally {
				if (!signal.aborted) this.patch(day.id, { routeLoading: false });
			}
		});
	}

	private syncTransfers(days: Day[], mode: RouteMode, ends: ResolvedEnds[]): void {
		if (mode === 'straight') return; // straight-line transfers need no request
		const used = days.map((d, i) => ({ d, e: ends[i] })).filter(({ d }) => d.stops.length > 0);
		for (let i = 0; i < used.length - 1; i++) {
			const from = used[i].e.end ?? used[i].d.stops[used[i].d.stops.length - 1];
			const to = used[i + 1].e.start ?? used[i + 1].d.stops[0];
			if (haversineKm(from, to) < SAME_PLACE_KM) continue;
			const key = `${from.lat},${from.lng}>${to.lat},${to.lng}|${mode}`;
			if (this.transferSigs.has(key)) continue;
			this.transferSigs.add(key);
			this.schedule(`transfer:${key}`, ROUTE_DELAY_MS, async (signal) => {
				try {
					const route = await this.api.route(
						[
							{ ...from, id: 'a' },
							{ ...to, id: 'b' }
						],
						mode,
						signal
					);
					this.transferCalc[key] = { route };
				} catch (err) {
					if (!isAbort(err)) this.transferSigs.delete(key); // allow a later retry
				}
			});
		}
	}

	retryRoute(): void {
		this.dismissedFor = null;
		for (const sig of this.sigs.values()) delete sig.route;
		this.transferSigs.clear();
		this.nonce++;
	}

	dismissRoutingBanner(): void {
		this.dismissedFor = this.degradedKey;
	}

	retrySummary(): void {
		for (const sig of this.sigs.values()) delete sig.summary;
		this.nonce++;
	}

	// ── trip settings ───────────────────────────────────────────────────

	setName(value: string): void {
		this.name = value.slice(0, 80);
	}

	setStartDate(iso: string | null): void {
		this.startDate = iso;
	}

	setUseBase(on: boolean): void {
		this.useBase = on;
		this.closeSuggest();
	}

	setRouteMode(mode: RouteMode): void {
		this.routeMode = mode;
		this.dismissedFor = null;
	}

	setClusterThreshold(km: number): void {
		this.clusterThresholdKm = km;
	}

	// ── days ────────────────────────────────────────────────────────────

	setActive(id: string | null): void {
		if (id === null && this.days.length < 2) return;
		if (id !== null && !this.days.some((d) => d.id === id)) return;
		if (this.activeId === id) return;
		this.activeId = id;
		this.addToId = null;
		this.selectedId = null;
		this.closeSuggest();
	}

	setAddTarget(dayId: string): void {
		this.addToId = dayId === this.activeId ? null : dayId;
	}

	/** Adds a day. `afterId` inserts after that day, otherwise at the end. Returns the new day. */
	addDay(options: { afterId?: string | null; copyOf?: string; activate?: boolean } = {}): Day {
		const source = options.copyOf ? this.days.find((d) => d.id === options.copyOf) : undefined;
		const day = source ? duplicateDay($state.snapshot(source) as Day) : newDay();
		const at = Math.max(0, options.afterId ? this.dayIndex(options.afterId) + 1 : this.days.length);
		this.days.splice(at, 0, day);
		if (options.activate !== false) this.setActive(day.id);
		return day;
	}

	renameDay(id: string, title: string): void {
		const day = this.days.find((d) => d.id === id);
		if (day) day.title = title.slice(0, 80);
	}

	moveDay(id: string, delta: -1 | 1): void {
		const i = this.dayIndex(id);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= this.days.length) return;
		const next = $state.snapshot(this.days) as Day[];
		[next[i], next[j]] = [next[j], next[i]];
		this.days = next;
	}

	clearDay(id: string): void {
		const day = this.days.find((d) => d.id === id);
		if (!day || day.stops.length === 0) return;
		const stops = $state.snapshot(day.stops) as Stop[];
		day.stops = [];
		if (this.selectedId && stops.some((s) => s.id === this.selectedId)) this.selectedId = null;
		toasts.push(`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} cleared`, {
			actionLabel: 'Undo',
			onaction: () => {
				const d = this.days.find((x) => x.id === id);
				if (d && d.stops.length === 0) d.stops = stops;
			}
		});
	}

	removeDay(id: string): void {
		if (this.days.length < 2) return;
		const index = this.dayIndex(id);
		if (index < 0) return;
		const day = $state.snapshot(this.days[index]) as Day;
		const label = day.title || `Day ${index + 1}`;
		const wasActive = this.activeId === id;
		this.days = this.days.filter((d) => d.id !== id);
		if (wasActive) this.activeId = this.days[Math.min(index, this.days.length - 1)].id;
		if (this.addToId === id) this.addToId = null;
		this.closeSuggest();
		toasts.push(`${label} deleted`, {
			actionLabel: 'Undo',
			onaction: () => {
				const next = $state.snapshot(this.days) as Day[];
				next.splice(Math.min(index, next.length), 0, day);
				this.days = next;
				this.setActive(day.id);
			}
		});
	}

	duplicateDayOf(id: string): void {
		this.addDay({ afterId: id, copyOf: id });
	}

	// ── start and end points ────────────────────────────────────────────

	/** Which day's start/end editor is open, and which half to focus. */
	endsEditor = $state<{ dayId: string; focus: 'start' | 'end' } | null>(null);

	openEndsEditor(dayId: string, focus: 'start' | 'end' = 'start'): void {
		if (this.days.some((d) => d.id === dayId)) this.endsEditor = { dayId, focus };
	}
	closeEndsEditor(): void {
		this.endsEditor = null;
	}

	setStart(dayId: string, start: StartPoint): void {
		const day = this.days.find((d) => d.id === dayId);
		if (!day) return;
		const same = (a: Stop | undefined, b: Stop) => !!a && a.lat === b.lat && a.lng === b.lng && a.name === b.name;
		const current = day.start.kind === 'place' ? day.start.place : undefined;
		day.start =
			start.kind === 'place'
				? { kind: 'place', place: same(current, start.place) ? ($state.snapshot(current) as Stop) : { ...start.place, id: newId() } }
				: start;
		this.closeSuggest();
	}

	setEnd(dayId: string, end: EndPoint): void {
		const day = this.days.find((d) => d.id === dayId);
		if (!day) return;
		const same = (a: Stop | undefined, b: Stop) => !!a && a.lat === b.lat && a.lng === b.lng && a.name === b.name;
		const current = day.end.kind === 'place' ? day.end.place : undefined;
		day.end =
			end.kind === 'place'
				? { kind: 'place', place: same(current, end.place) ? ($state.snapshot(current) as Stop) : { ...end.place, id: newId() } }
				: end;
		this.closeSuggest();
	}

	/** The next day, if it starts where this one ends (so the end row can say "Day N starts here"). */
	nextChainsFrom(dayId: string): Day | null {
		const next = this.days[this.dayIndex(dayId) + 1];
		return next && next.start.kind === 'chain' && this.endsOf(next).start ? next : null;
	}

	// ── stops ───────────────────────────────────────────────────────────

	canAdd(dayId?: string): boolean {
		const day = dayId ? this.days.find((d) => d.id === dayId) : this.addTarget;
		return !!day && day.stops.length < MAX_STOPS;
	}

	/** Adds a stop to `dayId`, else to the "Adding to" day. Shows the day it landed in. */
	addStop(stop: Stop, dayId?: string): void {
		const target = (dayId ? this.days.find((d) => d.id === dayId) : this.addTarget) ?? this.days[0];
		if (target.stops.length >= MAX_STOPS) return;
		target.stops.push(stop);
		if (this.activeId !== null && this.activeId !== target.id) this.setActive(target.id);
		this.addToId = null;
		this.selectedId = stop.id;
	}

	removeStop(id: string): void {
		const hit = findStop(this.days, id);
		if (!hit) return;
		const stop = $state.snapshot(hit.stop) as Stop;
		const dayId = hit.day.id;
		hit.day.stops.splice(hit.index, 1);
		if (this.selectedId === id) this.selectedId = null;
		toasts.push(`${stop.name} removed`, {
			actionLabel: 'Undo',
			onaction: () => this.restoreStop(stop, dayId, hit.index)
		});
	}

	/** Put a removed stop back where it was (Undo). */
	restoreStop(stop: Stop, dayId: string, index: number): void {
		const day = this.days.find((d) => d.id === dayId);
		if (!day || day.stops.length >= MAX_STOPS || findStop(this.days, stop.id)) return;
		day.stops.splice(Math.min(index, day.stops.length), 0, stop);
		this.selectedId = stop.id;
	}

	/** Apply a new order to a day (default: the active one), given as a list of stop ids. */
	reorder(ids: string[], dayId?: string): void {
		const day = dayId ? this.days.find((d) => d.id === dayId) : this.activeDay;
		if (day) day.stops = orderBy($state.snapshot(day.stops) as Stop[], ids);
	}

	moveStop(stopId: string, toDayId: string, toIndex?: number): void {
		const from = findStop(this.days, stopId);
		const next = moveStopToDay($state.snapshot(this.days) as Day[], stopId, toDayId, toIndex);
		if (!from || !next) {
			if (from && this.days.find((d) => d.id === toDayId)?.stops.length === MAX_STOPS) {
				this.showNotice({ variant: 'info', message: `That day already has ${MAX_STOPS} stops.` });
			}
			return;
		}
		const fromDayId = from.day.id;
		const fromIndex = from.index;
		const name = from.stop.name;
		this.days = next;
		const label = this.dayLabel(toDayId);
		toasts.push(`${name} moved to ${label}`, {
			actionLabel: 'Undo',
			onaction: () => this.moveStop(stopId, fromDayId, fromIndex)
		});
	}

	/** "Also visit": a copy of the stop on another day. */
	copyStop(stopId: string, toDayId: string): void {
		const result = copyStopToDay($state.snapshot(this.days) as Day[], stopId, toDayId);
		if (!result) return;
		const name = result.copy.name;
		this.days = result.days;
		toasts.push(`${name} also added to ${this.dayLabel(toDayId)}`, {
			actionLabel: 'Undo',
			onaction: () => this.removeStopSilently(result.copy.id)
		});
	}

	private removeStopSilently(id: string): void {
		const hit = findStop(this.days, id);
		hit?.day.stops.splice(hit.index, 1);
	}

	dayLabel(dayId: string): string {
		const i = this.dayIndex(dayId);
		return i < 0 ? 'that day' : `Day ${i + 1}`;
	}

	select(id: string | null): void {
		if (id) {
			const day = this.dayOfStop(id);
			if (day && day.id !== this.activeId) this.setActive(day.id);
		}
		this.selectedId = id;
		if (id) this.areaOpenId = null;
	}

	clear(): void {
		this.days = [newDay()];
		this.activeId = this.days[0].id;
		this.addToId = null;
		this.selectedId = null;
		this.startDate = null;
		this.closeSuggest();
	}

	// ── suggest better order (active day) ───────────────────────────────

	async openSuggest(): Promise<void> {
		if (this.stops.length < 3) return;
		this.suggestOpen = true;
		await this.requestProposal();
	}

	closeSuggest(): void {
		this.suggestOpen = false;
		this.proposal = null;
		this.optimizeError = null;
	}

	async setSuggestKeepStart(value: boolean): Promise<void> {
		this.suggestKeepStart = value;
		await this.requestProposal();
	}

	private async requestProposal(): Promise<void> {
		const day = this.activeDay;
		if (!day || day.stops.length < 3) return;
		const stops = $state.snapshot(day.stops) as Stop[];
		const key = this.proposalKey();
		const ends = this.endsOf(day);
		const wp = waypointsOf(day, ends);
		const startId = wp.hasStart ? wp.list[0].id : this.suggestKeepStart ? stops[0].id : undefined;
		const endId = wp.hasEnd ? wp.list[wp.list.length - 1].id : undefined;
		this.optimizing = true;
		this.optimizeError = null;
		this.proposal = null;
		try {
			// The path is start → stops → end; the pinned ends stay where they are.
			const result = await this.api.optimize(wp.list, startId, endId);
			const pinned = new Set([wp.hasStart ? wp.list[0].id : '', endId ?? '']);
			const order = result.order.filter((id) => !pinned.has(id));
			this.proposal = { ...result, order, key };
		} catch (err) {
			this.optimizeError = messageOf(err);
		} finally {
			this.optimizing = false;
		}
	}

	applyProposal(): void {
		const proposal = this.activeProposal;
		if (!proposal) return;
		const saved = proposal.km_saved;
		this.reorder(proposal.order);
		this.closeSuggest();
		this.showNotice({
			variant: 'ok',
			message: saved > 0 ? `New order applied. Saved ${formatKm(saved)}.` : 'New order applied.'
		});
	}

	showNotice(notice: Notice): void {
		clearTimeout(this.noticeTimer);
		this.notice = notice;
		this.noticeTimer = setTimeout(() => (this.notice = null), NOTICE_MS);
	}

	dismissNotice(): void {
		clearTimeout(this.noticeTimer);
		this.notice = null;
	}
}
