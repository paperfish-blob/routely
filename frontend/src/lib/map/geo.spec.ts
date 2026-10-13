import { describe, expect, it } from 'vitest';
import { clusterOutline, convexHull, midpoint, nearestOnLine, niceScale, paddingFor } from './geo';

describe('convexHull', () => {
	it('drops interior points', () => {
		const hull = convexHull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2]]);
		expect(hull).toHaveLength(4);
		expect(hull).not.toContainEqual([2, 2]);
	});
	it('returns inputs unchanged for fewer than three points', () => {
		expect(convexHull([[1, 1], [0, 0]])).toEqual([[0, 0], [1, 1]]);
	});
});

describe('clusterOutline', () => {
	it('is a closed ring for one, two and many stops', () => {
		for (const pts of [[[100, 3]], [[100, 3], [101, 3.2]], [[100, 3], [101, 3.2], [100.5, 4]]] as [number, number][][]) {
			const ring = clusterOutline(pts, 5);
			expect(ring.length).toBeGreaterThan(3);
			expect(ring[0]).toEqual(ring[ring.length - 1]);
		}
	});
	it('is empty for no stops', () => expect(clusterOutline([], 5)).toEqual([]));
});

describe('helpers', () => {
	it('padding is bounded', () => {
		expect(paddingFor([[100, 3]])).toBe(2);
		expect(paddingFor([[0, 0], [60, 60]])).toBe(40);
	});
	it('midpoint and nearestOnLine', () => {
		expect(midpoint([0, 0], [2, 4])).toEqual([1, 2]);
		expect(nearestOnLine([[0, 0], [10, 10]], [9, 9])).toEqual([10, 10]);
	});
	it('niceScale picks 1/2/5 x 10^n km', () => {
		const { km, px } = niceScale(8, 3);
		expect([1, 2, 5].includes(km / 10 ** Math.floor(Math.log10(km)))).toBe(true);
		expect(px).toBeGreaterThan(30);
		expect(px).toBeLessThan(200);
	});
});
