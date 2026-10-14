import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherResponse } from '../types';
import { WeatherState } from './weather.svelte';

const wx = (over: Partial<WeatherResponse> = {}): WeatherResponse => ({
	date: '2026-10-25',
	lat: 3.14,
	lng: 101.69,
	source: 'forecast',
	summary: 'Rain',
	icon: 'rain',
	temp_max_c: 30,
	temp_min_c: 24,
	rain_chance: 70,
	rain_mm: 5,
	wind_kmh: 10,
	uv_index: 6,
	periods: [],
	wet_day_share: null,
	years: null,
	fetched_at: '2026-10-14T06:00:00Z',
	attribution: 'Weather by Open-Meteo.com',
	...over
});
const place = (id: string, lat: number, lng: number) => ({ id, name: id, lat, lng });
const KL = place('kl', 3.139, 101.687);
const MALACCA = place('mal', 2.196, 102.249);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('WeatherState', () => {
	it('waits for edits to settle, then fetches and stores the result', async () => {
		const fetchWeather = vi.fn(async () => wx());
		const s = new WeatherState(fetchWeather);
		s.want([{ place: KL, date: '2026-10-25' }]);
		expect(s.entry(KL, '2026-10-25')).toBeUndefined();
		expect(fetchWeather).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(400);
		expect(fetchWeather).toHaveBeenCalledOnce();
		expect(fetchWeather.mock.calls[0].slice(0, 3)).toEqual([3.139, 101.687, '2026-10-25']);
		expect(s.entry(KL, '2026-10-25')).toMatchObject({ status: 'ok' });
	});

	it('looks up a place and date once even when several days ask for it', async () => {
		const fetchWeather = vi.fn(async () => wx());
		const s = new WeatherState(fetchWeather);
		s.want([
			{ place: KL, date: '2026-10-25' },
			{ place: { ...KL, id: 'other', lat: 3.1391 }, date: '2026-10-25' }
		]);
		await vi.advanceTimersByTimeAsync(400);
		expect(fetchWeather).toHaveBeenCalledOnce();
	});

	it('does not fetch again for results it already has', async () => {
		const fetchWeather = vi.fn(async () => wx());
		const s = new WeatherState(fetchWeather);
		s.want([{ place: KL, date: '2026-10-25' }]);
		await vi.advanceTimersByTimeAsync(400);
		s.want([{ place: KL, date: '2026-10-25' }, { place: MALACCA, date: '2026-10-26' }]);
		await vi.advanceTimersByTimeAsync(400);
		expect(fetchWeather).toHaveBeenCalledTimes(2);
	});

	it('marks failures as errors and retries them on request', async () => {
		const fetchWeather = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(wx());
		const s = new WeatherState(fetchWeather);
		s.want([{ place: KL, date: '2026-10-25' }]);
		await vi.advanceTimersByTimeAsync(400);
		expect(s.entry(KL, '2026-10-25')).toEqual({ status: 'error' });
		s.retry();
		await vi.advanceTimersByTimeAsync(0);
		expect(s.entry(KL, '2026-10-25')).toMatchObject({ status: 'ok' });
		expect(fetchWeather).toHaveBeenCalledTimes(2);
	});

	it('cancels lookups nobody needs any more', async () => {
		let signal: AbortSignal | undefined;
		const fetchWeather = vi.fn((_a: number, _b: number, _c: string, sig?: AbortSignal) => {
			signal = sig;
			return new Promise<WeatherResponse>(() => {});
		});
		const s = new WeatherState(fetchWeather);
		s.want([{ place: KL, date: '2026-10-25' }]);
		await vi.advanceTimersByTimeAsync(400);
		expect(s.entry(KL, '2026-10-25')).toEqual({ status: 'loading' });
		s.want([]);
		expect(signal?.aborted).toBe(true);
		expect(s.entry(KL, '2026-10-25')).toBeUndefined();
	});

	it('runs at most four lookups at a time', async () => {
		let active = 0;
		let peak = 0;
		const fetchWeather = vi.fn(async () => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((r) => setTimeout(r, 50));
			active--;
			return wx();
		});
		const s = new WeatherState(fetchWeather);
		s.want(Array.from({ length: 10 }, (_, i) => ({ place: KL, date: `2026-10-${10 + i}` })));
		await vi.advanceTimersByTimeAsync(2000);
		expect(fetchWeather).toHaveBeenCalledTimes(10);
		expect(peak).toBe(4);
	});
});
