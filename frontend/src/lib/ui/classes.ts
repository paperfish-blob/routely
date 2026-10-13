import type { ClusterStyle } from '../clusters.ts';

/** Class string for a numbered badge, shared by Svelte components and DOM-built map markers. */
export function badgeClass(style: ClusterStyle, small = false): string {
	return ['badge', style.colorClass, style.shapeClass, small ? 'sm' : ''].filter(Boolean).join(' ');
}
