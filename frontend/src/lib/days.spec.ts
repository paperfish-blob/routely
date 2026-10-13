import { describe, expect, it } from 'vitest';
import {
	endLegsKm,
	placeIcon,
	resolveEnds,
	samePlace,
	copyStopToDay,
	dayCaption,
	dayDate,
	duplicateDay,
	formatDayLong,
	formatDayShort,
	formatTripRange,
	haversineKm,
	isIsoDate,
	MAX_STOPS_PER_DAY,
	moveStopToDay,
	newDay,
	waypointsOf
} from './days';
import type { Day, Stop } from './types';

const stop = (id: string, lat = 0, lng = 0): Stop => ({ id, name: id, lat, lng });
const day = (
	id: string,
	ids: string[],
	start: Day['start'] = { kind: 'chain' },
	end: Day['end'] = { kind: 'start' }
): Day => ({ id, title: '', start, end, stops: ids.map((s) => stop(s)) });
const at = (p: Stop): Day['start'] => ({ kind: 'place', place: p });

describe('haversineKm', () => {
	it('agrees with the backend (Paris → London ≈ 343.5 km)', () => {
		const d = haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 });
		expect(d).toBeGreaterThan(342.5);
		expect(d).toBeLessThan(344.5);
	});
	it('is zero for the same point', () => expect(haversineKm({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0));
});

describe('dates', () => {
	it('validates ISO dates', () => {
		expect(isIsoDate('2026-10-24')).toBe(true);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('24/10/2026')).toBe(false);
		expect(isIsoDate(5)).toBe(false);
	});
	it('derives each day from the start date, independent of timezone', () => {
		expect(formatDayShort(dayDate('2026-10-24', 0)!)).toBe('Sat 24 Oct');
		expect(formatDayShort(dayDate('2026-10-24', 2)!)).toBe('Mon 26 Oct');
		expect(formatDayLong(dayDate('2026-10-24', 1)!)).toBe('Sunday 25 October');
		expect(formatDayShort(dayDate('2026-10-31', 2)!)).toBe('Mon 2 Nov');
	});
	it('has no dates without a start date', () => {
		expect(dayDate(null, 0)).toBeNull();
		expect(formatTripRange(undefined, 3)).toBeNull();
	});
	it('formats the trip range', () => {
		expect(formatTripRange('2026-10-24', 3)).toBe('Sat 24 – Mon 26 Oct');
		expect(formatTripRange('2026-10-31', 3)).toBe('Sat 31 Oct – Mon 2 Nov');
		expect(formatTripRange('2026-10-24', 1)).toBe('Sat 24 Oct');
	});
	it('captions a tab with its date, else its stop count', () => {
		expect(dayCaption('2026-10-24', 1, 4)).toBe('Sun 25 Oct');
		expect(dayCaption(null, 0, 1)).toBe('1 stop');
		expect(dayCaption(null, 0, 3)).toBe('3 stops');
	});
});

describe('resolveEnds', () => {
	const A = stop('A', 1, 1);
	const B = stop('B', 2, 2);
	const C = stop('C', 3, 3);

	it('a loop starts and ends at the same place', () => {
		const [d] = resolveEnds([day('d1', ['a'], at(A))]);
		expect(d.start).toEqual(A);
		expect(d.end).toEqual(A);
	});

	it('the first day has no chained start', () => {
		const [d] = resolveEnds([day('d1', ['a'])]);
		expect(d).toEqual({ start: null, end: null });
	});

	it('a chained start follows the previous day’s end, through different hotels', () => {
		const days = [
			day('d1', ['a'], at(A), { kind: 'place', place: B }), // A → B
			day('d2', ['b']), // starts at B, loops back to B
			day('d3', ['c'], { kind: 'chain' }, { kind: 'place', place: C }) // B → C
		];
		const r = resolveEnds(days);
		expect(r.map((x) => [x.start?.id, x.end?.id])).toEqual([['A', 'B'], ['B', 'B'], ['B', 'C']]);
	});

	it('an open end leaves the next day without a chained start', () => {
		const r = resolveEnds([day('d1', ['a'], at(A), { kind: 'open' }), day('d2', ['b'])]);
		expect(r[0].end).toBeNull();
		expect(r[1].start).toBeNull();
	});

	it('an explicit "none" start stops the chain, and a place overrides it', () => {
		const r = resolveEnds([
			day('d1', ['a'], at(A)),
			day('d2', ['b'], { kind: 'none' }),
			day('d3', ['c'], at(C))
		]);
		expect(r[1].start).toBeNull();
		expect(r[1].end).toBeNull(); // loop back to nothing
		expect(r[2].start).toEqual(C);
	});

	it('an empty day passes the chain through', () => {
		const r = resolveEnds([day('d1', ['a'], at(A)), day('d2', []), day('d3', ['c'])]);
		expect(r[2].start).toEqual(A);
	});
});

