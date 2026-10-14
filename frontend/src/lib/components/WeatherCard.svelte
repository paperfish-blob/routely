<script lang="ts">
	import { formatDayLong, formatDayShort } from '#lib/days.ts';
	import type { DayWeather, ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Banner, Button, Icon, SegmentedControl, Skeleton, WeatherIcon, type SegmentOption } from '#lib/ui/index.ts';
	import WeatherAreaList from './WeatherAreaList.svelte';
	import WeatherDetail from './WeatherDetail.svelte';
	import WeatherSource from './WeatherSource.svelte';
	import { forecastOpensOn, formatTemp, rainAdvice, type WeatherReading, type WeatherRole } from '#lib/weather.ts';

	/** The selected day's weather at its start and end. `compact` (mobile) starts collapsed to one line. */
	let {
		itinerary,
		ontripdates,
		compact = false
	}: { itinerary: ItineraryState; ontripdates: () => void; compact?: boolean } = $props();

	const day = $derived(itinerary.activeDay);
	const wx = $derived<DayWeather | null>(day ? itinerary.dayWeather(day) : null);
	const unit = $derived(itinerary.tempUnit);
	const split = $derived((wx?.readings.length ?? 0) > 1);
	const advice = $derived((wx?.readings ?? []).map((r) => rainAdvice(r)).find((a) => a !== null) ?? null);
	const dateLong = $derived(wx?.date ? formatDayLong(new Date(`${wx.date}T00:00:00Z`)) : '');
	const dateShort = $derived(wx?.date ? formatDayShort(new Date(`${wx.date}T00:00:00Z`)) : '');

	let toggled = $state<Record<string, boolean>>({});
	const isOpen = (role: WeatherRole) => toggled[role] ?? (!compact && !split);
	const toggle = (role: WeatherRole) => (toggled[role] = !isOpen(role));

	const roleCaption = (r: WeatherReading) => (r.role === 'start' ? 'START' : r.role === 'end' ? 'END' : '');
	const VIEWS: SegmentOption<'ends' | 'areas'>[] = [
		{ value: 'ends', label: 'Start & end' },
		{ value: 'areas', label: 'By area' }
	];
	const areaAdvice = $derived(itinerary.areaRows.map((r) => (r.reading ? rainAdvice(r.reading) : null)).find((a) => a !== null) ?? null);
</script>

{#if wx && wx.kind !== 'hidden'}
	{#if wx.kind === 'nodates'}
		<section class="wxcard prompt {compact ? 'compact' : ''}" aria-label="Weather needs trip dates" data-name="Weather/NoDates">
			<span class="wxbig" style="width: 38px; height: 38px"><WeatherIcon kind="partly" /></span>
			<span class="wxlabel" style="gap: var(--sp-2)">
				<b>Weather for each day</b>
				<span>Needs trip dates</span>
			</span>
			<Button variant="secondary" size="sm" icon="calendar" onclick={ontripdates}>Add dates</Button>
		</section>
	{:else if wx.kind === 'loading' && !itinerary.showAreas}
		<section class="wxcard {compact ? 'compact' : ''}" aria-busy="true" aria-label="Loading weather" data-name="Weather/Loading">
			<div class="wxtop">
				<span class="wxbig"><Skeleton width="28px" height="28px" circle /></span>
				<div class="wxlabel" style="gap: var(--sp-6)">
					<Skeleton width="150px" height="14px" />
					<Skeleton width="110px" height="11px" />
				</div>
				<Skeleton width="64px" height="24px" />
			</div>
			{#if !compact}
				<div class="wxmetrics">
					{#each [0, 1, 2, 3] as n (n)}<Skeleton height="32px" />{/each}
				</div>
				<div class="wxhours">
					{#each [0, 1, 2, 3] as n (n)}<Skeleton height="66px" radius="var(--r-lg)" />{/each}
				</div>
			{/if}
		</section>
	{:else if wx.kind === 'error' && !itinerary.showAreas}
		<div class="wxnote" data-name="Weather/Error">
			<Banner variant="err">
				Weather isn’t available right now. Your route and distances still work.
				{#snippet actions()}
					<Button variant="secondary" size="sm" style="margin: -4px 0" onclick={() => itinerary.retryWeather()}>Retry</Button>
				{/snippet}
			</Banner>
		</div>
	{:else if itinerary.showAreas}
		<section class="wxcard {compact ? 'compact' : ''}" aria-label="Weather by area for {dateLong}" data-name="WeatherCard">
			{@render head('WEATHER BY AREA')}
			<WeatherAreaList {itinerary} {compact} />
		</section>
		{#if areaAdvice}
			<div class="wxnote" data-name="Weather/Advice"><Banner variant="warn"><b>{areaAdvice.place}:</b> {areaAdvice.text} {areaAdvice.hint}</Banner></div>
		{/if}
	{:else}
		<section class="wxcard {compact ? 'compact' : ''}" aria-label="Weather for {dateLong}" data-name="WeatherCard">
			{#if itinerary.areasApplicable}{@render head('WEATHER')}{/if}
			{#each wx.readings as r (r.role)}
				{@const w = r.wx}
				{@const open = isOpen(r.role)}
				<div class="wxrow" data-role={r.role}>
					{#if split}<span class="wxrole">{roleCaption(r)} · {r.place.name}</span>{/if}
					<button
						class="wxtop"
						aria-expanded={open}
						aria-label="{w.summary}, high {formatTemp(w.temp_max_c, unit)}, low {formatTemp(w.temp_min_c, unit)}{w.rain_chance !== null ? `, rain ${w.rain_chance} percent` : ''}. {open ? 'Hide' : 'Show'} details"
						onclick={() => toggle(r.role)}
					>
						<span class="wxbig" style={compact ? 'width: 38px; height: 38px' : ''}><WeatherIcon kind={w.icon} /></span>
						<span class="wxlabel">
							<b>{w.summary}</b>
							<span>{split ? dateShort : `${dateShort} · ${r.place.name}`}</span>
						</span>
						<span class="wxtemp num">{w.source === 'typical' ? '~' : ''}{formatTemp(w.temp_max_c, unit)}<small> / {formatTemp(w.temp_min_c, unit)}</small></span>
						<Icon name={open ? 'chevron-down' : 'chevron-right'} />
					</button>
					{#if open}<WeatherDetail {w} {unit} />{/if}
					<WeatherSource {w} />
				</div>
			{/each}
		</section>
		{#if wx.readings.some((r) => r.wx.source === 'typical') && wx.date}
			{@const opens = forecastOpensOn(wx.date)}
			<div class="wxnote">
				<Banner variant="info">This is not a forecast.{opens ? ` A real one appears 15 days before the day, on ${opens}.` : ''}</Banner>
			</div>
		{:else if advice}
			<div class="wxnote" data-name="Weather/Advice">
				<Banner variant="warn">{split ? `At ${advice.place}: ` : ''}{advice.text} {advice.hint}</Banner>
			</div>
		{/if}
	{/if}
{/if}

{#snippet head(title: string)}
	<div class="wxhead">
		<span class="tt">{title}</span>
		{#if itinerary.areasApplicable}
			<SegmentedControl
				size="sm"
				label="Weather view"
				options={VIEWS}
				value={itinerary.showAreas ? 'areas' : 'ends'}
				onchange={(v) => itinerary.setWeatherView(v)}
			/>
		{/if}
	</div>
{/snippet}
