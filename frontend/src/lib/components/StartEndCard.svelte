<script lang="ts">
	import { stopFromCandidate } from '#lib/format.ts';
	import { resolveEnds } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import type { EndPoint, GeocodeCandidate, StartPoint, Stop } from '#lib/types.ts';
	import { Button, Icon, type IconName } from '#lib/ui/index.ts';
	import SearchBox from './SearchBox.svelte';

	interface Props {
		itinerary: ItineraryState;
		dayId: string;
		focus?: 'start' | 'end';
		onclose: () => void;
		/** Inside a dialog: no card chrome. */
		embedded?: boolean;
	}

	let { itinerary, dayId, focus = 'start', onclose, embedded = false }: Props = $props();

	const day = $derived(itinerary.days.find((d) => d.id === dayId));
	const index = $derived(itinerary.dayIndex(dayId));
	const prev = $derived(itinerary.days[index - 1]);
	const prevEnd = $derived(prev ? itinerary.endsOf(prev).end : null);

	// Draft state: nothing changes until Done.
	type StartKind = StartPoint['kind'];
	type EndKind = EndPoint['kind'];
	let startKind = $state<StartKind>('none');
	let startPlace = $state<Stop | null>(null);
	let endKind = $state<EndKind>('start');
	let endPlace = $state<Stop | null>(null);

	$effect(() => {
		const d = itinerary.days.find((x) => x.id === dayId);
		if (!d) return;
		startKind = d.start.kind;
		startPlace = d.start.kind === 'place' ? d.start.place : null;
		endKind = d.end.kind;
		endPlace = d.end.kind === 'place' ? d.end.place : null;
	});

	/** The start this draft would resolve to (the end can only loop back to a start that exists). */
	const draftStart = $derived<Stop | null>(startKind === 'place' ? startPlace : startKind === 'chain' ? prevEnd : null);
	const canDone = $derived((startKind !== 'place' || !!startPlace) && (endKind !== 'place' || !!endPlace));
	const near = $derived.by(() => {
		const p = draftStart ?? day?.stops.at(-1) ?? itinerary.allStops.at(-1);
		return p ? { lat: p.lat, lng: p.lng } : null;
	});
	const choosingStart = $derived(startKind === 'place');
	const choosingEnd = $derived(endKind === 'place');

	function done() {
		if (!day || !canDone) return;
		itinerary.setStart(dayId, startKind === 'place' && startPlace ? { kind: 'place', place: startPlace } : { kind: startKind } as StartPoint);
		itinerary.setEnd(dayId, endKind === 'place' && endPlace ? { kind: 'place', place: endPlace } : { kind: endKind } as EndPoint);
		onclose();
	}

	const pick = (set: (s: Stop) => void) => (c: GeocodeCandidate) => set(stopFromCandidate(c));
</script>

{#snippet option(selected: boolean, icon: IconName, title: string, sub: string, onclick: () => void, disabled = false)}
	<button type="button" class="opt sm" role="radio" aria-checked={selected} {disabled} onclick={onclick}>
		<span class="ic"><Icon name={icon} /></span>
		<span class="ot"><b>{title}</b><span>{sub}</span></span>
		{#if selected}<Icon name="check" />{/if}
	</button>
{/snippet}

{#if day}
	<section class="secard {embedded ? 'embedded' : ''}" aria-label="Start and end of Day {index + 1}" data-name="StartEndEditor">
		<div class="grp" role="radiogroup" aria-label="Where Day {index + 1} starts">
			<span class="lbl"><Icon name="home" size="sm" />DAY {index + 1} STARTS</span>
			{#if prev}
				{@render option(startKind === 'chain', 'link', `Where Day ${index} ended`, prevEnd?.name ?? 'Not set yet', () => (startKind = 'chain'))}
			{/if}
			{@render option(startKind === 'place', 'pin', 'Somewhere else', startPlace?.name ?? 'For example an airport or a hotel', () => (startKind = 'place'))}
			{#if choosingStart}
				<SearchBox autofocus={focus === 'start'} {near} actionLabel="Choose" placeholder="Search for a start point" onselect={pick((s) => (startPlace = s))} />
			{/if}
			{@render option(startKind === 'none', 'ban', 'No start point', 'Begin at the first stop', () => (startKind = 'none'))}
		</div>

		<div class="grp" role="radiogroup" aria-label="Where Day {index + 1} ends">
			<span class="lbl"><Icon name="flag" size="sm" />DAY {index + 1} ENDS</span>
			{@render option(endKind === 'start', 'loop', 'Back at the start', draftStart?.name ?? 'Set a start first', () => (endKind = 'start'), !draftStart)}
			{@render option(endKind === 'place', 'pin', 'A different place', endPlace?.name ?? 'Sleep somewhere new, or fly out', () => (endKind = 'place'))}
			{#if choosingEnd}
				<SearchBox autofocus={focus === 'end'} {near} actionLabel="Choose" placeholder="Search for an end point" onselect={pick((s) => (endPlace = s))} />
			{/if}
			{@render option(endKind === 'open', 'ban', 'No fixed end', 'Finish at the last stop', () => (endKind = 'open'))}
		</div>

		<div style="display: flex; gap: var(--sp-8)">
			<Button variant="secondary" size="sm" style="flex: 1" onclick={onclose}>Cancel</Button>
			<Button size="sm" style="flex: 1" disabled={!canDone} onclick={done}>Done</Button>
		</div>
	</section>
{/if}
