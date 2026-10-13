import type { GeocodeCandidate, Stop } from './types';

/** One decimal everywhere (design: "13.6 km", "237.7"); metres below 1 km. */
export function formatKm(km: number): string {
	if (km < 1) return `${Math.round(km * 1000)} m`;
	return `${formatKmValue(km)} km`;
}

/** The number part only, for stat tiles that render the unit separately. */
export function formatKmValue(km: number): string {
	return km.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatDuration(seconds: number): string {
	const min = seconds / 60;
	if (min < 60) return `${Math.max(1, Math.round(min))} min`;
	const h = Math.floor(min / 60);
	const m = Math.round(min % 60);
	return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function newId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** "Tour Eiffel, 5, Avenue Anatole France, ..." -> name "Tour Eiffel". */
export function stopFromCandidate(c: GeocodeCandidate): Stop {
	const name = c.display_name.split(',')[0]?.trim() || c.display_name;
	return { id: newId(), name, lat: c.lat, lng: c.lng, address: c.display_name };
}

/** Reorders `items` to follow `ids`; items missing from `ids` keep their relative order at the end. */
export function orderBy<T extends { id: string }>(items: T[], ids: string[]): T[] {
	const byId = new Map(items.map((i) => [i.id, i]));
	const ordered = ids.flatMap((id) => byId.get(id) ?? []);
	const seen = new Set(ids);
	return [...ordered, ...items.filter((i) => !seen.has(i.id))];
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
		return items;
	}
	const next = items.slice();
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}

/** Splits a duration into the big number and its small unit: 12720 s -> { main: '3 h 32', unit: 'min' }. */
export function durationParts(seconds: number): { main: string; unit: string } {
	const total = Math.max(1, Math.round(seconds / 60));
	const h = Math.floor(total / 60);
	const m = total % 60;
	return h === 0 ? { main: String(m), unit: 'min' } : { main: `${h} h ${String(m).padStart(2, '0')}`.replace(/ 00$/, ''), unit: m === 0 ? '' : 'min' };
}

/** "Gombak, Selangor" from a geocoder label: the two parts after the name, skipping numbers. */
export function placeSubtitle(address: string | undefined, name: string): string {
	if (!address) return '';
	const parts = address
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p && p !== name && !/^[\d\s-]+$/.test(p));
	return parts.slice(0, 2).join(', ');
}

const FALLBACK_REASONS: Record<string, string> = {
	router_unreachable: 'the routing service is unreachable',
	no_route: 'no road route exists between these stops',
	router_error: 'the routing service returned an error',
	router_bad_response: 'the routing service returned an unexpected response'
};

export function describeFallback(reason: string | null): string {
	return (reason && FALLBACK_REASONS[reason]) || 'road routing is unavailable';
}
