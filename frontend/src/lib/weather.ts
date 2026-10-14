import { dayDate, formatDayShort, haversineKm } from './days';
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
