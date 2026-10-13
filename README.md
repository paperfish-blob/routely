# Routely

Enter several places, see them on a map as an ordered itinerary, and view the distance and proximity between them. Reorder by drag-and-drop, switch between straight-line and real driving/walking routes, and let Routely suggest a shorter visiting order.

- **No database, no Docker, no auth.** Everything runs locally with plain commands.
- **The backend is stateless.** Every request carries the stops it needs; nothing is stored server-side.
- **The frontend owns the itinerary** and persists it in `localStorage` (key prefix `routely:`).
- **Supabase-ready.** All persistence goes through one `ItineraryStore` interface, so Postgres/Auth can be added by swapping one implementation (see [Adding Supabase later](#adding-supabase-later)).

## Design

The UI follows `Routely.html` (light mode). The design system, token rules and component catalogue are documented in [`DESIGN.md`](DESIGN.md); the running app has a live style guide at `/design`. `npm test` fails if UI code hardcodes colours or type sizes instead of using the design tokens.

## Layout

```
backend/    FastAPI service (Python 3.12, uv)
frontend/   SvelteKit + TypeScript + MapLibre GL JS
```

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (it will fetch Python 3.12 for you)
- Node.js 22.17+ (required by SvelteKit 3) and npm

## Run it locally

Two terminals.

**1. Backend** (http://localhost:8001)

```bash
cd backend
cp .env.example .env        # then set your contact email in ROUTELY_NOMINATIM_USER_AGENT
uv sync
uv run uvicorn routely.main:app --reload --port 8001
```

**2. Frontend** (http://localhost:5173)

```bash
cd frontend
cp .env.example .env        # VITE_API_URL, defaults to http://localhost:8001
npm install
npm run dev
```

Open http://localhost:5173.

> Port 8001 is used because 8000 is commonly taken. If you change it, update `VITE_API_URL` in `frontend/.env`.
> To open the app from another device on your network, add that origin to `ROUTELY_CORS_ORIGINS` and run `npm run dev -- --host`.

## Tests

```bash
cd backend && uv run pytest        # unit + API tests (external providers mocked)
cd frontend && npm test            # unit tests (including the design-token guard)
cd frontend && npm run check       # svelte-check / TypeScript
```

## Configuration (backend)

Environment variables, all prefixed `ROUTELY_`; see [`backend/.env.example`](backend/.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOMINATIM_USER_AGENT` | `Routely/0.1 (set contact email in .env)` | Sent to Nominatim. **Set a real contact address**, as required by their usage policy. |
| `NOMINATIM_BASE_URL` | `https://nominatim.openstreetmap.org` | Geocoder |
| `GEOCODE_MIN_INTERVAL_S` | `1.0` | Minimum gap between upstream geocode calls (1 req/s) |
| `GEOCODE_CACHE_TTL_S` / `GEOCODE_CACHE_MAX_ENTRIES` | `86400` / `1000` | In-memory TTL/LRU cache |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | Driving routes |
| `OSRM_WALKING_BASE_URL` | `https://routing.openstreetmap.de/routed-foot` | Walking routes (see note below) |
| `OSRM_TIMEOUT_S` | `8.0` | Router timeout before falling back to straight lines |
| `CLUSTER_THRESHOLD_KM` | `5.0` | Default proximity-group threshold |
| `CORS_ORIGINS` | `["http://localhost:5173","http://127.0.0.1:5173"]` | JSON list of allowed origins |

**Why two OSRM URLs?** The public demo server (`router.project-osrm.org`) only serves the car profile and silently ignores the profile in the URL, so a "walking" request would return driving results. Walking therefore defaults to the FOSSGIS foot-profile instance. Point both at your own OSRM if you run one.

## API

All endpoints are stateless. Stops are `{id, name, lat, lng}`; `lat` ∈ [-90, 90], `lng` ∈ [-180, 180], ids unique, 2–25 stops. Errors are always `{"error": {"code", "message", "details?"}}` (`422 validation_error`, `429 rate_limited` when the geocoder throttles, `502 upstream_error`, ...). Interactive docs at http://localhost:8001/docs.

| Endpoint | Body / query | Returns |
| --- | --- | --- |
| `GET /health` | | `{status, version}` |
| `GET /geocode?q=` | `q` (1–200 chars), optional `near_lat` + `near_lng` (location hint) | up to 5 `{display_name, lat, lng}`; with a hint, matches within 150 km come first (closest first) |
| `POST /distances` | `stops`, optional `cluster_threshold_km` | `matrix_km`, per-leg `legs`, `total_km`, `nearest` neighbour per stop, `clusters` (single-linkage; singletons included) |
| `POST /route` | `stops`, `mode`: `driving` \| `walking` | GeoJSON `geometry`, `distance_km`, `duration_s`, `legs`, `fallback`, `fallback_reason` |
| `POST /optimize` | `stops`, optional `start_id` | suggested `order` of ids, `original_total_km`, `new_total_km`, `km_saved` |

```bash
curl -s localhost:8001/geocode?q=Eiffel+Tower
curl -s -X POST localhost:8001/distances -H 'content-type: application/json' \
  -d '{"stops":[{"id":"a","name":"Paris","lat":48.85,"lng":2.35},{"id":"b","name":"London","lat":51.5,"lng":-0.12}]}'
```

Behaviour worth knowing:

- **Search is biased toward your trip.** The app sends the last stop's location as `near_lat`/`near_lng`, so "Union Square" while planning San Francisco finds San Francisco's first. The backend asks Nominatim for a wider candidate set around the hint (a soft `viewbox`, not a hard filter) and re-ranks by distance; results are cached per 1° area.

- **Fallback:** if OSRM is unreachable, errors, or finds no route, `/route` returns straight lines with `fallback: true` (and a `fallback_reason`). Durations in that case are rough estimates (50 km/h driving, 5 km/h walking). The UI flags this.
- **Optimizer:** nearest-neighbour construction followed by 2-opt, over the open path (no return to the start). Without `start_id` every stop is tried as the start. It never returns an order worse than the current one, unless `start_id` forces a different first stop.
- **Distances** are great-circle (haversine) kilometres; road distances come from `/route`.

## Architecture notes

Backend (`backend/src/routely`): each capability is an abstract interface with one implementation, wired in `main.py` and injected through FastAPI dependencies (overridden in tests).

| Interface | Implementation |
| --- | --- |
| `GeocodingService` | `NominatimGeocoder` (User-Agent, 1 req/s `RateLimiter`, `GeocodeCache`) |
| `GeocodeCache` | `InMemoryGeocodeCache` (TTL + LRU) |
| `DistanceService` | `HaversineDistanceService` |
| `RoutingService` | `OsrmRoutingService` with `HaversineRoutingService` fallback |
| `ProximityService` | `SingleLinkageProximityService` |
| `OptimizerService` | `NearestNeighbourTwoOptOptimizer` |

Frontend (`frontend/src/lib`): `state/itinerary.svelte.ts` holds all state and receives the store and API client by injection; components are presentational.

## Adding Supabase later

1. Implement `ItineraryStore` (`load` / `save` / `clear`) in `frontend/src/lib/storage/SupabaseStore.ts`, which is already stubbed with notes.
2. Return it from `createStore()` in `frontend/src/lib/storage/index.ts`, the only place that picks a backend.
3. Optionally implement `GeocodeCache` against Postgres and pass it to `create_app(geocode_cache=...)` in the backend.

No component or endpoint changes are needed.

## Data providers and fair use

- Geocoding: [Nominatim](https://operations.osmfoundation.org/policies/nominatim/): max 1 request/second, identify yourself via the User-Agent.
- Routing: public OSRM servers, not for heavy use.
- Map tiles: [OpenStreetMap tile servers](https://operations.osmfoundation.org/policies/tiles/), fine for development and light use. Use a tile provider for production traffic.
