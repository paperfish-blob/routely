import { newId } from './format';
import type { Day, ResolvedEnds, Stop } from './types';

export const MAX_STOPS_PER_DAY = 25;

/** Identity class for a day: Day 1 → day1, Day 4 → day1 again (three hues cycle). */
export const dayClass = (index: number): string => `day${(index % 3) + 1}`;

export function newDay(partial: Partial<Day> = {}): Day {
	return { id: newId(), title: '', start: { kind: 'chain' }, end: { kind: 'start' }, stops: [], ...partial };
}

// ── geometry ────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance; mirrors the backend's haversine so straight-line numbers agree. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const dPhi = rad(b.lat - a.lat);
	const dLambda = rad(b.lng - a.lng);
	const h = Math.sin(dPhi / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLambda / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ── start and end points ───────────────────────────────────────────────

/**
 * Follows chains: a day that starts "where the previous day ended" begins at that day's end.
 * A day's end is "back at the start", a chosen place, or open (no fixed end, so the next day has no chained start).
 */
export function resolveEnds(days: Day[]): ResolvedEnds[] {
	const out: ResolvedEnds[] = [];
	let previousEnd: Stop | null = null;
	for (const day of days) {
		const start: Stop | null =
			day.start.kind === 'place' ? day.start.place : day.start.kind === 'chain' ? previousEnd : null;
		const end: Stop | null =
			day.end.kind === 'start' ? start : day.end.kind === 'place' ? day.end.place : null;
		out.push({ start, end });
		previousEnd = end;
	}
	return out;
}

export const START_SUFFIX = '~start';
export const END_SUFFIX = '~end';

export interface Waypoints {
	/** The whole path in order. The same place can appear twice with distinct ids (the API needs unique ids). */
	list: Stop[];
	hasStart: boolean;
	hasEnd: boolean;
}

/** start → stops → end. With the feature off, or no stops, only the stops. */
export function waypointsOf(day: Day, ends: ResolvedEnds | null): Waypoints {
	const start = day.stops.length > 0 ? (ends?.start ?? null) : null;
	const end = day.stops.length > 0 ? (ends?.end ?? null) : null;
	return {
		list: [
			...(start ? [{ ...start, id: start.id + START_SUFFIX }] : []),
			...day.stops,
			...(end ? [{ ...end, id: end.id + END_SUFFIX }] : [])
		],
		hasStart: start !== null,
		hasEnd: end !== null
	};
}

/** Straight-line length of the start→first and last→end legs (0 when missing). */
export function endLegsKm(day: Day, ends: ResolvedEnds | null): { start: number; end: number } {
	if (!ends || day.stops.length === 0) return { start: 0, end: 0 };
	const first = day.stops[0];
	const last = day.stops[day.stops.length - 1];
	return {
		start: ends.start ? haversineKm(ends.start, first) : 0,
		end: ends.end ? haversineKm(last, ends.end) : 0
	};
}

/** Two points are "the same place" for chaining and transfers. */
export const SAME_PLACE_KM = 0.2;
export function samePlace(a: Stop | null, b: Stop | null): boolean {
	return !!a && !!b && haversineKm(a, b) < SAME_PLACE_KM;
}

// ── dates ───────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const m = DATE_RE.exec(value);
	if (!m) return false;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Date of day `index` (0-based) as a UTC date, or null when the trip has no start date. */
export function dayDate(startDate: string | null | undefined, index: number): Date | null {
	if (!startDate || !isIsoDate(startDate)) return null;
	const [y, m, d] = startDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + index));
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' });
const WEEKDAY_SHORT = fmt({ weekday: 'short' });
const WEEKDAY_LONG = fmt({ weekday: 'long' });
const DAY_NUM = fmt({ day: 'numeric' });
const MONTH_SHORT = fmt({ month: 'short' });
const MONTH_LONG = fmt({ month: 'long' });

/** "Sat 24 Oct" */
export function formatDayShort(d: Date): string {
	return `${WEEKDAY_SHORT.format(d)} ${DAY_NUM.format(d)} ${MONTH_SHORT.format(d)}`;
}

