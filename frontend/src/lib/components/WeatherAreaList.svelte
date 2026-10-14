<script lang="ts">
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { ClusterTag, Button, Icon, Skeleton, WeatherIcon } from '#lib/ui/index.ts';
	import { placeIcon } from '#lib/days.ts';
	import { WET_CHANCE, formatTemp } from '#lib/weather.ts';
	import WeatherDetail from './WeatherDetail.svelte';
	import WeatherSource from './WeatherSource.svelte';

	/** One row per area (clusters within 30 km share a row), opening to the hourly strip. */
	let { itinerary, compact = false }: { itinerary: ItineraryState; compact?: boolean } = $props();

	const rows = $derived(itinerary.areaRows);
	const unit = $derived(itinerary.tempUnit);

	const OUTER = { start: 'START', end: 'END', both: 'START & END' } as const;
	const subOf = (r: (typeof rows)[number]) => {
		if (r.outer) return OUTER[r.outer.role];
		const n = r.group!.stops.length;
		const also = r.includes.map((i) => (i === 'start' ? 'START' : 'END')).join(' & ');
		return [`${n} ${n === 1 ? 'stop' : 'stops'}`, also ? `also ${also}` : ''].filter(Boolean).join(' · ');
	};
	const titleOf = (r: (typeof rows)[number]) => (r.outer ? r.place.name : r.group!.name);
	const colorOf = (r: (typeof rows)[number]) => r.group?.clusters[0].style.colorClass ?? '';
</script>

{#if compact}
	<!-- Mobile: swipe through areas; the open one shows its day below. -->
	<div class="wxcards" role="list" data-name="WeatherByArea">
		{#each rows as r (r.id)}
			{@const w = r.reading?.wx}
			{@const open = itinerary.openAreaId === r.id}
			<div role="listitem" style="display: contents">
				{#if r.status === 'error'}
					<div class="wxac {colorOf(r)}">
						<span class="h">{@render tags(r)}</span>
						<span class="n">Unavailable</span>
						<Button variant="secondary" size="sm" onclick={() => itinerary.retryWeather()}>Retry</Button>
					</div>
				{:else if !w}
					<div class="wxac {colorOf(r)}" aria-busy="true">
						<span class="h">{@render tags(r)}</span>
						<Skeleton width="70px" height="16px" />
						<Skeleton width="90px" height="11px" />
					</div>
				{:else}
					<button
						class="wxac {colorOf(r)} {open ? 'sel' : ''} {(w.rain_chance ?? 0) >= WET_CHANCE ? 'wet' : ''}"
						aria-pressed={open}
						aria-label="{titleOf(r)}: {w.summary}, high {formatTemp(w.temp_max_c, unit)}, low {formatTemp(w.temp_min_c, unit)}"
						onclick={() => itinerary.toggleArea(r.id)}
					>
						<span class="h">{@render tags(r)}<WeatherIcon kind={w.icon} /></span>
						<span class="t num">{formatTemp(w.temp_max_c, unit)}<small> / {formatTemp(w.temp_min_c, unit)}</small></span>
						<span class="n num">{titleOf(r)}{w.rain_chance !== null ? ` · ${w.rain_chance}%` : ''}</span>
					</button>
				{/if}
			</div>
		{/each}
	</div>
	{#each rows as r (r.id)}
		{#if itinerary.openAreaId === r.id && r.reading}
			{@const w = r.reading.wx}
			<div class="wxdetail {colorOf(r)}" data-name="AreaDetail">
				<div class="wxlabel" style="flex-direction: row; align-items: center; gap: var(--sp-8); flex-wrap: wrap">
					<b>{titleOf(r)}{r.group ? ` · ${subOf(r)}` : ''}</b>
					{#each r.diffs as d (d.kind)}<span class="wxchip diff">{d.text}</span>{/each}
				</div>
				<WeatherDetail {w} {unit} />
				<WeatherSource {w} />
			</div>
		{/if}
	{/each}
{:else}
<div class="wxlist" role="list" data-name="WeatherByArea">
	{#each rows as r (r.id)}
		{@const open = itinerary.openAreaId === r.id}
		{@const w = r.reading?.wx}
		{@const wet = (w?.rain_chance ?? 0) >= WET_CHANCE}
		<div role="listitem">
			{#if r.status === 'error'}
				<div class="wxa {colorOf(r)}">
					{@render tags(r)}
					<span class="tx"><b>{titleOf(r)}</b><span>Weather unavailable</span></span>
					<Button variant="secondary" size="sm" icon="refresh" onclick={() => itinerary.retryWeather()}>Retry</Button>
				</div>
			{:else if r.status === 'loading' || !w}
				<div class="wxa {colorOf(r)}" aria-busy="true">
					{@render tags(r)}
					<span class="tx" style="gap: var(--sp-6)"><Skeleton width="120px" height="13px" /><Skeleton width="80px" height="10px" /></span>
					<Skeleton width="56px" height="22px" />
				</div>
			{:else}
				<button
					class="wxa {colorOf(r)} {open ? 'sel' : ''} {wet ? 'wet' : ''}"
					aria-expanded={open}
					aria-label="{titleOf(r)}: {w.summary}, high {formatTemp(w.temp_max_c, unit)}, low {formatTemp(w.temp_min_c, unit)}{w.rain_chance !== null ? `, rain ${w.rain_chance} percent` : ''}"
					onclick={() => itinerary.toggleArea(r.id)}
				>
					{@render tags(r)}
					<span class="tx"><b>{titleOf(r)}</b><span>{subOf(r)}</span></span>
					<WeatherIcon kind={w.icon} />
					<span class="rt-r">
						<span class="t num">{w.source === 'typical' ? '~' : ''}{formatTemp(w.temp_max_c, unit)}<small> / {formatTemp(w.temp_min_c, unit)}</small></span>
						{#if w.rain_chance !== null}<span class="rn num"><Icon name="drop" class="wx-rainy" />{w.rain_chance}%</span>{/if}
					</span>
				</button>
				{#if r.diffs.length > 0}
					<div class="wxdiffs">
						{#each r.diffs as d (d.kind)}<span class="wxchip diff"><Icon name={d.kind === 'rain' ? 'drop' : d.text.includes('COOLER') ? 'arrow-down' : 'arrow-up'} />{d.text}</span>{/each}
					</div>
				{/if}
				{#if open}
					<div class="wxdetail {colorOf(r)}" data-name="AreaDetail">
						<span class="wxrole">{r.group ? r.group.stops.map((s) => s.name).join(', ') : r.place.name}</span>
						<WeatherDetail {w} {unit} />
						<WeatherSource {w} />
					</div>
				{/if}
			{/if}
		</div>
	{/each}
</div>

{/if}

{#snippet tags(r: (typeof rows)[number])}
	<span class="tags">
		{#if r.group}
			{#each r.group.clusters as c (c.id)}<ClusterTag cluster={c.style} />{/each}
		{:else}
			<span class="base-ico {r.outer?.role === 'end' ? 'end' : ''}" style="width: 26px; height: 26px"><Icon name={placeIcon(r.place.name, r.outer?.role === 'end' ? 'flag' : 'home')} /></span>
		{/if}
	</span>
{/snippet}
