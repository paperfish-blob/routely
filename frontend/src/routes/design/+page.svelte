<script lang="ts">
	import { onMount } from 'svelte';
	import { clusterStyleAt } from '#lib/clusters.ts';
	import LegConnector from '#lib/components/LegConnector.svelte';
	import {
		Badge,
		Banner,
		Button,
		ClusterChip,
		ClusterTag,
		Field,
		Icon,
		IconButton,
		ICONS,
		Pill,
		SegmentedControl,
		Skeleton,
		Toast,
		WeatherIcon,
		Menu,
		MenuHeading,
		MenuItem,
		type IconName
	} from '#lib/ui/index.ts';
	import type { RouteMode } from '#lib/types.ts';

	/** Living style guide: every shared component and state. Not linked from the app. */
	const SWATCHES: { name: string; token: string }[] = [
		{ name: 'Primary', token: '--primary' },
		{ name: 'Accent', token: '--accent' },
		{ name: 'Ink', token: '--ink' },
		{ name: 'Ink 2', token: '--ink-2' },
		{ name: 'Surface 2', token: '--surface-2' },
		{ name: 'Line', token: '--line' },
		{ name: 'Danger', token: '--danger' },
		{ name: 'OK', token: '--ok' },
		{ name: 'Focus', token: '--focus' }
	];
	const FONT_SIZES = ['--fs-micro', '--fs-caption-2', '--fs-small-2', '--fs-body', '--fs-body-lg', '--fs-title', '--fs-stat', '--fs-display'];

	let resolved = $state<Record<string, string>>({});
	let mode = $state<RouteMode>('driving');
	let query = $state('Kualaa Lumpr');
	let okQuery = $state('Kuala');

	onMount(() => {
		const style = getComputedStyle(document.documentElement);
		const read = (t: string) => style.getPropertyValue(t).trim();
		resolved = Object.fromEntries([...SWATCHES.map((s) => s.token), ...FONT_SIZES].map((t) => [t, read(t)]));
	});

	const A = clusterStyleAt(0);
	const B = clusterStyleAt(1);
	const C = clusterStyleAt(2);
	const D = clusterStyleAt(3);
	const modes = [
		{ value: 'straight', label: 'Straight line', icon: 'line' },
		{ value: 'driving', label: 'Driving', icon: 'car' },
		{ value: 'walking', label: 'Walking', icon: 'walk' }
	] satisfies { value: RouteMode; label: string; icon: IconName }[];
	const shortModes = [
		{ value: 'straight', label: 'Line', icon: 'line' },
		{ value: 'driving', label: 'Drive', icon: 'car' },
		{ value: 'walking', label: 'Walk', icon: 'walk' }
	] satisfies { value: RouteMode; label: string; icon: IconName }[];
</script>

<svelte:head><title>Routely · Design system</title></svelte:head>

