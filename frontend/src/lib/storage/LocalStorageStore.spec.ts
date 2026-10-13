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

const itinerary: Itinerary = {
	version: 1,
	routeMode: 'driving',
	stops: [{ id: '1', name: 'Paris', lat: 48.85, lng: 2.35 }]
};

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

describe('itinerary name and cluster threshold', () => {
	it('round-trips both and tolerates their absence (older saves)', async () => {
		const store = new LocalStorageStore(memoryStorage());
		await store.save({ ...itinerary, name: 'Peninsular Malaysia Weekend', clusterThresholdKm: 60 });
		expect(await store.load()).toMatchObject({ name: 'Peninsular Malaysia Weekend', clusterThresholdKm: 60 });

		const old = parseItinerary(JSON.stringify({ version: 1, routeMode: 'driving', stops: [] }));
		expect(old?.name).toBeUndefined();
		expect(old?.clusterThresholdKm).toBeUndefined();
	});

	it('ignores invalid values', () => {
		const parsed = parseItinerary(JSON.stringify({ version: 1, routeMode: 'driving', stops: [], name: 5, clusterThresholdKm: -3 }));
		expect(parsed?.name).toBeUndefined();
		expect(parsed?.clusterThresholdKm).toBeUndefined();
		expect(parseItinerary(JSON.stringify({ version: 1, routeMode: 'driving', stops: [], clusterThresholdKm: 'far' }))?.clusterThresholdKm).toBeUndefined();
	});

	it('caps a very long name', () => {
		const parsed = parseItinerary(JSON.stringify({ version: 1, routeMode: 'driving', stops: [], name: 'x'.repeat(500) }));
		expect(parsed?.name).toHaveLength(80);
	});
});

describe('parseItinerary', () => {
	it('rejects corrupt JSON and wrong versions', () => {
		expect(parseItinerary('{nope')).toBeNull();
		expect(parseItinerary(JSON.stringify({ version: 2, stops: [] }))).toBeNull();
		expect(parseItinerary(null)).toBeNull();
	});

	it('drops malformed stops and defaults an unknown route mode', () => {
		const raw = JSON.stringify({
			version: 1,
			routeMode: 'teleport',
			stops: [{ id: '1', name: 'ok', lat: 1, lng: 2 }, { id: 2 }, null]
		});
		const parsed = parseItinerary(raw);
		expect(parsed?.stops).toHaveLength(1);
		expect(parsed?.routeMode).toBe('straight');
	});
});
