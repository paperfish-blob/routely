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
| Days | `--day1` `--day2` `--day3` (+`-soft`, `--day2-route`) | Identity of Day 1/2/3, cycling every three. Always paired with a `D1` tag/number, never colour alone. Shown only where clusters are not (all-days view, day tags) |
| Status | `--danger` `--ok` (+`-soft`) `--focus` | Errors always pair colour with an icon and text |
| Type sizes | `--fs-nano` … `--fs-display` | 10 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15 / 17 / 18 / 19 / 20 / 21 / 22 / 26 / 28 px |
| Weights | `--fw-regular` … `--fw-extrabold` | 400–800; Plus Jakarta Sans only |
| Radius | `--r-xs` … `--r-3xl`, `--r-pill` | 4 / 6 / 8 / 9 / 10 / 12 / 16 / 20 / 999 |
| Spacing | `--sp-2` … `--sp-28` | The number is the px value |
| Sizes | `--h-btn` `--h-field` `--h-stop` `--h-leg` `--h-day-tab` `--h-srow` `--h-base-row` `--w-sidebar` `--w-panel` `--w-menu` `--w-dialog` … | 44px buttons/touch targets, 64px stop row, 36px leg, 56px day tab, 400px sidebar |
| Shadows | `--shadow` `--shadow-sm` `--shadow-side` `--shadow-sheet` `--shadow-marker` | |
| Layers | `--z-map` … `--z-menu` `--z-dialog` `--z-toast` | |

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
| Menu / MenuItem / MenuHeading (anchored popover; radio, checkbox-switch and danger items) | `ui/Menu.svelte`, `ui/MenuItem.svelte`, `ui/MenuHeading.svelte` |
| Dialog (scrim, focus trap, Esc) and option rows (`.opt`) | `ui/Dialog.svelte` |
| DayTabs (desktop) · DayChips (mobile) | `components/DayTabs.svelte`, `components/DayChips.svelte` |
| DayHeader (title + day menu) | `components/DayHeader.svelte` |
| AllDaysView (day sections, overnight connectors, trip totals) | `components/AllDaysView.svelte` |
| EndpointRow (a day's START / END, with its menu) | `components/EndpointRow.svelte` |
| StartEndCard (editor: where a day starts and ends) · RouteEndsRow (mobile) | `components/StartEndCard.svelte`, `components/RouteEndsRow.svelte` |
| AddDayDialog · TripDatesDialog · TripOptions | `components/AddDayDialog.svelte`, `TripDatesDialog.svelte`, `TripOptions.svelte` |
| WeatherCard (a day's weather at its start and end, or by area) · WeatherAreaList · WeatherDetail · WeatherSource · WeatherIcon · DayGlance (tab/chip temperatures) | `components/WeatherCard.svelte`, `WeatherAreaList.svelte`, `WeatherDetail.svelte`, `WeatherSource.svelte`, `ui/WeatherIcon.svelte`, `components/DayGlance.svelte` |
| SidebarResizer (drag handle, live width, limits ruler) · SidebarRail (collapsed) | `components/SidebarResizer.svelte`, `components/SidebarRail.svelte`, `state/sidebar.svelte.ts` |
| "Adding to Day N" chip | `components/SearchBox.svelte` (`target` prop) |

## Building new UI

1. **Look in `/design` first.** If a primitive exists, use it. Don't restyle it locally.
2. **Need a new variant or component?** Add its classes to `components.css` (global, named like the design layer, tokens only), wrap it in `src/lib/ui/`, and add it to `/design` with every state (default, hover, focus, disabled, error, loading as relevant).
3. **Need a new value?** Add a token to `tokens.css` first. Prefer an existing token over a new one.
4. **New icon?** Same style (24×24 viewBox, 1.8 stroke, round caps), add to `ui/icons.ts`.
5. **Map colours** can't use CSS variables: read them through `lib/map/theme.ts`.
6. Prefer `<style>` blocks only for layout glue that uses tokens; shared look belongs in `components.css`.

## Days

A trip is a list of days (`Itinerary.days`). The UI always shows **one day at a time** (tabs/chips) or **all days** (overview). Rules to keep when extending it:

- **Where a new stop goes is always visible.** With more than one day, the search field shows an "Adding to Day N" chip; adding to another day switches the view to it.
- **Other days stay visible but quiet** (dimmed markers and dashed grey routes, with `D2` tags) so you can plan around them. The all-days view colours each day (`--day1…3`) and hides cluster letters.
- **Every day has a start and an end** (when "Fixed start and end points" is on, the default). They are not stops: they are never in the reorderable list, and the optimiser pins them.
  - **Start** is one of: where the previous day ended (the default, a *chain*), a chosen place, or none.
  - **End** is one of: back at the start (the default, a round trip), a chosen place, or open (no fixed end, finish at the last stop).
  - Labels say what is true: a round trip is one **START & END** row plus **BACK AT** at the bottom; different places are **START** and **END**; the flag icon marks an end, a plane marks an airport.
  - The first day's start and the last day's end are set like any other (an airport, say); there are no special cases in the model.
  - Changing a day's end moves the next day's chained start, and the end row says "Day N starts here".
  - On mobile start and end collapse into one tappable route row (`START → END`) that opens the same editor as a dialog.
- **Overnight transfers** (dashed pill, dotted map line) connect the end of one day to the start of the next, and only when those are different places (a chained start never needs one: the all-days view shows a link chip instead).
- **Dates are optional.** One trip start date; each day's date is derived from its position. Without dates, tabs show the stop count.
- **Every destructive day/stop action is undoable** (toast with Undo): delete day, clear stops, remove/move/copy a stop.
- **Optimising is per day** and pins the start first and the end last.

## Collapsible summary

The day summary (and the all-days trip totals) can be folded to a ~64 px row with the **drawer icon** button (`drawer-open` when expanded, `drawer` when folded). Rules to keep:

- **Folded shows the essentials:** distance · time · stops, plus the first five cluster tags, "+n" and "N clusters". Everything else (cluster-size control, chips, "Day runs", "Whole trip") is only in the expanded card.
- **The whole folded row is the button** (`aria-expanded`, Enter/Space). Stop tags, map outlines and weather by area are unaffected by it.
- **The choice is a per-browser view setting** (`summaryCollapsed` in `ViewPrefsStore`), shared by the day summary and the all-days totals. New visitors start expanded.
- Loading and error states keep their own card; only the numbers card folds.

## Resizable sidebar

On desktop the sidebar is **320–640 px wide** (default 400, never more than half the window) and can be dragged by the handle on its right edge. Rules to keep:

- **The handle is a real control:** `role="separator"` with the width announced. Arrow keys resize by 16 px (64 with Shift), Home/End jump to min/max, Enter or double-click resets to 400.
- **Never size things in the sidebar with fixed pixel widths.** Content must reflow between 320 and 640 (chips wrap or stay on one line, tabs scroll); fixed-height rows keep their height.
- **Layout reads `--w-sidebar`**, set on `.app` from `SidebarState`. Anything positioned next to the sidebar (map, toasts) uses that variable, never a literal 400.
- **Dragging past the minimum** (released under 260 px) collapses it to a 56 px rail (logo, day tags, expand button); `[` toggles it. Expanding restores the previous width.
- **The width is a per-browser view setting** (`routely:view` via `ViewPrefsStore`), not part of the trip. The map canvas follows via a `ResizeObserver`.
- Below 768 px there is no sidebar to resize: the bottom sheet takes over.

## Weather

Weather appears once the trip has dates (Open-Meteo, via the backend's `GET /weather`; only coordinates and a date are sent). Rules to keep when extending it:

- **Start and end are read separately.** A day shows one reading when its start and end are within 30 km (or it has one stop), otherwise a **START** and an **END** reading, each collapsible. Without a fixed start/end, the first and last stop stand in.
- **By area.** When a day's clusters form two or more areas, the card offers **Start & end | By area** (by area is the default). Clusters whose centres are within 30 km share one row (single linkage), and a start/end within 30 km of an area folds into it ("also END"); a farther one keeps its own row. Weather is looked up per area, never per cluster, so changing the cluster size regroups rows without adding requests. A row is tagged with its cluster letters, opens to the hourly strip, tints its stops in the list and outlines them on the map, and a selected stop opens its area. An area that is 5° or more away from the others, or whose rain chance differs by 30 points or more, gets a `10° COOLER` / `+55% RAIN` chip. Each area loads independently: one failing shows "Weather unavailable · Retry" and never hides the rest. On mobile the rows become swipeable cards.
- **Every reading says where it comes from:** `FORECAST` (today to 15 days ahead, with an hourly strip and a rain advisory banner), `TYPICAL` (further ahead: an average of the same date in recent years, with a "not a forecast" notice) or `RECORDED` (past days: no rain *chance*, just what fell). Never show a typical value as if it were a forecast.
- **Weather is a bonus.** It never blocks routing; when it fails the day shows an error banner with Retry, and the tabs show `—`.
- **States:** no dates (a slim dashed prompt row with "Add dates"), loading (skeleton in the card's shape), ready, unavailable.
- **Rain is never colour-only:** wet periods are tinted *and* carry a drop icon and a percentage.
- **Units:** temperatures are °C by default, °F in Trip options (stored with the trip). Wind is km/h and rain mm.
- **Attribution:** "Open-Meteo.com" (a link) stays visible in every card.
- Icons are `wx-*` in `ui/icons.ts`, always rendered with `WeatherIcon` so the colour (sunny / wet / grey) follows the meaning.

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
- Multi-day (tabs, all-days overview, overnight transfers, day menus, add-day dialog, base rows) follows the separate "Routely · Multi-day itineraries" mock, not `Routely.html`. The start/end behaviour follows boards 8–12 of that mock.
- The suggest panel becomes a bottom overlay on mobile (no artboard exists).
- There is no dark theme.
