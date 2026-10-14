/** Sidebar width rules (desktop). Below the mobile breakpoint the sidebar is the bottom sheet and never resizes. */
export const SIDEBAR_MIN = 320;
export const SIDEBAR_DEFAULT = 400;
export const SIDEBAR_MAX = 640;
/** Width of the collapsed rail. */
export const SIDEBAR_RAIL = 56;
/** Dragging narrower than this (released) collapses the sidebar to the rail. */
export const SIDEBAR_COLLAPSE_BELOW = 260;
export const SIDEBAR_STEP = 16;
export const SIDEBAR_STEP_BIG = 64;

/** Widest allowed: 640, but never more than half the window so the map keeps room. */
export function maxSidebarFor(windowWidth: number): number {
	return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(windowWidth / 2)));
}

export function clampSidebar(width: number, windowWidth: number): number {
	return Math.round(Math.min(maxSidebarFor(windowWidth), Math.max(SIDEBAR_MIN, width)));
}
