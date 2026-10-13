import { describe, expect, it, vi } from 'vitest';
import type { ItineraryStore } from '../storage';
import type { Day, Stop } from '../types';
import { ItineraryState } from './itinerary.svelte';
import { toasts } from './toasts.svelte';

/** Day/stop operations only: no network, no effects (those are covered by the browser tests). */
const store: ItineraryStore = { load: async () => null, save: async () => {}, clear: async () => {} };
const api = {} as never;

const stop = (id: string, lat = 3, lng = 101): Stop => ({ id, name: id.toUpperCase(), lat, lng });
const day = (
	id: string,
	ids: string[],
	start: Day['start'] = { kind: 'chain' },
	end: Day['end'] = { kind: 'start' }
): Day => ({ id, title: '', start, end, stops: ids.map((s) => stop(s)) });
const at = (p: Stop): Day['start'] => ({ kind: 'place', place: p });

function make(days: Day[] = [day('d1', ['a', 'b', 'c']), day('d2', ['x'])]) {
	const s = new ItineraryState(store, api);
	s.days = days;
	s.activeId = days[0].id;
	return s;
}
const ids = (s: ItineraryState, dayId: string) => s.days.find((d) => d.id === dayId)!.stops.map((x) => x.id);

describe('active day', () => {
	it('exposes only the active day’s stops and can switch to all days', () => {
		const s = make();
		expect(s.stops.map((x) => x.id)).toEqual(['a', 'b', 'c']);
		s.setActive('d2');
		expect(s.stops.map((x) => x.id)).toEqual(['x']);
		s.setActive(null);
		expect(s.isAll).toBe(true);
		expect(s.stops).toEqual([]);
	});

	it('cannot show "all days" with a single day', () => {
		const s = make([day('d1', ['a'])]);
		s.setActive(null);
		expect(s.activeId).toBe('d1');
		expect(s.isAll).toBe(false);
		expect(s.multiDay).toBe(false);
	});

	it('ignores unknown days and clears the selection when switching', () => {
		const s = make();
		s.select('b');
		s.setActive('nope');
		expect(s.activeId).toBe('d1');
		s.setActive('d2');
		expect(s.selectedId).toBeNull();
	});

	it('selecting a stop on another day switches to that day', () => {
		const s = make();
		s.select('x');
		expect(s.activeId).toBe('d2');
		expect(s.selectedId).toBe('x');
	});
});

describe('adding stops', () => {
	it('adds to the active day by default and to the chosen day otherwise', () => {
		const s = make();
		s.addStop(stop('n1'));
		expect(ids(s, 'd1')).toContain('n1');
		s.setAddTarget('d2');
		expect(s.addTarget.id).toBe('d2');
		s.addStop(stop('n2'));
		expect(ids(s, 'd2')).toContain('n2');
		expect(s.activeId).toBe('d2'); // the view follows the new stop
		expect(s.addToId).toBeNull();
	});

	it('stops at 25 per day', () => {
		const full = day('d1', Array.from({ length: 25 }, (_, i) => `s${i}`));
		const s = make([full, day('d2', [])]);
		expect(s.canAdd()).toBe(false);
		s.addStop(stop('extra'));
		expect(ids(s, 'd1')).toHaveLength(25);
		expect(s.canAdd('d2')).toBe(true);
	});
});

