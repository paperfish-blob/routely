<script lang="ts">
	import { dayClass } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import type { SidebarState } from '#lib/state/sidebar.svelte.ts';
	import { Icon, IconButton } from '#lib/ui/index.ts';

	/** The collapsed sidebar: logo, a tag per day (jumps to that day) and a button to expand. */
	let { itinerary, sidebar }: { itinerary: ItineraryState; sidebar: SidebarState } = $props();

	function openDay(id: string) {
		itinerary.setActive(id);
		sidebar.expand();
	}
</script>

<aside class="side rail" aria-label="Itinerary (collapsed)" data-name="SidebarRail">
	<span class="brand-mark" aria-hidden="true"><Icon name="route-mark" /></span>
	{#if itinerary.multiDay}
		<div class="rail-days">
			{#each itinerary.days as day, i (day.id)}
				<button class="dtag {dayClass(i)} {day.id === itinerary.activeId ? 'on' : ''}" aria-label="Open Day {i + 1}" aria-pressed={day.id === itinerary.activeId} onclick={() => openDay(day.id)}>
					D{i + 1}
				</button>
			{/each}
		</div>
	{/if}
	<IconButton label="Show sidebar ([)" icon="chevron-right" onclick={() => sidebar.expand()} />
</aside>
