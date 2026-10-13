import { api as defaultApi, ApiError } from '../api';
import { orderBy } from '../format';
import type { ItineraryStore } from '../storage';
import type {
	DistancesResponse,
	NearestNeighbour,
	OptimizeResponse,
	RouteMode,
	RouteResponse,
	Stop
} from '../types';

type Api = typeof defaultApi;

const MAX_STOPS = 25;
const RECOMPUTE_DELAY_MS = 250;
const ROUTE_DELAY_MS = 400; // OSRM's public server is shared; don't hammer it while editing

const stopsKey = (stops: Stop[]) => stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join(';');

const routeKey = (mode: RouteMode, stops: Stop[]) =>
	`${mode}|${stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join(';')}`;

function messageOf(err: unknown): string {
	return err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong';
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

export class ItineraryState {
	stops = $state<Stop[]>([]);
	routeMode = $state<RouteMode>('straight');
	selectedId = $state<string | null>(null);
	loaded = $state(false);

	summary = $state<DistancesResponse | null>(null);
	summaryLoading = $state(false);
	summaryError = $state<string | null>(null);

	route = $state<RouteResponse | null>(null);
	/** The routeKey the stored `route` was computed for, so stale routes are never drawn. */
	private routeFor = $state<string | null>(null);
	routeLoading = $state(false);
	routeError = $state<string | null>(null);

	/** A suggested order awaiting accept/discard, tied to the stops it was computed for. */
	private proposal = $state<(OptimizeResponse & { key: string }) | null>(null);
	optimizing = $state(false);
	optimizeError = $state<string | null>(null);

	readonly maxStops = MAX_STOPS;

	constructor(
		private readonly store: ItineraryStore,
		private readonly api: Api = defaultApi
	) {}

	selected = $derived(this.stops.find((s) => s.id === this.selectedId) ?? null);

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

	/** The fetched route, only if it still matches the current mode and stops. */
	activeRoute = $derived(
		this.route && this.routeFor === routeKey(this.routeMode, this.stops) ? this.route : null
	);

	/** Road geometry to draw, or null when we should draw straight lines. */
	roadGeometry = $derived(
		this.activeRoute && !this.activeRoute.fallback ? this.activeRoute.geometry.coordinates : null
	);

	/** Distance/duration after `id`: road legs when available, else straight-line. */
	legAfter(id: string): { km: number; seconds: number | null } | null {
		if (this.roadGeometry) {
			const leg = this.activeRoute?.legs.find((l) => l.from_id === id);
			if (leg) return { km: leg.distance_km, seconds: leg.duration_s };
		}
		const leg = this.summary?.legs.find((l) => l.from_id === id);
		return leg ? { km: leg.distance_km, seconds: null } : null;
	}

	nearestOf(id: string | null): NearestNeighbour | null {
		if (!id || !this.summary) return null;
		return this.summary.nearest.find((n) => n.stop_id === id) ?? null;
	}

	stopById(id: string): Stop | undefined {
		return this.stops.find((s) => s.id === id);
	}

	/** Loads persisted state, then starts persistence + recompute effects. Returns a disposer. */
	init(): () => void {
		void this.store.load().then((saved) => {
			if (saved) {
				this.stops = saved.stops.slice(0, MAX_STOPS);
				this.routeMode = saved.routeMode;
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
		if (!this.loaded) return; // don't overwrite saved data before it is read
		if (stops.length === 0) void this.store.clear();
		else void this.store.save({ version: 1, stops, routeMode });
	}

	private recomputeSummary(): () => void {
		const stops = $state.snapshot(this.stops);
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
				const result = await this.api.distances(stops, controller.signal);
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

	async suggestOrder(keepFirstAsStart: boolean): Promise<void> {
		if (this.stops.length < 3 || this.optimizing) return;
		const stops = $state.snapshot(this.stops);
		this.optimizing = true;
		this.optimizeError = null;
		this.proposal = null;
		try {
			const result = await this.api.optimize(stops, keepFirstAsStart ? stops[0].id : undefined);
			this.proposal = { ...result, key: stopsKey(stops) };
		} catch (err) {
			this.optimizeError = messageOf(err);
		} finally {
			this.optimizing = false;
		}
	}

	acceptProposal(): void {
		const proposal = this.activeProposal;
		if (!proposal) return;
		this.reorder(proposal.order);
		this.proposal = null;
	}

	discardProposal(): void {
		this.proposal = null;
		this.optimizeError = null;
	}

	canAdd(): boolean {
		return this.stops.length < MAX_STOPS;
	}

	addStop(stop: Stop): void {
		if (!this.canAdd()) return;
		this.stops.push(stop);
		this.selectedId = stop.id;
	}

	removeStop(id: string): void {
		this.stops = this.stops.filter((s) => s.id !== id);
		if (this.selectedId === id) this.selectedId = null;
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
	}

	clear(): void {
		this.stops = [];
		this.selectedId = null;
	}
}
