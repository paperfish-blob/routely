<script lang="ts">
	import { iconName, tone } from '#lib/weather.ts';
	import type { WeatherIconKind } from '#lib/types.ts';
	import Icon from './Icon.svelte';

	/** A weather glyph, coloured by what it means (sunny, wet, grey). */
	let { kind, size = 'md', class: className = '' }: { kind: WeatherIconKind; size?: 'sm' | 'md'; class?: string } = $props();
</script>

<Icon name={iconName(kind)} {size} class="wx-{tone(kind)} {className}" />
