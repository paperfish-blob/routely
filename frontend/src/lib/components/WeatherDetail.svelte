<script lang="ts">
	import type { TempUnit, WeatherResponse } from '#lib/types.ts';
	import { Icon, WeatherIcon } from '#lib/ui/index.ts';
	import { formatTemp, PERIOD_LABEL, WET_CHANCE } from '#lib/weather.ts';

	/** The numbers behind a reading: rain, wind, UV and the time-of-day strip (forecasts only). */
	let { w, unit }: { w: WeatherResponse; unit: TempUnit } = $props();

	const wetShare = (share: number | null) => (share === null ? '—' : `${Math.round(share * 10)} in 10`);
</script>

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
			{@const wet = (p.rain_chance ?? 0) >= WET_CHANCE}
			<div class="wxh {wet ? 'wet' : ''}" role="listitem">
				{PERIOD_LABEL[p.name]}
				<Icon name={wet ? 'wx-rain' : 'wx-cloudy'} class={wet ? 'wx-rainy' : 'wx-cloudy'} />
				<b>{formatTemp(p.temp_c, unit)}</b>
				{#if p.rain_chance !== null}{p.rain_chance}%{/if}
			</div>
		{/each}
	</div>
{/if}
