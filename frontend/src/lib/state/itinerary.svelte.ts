import { api as defaultApi, ApiError } from '../api';
import {
	buildClusters,
	clusterStyleAt,
	type ClusterInfo,
	type ClusterStyle
} from '../clusters';
import { formatKm, orderBy } from '../format';
import type { ItineraryStore } from '../storage';
import type {
	DistancesResponse,
	NearestNeighbour,
	OptimizeResponse,
	RouteMode,
	RouteResponse,
	Stop
} from '../types';
import { toasts } from './toasts.svelte';

type Api = typeof defaultApi;

export const MAX_STOPS = 25;
/** Cluster threshold presets offered in the summary card (km). */
export const CLUSTER_PRESETS_KM = [5, 15, 30, 60] as const;
export const DEFAULT_CLUSTER_KM = 30;
export const DEFAULT_NAME = '';

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

export class ItineraryState {
	name = $state(DEFAULT_NAME);
	stops = $state<Stop[]>([]);
	routeMode = $state<RouteMode>('driving');
	clusterThresholdKm = $state<number>(DEFAULT_CLUSTER_KM);
	selectedId = $state<string | null>(null);
	loaded = $state(false);

	summary = $state<DistancesResponse | null>(null);
	summaryLoading = $state(false);
	summaryError = $state<string | null>(null);
	private summaryNonce = $state(0);

	route = $state<RouteResponse | null>(null);
	/** The routeKey the stored `route` was computed for, so stale routes are never drawn. */
	private routeFor = $state<string | null>(null);
	routeLoading = $state(false);
	routeError = $state<string | null>(null);
	private routeNonce = $state(0);
	/** The routeKey whose fallback/error banner the user dismissed. */
	private dismissedFor = $state<string | null>(null);

	/** Suggest-order panel. */
	suggestOpen = $state(false);
	suggestKeepStart = $state(false);
	private proposal = $state<(OptimizeResponse & { key: string }) | null>(null);
	optimizing = $state(false);
	optimizeError = $state<string | null>(null);

	notice = $state<Notice | null>(null);
	private noticeTimer: ReturnType<typeof setTimeout> | undefined;

	readonly maxStops = MAX_STOPS;

	constructor(
		private readonly store: ItineraryStore,
		private readonly api: Api = defaultApi
	) {}

	// ── derived ─────────────────────────────────────────────────────────

	selected = $derived(this.stops.find((s) => s.id === this.selectedId) ?? null);

	/** The fetched route, only if it still matches the current mode and stops. */
	activeRoute = $derived(
		this.route && this.routeFor === routeKey(this.routeMode, this.stops) ? this.route : null
	);

	/** Road geometry to draw, or null when we should draw straight lines. */
	roadGeometry = $derived(
		this.activeRoute && !this.activeRoute.fallback ? this.activeRoute.geometry.coordinates : null
	);

	/** Total distance: road distance while a road route is shown, else the straight-line total. */
	totalKm = $derived(
		this.roadGeometry && this.activeRoute
			? this.activeRoute.distance_km
			: (this.summary?.total_km ?? null)
	);

	/** Total travel time for the current road route, or null (straight-line / loading / fallback). */
	totalSeconds = $derived(this.roadGeometry && this.activeRoute ? this.activeRoute.duration_s : null);

	/** Road routing failed (server fallback or request error) and has not been dismissed. */
	routingDegraded = $derived(
		this.routeMode !== 'straight' &&
			this.stops.length >= 2 &&
			(this.routeError !== null || this.activeRoute?.fallback === true)
	);

	routingBannerVisible = $derived(
		this.routingDegraded && this.dismissedFor !== routeKey(this.routeMode, this.stops)
	);

	/** What the mode toggle shows: Straight line while routing is degraded, as in the design. */
	effectiveMode = $derived<RouteMode>(this.routingDegraded ? 'straight' : this.routeMode);

	/** The summary matches the stops on screen (it lags briefly while recomputing). */
	private summaryFresh = $derived(
		this.summary !== null && stopsKey(this.stops) !== '' &&
			this.summary.stop_ids.join('|') === this.stops.map((s) => s.id).join('|')
	);

	clusterInfos = $derived<ClusterInfo[]>(
		this.summary && this.summaryFresh
			? buildClusters(this.summary.clusters, this.summary.stop_ids, this.summary.matrix_km)
			: []
	);

	/** The pending suggestion, unless the stops changed since it was computed. */
	activeProposal = $derived(
		this.proposal && this.proposal.key === stopsKey(this.stops) ? this.proposal : null
	);

	/** The pending suggestion has a different order than the current one. */
	proposalChangesOrder = $derived(
		this.activeProposal
			? this.activeProposal.order.some((id, i) => id !== this.stops[i]?.id)
			: false
	);

	// ── queries ─────────────────────────────────────────────────────────

	clusterOf(id: string): ClusterInfo | null {
		return this.clusterInfos.find((c) => c.stopIds.includes(id)) ?? null;
	}

	/** Cluster style for a stop; a placeholder (A) until the first summary arrives. */
	styleOf(id: string): ClusterStyle {
		return this.clusterOf(id)?.style ?? clusterStyleAt(0);
	}

	nearestOf(id: string | null): NearestNeighbour | null {
		if (!id || !this.summary) return null;
		return this.summary.nearest.find((n) => n.stop_id === id) ?? null;
	}

	stopById(id: string): Stop | undefined {
		return this.stops.find((s) => s.id === id);
	}

