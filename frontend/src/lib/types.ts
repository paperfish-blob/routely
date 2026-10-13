export interface Stop {
	id: string;
	name: string;
	lat: number;
	lng: number;
	/** Client-only: full geocoder label, shown as a subtitle. Not sent to the API. */
	address?: string;
}

export type RouteMode = 'straight' | 'driving' | 'walking';

/** The persisted shape. Bump `version` when it changes. */
export interface Itinerary {
	version: 1;
	stops: Stop[];
	routeMode: RouteMode;
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
