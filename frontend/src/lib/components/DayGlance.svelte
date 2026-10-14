<script lang="ts">
	import type { Day } from '#lib/types.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Icon, Skeleton, WeatherIcon } from '#lib/ui/index.ts';
	import { formatTemp, glance } from '#lib/weather.ts';

	/** One-line weather for a day tab or chip: icon and temperatures. Nothing for days with no stops. */
	let { itinerary, day, short = false }: { itinerary: ItineraryState; day: Day; short?: boolean } = $props();

	const wx = $derived(itinerary.dayWeather(day));
	const g = $derived(glance(wx.readings));
	const unit = $derived(itinerary.tempUnit);
</script>

{#if wx.kind === 'ok' && g}
	<span class="wx" data-name="DayGlance" title="{g.rain !== null ? `Rain ${g.rain}%` : 'Typical weather'}">
		<WeatherIcon kind={g.icon} />{formatTemp(g.high, unit)}{#if !short}&nbsp;{formatTemp(g.low, unit)}{/if}
	</span>
{:else if wx.kind === 'loading'}
	<span class="wx" aria-label="Loading weather"><Skeleton width={short ? '34px' : '56px'} height="12px" /></span>
{:else if wx.kind === 'error'}
	<span class="wx" title="Weather unavailable"><Icon name="minus" />—</span>
{:else}
	<span class="wx" aria-hidden="true">&nbsp;</span>
{/if}
