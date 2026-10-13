<script lang="ts">
	import { dayDate, formatDayShort } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import { Button, Dialog, Icon, type IconName } from '#lib/ui/index.ts';

	let { itinerary, open, onclose }: { itinerary: ItineraryState; open: boolean; onclose: () => void } = $props();

	type Choice = 'end' | 'insert' | 'duplicate';
	let choice = $state<Choice>('end');
	$effect(() => {
		if (open) choice = 'end';
	});

	const days = $derived(itinerary.days);
	const active = $derived(itinerary.activeDay);
	const activeIndex = $derived(active ? itinerary.dayIndex(active.id) : -1);
	const nextN = $derived(days.length + 1);
	const nextDate = $derived(dayDate(itinerary.startDate, days.length));

	interface Option {
		value: Choice;
		icon: IconName;
		title: string;
		detail: string;
	}
	const options = $derived.by<Option[]>(() => {
		const list: Option[] = [
			{
				value: 'end',
				icon: 'plus',
				title: `Day ${nextN}${nextDate ? ` · ${formatDayShort(nextDate)}` : ''}`,
				detail: 'After your last day.'
			}
		];
		if (active && activeIndex < days.length - 1) {
			list.push({
				value: 'insert',
				icon: 'insert',
				title: `Insert after Day ${activeIndex + 1}`,
				detail: `Later days move back by one${itinerary.startDate ? ' and their dates shift' : ''}.`
			});
		}
		if (active && active.stops.length > 0) {
			list.push({
				value: 'duplicate',
				icon: 'copy',
				title: `Duplicate Day ${activeIndex + 1}`,
				detail: `Copy its ${active.stops.length} ${active.stops.length === 1 ? 'stop' : 'stops'} to a new day, then adjust.`
			});
		}
		return list;
	});

	function add() {
		if (choice === 'insert' && active) itinerary.addDay({ afterId: active.id });
		else if (choice === 'duplicate' && active) itinerary.duplicateDayOf(active.id);
		else itinerary.addDay();
		onclose();
	}
</script>

<Dialog {open} {onclose} title="Add a day" description={itinerary.startDate ? 'Choose where the new day goes.' : 'Choose where the new day goes. You can add dates later.'}>
	<div role="radiogroup" aria-label="Where to add the day" style="display: contents">
		{#each options as o (o.value)}
			<button type="button" class="opt" role="radio" aria-checked={choice === o.value} onclick={() => (choice = o.value)}>
				<span class="ic"><Icon name={o.icon} /></span>
				<span class="ot"><b>{o.title}</b><span>{o.detail}</span></span>
				{#if choice === o.value}<Icon name="check" />{/if}
			</button>
		{/each}
	</div>
	{#snippet footer()}
		<Button variant="secondary" onclick={onclose}>Cancel</Button>
		<Button icon="plus" onclick={add}>Add day</Button>
	{/snippet}
</Dialog>
