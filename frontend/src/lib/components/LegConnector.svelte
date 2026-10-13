<script lang="ts">
	import { durationParts, formatKm } from '#lib/format.ts';
	import type { RouteMode } from '#lib/types.ts';
	import { Pill } from '#lib/ui/index.ts';

	interface Props {
		km: number;
		seconds: number | null;
		/** Straight-line estimate (shown as "≈ 9.4 km"). */
		approx: boolean;
		mode: RouteMode;
	}

	let { km, seconds, approx, mode }: Props = $props();

	const icon = $derived(approx || mode === 'straight' ? 'line' : mode === 'walking' ? 'walk' : 'car');
	const label = $derived.by(() => {
		const distance = `${approx ? '≈ ' : ''}${formatKm(km)}`;
		if (seconds === null) return distance;
		const t = durationParts(seconds);
		return `${distance} · ${t.main}${t.unit ? ` ${t.unit}` : ''}`;
	});
</script>

<div class="leg" data-name="LegConnector">
	<Pill {icon}>{label}</Pill>
</div>
