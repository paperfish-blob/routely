import { describe, expect, it } from 'vitest';
import { formatDuration, formatKm, moveItem, orderBy, stopFromCandidate } from './format';

describe('formatKm', () => {
	it('uses metres below 1 km', () => expect(formatKm(0.456)).toBe('456 m'));
	it('uses one decimal below 100 km', () => expect(formatKm(12.345)).toBe('12.3 km'));
	it('rounds and groups above 100 km', () => expect(formatKm(1234.6)).toBe('1,235 km'));
});

describe('formatDuration', () => {
	it('formats minutes', () => expect(formatDuration(42.4 * 60)).toBe('42 min'));
	it('formats hours', () => expect(formatDuration(120 * 60)).toBe('2 h'));
	it('formats hours and minutes', () => expect(formatDuration(135 * 60)).toBe('2 h 15 min'));
});

describe('moveItem', () => {
	it('moves forward and backward', () => {
		expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
		expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
	});
	it('ignores out-of-range moves', () => {
		const items = ['a', 'b'];
		expect(moveItem(items, 0, 5)).toBe(items);
		expect(moveItem(items, -1, 0)).toBe(items);
	});
});

describe('orderBy', () => {
	const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
	it('follows the given id order', () => {
		expect(orderBy(items, ['c', 'a', 'b']).map((i) => i.id)).toEqual(['c', 'a', 'b']);
	});
	it('drops unknown ids and keeps items missing from the order', () => {
		expect(orderBy(items, ['c', 'zzz']).map((i) => i.id)).toEqual(['c', 'a', 'b']);
	});
});

describe('stopFromCandidate', () => {
	it('uses the first label segment as the name and keeps the full address', () => {
		const stop = stopFromCandidate({ display_name: 'Tour Eiffel, 5, Paris, France', lat: 1, lng: 2 });
		expect(stop.name).toBe('Tour Eiffel');
		expect(stop.address).toBe('Tour Eiffel, 5, Paris, France');
		expect(stop).toMatchObject({ lat: 1, lng: 2 });
		expect(stop.id).toBeTruthy();
	});
});
