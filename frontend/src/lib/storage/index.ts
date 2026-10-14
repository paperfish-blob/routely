import type { ItineraryStore } from './ItineraryStore';
import { LocalStorageStore } from './LocalStorageStore';
import { LocalViewPrefsStore, type ViewPrefsStore } from './ViewPrefsStore';

export type { ItineraryStore } from './ItineraryStore';
export type { ViewPrefsStore } from './ViewPrefsStore';

/** The single place that decides which storage backend the app uses. */
export function createStore(): ItineraryStore {
	return new LocalStorageStore();
}

/** Per-browser view settings (sidebar width, ...), kept apart from the trip. */
export function createViewPrefs(): ViewPrefsStore {
	return new LocalViewPrefsStore();
}
