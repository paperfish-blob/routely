<script lang="ts">
	import { formatTripRange, isIsoDate } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Button, Dialog } from '#lib/ui/index.ts';

	let { itinerary, open, onclose }: { itinerary: ItineraryState; open: boolean; onclose: () => void } = $props();

	let value = $state('');
	$effect(() => {
		if (open) value = itinerary.startDate ?? '';
	});

	const valid = $derived(value === '' || isIsoDate(value));
	const preview = $derived(value && isIsoDate(value) ? formatTripRange(value, itinerary.days.length) : null);

	function save() {
		if (!valid) return;
		itinerary.setStartDate(value || null);
		onclose();
	}
</script>

<Dialog {open} {onclose} title="Trip dates" description="Set when Day 1 is. Every later day follows from it. Dates are optional.">
	<label class="sr" for="trip-start">First day</label>
	<input
		id="trip-start"
		class="dlg-field"
		type="date"
		bind:value
		onkeydown={(e) => e.key === 'Enter' && save()}
	/>
	{#if preview}
		<span class="lbl num">{itinerary.days.length} {itinerary.days.length === 1 ? 'DAY' : 'DAYS'} · {preview.toUpperCase()}</span>
	{/if}
	{#snippet footer()}
		<Button variant="secondary" onclick={() => { itinerary.setStartDate(null); onclose(); }} disabled={!itinerary.startDate}>Remove dates</Button>
		<Button onclick={save} disabled={!valid}>Save</Button>
	{/snippet}
</Dialog>
