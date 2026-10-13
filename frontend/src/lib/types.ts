export interface Stop {
	id: string;
	name: string;
	lat: number;
	lng: number;
	/** Client-only: full geocoder label, shown as a subtitle. Not sent to the API. */
	address?: string;
}

export type RouteMode = 'straight' | 'driving' | 'walking';

/** Where a day begins. `chain` = where the previous day ended (the usual overnight case). */
export type StartPoint = { kind: 'chain' } | { kind: 'place'; place: Stop } | { kind: 'none' };

/** Where a day finishes. `start` = back where it began (a round trip); `open` = at the last stop. */
export type EndPoint = { kind: 'start' } | { kind: 'place'; place: Stop } | { kind: 'open' };

/** One travel day. */
export interface Day {
	id: string;
	/** Optional name, e.g. "Kuala Lumpur". */
	title: string;
	start: StartPoint;
	end: EndPoint;
	stops: Stop[];
}

/** A day's start and end after following chains; null when there is none. */
export interface ResolvedEnds {
	start: Stop | null;
	end: Stop | null;
}

/** The persisted shape. Bump `version` when it changes (v1: flat `stops`; v2: one `base` per day). */
export interface Itinerary {
	version: 3;
	days: Day[];
	routeMode: RouteMode;
	/** Optional so itineraries saved before this field existed still load. */
	name?: string;
	clusterThresholdKm?: number;
	/** ISO date (YYYY-MM-DD) of Day 1. Dates of later days follow from it. Absent = no dates. */
	startDate?: string;
	/** Days have a fixed start and end (e.g. a hotel). Default true. */
	useBase?: boolean;
}

export interface GeocodeCandidate {
	display_name: string;
	lat: number;
	lng: number;
}

export interface Leg {
	from_id: string;
	to_id: string;
	distance_km: number;
}

export interface NearestNeighbour {
	stop_id: string;
	nearest_id: string;
	distance_km: number;
}

export interface Cluster {
	id: number;
	stop_ids: string[];
}

export interface DistancesResponse {
	stop_ids: string[];
	matrix_km: number[][];
	legs: Leg[];
	total_km: number;
	nearest: NearestNeighbour[];
	clusters: Cluster[];
	cluster_threshold_km: number;
}

export interface RouteLeg {
	from_id: string;
	to_id: string;
	distance_km: number;
	duration_s: number;
}

export interface RouteResponse {
	mode: 'driving' | 'walking';
	geometry: { type: 'LineString'; coordinates: [number, number][] };
	distance_km: number;
	duration_s: number;
	legs: RouteLeg[];
	/** True when road routing was unavailable and the line is straight segments. */
	fallback: boolean;
	fallback_reason: string | null;
}

export interface OptimizeResponse {
	order: string[];
	original_total_km: number;
	new_total_km: number;
	km_saved: number;
}
