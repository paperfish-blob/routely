import { describe, expect, it } from 'vitest';
import { LocalStorageStore, parseItinerary, STORAGE_KEY } from './LocalStorageStore';
import type { Itinerary } from '../types';

function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k)
	};
}

const paris = { id: '1', name: 'Paris', lat: 48.85, lng: 2.35 };
const hotel = { id: 'h', name: 'Hotel', lat: 48.86, lng: 2.34 };

const itinerary: Itinerary = {
	version: 3,
	routeMode: 'driving',
	days: [
		{ id: 'd1', title: 'Paris', start: { kind: 'place', place: hotel }, end: { kind: 'place', place: paris }, stops: [paris] },
		{ id: 'd2', title: '', start: { kind: 'chain' }, end: { kind: 'open' }, stops: [] }
	]
};

const raw = (extra: object) => JSON.stringify({ version: 3, routeMode: 'driving', days: [], ...extra });

describe('LocalStorageStore', () => {
	it('uses the routely: key prefix', () => expect(STORAGE_KEY.startsWith('routely:')).toBe(true));

	it('round-trips an itinerary', async () => {
		const store = new LocalStorageStore(memoryStorage());
		expect(await store.load()).toBeNull();
		await store.save(itinerary);
		expect(await store.load()).toEqual(itinerary);
	});

	it('clear removes saved data', async () => {
		const storage = memoryStorage();
		const store = new LocalStorageStore(storage);
		await store.save(itinerary);
		await store.clear();
		expect(storage.data.size).toBe(0);
		expect(await store.load()).toBeNull();
	});

	it('survives a storage that throws', async () => {
		const broken = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {
				throw new Error('denied');
			}
		};
		const store = new LocalStorageStore(broken);
		expect(await store.load()).toBeNull();
		await expect(store.save(itinerary)).resolves.toBeUndefined();
		await expect(store.clear()).resolves.toBeUndefined();
	});
});

describe('migration from older saves', () => {
	it('v1: a flat stop list becomes a single Day 1 with a chained start and a loop end', () => {
		const parsed = parseItinerary(
			JSON.stringify({ version: 1, routeMode: 'driving', name: 'Trip', stops: [paris, { id: 2 }] })
		);
		expect(parsed?.version).toBe(3);
		expect(parsed?.days).toHaveLength(1);
		expect(parsed?.days[0].stops).toEqual([paris]);
		expect(parsed?.days[0].start).toEqual({ kind: 'chain' });
		expect(parsed?.days[0].end).toEqual({ kind: 'start' });
		expect(parsed?.name).toBe('Trip');
	});

	it('v2: a day’s single base becomes its start, and the day loops back to it', () => {
		const parsed = parseItinerary(
			JSON.stringify({
				version: 2,
				routeMode: 'driving',
				useBase: true,
				days: [
					{ id: 'a', title: 'KL', base: hotel, stops: [paris] },
					{ id: 'b', title: '', base: null, stops: [] }
				]
			})
		);
		expect(parsed?.version).toBe(3);
		expect(parsed?.days[0].start).toEqual({ kind: 'place', place: hotel });
		expect(parsed?.days[0].end).toEqual({ kind: 'start' });
		expect(parsed?.days[1].start).toEqual({ kind: 'chain' });
		expect(parsed?.useBase).toBe(true);
	});
});

describe('days, dates and start/end points', () => {
	it('round-trips start date, base mode and per-day base', async () => {
		const store = new LocalStorageStore(memoryStorage());
		await store.save({ ...itinerary, startDate: '2026-10-24', useBase: false, name: 'KL', clusterThresholdKm: 60 });
		expect(await store.load()).toMatchObject({ startDate: '2026-10-24', useBase: false, name: 'KL', clusterThresholdKm: 60 });
	});

	it('tolerates their absence and always yields at least one day', () => {
		const parsed = parseItinerary(raw({}));
		expect(parsed?.days).toHaveLength(1);
		expect(parsed?.startDate).toBeUndefined();
		expect(parsed?.useBase).toBeUndefined();
	});

	it('ignores invalid values', () => {
		const parsed = parseItinerary(raw({ name: 5, clusterThresholdKm: -3, startDate: '2026-02-30', useBase: 'yes' }));
		expect(parsed?.name).toBeUndefined();
		expect(parsed?.clusterThresholdKm).toBeUndefined();
		expect(parsed?.startDate).toBeUndefined();
		expect(parsed?.useBase).toBeUndefined();
		expect(parseItinerary(raw({ clusterThresholdKm: 'far' }))?.clusterThresholdKm).toBeUndefined();
	});

	it('drops malformed days, stops and bases', () => {
		const parsed = parseItinerary(
			raw({
				days: [
					{ id: 'a', stops: [paris, null, { id: 1 }], start: { kind: 'place', place: { nope: true } }, end: { kind: 'weird' } },
					{ stops: [] },
					null
				]
			})
		);
		expect(parsed?.days).toHaveLength(1);
		expect(parsed?.days[0].stops).toEqual([paris]);
		expect(parsed?.days[0].start).toEqual({ kind: 'chain' });
		expect(parsed?.days[0].end).toEqual({ kind: 'start' });
	});

	it('caps long names and titles', () => {
		const parsed = parseItinerary(raw({ name: 'x'.repeat(500), days: [{ id: 'a', title: 'y'.repeat(500), stops: [] }] }));
		expect(parsed?.name).toHaveLength(80);
		expect(parsed?.days[0].title).toHaveLength(80);
	});
});

describe('parseItinerary', () => {
	it('rejects corrupt JSON, unknown versions and empty input', () => {
		expect(parseItinerary('{nope')).toBeNull();
		expect(parseItinerary(JSON.stringify({ version: 9, days: [] }))).toBeNull();
		expect(parseItinerary(JSON.stringify({ version: 4, days: [] }))).toBeNull();
		expect(parseItinerary(null)).toBeNull();
	});

	it('defaults an unknown route mode', () => {
		expect(parseItinerary(raw({ routeMode: 'teleport' }))?.routeMode).toBe('straight');
	});

	it('keeps a valid temperature unit and drops anything else', () => {
		const base = { version: 3, days: [], routeMode: 'driving' };
		expect(parseItinerary(JSON.stringify({ ...base, tempUnit: 'f' }))?.tempUnit).toBe('f');
		expect(parseItinerary(JSON.stringify({ ...base, tempUnit: 'k' }))?.tempUnit).toBeUndefined();
	});
});
