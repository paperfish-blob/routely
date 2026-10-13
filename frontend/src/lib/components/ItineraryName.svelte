<script lang="ts">
	import { Icon } from '#lib/ui/index.ts';

	let { value, onchange }: { value: string; onchange: (value: string) => void } = $props();
</script>

<label class="trip" data-name="ItineraryName">
	<span class="sr">Itinerary name</span>
	<input
		{value}
		placeholder="Untitled itinerary"
		maxlength="80"
		oninput={(e) => onchange(e.currentTarget.value)}
		onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
	/>
	<Icon name="pencil" />
</label>
