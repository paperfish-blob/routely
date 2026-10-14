import { dayDate, formatDayShort, haversineKm } from './days';
import type { ClusterInfo, ClusterStyle } from './clusters';
import type { Day, ResolvedEnds, Stop, TempUnit, WeatherIconKind, WeatherResponse } from './types';
import type { IconName } from './ui/icons';

/** Start and end closer than this share one reading; further apart get a reading each. */
export const MERGE_KM = 30;
/** Rain chance (%) from which a day is called out as wet. */
export const WET_CHANCE = 50;

export type WeatherRole = 'day' | 'start' | 'end';

/** A place to look up the weather for, and why. */
export interface WeatherPoint {
	role: WeatherRole;
	place: Stop;
}

export interface WeatherReading extends WeatherPoint {
	wx: WeatherResponse;
}

/**
 * Where to read the weather for a day: its start and its end. Close together (or a single stop)
 * they collapse into one reading. Without a fixed start/end the first/last stop stand in. Empty days have none.
 */
export function weatherPoints(day: Day, ends: ResolvedEnds | null): WeatherPoint[] {
	if (day.stops.length === 0) return [];
	const start = ends?.start ?? day.stops[0];
	const end = ends?.end ?? day.stops[day.stops.length - 1];
	if (haversineKm(start, end) < MERGE_KM) return [{ role: 'day', place: start }];
	return [
		{ role: 'start', place: start },
		{ role: 'end', place: end }
	];
}

/** ISO date of the day at `index`, or null when the trip has no dates. */
export function isoDayDate(startDate: string | null | undefined, index: number): string | null {
	const d = dayDate(startDate, index);
	return d ? d.toISOString().slice(0, 10) : null;
}

/** Cache key: the backend rounds to ~1 km, so the browser does the same to share lookups. */
export function weatherKey(place: { lat: number; lng: number }, date: string): string {
	return `${place.lat.toFixed(2)},${place.lng.toFixed(2)}|${date}`;
}

export const toUnit = (c: number, unit: TempUnit): number => Math.round(unit === 'f' ? (c * 9) / 5 + 32 : c);
export const formatTemp = (c: number, unit: TempUnit): string => `${toUnit(c, unit)}°`;

export const iconName = (kind: WeatherIconKind): IconName => `wx-${kind}` as IconName;

/** Colour role of a weather icon: sunny, wet or grey. */
export function tone(kind: WeatherIconKind): 'sun' | 'rainy' | 'cloudy' {
	if (kind === 'sun' || kind === 'partly') return 'sun';
	if (kind === 'rain' || kind === 'storm' || kind === 'snow') return 'rainy';
	return 'cloudy';
}

export interface WeatherGlance {
	icon: WeatherIconKind;
	high: number;
	low: number;
	/** Highest rain chance (%), or null when no source gives one. */
	rain: number | null;
	wet: boolean;
}

const SEVERITY: WeatherIconKind[] = ['sun', 'partly', 'cloudy', 'fog', 'rain', 'snow', 'storm'];

/** One line for a tab or chip: the worst icon, widest temperature range, highest rain chance. */
export function glance(readings: WeatherReading[]): WeatherGlance | null {
	if (readings.length === 0) return null;
	let icon = readings[0].wx.icon;
	let high = -Infinity;
	let low = Infinity;
	let rain: number | null = null;
	let mm = 0;
	for (const { wx } of readings) {
		if (SEVERITY.indexOf(wx.icon) > SEVERITY.indexOf(icon)) icon = wx.icon;
		high = Math.max(high, wx.temp_max_c);
		low = Math.min(low, wx.temp_min_c);
		if (wx.rain_chance !== null) rain = Math.max(rain ?? 0, wx.rain_chance);
		mm = Math.max(mm, wx.rain_mm);
	}
	const wet = rain !== null ? rain >= WET_CHANCE : mm >= 1;
	return { icon, high, low, rain, wet };
}

