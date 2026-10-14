import {
	clampSidebar,
	maxSidebarFor,
	SIDEBAR_COLLAPSE_BELOW,
	SIDEBAR_DEFAULT,
	SIDEBAR_MIN,
	SIDEBAR_RAIL,
	SIDEBAR_STEP,
	SIDEBAR_STEP_BIG
} from '../sidebar';
import type { ViewPrefsStore } from '../storage/ViewPrefsStore';

/** Desktop sidebar width: resizable, collapsible to a rail, remembered per browser. */
export class SidebarState {
	/** The width you chose (kept while collapsed, so expanding restores it). */
	width = $state(SIDEBAR_DEFAULT);
	collapsed = $state(false);
	/** The summary card at the bottom of the sidebar is folded to one row. */
	summaryCollapsed = $state(false);
	windowWidth = $state(1280);
	/** While dragging: the raw (unclamped) width under the pointer. */
	dragRaw = $state<number | null>(null);

	constructor(private readonly prefs: ViewPrefsStore) {}

	load(): void {
		const saved = this.prefs.load();
		if (saved.sidebarWidth) this.width = saved.sidebarWidth;
		if (saved.sidebarCollapsed) this.collapsed = true;
		if (saved.summaryCollapsed) this.summaryCollapsed = true;
	}

	max = $derived(maxSidebarFor(this.windowWidth));
	dragging = $derived(this.dragRaw !== null);
	/** Releasing now would collapse the sidebar. */
	willCollapse = $derived(this.dragRaw !== null && this.dragRaw < SIDEBAR_COLLAPSE_BELOW);
	/** The width on screen right now. */
	effective = $derived(
		this.dragRaw !== null
			? clampSidebar(this.dragRaw, this.windowWidth)
			: this.collapsed
				? SIDEBAR_RAIL
				: clampSidebar(this.width, this.windowWidth)
	);

	private save(): void {
		this.prefs.save({ sidebarWidth: this.width, sidebarCollapsed: this.collapsed, summaryCollapsed: this.summaryCollapsed });
	}

	startDrag(): void {
		this.dragRaw = this.effective;
	}

	drag(raw: number): void {
		if (this.dragRaw !== null) this.dragRaw = raw;
	}

	/** Ends a drag: collapses when dragged past the minimum, otherwise keeps the width. */
	endDrag(): void {
		if (this.dragRaw === null) return;
		if (this.willCollapse) this.collapsed = true;
		else {
			this.width = clampSidebar(this.dragRaw, this.windowWidth);
			this.collapsed = false;
		}
		this.dragRaw = null;
		this.save();
	}

	setWidth(width: number): void {
		this.width = clampSidebar(width, this.windowWidth);
		this.collapsed = false;
		this.save();
	}

	/** Keyboard resize: delta in steps of 16 (64 with Shift). */
	nudge(direction: -1 | 1, big = false): void {
		this.setWidth(this.effective + direction * (big ? SIDEBAR_STEP_BIG : SIDEBAR_STEP));
	}

	toMin(): void {
		this.setWidth(SIDEBAR_MIN);
	}

	toMax(): void {
		this.setWidth(this.max);
	}

	reset(): void {
		this.setWidth(SIDEBAR_DEFAULT);
	}

	collapse(): void {
		this.collapsed = true;
		this.save();
	}

	expand(): void {
		this.collapsed = false;
		this.save();
	}

	toggleSummary(): void {
		this.summaryCollapsed = !this.summaryCollapsed;
		this.save();
	}

	toggle(): void {
		if (this.collapsed) this.expand();
		else this.collapse();
	}
}
