# Routely: instructions for AI assistants and contributors

## Frontend UI work: read `DESIGN.md` first

- `Routely.html` is the visual source of truth; `DESIGN.md` explains how it is implemented. The live component reference is the `/design` route.
- **Never hardcode colours, font sizes, font families or shadows.** Use tokens from `frontend/src/lib/styles/tokens.css`. `npm test` fails if you do.
- Reuse the primitives in `frontend/src/lib/ui/` and the shared classes in `components.css`. If something is missing, add it there (and to `/design`), don't restyle locally.
- New UI must include its loading, error and empty states in the same style as the existing ones.

## Architecture rules

- The backend is stateless (stops travel in each request). All frontend persistence goes through `ItineraryStore`; don't call `localStorage` directly from components.
- Backend services sit behind abstract interfaces; wire new providers in `backend/src/routely/main.py`.

## Commands

- Backend: `cd backend && uv run pytest`; run with `uv run uvicorn routely.main:app --reload --port 8001`
- Frontend: `cd frontend && npm test && npm run check`; run with `npm run dev`
