import type { Itinerary, RouteMode, Stop } from '../types';
import type { ItineraryStore } from './ItineraryStore';

export const STORAGE_KEY = 'routely:itinerary';

const MODES: RouteMode[] = ['straight', 'driving', 'walking'];

function isStop(v: unknown): v is Stop {
	if (typeof v !== 'object' || v === null) return false;
	const s = v as Record<string, unknown>;
	return (
		typeof s.id === 'string' &&
		typeof s.name === 'string' &&
		typeof s.lat === 'number' &&
		typeof s.lng === 'number'
	);
}

/** Defensive parse: corrupt or foreign data yields null rather than throwing. */
export function parseItinerary(raw: string | null): Itinerary | null {
	if (!raw) return null;
	try {
		const data = JSON.parse(raw) as Partial<Itinerary>;
		if (data.version !== 1 || !Array.isArray(data.stops)) return null;
		const mode = MODES.includes(data.routeMode as RouteMode)
			? (data.routeMode as RouteMode)
			: 'straight';
		return { version: 1, stops: data.stops.filter(isStop), routeMode: mode };
	} catch {
		return null;
	}
}

export class LocalStorageStore implements ItineraryStore {
	constructor(
		private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
		private readonly key: string = STORAGE_KEY
	) {}

	async load(): Promise<Itinerary | null> {
		try {
			return parseItinerary(this.storage.getItem(this.key));
		} catch {
			return null;
		}
	}

	async save(itinerary: Itinerary): Promise<void> {
		try {
			this.storage.setItem(this.key, JSON.stringify(itinerary));
		} catch {
			// Quota exceeded or storage disabled: keep working in-memory.
		}
	}

	async clear(): Promise<void> {
		try {
			this.storage.removeItem(this.key);
		} catch {
			// ignore
		}
	}
}
