import type { Itinerary } from '../types';

/**
 * All itinerary persistence goes through this interface. Methods are async so
 * a remote implementation (see SupabaseStore.ts) drops in without changing callers.
 */
export interface ItineraryStore {
	/** Resolves to null when nothing has been saved (or saved data is unusable). */
	load(): Promise<Itinerary | null>;
	save(itinerary: Itinerary): Promise<void>;
	clear(): Promise<void>;
}
