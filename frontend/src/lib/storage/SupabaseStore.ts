import type { Itinerary } from '../types';
import type { ItineraryStore } from './ItineraryStore';

/**
 * ============================ FUTURE: SUPABASE ============================
 * STUB, not wired up and intentionally not functional. When Auth + Postgres
 * are added:
 *
 *   1. `npm i @supabase/supabase-js`, create a client from env vars.
 *   2. Implement load/save/clear against an `itineraries` table keyed by
 *      `auth.uid()` (row: { user_id, data jsonb, updated_at }), protected by RLS.
 *   3. In `./index.ts`, change `createStore()` to return `new SupabaseStore(...)`
 *      (optionally migrating existing localStorage data on first sign-in).
 *
 * Nothing else in the app needs to change: components talk to ItineraryStore.
 * ========================================================================
 */
export class SupabaseStore implements ItineraryStore {
	async load(): Promise<Itinerary | null> {
		throw new Error('SupabaseStore is not implemented yet');
	}
	async save(_itinerary: Itinerary): Promise<void> {
		throw new Error('SupabaseStore is not implemented yet');
	}
	async clear(): Promise<void> {
		throw new Error('SupabaseStore is not implemented yet');
	}
}
