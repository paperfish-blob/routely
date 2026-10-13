/**
 * MapLibre paint properties cannot use CSS variables, so read the design tokens at runtime.
 * This keeps every map colour sourced from tokens.css.
 */
function token(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface MapTheme {
	casing: string;
	primary: string;
	accentRoute: string;
	routeDash: string;
	clusters: Record<'cA' | 'cB' | 'cC' | 'cD', string>;
	/** Route colour per day identity (day1, day2, day3). */
	days: [string, string, string];
	grab: string;
}

export function readMapTheme(): MapTheme {
	return {
		casing: token('--casing'),
		primary: token('--primary'),
		accentRoute: token('--accent-route'),
		routeDash: token('--route-dash'),
		clusters: { cA: token('--cA'), cB: token('--cB'), cC: token('--cC'), cD: token('--cD') },
		days: [token('--day1'), token('--day2-route'), token('--day3')],
		grab: token('--grab')
	};
}
