import type {
	DistancesResponse,
	GeocodeCandidate,
	OptimizeResponse,
	RouteResponse,
	Stop
} from './types';

const BASE_URL: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:8001').replace(
	/\/$/,
	''
);

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number | null,
		readonly code: string
	) {
		super(message);
	}
}

interface ErrorBody {
	error?: { code?: string; message?: string; details?: { field: string; message: string }[] };
}

function describe(body: ErrorBody, status: number): ApiError {
	const e = body.error;
	const detail = e?.details?.[0];
	const message = detail ? `${detail.field}: ${detail.message}` : (e?.message ?? `HTTP ${status}`);
	return new ApiError(message, status, e?.code ?? 'http_error');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${BASE_URL}${path}`, init);
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') throw err;
		throw new ApiError('Cannot reach the Routely server. Is the backend running?', null, 'network');
	}
	if (!response.ok) {
		throw describe(await response.json().catch(() => ({})), response.status);
	}
	return response.json() as Promise<T>;
}

function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
	return request<T>(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal
	});
}

/** Strip client-only fields: the API takes exactly {id, name, lat, lng}. */
const wire = (stops: Stop[]) => stops.map(({ id, name, lat, lng }) => ({ id, name, lat, lng }));

export const api = {
	/** `near` is a location hint: results close to it are ranked first. */
	async geocode(
		q: string,
		near?: { lat: number; lng: number } | null,
		signal?: AbortSignal
	): Promise<GeocodeCandidate[]> {
		const params = new URLSearchParams({ q });
		if (near) {
			params.set('near_lat', String(near.lat));
			params.set('near_lng', String(near.lng));
		}
		const res = await request<{ results: GeocodeCandidate[] }>(`/geocode?${params}`, { signal });
		return res.results;
	},
	distances(
		stops: Stop[],
		clusterThresholdKm?: number,
		signal?: AbortSignal
	): Promise<DistancesResponse> {
		return post(
			'/distances',
			{ stops: wire(stops), cluster_threshold_km: clusterThresholdKm ?? null },
			signal
		);
	},
	route(
		stops: Stop[],
		mode: 'driving' | 'walking',
		signal?: AbortSignal
	): Promise<RouteResponse> {
		return post('/route', { stops: wire(stops), mode }, signal);
	},
	optimize(
		stops: Stop[],
		startId?: string,
		endId?: string,
		signal?: AbortSignal
	): Promise<OptimizeResponse> {
		return post('/optimize', { stops: wire(stops), start_id: startId ?? null, end_id: endId ?? null }, signal);
	}
};
