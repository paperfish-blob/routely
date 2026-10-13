import type { Cluster } from './types.ts';

/** Design: four colour+shape pairs. Shape is never optional, so identity never relies on colour alone. */
export const COLOR_CLASSES = ['cA', 'cB', 'cC', 'cD'] as const;
export const SHAPE_CLASSES = ['', 'shB', 'shC', 'shD'] as const;

export interface ClusterStyle {
	letter: string;
	colorClass: (typeof COLOR_CLASSES)[number];
	shapeClass: (typeof SHAPE_CLASSES)[number];
}

export interface ClusterInfo {
	id: number;
	style: ClusterStyle;
	stopIds: string[];
	/** Largest straight-line distance between any two stops in the cluster (km). */
	spanKm: number;
}

/** Cluster 0 -> A (blue circle), 1 -> B (magenta rounded), 2 -> C (amber hexagon), 3 -> D (green square), 4 -> E (blue circle) ... */
export function clusterStyleAt(index: number): ClusterStyle {
	return {
		letter: String.fromCharCode(65 + (index % 26)),
		colorClass: COLOR_CLASSES[index % COLOR_CLASSES.length],
		shapeClass: SHAPE_CLASSES[index % SHAPE_CLASSES.length]
	};
}

export function spanKm(ids: string[], stopIds: string[], matrix: number[][]): number {
	const idx = ids.map((id) => stopIds.indexOf(id)).filter((i) => i >= 0);
	let max = 0;
	for (let a = 0; a < idx.length; a++)
		for (let b = a + 1; b < idx.length; b++) max = Math.max(max, matrix[idx[a]]?.[idx[b]] ?? 0);
	return max;
}

/** Clusters arrive ordered by their earliest stop; letters follow that order. */
export function buildClusters(
	clusters: Cluster[],
	stopIds: string[],
	matrix: number[][]
): ClusterInfo[] {
	return clusters.map((c, i) => ({
		id: c.id,
		style: clusterStyleAt(i),
		stopIds: c.stop_ids,
		spanKm: spanKm(c.stop_ids, stopIds, matrix)
	}));
}

export function clusterByStopId(infos: ClusterInfo[]): Map<string, ClusterInfo> {
	const map = new Map<string, ClusterInfo>();
	for (const info of infos) for (const id of info.stopIds) map.set(id, info);
	return map;
}

/** "3 stops within 28 km", or "1 stop" for a singleton. */
export function describeCluster(info: ClusterInfo): string {
	const n = info.stopIds.length;
	if (n === 1) return '1 stop';
	return `${n} stops within ${Math.max(1, Math.round(info.spanKm))} km`;
}
