<script lang="ts">
	import type { WeatherResponse } from '#lib/types.ts';
	import { Icon } from '#lib/ui/index.ts';
	import { ago, sourceLabel } from '#lib/weather.ts';

	/** Where a reading comes from (forecast, typical or recorded) with the required Open-Meteo credit. */
	let { w }: { w: WeatherResponse } = $props();
</script>

<div class="wxsrc">
	<span class="wxchip {w.source === 'typical' ? 'typ' : w.source === 'recorded' ? 'rec' : ''}">
		<Icon name={w.source === 'forecast' ? 'clock' : w.source === 'typical' ? 'refresh' : 'check'} />{sourceLabel(w.source)}
	</span>
	<span>
		{#if w.source === 'forecast'}Updated {ago(w.fetched_at)}{:else if w.source === 'typical'}Average of the last {w.years} years{:else}Observed data{/if}
		· <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>
	</span>
</div>