<div class="ds">
	<header>
		<h1>Design system</h1>
		<span>Everything here is built from <code>src/lib/styles/*</code> and <code>src/lib/ui/*</code>. See DESIGN.md before adding to it.</span>
	</header>

	<div class="grid">
		<div class="col">
			<section class="card">
				<h2 class="cs">COLOUR AND TYPE</h2>
				<div class="swatches">
					{#each SWATCHES as s (s.token)}
						<div>
							<div class="sw" style="background: var({s.token})"></div>
							<span class="cap">{s.name}<br />{s.token}<br />{resolved[s.token] ?? ''}</span>
						</div>
					{/each}
				</div>
				<div class="swatches four">
					{#each [A, B, C, D] as c, i (c.letter)}
						<div>
							<span class="{c.colorClass} {c.shapeClass} badge" style="width: 40px; height: 40px">{c.letter}</span>
							<span class="cap">Cluster {c.letter}<br />{['circle', 'rounded', 'hexagon', 'square'][i]}</span>
						</div>
					{/each}
				</div>
				<div class="type">
					<span class="cap">PLUS JAKARTA SANS</span>
					{#each FONT_SIZES as t (t)}
						<span style="font-size: var({t}); font-weight: var(--fw-semibold)">{t.replace('--fs-', '')} · {resolved[t] ?? ''} · Where are you headed?</span>
					{/each}
					<span class="num" style="font-size: var(--fs-body-lg); font-weight: var(--fw-bold)">Tabular: 237.7 km · 3 h 32 min · 0123456789</span>
				</div>
			</section>

			<section class="card">
				<h2 class="cs">STOP ROW</h2>
				{#each [['DEFAULT', ''], ['HOVER', 'hov'], ['DRAGGING', 'drag'], ['SELECTED', 'sel']] as [label, cls] (label)}
					<span class="cap">{label}</span>
					<div class="stop {cls}" style={cls === 'drag' ? 'margin: var(--sp-4) var(--sp-6); position: static' : undefined}>
						<button class="grip" aria-label="Reorder"><Icon name="grip" /></button>
						<Badge n={2} cluster={A} />
						<div class="txt"><span class="nm">Batu Caves</span><span class="sb">Gombak, Selangor</span></div>
						<ClusterTag cluster={A} />
						<IconButton label="Remove" icon="trash" />
					</div>
				{/each}
			</section>

			<section class="card">
				<h2 class="cs">LEG CONNECTOR</h2>
				<div class="legs">
					<LegConnector km={12.4} seconds={1080} approx={false} mode="driving" />
					<span class="cap">DRIVING</span>
					<LegConnector km={12.4} seconds={9060} approx={false} mode="walking" />
					<span class="cap">WALKING</span>
					<LegConnector km={9.4} seconds={null} approx mode="straight" />
					<span class="cap">STRAIGHT LINE</span>
				</div>
			</section>
		</div>

		<div class="col">
			<section class="card">
				<h2 class="cs">NUMBERED MARKER</h2>
				<div class="mapbox">
					{#each [{ c: A, sel: false }, { c: A, sel: true }, { c: B, sel: false }, { c: C, sel: false }, { c: D, sel: false }] as { c, sel }, i (i)}
						<div class="slot">
							<div class="mk {c.colorClass} {sel ? 'sel' : ''}">
								<span class="{c.colorClass} {c.shapeClass} badge">{i + 1}</span><span class="lt">{c.letter}</span>
							</div>
						</div>
					{/each}
				</div>
				<div class="popup" style="position: relative; width: 100%">
					<div class="pt">KLCC <ClusterTag cluster={A} /></div>
					<div class="ps">Kuala Lumpur</div>
					<div class="pn"><Icon name="pin" /><span>Nearest stop: <b>Batu Caves</b> · <span class="num">13.6 km</span></span></div>
				</div>
			</section>

			<section class="card">
				<h2 class="cs">SEARCH</h2>
				<Field label="Search for a place" bind:value={okQuery} placeholder="Search a city, landmark or address" />
				<div class="dd" style="position: static; box-shadow: none">
					<div class="sugg"><span class="pin"><Icon name="pin" /></span><span class="tx"><span class="t"><span class="hit">Kuala</span> Lumpur Tower</span><span class="s">Kuala Lumpur, Malaysia</span></span></div>
					<div class="sugg hov"><span class="pin"><Icon name="pin" /></span><span class="tx"><span class="t"><span class="hit">Kuala</span> Selangor Nature Park</span><span class="s">Selangor, Malaysia</span></span><Button size="sm" icon="plus" class="add">Add stop</Button></div>
				</div>
				<Field label="Search for a place" bind:value={query} error help="No places found. Try a different name." />
			</section>

			<section class="card">
				<h2 class="cs">CLUSTER CHIP</h2>
				<div class="chips">
					<ClusterChip cluster={A} text="3 stops within 30 km" />
					<ClusterChip cluster={B} text="2 stops within 58 km" />
					<ClusterChip cluster={C} text="1 stop" />
					<ClusterChip cluster={D} text="2 stops within 12 km" />
				</div>
			</section>

			<section class="card">
				<h2 class="cs">MODE TOGGLE (SEGMENTED)</h2>
				<SegmentedControl label="Travel mode, desktop" options={modes} value={mode} onchange={(m) => (mode = m)} />
				<SegmentedControl size="lg" label="Travel mode, mobile" options={shortModes} value={mode} onchange={(m) => (mode = m)} />
				<SegmentedControl size="sm" label="Small" options={[{ value: '5', label: '5 km' }, { value: '30', label: '30 km' }]} value="30" onchange={() => {}} />
			</section>
		</div>

		<div class="col">
			<section class="card">
				<h2 class="cs">BUTTONS</h2>
				<div class="row">
					<Button>Apply new order</Button>
					<Button variant="secondary">Keep current</Button>
					<Button variant="accent" icon="sparkles">Suggest better order</Button>
				</div>
				<div class="row">
					<button class="btn btn-primary hov">Hover</button>
					<button class="btn btn-primary foc">Focus</button>
					<Button disabled>Disabled</Button>
					<Button variant="ghost">Ghost</Button>
				</div>
				<div class="row">
					<Button size="sm" icon="plus">Add stop</Button>
					<Button size="sm" variant="secondary">Retry</Button>
					<IconButton label="Suggest better order" icon="sparkles" accent />
				</div>
			</section>

			<section class="card">
				<h2 class="cs">BANNERS AND TOAST</h2>
				<Banner variant="info">Drag a stop by its handle to change the order.</Banner>
				<Banner variant="warn">Couldn’t get road directions, showing straight-line distances instead.</Banner>
				<Banner variant="err">Couldn’t load this itinerary. Check your connection and try again.</Banner>
				<Banner variant="ok">New order applied. Saved 38.2 km.</Banner>
				<Banner variant="warn" icon="clock">Too many searches, try again in a moment.</Banner>
				<Toast message="Port Dickson Beach removed" actionLabel="Undo" />
			</section>

			<section class="card">
				<h2 class="cs">SKELETON LOADERS</h2>
				<div class="stop" style="gap: var(--sp-12); padding: 0 var(--sp-12)">
					<Skeleton width="30px" height="30px" circle />
					<div style="flex: 1; display: flex; flex-direction: column; gap: var(--sp-8)"><Skeleton width="60%" /><Skeleton width="36%" height="10px" /></div>
					<Skeleton width="24px" height="24px" />
				</div>
				<div class="leg" style="margin-left: var(--sp-12)"><Skeleton width="112px" height="22px" radius="var(--r-pill)" /></div>
			</section>

			<section class="card">
				<h2 class="cs">ICONS</h2>
				<div class="icons">
					{#each Object.keys(ICONS) as name (name)}
						<div><Icon name={name as IconName} /><span class="cap">{name}</span></div>
					{/each}
				</div>
			</section>
		</div>

		<div class="col">
			<section class="card">
				<h2 class="cs">DAYS: TABS, TAGS, CHIPS</h2>
				<span class="cap">DAY TABS: DEFAULT · SELECTED · DROP TARGET · ADD</span>
				<div class="row" style="flex-wrap: nowrap; overflow: hidden">
					<button class="dtab day1"><b><i></i>Day 1</b><span>Sat 24 Oct</span></button>
					<button class="dtab day2 sel"><b><i></i>Day 2</b><span>Sun 25 Oct</span></button>
					<button class="dtab day3 drop"><b><i></i>Day 3</b><span>Mon 26 Oct</span></button>
					<button class="dtab add"><Icon name="plus" size="sm" />Add day</button>
				</div>
				<span class="cap">DAY TAGS (three hues, cycling)</span>
				<div class="row">
					<span class="dtag day1">D1</span><span class="dtag day2">D2</span><span class="dtag day3">D3</span>
					<span class="addto day2"><span class="dtag">D2</span>Day 2<Icon name="chevron-down" /></span>
				</div>
				<span class="cap">MOBILE DAY CHIPS</span>
				<div class="row">
					<button class="dchip"><Icon name="layers" size="sm" />All</button>
					<button class="dchip day1 sel"><span class="dtag">D1</span>Sat 24</button>
					<button class="dchip day2"><span class="dtag">D2</span>Sun 25</button>
				</div>
			</section>

			<section class="card">
				<h2 class="cs">START &amp; END ROWS</h2>
				<span class="cap">ROUND TRIP (SAME PLACE)</span>
				<div class="stop base"><span class="base-ico"><Icon name="home" /></span><div class="txt"><span class="cap">START &amp; END</span><span class="nm" style="font-size: var(--fs-body)">Hotel KL</span></div><IconButton label="Options" icon="more" /></div>
				<div class="stop base"><span class="base-ico"><Icon name="home" /></span><div class="txt"><span class="cap">BACK AT</span><span class="nm" style="font-size: var(--fs-body)">Hotel KL</span></div><IconButton label="Options" icon="more" /></div>
				<span class="cap">DIFFERENT START AND END</span>
				<div class="stop base"><span class="base-ico"><Icon name="plane" /></span><div class="txt"><span class="cap">START</span><span class="nm" style="font-size: var(--fs-body)">KLIA Airport</span></div><span class="linkchip"><Icon name="link" />from Day 1</span><IconButton label="Options" icon="more" /></div>
				<div class="stop base"><span class="base-ico end"><Icon name="flag" /></span><div class="txt"><span class="cap">END</span><span class="nm" style="font-size: var(--fs-body)">Hotel Pantai</span></div><span class="linkchip"><Icon name="link" />Day 2 starts here</span><IconButton label="Options" icon="more" /></div>
				<span class="cap">OPEN END · NOT SET</span>
				<div class="stop base open"><span class="base-ico" style="background: var(--ink-3)"><Icon name="ban" /></span><div class="txt"><span class="cap">END</span><span class="nm" style="font-size: var(--fs-small-2)">No fixed end · finishes at the last stop</span></div><IconButton label="Options" icon="more" /></div>
				<div class="stop base unset"><span class="base-ico"><Icon name="home" /></span><div class="txt"><span class="cap">START &amp; END</span><span class="nm" style="font-size: var(--fs-small-2)">Where does Day 2 begin?</span></div><Button size="sm" variant="secondary">Set start</Button></div>
			</section>

			<section class="card">
				<h2 class="cs">ALL-DAYS SECTION · OVERNIGHT</h2>
				<div class="daysec day2" style="margin: 0">
					<div class="daysec-h"><IconButton label="Collapse" icon="chevron-down" /><span class="dtag">D2</span><span class="t"><b>Putrajaya &amp; Port Dickson</b><span>Sun 25 Oct · 2 stops</span></span><span class="st num">63.4 km<br />58 min</span></div>
					<div class="srow"><span class="badge sm day2">1</span><span class="nm">Putrajaya Lake</span><span class="km num">63.4 km</span></div>
				</div>
				<div class="xfer" style="margin: 0"><Pill dashed icon="car">Overnight · 57.9 km · 58 min</Pill></div>
			</section>

			<section class="card">
				<h2 class="cs">WEATHER</h2>
				<span class="cap">ICONS (SUNNY · WET · GREY)</span>
				<div class="row">
					<WeatherIcon kind="sun" /><WeatherIcon kind="partly" /><WeatherIcon kind="cloudy" /><WeatherIcon kind="fog" /><WeatherIcon kind="rain" /><WeatherIcon kind="storm" /><WeatherIcon kind="snow" />
				</div>
				<span class="cap">DAY TABS WITH WEATHER · MAP PIN</span>
				<div class="row" style="flex-wrap: nowrap; overflow: hidden">
					<button class="dtab wxon day1 sel"><b><i></i>Day 1</b><span>Sat 24 Oct</span><span class="wx"><WeatherIcon kind="partly" />32° 24°</span></button>
					<button class="dtab wxon day2"><b><i></i>Day 2</b><span>Sun 25 Oct</span><span class="wx"><WeatherIcon kind="storm" />30° 24°</span></button>
					<span class="wxpin day2"><WeatherIcon kind="storm" />30°</span>
				</div>
				<span class="cap">FORECAST CARD (RAIN PERIODS TINTED)</span>
				<section class="wxcard" style="margin: 0">
					<div class="wxrow">
						<div class="wxtop">
							<span class="wxbig"><WeatherIcon kind="storm" /></span>
							<span class="wxlabel"><b>Thunderstorms likely</b><span>Sun 25 Oct · Putrajaya</span></span>
							<span class="wxtemp num">30°<small> / 24°</small></span>
						</div>
						<div class="wxmetrics num">
							<div class="wxm">RAIN<b><Icon name="drop" class="wx-rainy" />75%</b></div>
							<div class="wxm">AMOUNT<b>12 mm</b></div>
							<div class="wxm">WIND<b><Icon name="wind" class="wx-cloudy" />14 km/h</b></div>
							<div class="wxm">UV<b><Icon name="wx-sun" class="wx-sun" />7</b></div>
						</div>
						<div class="wxhours num">
							<div class="wxh">Morning<WeatherIcon kind="cloudy" /><b>27°</b>10%</div>
							<div class="wxh wet">Afternoon<WeatherIcon kind="rain" /><b>30°</b>80%</div>
							<div class="wxh wet">Evening<WeatherIcon kind="rain" /><b>27°</b>60%</div>
							<div class="wxh">Night<WeatherIcon kind="cloudy" /><b>25°</b>20%</div>
						</div>
						<div class="wxsrc"><span class="wxchip"><Icon name="clock" />FORECAST</span><span>Updated 8 min ago · Open-Meteo.com</span></div>
					</div>
				</section>
				<span class="cap">SOURCE CHIPS · FORECAST STRIP TILE</span>
				<div class="row">
					<span class="wxchip"><Icon name="clock" />FORECAST</span>
					<span class="wxchip typ"><Icon name="refresh" />TYPICAL</span>
					<span class="wxchip rec"><Icon name="check" />RECORDED</span>
					<button class="wxt wet day2" style="width: 120px"><span class="h"><span class="dtag">D2</span><WeatherIcon kind="storm" /></span><span class="t num">30°<small> / 24°</small></span><span class="r num"><Icon name="drop" class="wx-rainy" />75%</span></button>
				</div>
				<span class="cap">BY AREA: ROWS (SELECTED · WET · LOADING · UNAVAILABLE) AND DIFFERENCE CHIPS</span>
				<section class="wxcard" style="margin: 0">
					<div class="wxhead">
						<span class="tt">WEATHER BY AREA</span>
						<SegmentedControl size="sm" label="Weather view" options={[{ value: 'ends', label: 'Start & end' }, { value: 'areas', label: 'By area' }]} value="areas" onchange={() => {}} />
					</div>
					<div class="wxlist">
						<button class="wxa"><span class="tags"><span class="base-ico" style="width: 26px; height: 26px"><Icon name="plane" /></span></span><span class="tx"><b>KLIA Airport</b><span>START</span></span><WeatherIcon kind="sun" /><span class="rt-r"><span class="t num">33°<small> / 24°</small></span><span class="rn num"><Icon name="drop" class="wx-rainy" />20%</span></span></button>
						<button class="wxa cA"><span class="tags"><ClusterTag cluster={A} /></span><span class="tx"><b>KLCC +2</b><span>3 stops · also END</span></span><WeatherIcon kind="partly" /><span class="rt-r"><span class="t num">32°<small> / 24°</small></span><span class="rn num"><Icon name="drop" class="wx-rainy" />30%</span></span></button>
						<button class="wxa cC sel wet"><span class="tags"><ClusterTag cluster={C} /></span><span class="tx"><b>Genting Skyworld +1</b><span>2 stops</span></span><WeatherIcon kind="storm" /><span class="rt-r"><span class="t num">22°<small> / 17°</small></span><span class="rn num"><Icon name="drop" class="wx-rainy" />85%</span></span></button>
						<div class="wxdiffs"><span class="wxchip diff"><Icon name="arrow-down" />10° COOLER</span><span class="wxchip diff"><Icon name="drop" />+55% RAIN</span></div>
						<div class="wxa" aria-busy="true"><span class="tags"><ClusterTag cluster={B} /></span><span class="tx" style="gap: var(--sp-6)"><Skeleton width="120px" height="13px" /><Skeleton width="80px" height="10px" /></span><Skeleton width="56px" height="22px" /></div>
						<div class="wxa"><span class="tags"><ClusterTag cluster={D} /></span><span class="tx"><b>Malacca</b><span>Weather unavailable</span></span><Button variant="secondary" size="sm" icon="refresh">Retry</Button></div>
					</div>
				</section>
				<span class="cap">STATES: NO DATES · LOADING · UNAVAILABLE</span>
				<section class="wxcard prompt" style="margin: 0">
					<span class="wxbig" style="width: 38px; height: 38px"><WeatherIcon kind="partly" /></span>
					<span class="wxlabel" style="gap: var(--sp-2)"><b>Weather for each day</b><span>Needs trip dates</span></span>
					<Button variant="secondary" size="sm" icon="calendar">Add dates</Button>
				</section>
				<section class="wxcard" style="margin: 0" aria-busy="true">
					<div class="wxtop"><span class="wxbig"><Skeleton width="28px" height="28px" circle /></span><div class="wxlabel" style="gap: var(--sp-6)"><Skeleton width="150px" height="14px" /><Skeleton width="110px" height="11px" /></div><Skeleton width="64px" height="24px" /></div>
				</section>
				<Banner variant="err">Weather isn’t available right now. Your route and distances still work.</Banner>
			</section>

			<section class="card">
				<h2 class="cs">MENU · DIALOG OPTION</h2>
				<div class="menu" style="position: static; box-shadow: none; max-height: none">
					<MenuHeading>MOVE KLCC TO</MenuHeading>
					<MenuItem selected={true}><span class="dtag day1">D1</span>Day 1 · Sat 24 Oct</MenuItem>
					<MenuItem hint="2 stops"><span class="dtag day2">D2</span>Day 2 · Sun 25 Oct</MenuItem>
					<MenuItem icon="insert">New day after Day 1</MenuItem>
					<div class="msep"></div>
					<MenuItem icon="home" checked={true}>Start each day from a base</MenuItem>
					<MenuItem icon="trash" danger hint="Undo available">Remove from trip</MenuItem>
				</div>
				<button class="opt" role="radio" aria-checked="true"><span class="ic"><Icon name="plus" /></span><span class="ot"><b>Day 4 · Tue 27 Oct</b><span>After your last day.</span></span><Icon name="check" /></button>
				<button class="opt" role="radio" aria-checked="false"><span class="ic"><Icon name="copy" /></span><span class="ot"><b>Duplicate Day 2</b><span>Copy its 2 stops to a new day.</span></span></button>
			</section>
		</div>
	</div>
</div>

<style>
	.ds {
		min-height: 100dvh;
		background: var(--surface-2);
		padding: var(--sp-24);
		display: flex;
		flex-direction: column;
		gap: var(--sp-24);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: var(--sp-16);
		flex-wrap: wrap;
	}
	h1 {
		margin: 0;
		font-size: var(--fs-display);
		font-weight: var(--fw-extrabold);
		letter-spacing: var(--ls-tight);
	}
	header span {
		font-size: var(--fs-small-2);
		color: var(--ink-2);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
		gap: var(--sp-24);
		align-items: start;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--sp-24);
		min-width: 0;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--r-2xl);
		padding: var(--sp-20);
		display: flex;
		flex-direction: column;
		gap: var(--sp-10);
	}
	.cs {
		margin: 0 0 var(--sp-4);
		font-size: var(--fs-caption);
		font-weight: var(--fw-extrabold);
		color: var(--ink-2);
		letter-spacing: var(--ls-caps);
	}
	.cap {
		font-size: var(--fs-micro);
		font-weight: var(--fw-bold);
		color: var(--ink-2);
		letter-spacing: var(--ls-caps);
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-10);
	}
	.swatches.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.sw {
		height: 44px;
		border-radius: var(--r-lg);
		border: 1px solid var(--line);
		margin-bottom: var(--sp-6);
	}
	.type {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		padding-top: var(--sp-10);
		border-top: 1px solid var(--line);
	}
	.legs {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
	}
	.legs :global(.leg) {
		margin-left: var(--sp-12);
	}
	.mapbox {
		height: 112px;
		border-radius: var(--r-xl);
		background: var(--map-bg);
		display: flex;
		justify-content: space-around;
		align-items: center;
	}
	.slot {
		position: relative;
		width: 56px;
		height: 100%;
	}
	.slot .mk {
		left: 28px;
		top: 56px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-10);
		align-items: center;
	}
	.chips {
		display: flex;
		gap: var(--sp-8);
		flex-wrap: wrap;
	}
	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
		gap: var(--sp-12);
	}
	.icons div {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		color: var(--ink);
	}
	code {
		font-size: var(--fs-caption-2);
		background: var(--surface);
		padding: var(--sp-2) var(--sp-6);
		border-radius: var(--r-sm);
		border: 1px solid var(--line);
	}
</style>
