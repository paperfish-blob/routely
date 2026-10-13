import type { ItineraryStore } from './ItineraryStore';
import { LocalStorageStore } from './LocalStorageStore';

export type { ItineraryStore } from './ItineraryStore';

/** The single place that decides which storage backend the app uses. */
export function createStore(): ItineraryStore {
	return new LocalStorageStore();
}
