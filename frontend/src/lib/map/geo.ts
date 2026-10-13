export type LngLat = [number, number];

const toRad = (d: number) => (d * Math.PI) / 180;

/** Convex hull (monotone chain) of lng/lat points. */
export function convexHull(points: LngLat[]): LngLat[] {
	const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (pts.length < 3) return pts;
	const cross = (o: LngLat, a: LngLat, b: LngLat) =>
		(a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: LngLat[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: LngLat[] = [];
	for (const p of [...pts].reverse()) {
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A ring of points around `center`, `radiusKm` away (small-distance approximation). */
function circle(center: LngLat, radiusKm: number, steps = 24): LngLat[] {
	const [lng, lat] = center;
	const dLat = radiusKm / 110.574;
	const dLng = radiusKm / (111.32 * Math.cos(toRad(lat)) || 1);
	return Array.from({ length: steps }, (_, i) => {
		const a = (i / steps) * Math.PI * 2;
		return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)] as LngLat;
	});
}

/**
 * Soft outline around a cluster: the convex hull of a circle around every stop,
 * so one stop gets a disc, two get a capsule, more get a rounded hull.
 * Returns a closed polygon ring.
 */
export function clusterOutline(points: LngLat[], paddingKm: number): LngLat[] {
	if (points.length === 0) return [];
	const ring = convexHull(points.flatMap((p) => circle(p, paddingKm)));
	return [...ring, ring[0]];
}

/** Padding that scales with how spread out the cluster is, never tiny. */
export function paddingFor(points: LngLat[]): number {
	let max = 0;
	for (let i = 0; i < points.length; i++)
		for (let j = i + 1; j < points.length; j++) {
			const dx = (points[i][0] - points[j][0]) * 111.32 * Math.cos(toRad(points[i][1]));
			const dy = (points[i][1] - points[j][1]) * 110.574;
			max = Math.max(max, Math.hypot(dx, dy));
		}
	return Math.max(2, Math.min(40, max * 0.12));
}

export function midpoint(a: LngLat, b: LngLat): LngLat {
	return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** The route vertex closest to `target`, used to place a leg chip on a road polyline. */
export function nearestOnLine(line: LngLat[], target: LngLat): LngLat {
	let best = line[0] ?? target;
	let bestD = Infinity;
	for (const p of line) {
		const d = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2;
		if (d < bestD) {
			bestD = d;
			best = p;
		}
	}
	return best;
}

/** A "nice" scale-bar length (km) for roughly `targetPx` pixels at this zoom/latitude. */
export function niceScale(zoom: number, latitude: number, targetPx = 80): { km: number; px: number } {
	const metersPerPx = (78271.516964 * Math.cos(toRad(latitude))) / 2 ** zoom;
	const rawKm = (metersPerPx * targetPx) / 1000;
	const pow = 10 ** Math.floor(Math.log10(rawKm));
	const f = rawKm / pow;
	const km = (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pow;
	return { km, px: (km * 1000) / metersPerPx };
}