describe('moving and copying stops', () => {
	it('moves a stop and offers undo', () => {
		const s = make();
		toasts.items = [];
		s.moveStop('b', 'd2');
		expect(ids(s, 'd1')).toEqual(['a', 'c']);
		expect(ids(s, 'd2')).toEqual(['x', 'b']);
		toasts.act(toasts.items[0].id); // Undo
		expect(ids(s, 'd1')).toEqual(['a', 'b', 'c']);
		expect(ids(s, 'd2')).toEqual(['x']);
	});

	it('copies a stop under a new id, keeping the original', () => {
		const s = make();
		s.copyStop('a', 'd2');
		expect(ids(s, 'd1')).toEqual(['a', 'b', 'c']);
		const copy = s.days[1].stops.at(-1)!;
		expect(copy.name).toBe('A');
		expect(copy.id).not.toBe('a');
	});

	it('removing a stop can be undone in place', () => {
		const s = make();
		toasts.items = [];
		s.removeStop('b');
		expect(ids(s, 'd1')).toEqual(['a', 'c']);
		toasts.act(toasts.items[0].id);
		expect(ids(s, 'd1')).toEqual(['a', 'b', 'c']);
	});

	it('reorders a given day without touching the others', () => {
		const s = make();
		s.reorder(['c', 'a', 'b'], 'd1');
		expect(ids(s, 'd1')).toEqual(['c', 'a', 'b']);
		expect(ids(s, 'd2')).toEqual(['x']);
	});
});

