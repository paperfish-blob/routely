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