describe('waypoints', () => {
	const hotel = stop('hotel', 3, 101);
	const airport = stop('klia', 2.7, 101.7);
	it('wraps stops with start and end, using distinct ids (the same place can appear twice)', () => {
		const d = day('d', ['a', 'b']);
		const w = waypointsOf(d, { start: hotel, end: hotel });
		expect(w.hasStart && w.hasEnd).toBe(true);
		expect(w.list.map((s) => s.id)).toEqual(['hotel~start', 'a', 'b', 'hotel~end']);
		expect(new Set(w.list.map((s) => s.id)).size).toBe(4);
	});
	it('handles a start without an end, an end without a start, and different places', () => {
		const d = day('d', ['a']);
		expect(waypointsOf(d, { start: hotel, end: null }).list.map((s) => s.id)).toEqual(['hotel~start', 'a']);
		expect(waypointsOf(d, { start: null, end: hotel }).list.map((s) => s.id)).toEqual(['a', 'hotel~end']);
		expect(waypointsOf(d, { start: airport, end: hotel }).list.map((s) => s.id)).toEqual(['klia~start', 'a', 'hotel~end']);
	});
	it('ignores the ends when off, or when the day is empty', () => {
		expect(waypointsOf(day('d', ['a']), null).list.map((s) => s.id)).toEqual(['a']);
		expect(waypointsOf(day('d', []), { start: hotel, end: hotel }).list).toEqual([]);
	});
	it('measures the legs to and from the ends separately', () => {
		const d: Day = { ...day('d', []), stops: [stop('a', 3, 102), stop('b', 3, 101.5)] };
		const legs = endLegsKm(d, { start: hotel, end: hotel });
		expect(legs.start).toBeGreaterThan(100);
		expect(legs.end).toBeGreaterThan(50);
		expect(endLegsKm(d, { start: hotel, end: null }).end).toBe(0);
		expect(endLegsKm(d, null)).toEqual({ start: 0, end: 0 });
	});
});

describe('places', () => {
	it('knows when two points are the same place', () => {
		expect(samePlace(stop('a', 3, 101), stop('b', 3.0001, 101.0001))).toBe(true);
		expect(samePlace(stop('a', 3, 101), stop('b', 3.1, 101))).toBe(false);
		expect(samePlace(null, stop('b'))).toBe(false);
	});
	it('picks a plane for airports, else the fallback', () => {
		expect(placeIcon('KLIA Airport', 'home')).toBe('plane');
		expect(placeIcon('Changi Airport Terminal 3', 'flag')).toBe('plane');
		expect(placeIcon('Hotel Pantai', 'home')).toBe('home');
		expect(placeIcon('Hotel Pantai', 'flag')).toBe('flag');
	});
});

describe('moving stops', () => {
	const days = [day('d1', ['a', 'b', 'c']), day('d2', ['x'])];
	it('moves to the end of another day by default', () => {
		const next = moveStopToDay(days, 'b', 'd2')!;
		expect(next[0].stops.map((s) => s.id)).toEqual(['a', 'c']);
		expect(next[1].stops.map((s) => s.id)).toEqual(['x', 'b']);
		expect(days[0].stops).toHaveLength(3); // pure
	});
	it('can insert at a position', () => {
		expect(moveStopToDay(days, 'c', 'd2', 0)![1].stops.map((s) => s.id)).toEqual(['c', 'x']);
	});
	it('refuses same-day, unknown and full-day moves', () => {
		expect(moveStopToDay(days, 'a', 'd1')).toBeNull();
		expect(moveStopToDay(days, 'zzz', 'd2')).toBeNull();
		expect(moveStopToDay(days, 'a', 'nope')).toBeNull();
		const full = [day('d1', ['a']), day('d2', Array.from({ length: MAX_STOPS_PER_DAY }, (_, i) => `s${i}`))];
		expect(moveStopToDay(full, 'a', 'd2')).toBeNull();
	});
	it('copies a stop with a new id and keeps the original', () => {
		const result = copyStopToDay(days, 'a', 'd2')!;
		expect(result.copy.id).not.toBe('a');
		expect(result.copy.name).toBe('a');
		expect(result.days[0].stops.map((s) => s.id)).toEqual(['a', 'b', 'c']);
		expect(result.days[1].stops.at(-1)).toEqual(result.copy);
	});
	it('duplicates a day with fresh ids', () => {
		const original = { ...day('d1', ['a', 'b'], at(stop('hotel')), { kind: 'place', place: stop('end') } as const), title: 'KL' };
		const copy = duplicateDay(original);
		expect(copy.id).not.toBe('d1');
		expect(copy.title).toBe('KL (copy)');
		expect(copy.stops.map((s) => s.name)).toEqual(['a', 'b']);
		expect(copy.stops.map((s) => s.id)).not.toContain('a');
		expect(copy.start.kind === 'place' && copy.start.place.id).not.toBe('hotel');
		expect(copy.end.kind === 'place' && copy.end.place.id).not.toBe('end');
	});
	it('a chained start stays chained in the copy', () => {
		expect(duplicateDay(day('d1', ['a'])).start).toEqual({ kind: 'chain' });
	});
	it('newDay is empty, chained and looping', () =>
		expect(newDay()).toMatchObject({ title: '', start: { kind: 'chain' }, end: { kind: 'start' }, stops: [] }));
});