/** "Saturday 24 October" */
export function formatDayLong(d: Date): string {
	return `${WEEKDAY_LONG.format(d)} ${DAY_NUM.format(d)} ${MONTH_LONG.format(d)}`;
}

/** "Sat 24 – Mon 26 Oct" (same month) or "Sat 31 Oct – Mon 2 Nov"; one day: "Sat 24 Oct". */
export function formatTripRange(startDate: string | null | undefined, days: number): string | null {
	const first = dayDate(startDate, 0);
	if (!first) return null;
	if (days <= 1) return formatDayShort(first);
	const last = dayDate(startDate, days - 1)!;
	if (MONTH_SHORT.format(first) === MONTH_SHORT.format(last)) {
		return `${WEEKDAY_SHORT.format(first)} ${DAY_NUM.format(first)} – ${WEEKDAY_SHORT.format(last)} ${DAY_NUM.format(last)} ${MONTH_SHORT.format(last)}`;
	}
	return `${formatDayShort(first)} – ${formatDayShort(last)}`;
}

// ── moving stops between days (pure) ────────────────────────────────────

export function findStop(days: Day[], stopId: string): { day: Day; index: number; stop: Stop } | null {
	for (const day of days) {
		const index = day.stops.findIndex((s) => s.id === stopId);
		if (index >= 0) return { day, index, stop: day.stops[index] };
	}
	return null;
}

/** Moves a stop to another day (appended unless `toIndex` is given). Returns null if impossible. */
export function moveStopToDay(days: Day[], stopId: string, toDayId: string, toIndex?: number): Day[] | null {
	const from = findStop(days, stopId);
	const target = days.find((d) => d.id === toDayId);
	if (!from || !target) return null;
	if (from.day.id === toDayId) return null;
	if (target.stops.length >= MAX_STOPS_PER_DAY) return null;
	return days.map((d) => {
		if (d.id === from.day.id) return { ...d, stops: d.stops.filter((s) => s.id !== stopId) };
		if (d.id === toDayId) {
			const stops = d.stops.slice();
			stops.splice(toIndex ?? stops.length, 0, from.stop);
			return { ...d, stops };
		}
		return d;
	});
}

/** Copies a stop to another day under a new id ("also visit"). Returns the new days and the copy. */
export function copyStopToDay(
	days: Day[],
	stopId: string,
	toDayId: string
): { days: Day[]; copy: Stop } | null {
	const from = findStop(days, stopId);
	const target = days.find((d) => d.id === toDayId);
	if (!from || !target || target.stops.length >= MAX_STOPS_PER_DAY) return null;
	const copy: Stop = { ...from.stop, id: newId() };
	return {
		copy,
		days: days.map((d) => (d.id === toDayId ? { ...d, stops: [...d.stops, copy] } : d))
	};
}

/** A deep copy of a day with fresh ids (Duplicate day). A chained start stays chained. */
export function duplicateDay(day: Day): Day {
	const fresh = (p: Stop): Stop => ({ ...p, id: newId() });
	return {
		id: newId(),
		title: day.title ? `${day.title} (copy)` : '',
		start: day.start.kind === 'place' ? { kind: 'place', place: fresh(day.start.place) } : { ...day.start },
		end: day.end.kind === 'place' ? { kind: 'place', place: fresh(day.end.place) } : { ...day.end },
		stops: day.stops.map(fresh)
	};
}

/** Day tabs show the date when there is one, else the stop count. */
export function dayCaption(startDate: string | null | undefined, index: number, stops: number): string {
	const d = dayDate(startDate, index);
	if (d) return formatDayShort(d);
	return stops === 1 ? '1 stop' : `${stops} stops`;
}

const AIRPORT = /airport|terminal|\bklia\b|\blcct\b/i;

/** Airports get a plane; everything else the fallback (home for a start, flag for a different end). */
export function placeIcon(name: string, fallback: 'home' | 'flag'): 'plane' | 'home' | 'flag' {
	return AIRPORT.test(name) ? 'plane' : fallback;
}
