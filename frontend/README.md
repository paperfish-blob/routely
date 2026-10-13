# Routely frontend

SvelteKit + TypeScript + MapLibre GL JS. See the [top-level README](../README.md) for setup.

- `src/lib/storage/`: `ItineraryStore` interface, `LocalStorageStore`, and the `SupabaseStore` stub.
- `src/lib/state/itinerary.svelte.ts`: all itinerary state; talks to storage and the API only via injected deps.
- `src/lib/api.ts`: typed client for the backend.