export interface RainAdvice {
	/** "Rain is likely from about 12 pm to midnight (75%)." */
	text: string;
	/** What to do about it. */
	hint: string;
	place: string;
}

const DAYTIME = ['morning', 'afternoon', 'evening'] as const;
const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * Advice for a wet forecast day: which parts of the day are wet, so outdoor stops can move to a dry one.
 * Only forecasts carry hourly chances; recorded and typical weather give none.
 */
export function rainAdvice(reading: WeatherReading): RainAdvice | null {
	const { wx } = reading;
	if (wx.source !== 'forecast' || wx.rain_chance === null || wx.rain_chance < WET_CHANCE) return null;
	const place = reading.place.name;
	const wetNames = new Set(wx.periods.filter((p) => (p.rain_chance ?? 0) >= WET_CHANCE).map((p) => p.name));
	if (wetNames.size === 0) return { text: `Rain is likely today (${wx.rain_chance}%).`, hint: 'Bring rain gear or plan some indoor stops.', place };
	const wet = (['morning', 'afternoon', 'evening', 'night'] as const).filter((n) => wetNames.has(n));
	const dry = DAYTIME.find((n) => wx.periods.some((p) => p.name === n) && !wetNames.has(n));
	return {
		text: `Rain is likely during the ${listOf(wet)} (${wx.rain_chance}%).`,
		hint: dry ? `Consider doing outdoor stops in the ${dry}.` : 'Bring rain gear or plan some indoor stops.',
		place
	};
}

/** "just now", "8 min ago", "3 h ago". */
export function ago(iso: string, now: number = Date.now()): string {
	const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
	if (!Number.isFinite(min) || min < 1) return 'just now';
	if (min < 60) return `${min} min ago`;
	const h = Math.round(min / 60);
	return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** The date a real forecast becomes available for `iso`: 15 days before it. */
export function forecastOpensOn(iso: string): string | null {
	const d = dayDate(iso, -15);
	return d ? formatDayShort(d) : null;
}

export const sourceLabel = (source: WeatherResponse['source']): string =>
	source === 'forecast' ? 'FORECAST' : source === 'typical' ? 'TYPICAL' : 'RECORDED';

export const PERIOD_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night' } as const;

// ── weather by area (clusters) ──────────────────────────────────────────

/** One or more clusters read together because their centres are within MERGE_KM of each other. */
export interface AreaGroup {
	id: string;
	clusters: ClusterInfo[];
	stops: Stop[];
	center: { lat: number; lng: number };
	/** First stop's name, plus how many more: "KLCC +2". */
	name: string;
}

/** A start or end that is too far from every area to share its reading. */
export interface OuterPoint {
	role: 'start' | 'end' | 'both';
	place: Stop;
}

export interface AreaPlan {
	groups: AreaGroup[];
	outer: OuterPoint[];
	/** The group a start/end reading is folded into, when there is one. */
	startIn: string | null;
	endIn: string | null;
	/** Worth showing by area: at least two places far enough apart to differ (areas, or an area plus a distant start/end). */
	applicable: boolean;
}

const centroid = (points: { lat: number; lng: number }[]) => ({
	lat: points.reduce((a, p) => a + p.lat, 0) / points.length,
	lng: points.reduce((a, p) => a + p.lng, 0) / points.length
});

/**
 * Groups clusters whose centres are within MERGE_KM (single linkage), so the number of weather
 * lookups depends on how spread out the day is, never on the cluster size setting.
 */
export function planAreas(
	clusters: ClusterInfo[],
	findStop: (id: string) => Stop | undefined,
	start: Stop | null,
	end: Stop | null
): AreaPlan {
	const withStops = clusters
		.map((c) => ({ c, stops: c.stopIds.flatMap((id) => findStop(id) ?? []) }))
		.filter((x) => x.stops.length > 0)
		.map((x) => ({ ...x, center: centroid(x.stops) }));
	const parent = withStops.map((_, i) => i);
	const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	for (let a = 0; a < withStops.length; a++) {
		for (let b = a + 1; b < withStops.length; b++) {
			if (haversineKm(withStops[a].center, withStops[b].center) < MERGE_KM) parent[find(b)] = find(a);
		}
	}
	const byRoot = new Map<number, typeof withStops>();
	withStops.forEach((x, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), x]));
	const groups: AreaGroup[] = [...byRoot.values()].map((members) => {
		const stops = members.flatMap((m) => m.stops);
		return {
			id: `area-${members[0].c.id}`,
			clusters: members.map((m) => m.c),
			stops,
			center: centroid(stops),
			name: stops.length > 1 ? `${stops[0].name} +${stops.length - 1}` : stops[0].name
		};
	});
	const near = (p: Stop | null) =>
		p ? (groups.find((g) => haversineKm(p, g.center) < MERGE_KM)?.id ?? null) : null;
	const startIn = near(start);
	const endIn = near(end);
	const outer: OuterPoint[] = [];
	if (start && !startIn && end && !endIn && haversineKm(start, end) < MERGE_KM) outer.push({ role: 'both', place: start });
	else {
		if (start && !startIn) outer.push({ role: 'start', place: start });
		if (end && !endIn) outer.push({ role: 'end', place: end });
	}
	return { groups, outer, startIn, endIn, applicable: groups.length + outer.length >= 2 };
}

