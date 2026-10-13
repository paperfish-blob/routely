import { describe, expect, it } from 'vitest';
import {
	buildClusters,
	clusterByStopId,
	clusterStyleAt,
	describeCluster,
	spanKm
} from './clusters';

const matrix = [
	[0, 10, 28, 90],
	[10, 0, 20, 85],
	[28, 20, 0, 70],
	[90, 85, 70, 0]
];
const ids = ['a', 'b', 'c', 'd'];

describe('clusterStyleAt', () => {
	it('cycles colour+shape together every four clusters, letters keep counting', () => {
		expect(clusterStyleAt(0)).toEqual({ letter: 'A', colorClass: 'cA', shapeClass: '' });
		expect(clusterStyleAt(1)).toEqual({ letter: 'B', colorClass: 'cB', shapeClass: 'shB' });
		expect(clusterStyleAt(2)).toEqual({ letter: 'C', colorClass: 'cC', shapeClass: 'shC' });
		expect(clusterStyleAt(3)).toEqual({ letter: 'D', colorClass: 'cD', shapeClass: 'shD' });
		expect(clusterStyleAt(4)).toEqual({ letter: 'E', colorClass: 'cA', shapeClass: '' });
	});
});

describe('spanKm / describeCluster', () => {
	it('uses the largest pairwise distance', () => {
		expect(spanKm(['a', 'b', 'c'], ids, matrix)).toBe(28);
		expect(spanKm(['a'], ids, matrix)).toBe(0);
	});
	it('describes groups and singletons', () => {
		const infos = buildClusters(
			[
				{ id: 0, stop_ids: ['a', 'b', 'c'] },
				{ id: 1, stop_ids: ['d'] }
			],
			ids,
			matrix
		);
		expect(infos.map(describeCluster)).toEqual(['3 stops within 28 km', '1 stop']);
		expect(infos.map((i) => i.style.letter)).toEqual(['A', 'B']);
	});
	it('never says "within 0 km"', () => {
		const infos = buildClusters([{ id: 0, stop_ids: ['a', 'b'] }], ['a', 'b'], [[0, 0.2], [0.2, 0]]);
		expect(describeCluster(infos[0])).toBe('2 stops within 1 km');
	});
});

describe('clusterByStopId', () => {
	it('maps every stop to its cluster', () => {
		const infos = buildClusters([{ id: 0, stop_ids: ['a', 'b'] }, { id: 1, stop_ids: ['c', 'd'] }], ids, matrix);
		const map = clusterByStopId(infos);
		expect(map.get('b')?.style.letter).toBe('A');
		expect(map.get('d')?.style.letter).toBe('B');
	});
});
