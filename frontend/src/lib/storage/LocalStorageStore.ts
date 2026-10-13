import { isIsoDate, newDay } from '../days';
import type { Day, Itinerary, RouteMode, Stop } from '../types';
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

function parseStops(value: unknown): Stop[] {
	return Array.isArray(value) ? value.filter(isStop) : [];
}

function parseStart(value: unknown, legacyBase: unknown): Day['start'] {
	if (typeof value === 'object' && value !== null) {
		const v = value as Record<string, unknown>;
		if (v.kind === 'chain') return { kind: 'chain' };
		if (v.kind === 'none') return { kind: 'none' };
		if (v.kind === 'place' && isStop(v.place)) return { kind: 'place', place: v.place };
	}
	// v2: a single base per day became both start and end.
	return isStop(legacyBase) ? { kind: 'place', place: legacyBase } : { kind: 'chain' };
}

function parseEnd(value: unknown): Day['end'] {
	if (typeof value === 'object' && value !== null) {
		const v = value as Record<string, unknown>;
		if (v.kind === 'start') return { kind: 'start' };
		if (v.kind === 'open') return { kind: 'open' };
		if (v.kind === 'place' && isStop(v.place)) return { kind: 'place', place: v.place };
	}
	return { kind: 'start' };
}

function parseDay(value: unknown): Day | null {
	if (typeof value !== 'object' || value === null) return null;
	const d = value as Record<string, unknown>;
	if (typeof d.id !== 'string') return null;
	return {
		id: d.id,
		title: typeof d.title === 'string' ? d.title.slice(0, 80) : '',
		start: parseStart(d.start, d.base),
		end: parseEnd(d.end),
		stops: parseStops(d.stops)
	};
}

/**
 * Defensive parse: corrupt or foreign data yields null rather than throwing.
 * Older saves migrate: v1 (a flat `stops` list) becomes one day; v2 (one `base` per day)
 * becomes a start at that place with the end back at the start.
 */
export function parseItinerary(raw: string | null): Itinerary | null {
	if (!raw) return null;
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		let days: Day[];
		if (data.version === 1 && Array.isArray(data.stops)) {
			days = [newDay({ stops: parseStops(data.stops) })];
		} else if ((data.version === 2 || data.version === 3) && Array.isArray(data.days)) {
			days = data.days.map(parseDay).filter((d): d is Day => d !== null);
			if (days.length === 0) days = [newDay()];
		} else {
			return null;
		}
		const mode = MODES.includes(data.routeMode as RouteMode) ? (data.routeMode as RouteMode) : 'straight';
		const itinerary: Itinerary = { version: 3, days, routeMode: mode };
		if (typeof data.name === 'string') itinerary.name = data.name.slice(0, 80);
		const t = data.clusterThresholdKm;
		if (typeof t === 'number' && Number.isFinite(t) && t > 0 && t <= 20000) {
			itinerary.clusterThresholdKm = t;
		}
		if (isIsoDate(data.startDate)) itinerary.startDate = data.startDate;
		if (typeof data.useBase === 'boolean') itinerary.useBase = data.useBase;
		return itinerary;
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