	/** Distance/duration after `id`: road legs when available, else straight-line (approximate). */
	legAfter(id: string): { km: number; seconds: number | null; approx: boolean } | null {
		if (this.roadGeometry) {
			const leg = this.activeRoute?.legs.find((l) => l.from_id === id);
			if (leg) return { km: leg.distance_km, seconds: leg.duration_s, approx: false };
		}
		const leg = this.summary?.legs.find((l) => l.from_id === id);
		return leg ? { km: leg.distance_km, seconds: null, approx: true } : null;
	}

	canAdd(): boolean {
		return this.stops.length < MAX_STOPS;
	}

	// ── lifecycle ───────────────────────────────────────────────────────

	/** Loads persisted state, then starts persistence + recompute effects. Returns a disposer. */
	init(): () => void {
		void this.store.load().then((saved) => {
			if (saved) {
				this.stops = saved.stops.slice(0, MAX_STOPS);
				this.routeMode = saved.routeMode;
				this.name = saved.name ?? DEFAULT_NAME;
				this.clusterThresholdKm = saved.clusterThresholdKm ?? DEFAULT_CLUSTER_KM;
			}
			this.loaded = true;
		});
		return $effect.root(() => {
			$effect(() => this.persist());
			$effect(() => this.recomputeSummary());
			$effect(() => this.recomputeRoute());
		});
	}

	private persist(): void {
		const stops = $state.snapshot(this.stops);
		const routeMode = this.routeMode;
		const name = this.name;
		const clusterThresholdKm = this.clusterThresholdKm;
		if (!this.loaded) return; // don't overwrite saved data before it is read
		if (stops.length === 0 && !name.trim()) void this.store.clear();
		else void this.store.save({ version: 1, stops, routeMode, name, clusterThresholdKm });
	}

	private recomputeSummary(): () => void {
		const stops = $state.snapshot(this.stops);
		const threshold = this.clusterThresholdKm;
		void this.summaryNonce;
		if (!this.loaded || stops.length < 2) {
			this.summary = null;
			this.summaryError = null;
			this.summaryLoading = false;
			return () => {};
		}
		this.summaryLoading = true;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const result = await this.api.distances(stops, threshold, controller.signal);
				this.summary = result;
				this.summaryError = null;
			} catch (err) {
				if (isAbort(err)) return;
				this.summaryError = messageOf(err);
			} finally {
				if (!controller.signal.aborted) this.summaryLoading = false;
			}
		}, RECOMPUTE_DELAY_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}

	private recomputeRoute(): () => void {
		const mode = this.routeMode;
		const stops = $state.snapshot(this.stops);
		void this.routeNonce;
		if (!this.loaded || mode === 'straight' || stops.length < 2) {
			this.route = null;
			this.routeFor = null;
			this.routeError = null;
			this.routeLoading = false;
			return () => {};
		}
		this.routeLoading = true;
		this.routeError = null;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const result = await this.api.route(stops, mode, controller.signal);
				this.route = result;
				this.routeFor = routeKey(mode, stops);
			} catch (err) {
				if (isAbort(err)) return;
				this.route = null;
				this.routeError = messageOf(err);
			} finally {
				if (!controller.signal.aborted) this.routeLoading = false;
			}
		}, ROUTE_DELAY_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}

	// ── editing ─────────────────────────────────────────────────────────

	setName(value: string): void {
		this.name = value.slice(0, 80);
	}

	addStop(stop: Stop): void {
		if (!this.canAdd()) return;
		this.stops.push(stop);
		this.selectedId = stop.id;
	}

	removeStop(id: string): void {
		const index = this.stops.findIndex((s) => s.id === id);
		if (index < 0) return;
		const stop = $state.snapshot(this.stops[index]);
		this.stops = this.stops.filter((s) => s.id !== id);
		if (this.selectedId === id) this.selectedId = null;
		toasts.push(`${stop.name} removed`, {
			actionLabel: 'Undo',
			onaction: () => this.restoreStop(stop, index)
		});
	}

	/** Put a removed stop back where it was (Undo). */
	restoreStop(stop: Stop, index: number): void {
		if (!this.canAdd() || this.stops.some((s) => s.id === stop.id)) return;
		const next = $state.snapshot(this.stops);
		next.splice(Math.min(index, next.length), 0, stop);
		this.stops = next;
		this.selectedId = stop.id;
	}

	/** Apply a new order given as a list of stop ids. */
	reorder(ids: string[]): void {
		this.stops = orderBy($state.snapshot(this.stops), ids);
	}

	select(id: string | null): void {
		this.selectedId = id;
	}

	setRouteMode(mode: RouteMode): void {
		this.routeMode = mode;
		this.dismissedFor = null;
	}

	setClusterThreshold(km: number): void {
		this.clusterThresholdKm = km;
	}

	clear(): void {
		this.stops = [];
		this.selectedId = null;
	}

	// ── route / summary recovery ────────────────────────────────────────

	retryRoute(): void {
		this.dismissedFor = null;
		this.routeNonce++;
	}

	dismissRoutingBanner(): void {
		this.dismissedFor = routeKey(this.routeMode, this.stops);
	}

	retrySummary(): void {
		this.summaryNonce++;
	}

	// ── suggest better order ────────────────────────────────────────────

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
		if (this.stops.length < 3) return;
		const stops = $state.snapshot(this.stops);
		this.optimizing = true;
		this.optimizeError = null;
		this.proposal = null;
		try {
			const result = await this.api.optimize(
				stops,
				this.suggestKeepStart ? stops[0].id : undefined
			);
			this.proposal = { ...result, key: stopsKey(stops) };
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
