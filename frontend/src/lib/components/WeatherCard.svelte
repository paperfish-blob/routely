<script lang="ts">
	import { formatDayLong, formatDayShort } from '#lib/days.ts';
	import type { DayWeather, ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Banner, Button, Icon, IconButton, Skeleton, WeatherIcon } from '#lib/ui/index.ts';
	import {
		ago,
		forecastOpensOn,
		formatTemp,
		PERIOD_LABEL,
		rainAdvice,
		sourceLabel,
		type WeatherReading,
		type WeatherRole
	} from '#lib/weather.ts';

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
	const wetShare = (share: number | null) => (share === null ? '—' : `${Math.round(share * 10)} in 10`);
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
	{:else if wx.kind === 'loading'}
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
	{:else if wx.kind === 'error'}
		<div class="wxnote" data-name="Weather/Error">
			<Banner variant="err">
				Weather isn’t available right now. Your route and distances still work.
				{#snippet actions()}
					<Button variant="secondary" size="sm" style="margin: -4px 0" onclick={() => itinerary.retryWeather()}>Retry</Button>
				{/snippet}
			</Banner>
		</div>
	{:else}
		<section class="wxcard {compact ? 'compact' : ''}" aria-label="Weather for {dateLong}" data-name="WeatherCard">
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
					{#if open}
						{#if w.source === 'typical'}
							<div class="wxmetrics num" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
								<div class="wxm">RAINY DAYS<b><Icon name="drop" class="wx-rainy" />{wetShare(w.wet_day_share)}</b></div>
								<div class="wxm">AVG. RAINFALL<b>{w.rain_mm} mm</b></div>
							</div>
						{:else}
							<div class="wxmetrics num">
								{#if w.rain_chance !== null}<div class="wxm">RAIN<b><Icon name="drop" class="wx-rainy" />{w.rain_chance}%</b></div>{/if}
								<div class="wxm">{w.source === 'recorded' ? 'RAINFALL' : 'AMOUNT'}<b>{w.rain_mm} mm</b></div>
								{#if w.wind_kmh !== null}<div class="wxm">WIND<b><Icon name="wind" class="wx-cloudy" />{Math.round(w.wind_kmh)} km/h</b></div>{/if}
								{#if w.uv_index !== null}<div class="wxm">UV<b><Icon name="wx-sun" class="wx-sun" />{Math.round(w.uv_index)}</b></div>{/if}
							</div>
						{/if}
						{#if w.periods.length > 0}
							<div class="wxhours num" role="list" aria-label="Through the day">
								{#each w.periods as p (p.name)}
									{@const wet = (p.rain_chance ?? 0) >= 50}
									<div class="wxh {wet ? 'wet' : ''}" role="listitem">
										{PERIOD_LABEL[p.name]}
										<Icon name={wet ? 'wx-rain' : 'wx-cloudy'} class={wet ? 'wx-rainy' : 'wx-cloudy'} />
										<b>{formatTemp(p.temp_c, unit)}</b>
										{#if p.rain_chance !== null}{p.rain_chance}%{/if}
									</div>
								{/each}
							</div>
						{/if}
					{/if}
					<div class="wxsrc">
						<span class="wxchip {w.source === 'typical' ? 'typ' : w.source === 'recorded' ? 'rec' : ''}">
							<Icon name={w.source === 'forecast' ? 'clock' : w.source === 'typical' ? 'refresh' : 'check'} />{sourceLabel(w.source)}
						</span>
						<span>
							{#if w.source === 'forecast'}Updated {ago(w.fetched_at)}{:else if w.source === 'typical'}Average of the last {w.years} years{:else}Observed data{/if}
							· <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>
						</span>
					</div>
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
