import { describe, expect, it } from 'vitest';
import { newDay } from './days';
import type { Stop, WeatherResponse } from './types';
import { ago, forecastOpensOn, formatTemp, glance, isoDayDate, rainAdvice, weatherKey, weatherPoints, type WeatherReading } from './weather';

const stop = (id: string, lat: number, lng: number, name = id): Stop => ({ id, name, lat, lng });
const KL = stop('kl', 3.139, 101.687);
const KLCC = stop('klcc', 3.158, 101.712);
const MALACCA = stop('mal', 2.196, 102.249);

const wx = (over: Partial<WeatherResponse> = {}): WeatherResponse => ({
	date: '2026-10-25',
	lat: 3.14,
	lng: 101.69,
	source: 'forecast',
	summary: 'Rain',
	icon: 'rain',
	temp_max_c: 30,
	temp_min_c: 24,
	rain_chance: 75,
	rain_mm: 12,
	wind_kmh: 14,
	uv_index: 7,
	periods: [
		{ name: 'morning', temp_c: 27, rain_chance: 10 },
		{ name: 'afternoon', temp_c: 30, rain_chance: 80 },
		{ name: 'evening', temp_c: 27, rain_chance: 60 },
		{ name: 'night', temp_c: 25, rain_chance: 20 }
	],
	wet_day_share: null,
	years: null,
	fetched_at: '2026-10-14T06:00:00Z',
	attribution: 'Weather by Open-Meteo.com',
	...over
});
const reading = (w = wx(), role: WeatherReading['role'] = 'day'): WeatherReading => ({ role, place: KL, wx: w });

describe('weatherPoints', () => {
	it('is empty for a day without stops', () => {
		expect(weatherPoints(newDay(), { start: KL, end: KL })).toEqual([]);
	});

	it('gives one reading when start and end are close', () => {
		const day = newDay({ stops: [KLCC] });
		expect(weatherPoints(day, { start: KL, end: KL })).toEqual([{ role: 'day', place: KL }]);
	});

	it('gives separate start and end readings when they are far apart', () => {
		const day = newDay({ stops: [KLCC] });
		expect(weatherPoints(day, { start: KL, end: MALACCA })).toEqual([
			{ role: 'start', place: KL },
			{ role: 'end', place: MALACCA }
		]);
	});

	it('falls back to the first and last stop without a fixed start/end', () => {
		const day = newDay({ stops: [KL, KLCC, MALACCA] });
		const points = weatherPoints(day, { start: null, end: null });
		expect(points.map((p) => [p.role, p.place.id])).toEqual([
			['start', 'kl'],
			['end', 'mal']
		]);
	});

	it('uses one reading for a single stop with no ends', () => {
		expect(weatherPoints(newDay({ stops: [KL] }), null)).toEqual([{ role: 'day', place: KL }]);
	});
});

describe('dates and keys', () => {
	it('derives a day date from the trip start', () => {
		expect(isoDayDate('2026-10-24', 0)).toBe('2026-10-24');
		expect(isoDayDate('2026-10-30', 3)).toBe('2026-11-02');
		expect(isoDayDate(null, 0)).toBeNull();
	});

	it('shares a key within about a kilometre', () => {
		expect(weatherKey({ lat: 3.1391, lng: 101.6869 }, '2026-10-25')).toBe(weatherKey({ lat: 3.1404, lng: 101.6851 }, '2026-10-25'));
		expect(weatherKey(KL, '2026-10-25')).not.toBe(weatherKey(KL, '2026-10-26'));
	});
});

describe('temperature', () => {
	it('shows Celsius or Fahrenheit, rounded', () => {
		expect(formatTemp(30.4, 'c')).toBe('30°');
		expect(formatTemp(30, 'f')).toBe('86°');
		expect(formatTemp(-1.2, 'c')).toBe('-1°');
	});
});

describe('glance', () => {
	it('is null without readings', () => {
		expect(glance([])).toBeNull();
	});

	it('combines two readings: worst icon, widest range, highest rain chance', () => {
		const g = glance([
			reading(wx({ icon: 'sun', temp_max_c: 33, temp_min_c: 25, rain_chance: 10, rain_mm: 0 }), 'start'),
			reading(wx({ icon: 'storm', temp_max_c: 29, temp_min_c: 23, rain_chance: 80 }), 'end')
		])!;
		expect(g).toMatchObject({ icon: 'storm', high: 33, low: 23, rain: 80, wet: true });
	});

	it('judges recorded days by rainfall when there is no chance', () => {
		expect(glance([reading(wx({ source: 'recorded', rain_chance: null, rain_mm: 4 }))])!.wet).toBe(true);
		expect(glance([reading(wx({ source: 'recorded', rain_chance: null, rain_mm: 0 }))])!.wet).toBe(false);
	});
});

describe('rainAdvice', () => {
	it('names the wet stretch of a wet forecast', () => {
		expect(rainAdvice(reading())!.text).toBe('Rain is likely during the afternoon and evening (75%).');
	});

	it('suggests the morning when it stays dry until noon', () => {
		expect(rainAdvice(reading())!.hint).toBe('Consider doing outdoor stops in the morning.');
	});

	it('suggests rain gear when the morning is wet too', () => {
		const w = wx({ periods: [{ name: 'morning', temp_c: 26, rain_chance: 70 }] });
		expect(rainAdvice(reading(w))!.hint).toBe('Bring rain gear or plan some indoor stops.');
	});

	it('is absent for dry days, recorded and typical weather', () => {
		expect(rainAdvice(reading(wx({ rain_chance: 20 })))).toBeNull();
		expect(rainAdvice(reading(wx({ source: 'recorded', rain_chance: null })))).toBeNull();
		expect(rainAdvice(reading(wx({ source: 'typical', rain_chance: null })))).toBeNull();
	});

	it('falls back to a plain sentence without hourly data', () => {
		expect(rainAdvice(reading(wx({ periods: [] })))!.text).toBe('Rain is likely today (75%).');
	});
});

describe('ago and forecastOpensOn', () => {
	const now = Date.parse('2026-10-14T06:30:00Z');
	it('describes how old a reading is', () => {
		expect(ago('2026-10-14T06:30:00Z', now)).toBe('just now');
		expect(ago('2026-10-14T06:22:00Z', now)).toBe('8 min ago');
		expect(ago('2026-10-14T03:30:00Z', now)).toBe('3 h ago');
		expect(ago('2026-10-12T06:30:00Z', now)).toBe('2 d ago');
	});

	it('says when a real forecast appears for a far-off day', () => {
		expect(forecastOpensOn('2026-11-14')).toBe('Fri 30 Oct');
	});
});