/** A row of the by-area view: a group of clusters, or an outer start/end. */
export interface AreaRowBase {
	id: string;
	group: AreaGroup | null;
	outer: OuterPoint | null;
	/** Where the reading is taken. */
	place: { id: string; name: string; lat: number; lng: number };
	/** "START" / "END" folded into an area row. */
	includes: ('start' | 'end')[];
}

export function areaRows(plan: AreaPlan, start: Stop | null, end: Stop | null): AreaRowBase[] {
	const rows: AreaRowBase[] = [];
	const outerOf = (o: OuterPoint): AreaRowBase => ({ id: `outer-${o.role}`, group: null, outer: o, place: o.place, includes: [] });
	const first = plan.outer.filter((o) => o.role !== 'end').map(outerOf);
	const last = plan.outer.filter((o) => o.role === 'end').map(outerOf);
	rows.push(...first);
	for (const g of plan.groups) {
		const includes: AreaRowBase['includes'] = [];
		if (plan.startIn === g.id && start) includes.push('start');
		if (plan.endIn === g.id && end) includes.push('end');
		rows.push({ id: g.id, group: g, outer: null, place: { id: g.id, name: g.name, lat: g.center.lat, lng: g.center.lng }, includes });
	}
	rows.push(...last);
	return rows;
}

export interface AreaDiff {
	kind: 'temp' | 'rain';
	/** "10° COOLER", "+55% RAIN" */
	text: string;
}

export const DIFF_TEMP_C = 5;
export const DIFF_RAIN_POINTS = 30;

/** How a reading stands out from the others (only when the gap is big enough to matter). */
export function areaDiffs(own: WeatherResponse, others: WeatherResponse[], unit: TempUnit): AreaDiff[] {
	if (others.length === 0) return [];
	const out: AreaDiff[] = [];
	const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
	const dT = own.temp_max_c - meanOf(others.map((o) => o.temp_max_c));
	if (Math.abs(dT) >= DIFF_TEMP_C) {
		const shown = Math.abs(toUnit(own.temp_max_c, unit) - toUnit(own.temp_max_c - dT, unit));
		out.push({ kind: 'temp', text: `${shown}° ${dT < 0 ? 'COOLER' : 'WARMER'}` });
	}
	const rains = others.flatMap((o) => (o.rain_chance === null ? [] : [o.rain_chance]));
	if (own.rain_chance !== null && rains.length > 0) {
		const dR = Math.round(own.rain_chance - meanOf(rains));
		if (Math.abs(dR) >= DIFF_RAIN_POINTS) out.push({ kind: 'rain', text: `${dR > 0 ? '+' : '−'}${Math.abs(dR)}% RAIN` });
	}
	return out;
}
