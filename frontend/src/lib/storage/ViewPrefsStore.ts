/** Per-browser view settings. They belong to the screen, not the trip, so they are not part of the itinerary. */
export interface ViewPrefs {
	sidebarWidth?: number;
	sidebarCollapsed?: boolean;
	/** The day/trip summary card is folded to one row. */
	summaryCollapsed?: boolean;
}

export interface ViewPrefsStore {
	load(): ViewPrefs;
	save(prefs: ViewPrefs): void;
}

export const VIEW_PREFS_KEY = 'routely:view';

/** Defensive parse: anything unusable is dropped. */
export function parseViewPrefs(raw: string | null): ViewPrefs {
	if (!raw) return {};
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		const prefs: ViewPrefs = {};
		const w = data.sidebarWidth;
		if (typeof w === 'number' && Number.isFinite(w) && w > 0 && w < 5000) prefs.sidebarWidth = w;
		if (typeof data.sidebarCollapsed === 'boolean') prefs.sidebarCollapsed = data.sidebarCollapsed;
		if (typeof data.summaryCollapsed === 'boolean') prefs.summaryCollapsed = data.summaryCollapsed;
		return prefs;
	} catch {
		return {};
	}
}

export class LocalViewPrefsStore implements ViewPrefsStore {
	constructor(
		private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
		private readonly key: string = VIEW_PREFS_KEY
	) {}

	load(): ViewPrefs {
		try {
			return parseViewPrefs(this.storage.getItem(this.key));
		} catch {
			return {};
		}
	}

	save(prefs: ViewPrefs): void {
		try {
			this.storage.setItem(this.key, JSON.stringify(prefs));
		} catch {
			// storage full or disabled: the setting just won't persist
		}
	}
}