describe('days', () => {
	it('adds a day at the end, inserts after, and duplicates', () => {
		const s = make();
		const end = s.addDay();
		expect(s.days.map((d) => d.id)).toEqual(['d1', 'd2', end.id]);
		expect(s.activeId).toBe(end.id);
		const mid = s.addDay({ afterId: 'd1', activate: false });
		expect(s.days.map((d) => d.id)).toEqual(['d1', mid.id, 'd2', end.id]);
		expect(s.activeId).toBe(end.id); // activate: false
		s.duplicateDayOf('d1');
		const copy = s.days[s.dayIndex('d1') + 1];
		expect(copy.stops.map((x) => x.name)).toEqual(['A', 'B', 'C']);
		expect(copy.stops.map((x) => x.id)).not.toContain('a');
	});

	it('a new day starts where the last one ended and loops back there', () => {
		const hotel = stop('h', 3.1, 101.1);
		const s = make([day('d1', ['a'], at(hotel)), day('d2', [])]);
		const added = s.addDay();
		expect(added.start).toEqual({ kind: 'chain' });
		expect(added.end).toEqual({ kind: 'start' });
		expect(s.endsOf(added).start?.name).toBe('H');
		expect(s.endsOf(added).end?.name).toBe('H');
	});

	it('moves days, but not past the ends', () => {
		const s = make([day('d1', []), day('d2', []), day('d3', [])]);
		s.moveDay('d1', -1);
		s.moveDay('d3', 1);
		expect(s.days.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
		s.moveDay('d1', 1);
		expect(s.days.map((d) => d.id)).toEqual(['d2', 'd1', 'd3']);
	});

	it('deleting a day moves the view along and can be undone; the last day cannot be deleted', () => {
		const s = make([day('d1', ['a']), day('d2', ['b']), day('d3', ['c'])]);
		s.setActive('d2');
		toasts.items = [];
		s.removeDay('d2');
		expect(s.days.map((d) => d.id)).toEqual(['d1', 'd3']);
		expect(s.activeId).toBe('d3');
		toasts.act(toasts.items[0].id);
		expect(s.days.map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
		expect(s.activeId).toBe('d2');
		const solo = make([day('only', ['a'])]);
		solo.removeDay('only');
		expect(solo.days).toHaveLength(1);
	});

	it('clearing a day keeps the day and can be undone', () => {
		const s = make();
		toasts.items = [];
		s.clearDay('d1');
		expect(ids(s, 'd1')).toEqual([]);
		toasts.act(toasts.items[0].id);
		expect(ids(s, 'd1')).toEqual(['a', 'b', 'c']);
	});

	it('numbers days and renames them', () => {
		const s = make();
		expect(s.dayLabel('d2')).toBe('Day 2');
		s.renameDay('d2', 'Putrajaya');
		expect(s.days[1].title).toBe('Putrajaya');
	});
});

describe('start and end points', () => {
	const hotelA = stop('ha', 3.0, 101.0);
	const hotelB = stop('hb', 3.0, 102.0); // ≈ 111 km east
	const airport = stop('klia', 2.7, 101.7);

	it('setting the first start carries through every day by chaining', () => {
		const s = make([day('d1', ['a']), day('d2', ['b']), day('d3', ['c'])]);
		s.setStart('d1', { kind: 'place', place: hotelA });
		const r = s.resolved;
		expect(r.map((x) => x.start?.name)).toEqual(['HA', 'HA', 'HA']);
		expect(r.map((x) => x.end?.name)).toEqual(['HA', 'HA', 'HA']);
	});

	it('changing a day’s end moves the next day’s chained start', () => {
		const s = make([day('d1', ['a'], at(hotelA)), day('d2', ['b']), day('d3', ['c'])]);
		s.setEnd('d1', { kind: 'place', place: hotelB });
		expect(s.endsOf(s.days[1]).start?.name).toBe('HB');
		expect(s.endsOf(s.days[2]).start?.name).toBe('HB');
		expect(s.nextChainsFrom('d1')?.id).toBe('d2');
	});

	it('an explicit start on the next day breaks the chain', () => {
		const s = make([day('d1', ['a'], at(hotelA), { kind: 'place', place: hotelB }), day('d2', ['b'], at(airport))]);
		expect(s.nextChainsFrom('d1')).toBeNull();
		expect(s.transfers).toHaveLength(1); // hotel B → airport is a real transfer
	});

	it('gives each chosen place its own id, but keeps it when the same place is set again', () => {
		const s = make([day('d1', ['a'])]);
		s.setStart('d1', { kind: 'place', place: hotelA });
		const first = s.days[0].start.kind === 'place' ? s.days[0].start.place.id : '';
		expect(first).not.toBe('ha');
		s.setStart('d1', { kind: 'place', place: { ...hotelA, id: 'something-else' } });
		expect(s.days[0].start.kind === 'place' && s.days[0].start.place.id).toBe(first);
	});

	it('supports an open end, which leaves the next day without a start', () => {
		const s = make([day('d1', ['a'], at(hotelA)), day('d2', ['b'])]);
		s.setEnd('d1', { kind: 'open' });
		expect(s.endsOf(s.days[0]).end).toBeNull();
		expect(s.endsOf(s.days[1]).start).toBeNull();
	});

	it('the editor opens for a day and closes', () => {
		const s = make();
		s.openEndsEditor('d2', 'end');
		expect(s.endsEditor).toEqual({ dayId: 'd2', focus: 'end' });
		s.openEndsEditor('nope');
		expect(s.endsEditor?.dayId).toBe('d2');
		s.closeEndsEditor();
		expect(s.endsEditor).toBeNull();
	});

	it('only counts when the feature is on', () => {
		const s = make([day('d1', ['a'], at(stop('hotel', 3.1, 101.1)))]);
		expect(s.hasStart && s.hasEnd).toBe(true);
		s.setUseBase(false);
		expect(s.hasStart || s.hasEnd).toBe(false);
		expect(s.dayStats(s.days[0]).km).toBe(0);
	});
});

describe('totals and transfers (straight-line)', () => {
	const hotelA = stop('ha', 3.0, 101.0);
	const hotelB = stop('hb', 3.0, 102.0); // ≈ 111 km east

	it('adds the legs to and from the start and end', () => {
		const s = make([{ ...day('d1', [], at(hotelA)), stops: [stop('a', 3.0, 101.5)] }]);
		s.routeMode = 'straight';
		const km = s.dayStats(s.days[0]).km!;
		expect(km).toBeGreaterThan(100); // ≈ 55.6 there + 55.6 back
		expect(km).toBeLessThan(120);
		expect(s.dayStats(s.days[0]).approx).toBe(true);
	});

	it('a different end counts its own leg', () => {
		const s = make([{ ...day('d1', [], at(hotelA), { kind: 'place', place: hotelB }), stops: [stop('a', 3.0, 101.5)] }]);
		s.routeMode = 'straight';
		const km = s.dayStats(s.days[0]).km!;
		expect(km).toBeGreaterThan(100);
		expect(km).toBeLessThan(120); // 55.6 out + 55.6 on to hotel B
		expect(s.legAfter('a')?.km).toBeGreaterThan(50);
		expect(s.startLegIn(s.days[0])?.km).toBeGreaterThan(50);
	});

	it('an open end has no final leg', () => {
		const s = make([{ ...day('d1', [], at(hotelA), { kind: 'open' }), stops: [stop('a', 3.0, 101.5)] }]);
		s.routeMode = 'straight';
		expect(s.legAfter('a')).toBeNull();
		expect(s.dayStats(s.days[0]).km!).toBeLessThan(60);
	});

	it('an overnight transfer exists only when the end and the next start differ', () => {
		const s = make([
			{ ...day('d1', [], at(hotelA)), stops: [stop('a', 3.0, 101.2)] },
			{ ...day('d2', []), stops: [stop('b', 3.0, 101.3)] }, // chained: same hotel, no transfer
			{ ...day('d3', [], at(hotelB)), stops: [stop('c', 3.0, 101.9)] } // different hotel: transfer
		]);
		s.routeMode = 'straight';
		expect(s.transfers).toHaveLength(1);
		expect(s.transfers[0]).toMatchObject({ fromDayId: 'd2', toDayId: 'd3', approx: true });
		expect(s.transfers[0].km).toBeGreaterThan(100);
		expect(s.transferAfter('d2')).not.toBeNull();
		expect(s.transferAfter('d1')).toBeNull();
	});

	it('without start/end points, transfers run from the last stop to the next day’s first', () => {
		const s = make([day('d1', ['a']), { ...day('d2', []), stops: [stop('b', 4, 102)] }]);
		s.routeMode = 'straight';
		s.setUseBase(false);
		expect(s.transfers).toHaveLength(1);
		expect(s.transfers[0].from.id).toBe('a');
		expect(s.transfers[0].to.id).toBe('b');
	});

	it('empty days are skipped when pairing transfers', () => {
		const s = make([day('d1', ['a']), day('empty', []), { ...day('d3', []), stops: [stop('c', 5, 103)] }]);
		s.routeMode = 'straight';
		s.setUseBase(false);
		expect(s.transfers.map((t) => [t.fromDayId, t.toDayId])).toEqual([['d1', 'd3']]);
	});

	it('trip totals sum the days and the transfers', () => {
		const s = make([
			{ ...day('d1', [], at(hotelA)), stops: [stop('a', 3.0, 101.5)] },
			{ ...day('d2', [], at(hotelB)), stops: [stop('b', 3.0, 101.5)] }
		]);
		s.routeMode = 'straight';
		const total = s.tripTotals;
		const d1 = s.dayStats(s.days[0]).km!;
		const d2 = s.dayStats(s.days[1]).km!;
		const t = s.transfers.reduce((n, x) => n + x.km, 0);
		expect(total.km).toBeCloseTo(d1 + d2 + t, 6);
		expect(total.seconds).toBeNull(); // straight-line has no times
	});
});

describe('dates and notices', () => {
	it('keeps a start date and shows notices briefly', () => {
		vi.useFakeTimers();
		const s = make();
		s.setStartDate('2026-10-24');
		expect(s.startDate).toBe('2026-10-24');
		s.showNotice({ variant: 'ok', message: 'hi' });
		expect(s.notice?.message).toBe('hi');
		vi.advanceTimersByTime(7000);
		expect(s.notice).toBeNull();
		vi.useRealTimers();
	});

	it('clear resets to one empty day', () => {
		const s = make();
		s.setStartDate('2026-10-24');
		s.clear();
		expect(s.days).toHaveLength(1);
		expect(s.days[0].stops).toEqual([]);
		expect(s.startDate).toBeNull();
		expect(s.activeId).toBe(s.days[0].id);
	});
});
