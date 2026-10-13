# Routely design system

Light mode only. **`Routely.html` is the visual source of truth** (open it in a browser: desktop, empty, suggest-order, states, components, mobile). This document explains how the frontend implements it and the rules every new UI must follow. A live version of every shared component is at **`/design`** in the running app (`npm run dev` → http://localhost:5173/design).

## The one rule

> Never write a raw colour, font size, font family or shadow outside `frontend/src/lib/styles/tokens.css`. Use a token.

`npm test` enforces this (`src/lib/styles/tokens.spec.ts`): it fails on hex/`rgb()`/`hsl()` colours, raw `font-size`, raw `font-family`, and any `var(--x)` that nothing defines. If you need something that has no token, add the token first, then use it.

## Where things live

```
frontend/static/fonts/PlusJakartaSans-latin.woff2     self-hosted font (400–800)
frontend/src/lib/styles/
  tokens.css       all raw values: colour, type scale, radius, spacing, sizes, shadows, z-index
  base.css         @font-face, reset, body type, focus ring, .num, .sr, .ico
  components.css   shared classes ported 1:1 from Routely.html (btn, seg, badge, stop, leg, field, banner, ...)
  layout.css       app shell + live-app additions (mobile layout, scrolling lists, map overlays)
frontend/src/lib/ui/          primitives, one per design layer name (see table)
frontend/src/lib/components/  feature components built from the primitives
frontend/src/lib/map/theme.ts MapLibre colours, read from the tokens at runtime
frontend/src/routes/design/   the living style guide
```

## Tokens

| Group | Tokens | Notes |
| --- | --- | --- |
| Surfaces | `--surface` `--surface-2` `--line` `--grab` | White cards on `--surface-2` backgrounds |
| Ink | `--ink` `--ink-2` `--ink-3` | Primary, secondary, tertiary text |
| Brand | `--primary` (+`-soft`, `--on-primary`) `--accent` (+`-soft`, `-line`, `-route`, `--on-accent`) | Teal = primary actions and the current route; amber = "suggest"/optimisation |
| Clusters | `--cA` … `--cD` (+`-fg`, `-soft`) | Four colours **each with a shape** (circle, rounded, hexagon, square). Never rely on colour alone |
| Status | `--danger` `--ok` (+`-soft`) `--focus` | Errors always pair colour with an icon and text |
| Type sizes | `--fs-nano` … `--fs-display` | 10 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15 / 17 / 18 / 19 / 20 / 21 / 22 / 26 / 28 px |
| Weights | `--fw-regular` … `--fw-extrabold` | 400–800; Plus Jakarta Sans only |
| Radius | `--r-xs` … `--r-3xl`, `--r-pill` | 4 / 6 / 8 / 9 / 10 / 12 / 16 / 20 / 999 |
| Spacing | `--sp-2` … `--sp-28` | The number is the px value |
| Sizes | `--h-btn` `--h-field` `--h-stop` `--h-leg` `--w-sidebar` `--w-panel` … | 44px buttons/touch targets, 64px stop row, 36px leg, 400px sidebar |
| Shadows | `--shadow` `--shadow-sm` `--shadow-side` `--shadow-sheet` `--shadow-marker` | |
| Layers | `--z-map` … `--z-toast` | |

Numbers (distances, durations, counts) always use `.num` (tabular figures). Distances show one decimal (`13.6 km`), durations read `1 h 24 min`.

## Components (design layer name → file)

| Design layer | File |
| --- | --- |
| Button (Primary / Secondary / Accent / Ghost, `sm`) | `ui/Button.svelte` |
| IconButton (always needs `label`) | `ui/IconButton.svelte` |
| ModeToggle (segmented; `lg` on mobile, `sm` inline) | `ui/SegmentedControl.svelte` |
| Badge (numbered, cluster colour + shape) | `ui/Badge.svelte` |
| ClusterTag / ClusterChip | `ui/ClusterTag.svelte`, `ui/ClusterChip.svelte` |
| LegConnector pill | `ui/Pill.svelte`, `components/LegConnector.svelte` |
| Banner (info / warn / err / ok) · Toast | `ui/Banner.svelte`, `ui/Toast.svelte` |
| Skeleton loaders | `ui/Skeleton.svelte` |
| SearchBox field (+ error / help) | `ui/Field.svelte`, `components/SearchBox.svelte` |
| Icons (24px stroke set) | `ui/Icon.svelte`, `ui/icons.ts` |
| Logo, ItineraryName | `components/Logo.svelte`, `components/ItineraryName.svelte` |
| StopRow, StopList | `components/StopRow.svelte`, `components/StopList.svelte` |
| SummaryCard, EmptyState | `components/SummaryCard.svelte`, `components/EmptyState.svelte` |
| MapToolbar, MapControls, Marker, MarkerPopup | `components/MapToolbar.svelte`, `MapControls.svelte`, `MapView.svelte` |
| SuggestOrderPanel, MapLegend | `components/SuggestOrderPanel.svelte`, `MapLegend.svelte` |
| BottomSheet (collapsed 112px / half 430px / full) | `components/BottomSheet.svelte` |

## Building new UI

1. **Look in `/design` first.** If a primitive exists, use it. Don't restyle it locally.
2. **Need a new variant or component?** Add its classes to `components.css` (global, named like the design layer, tokens only), wrap it in `src/lib/ui/`, and add it to `/design` with every state (default, hover, focus, disabled, error, loading as relevant).
3. **Need a new value?** Add a token to `tokens.css` first. Prefer an existing token over a new one.
4. **New icon?** Same style (24×24 viewBox, 1.8 stroke, round caps), add to `ui/icons.ts`.
5. **Map colours** can't use CSS variables: read them through `lib/map/theme.ts`.
6. Prefer `<style>` blocks only for layout glue that uses tokens; shared look belongs in `components.css`.

## Behavioural conventions (from the design)

- **States are never colour-only:** errors have an icon, border and text; selection has a border and fill; clusters have a shape and letter.
- **Loading keeps layout stable:** skeletons use the real row heights (stop 64, leg 36); shimmer stops under `prefers-reduced-motion`.
- **Focus** is a 3px `--focus` ring on every interactive element (`:focus-visible`).
- **Touch targets** are at least 44px on mobile.
- **Destructive actions are undoable** (toast with Undo) rather than confirmed.
- **Straight-line distances are labelled approximate** (`≈ 9.4 km`); when road routing fails the UI falls back to Straight line with a banner and Retry.

## Deliberate differences from `Routely.html`

- The artboard's "placeholder basemap" is replaced by OpenStreetMap tiles with the required attribution.
- Suggest-order copy says "shortest straight-line distance" (the optimiser is haversine-based), and a "Keep first stop as the start" checkbox is available in the panel.
- A cluster-distance selector (5 / 15 / 30 / 60 km) sits in the summary card; the design has none.
- The suggest panel becomes a bottom overlay on mobile (no artboard exists).
- There is no dark theme.
