<script lang="ts">
	import { placeIcon } from '#lib/days.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import type { Day } from '#lib/types.ts';
	import { Button, Icon, IconButton, Menu, MenuHeading, MenuItem } from '#lib/ui/index.ts';

	interface Props {
		itinerary: ItineraryState;
		day: Day;
		/** 'start' is where the day begins; 'end' is where it finishes. */
		position: 'start' | 'end';
	}

	let { itinerary, day, position }: Props = $props();

	const index = $derived(itinerary.dayIndex(day.id));
	const ends = $derived(itinerary.endsOf(day));
	const prev = $derived(itinerary.days[index - 1]);
	const next = $derived(itinerary.days[index + 1]);
	const prevEnd = $derived(prev ? itinerary.endsOf(prev).end : null);
	const linked = $derived(itinerary.nextChainsFrom(day.id));
	const loop = $derived(day.end.kind === 'start');
	/** A start/end that differs from the other gets its own label; a loop is one place under two rows. */
	const startName = $derived(ends.start?.name ?? '');

	let open = $state(false);
	let trigger = $state<HTMLElement | null>(null);
	const act = (fn: () => void) => () => {
		open = false;
		fn();
	};
</script>

{#snippet kebab(label: string)}
	<span bind:this={trigger} style="display: inline-flex">
		<IconButton {label} icon="more" aria-haspopup="menu" aria-expanded={open} class={open ? 'hov' : ''} onclick={() => (open = !open)} />
	</span>
{/snippet}

{#if position === 'start'}
	{#if ends.start}
		<div class="stop base" data-name="EndpointRow/Start">
			<span class="base-ico"><Icon name={placeIcon(ends.start.name, 'home')} /></span>
			<div class="txt">
				<span class="cap">{loop ? 'START & END' : 'START'}</span>
				<span class="nm" style="font-size: var(--fs-body)">{ends.start.name}</span>
			</div>
			{#if day.start.kind === 'chain' && prev}
				<span class="linkchip" title="Starts where Day {index} ended"><Icon name="link" />from Day {index}</span>
			{/if}
			{@render kebab('Start point options')}
			<Menu {open} onclose={() => (open = false)} label="Start point options" anchor={trigger}>
				<MenuHeading>DAY {index + 1} STARTS…</MenuHeading>
				{#if prev}
					<MenuItem icon="link" selected={day.start.kind === 'chain'} hint={prevEnd?.name ?? 'Not set'} onclick={act(() => itinerary.setStart(day.id, { kind: 'chain' }))}>
						Where Day {index} ended
					</MenuItem>
				{/if}
				<MenuItem icon="pin" selected={day.start.kind === 'place'} onclick={act(() => itinerary.openEndsEditor(day.id, 'start'))}>
					{day.start.kind === 'place' ? 'Another place…' : 'Somewhere else…'}
				</MenuItem>
				<MenuItem icon="ban" selected={day.start.kind === 'none'} onclick={act(() => itinerary.setStart(day.id, { kind: 'none' }))}>No start point</MenuItem>
				<div class="msep"></div>
				<MenuItem icon="home" onclick={act(() => itinerary.openEndsEditor(day.id, 'start'))}>Edit start &amp; end…</MenuItem>
			</Menu>
		</div>
	{:else}
		<div class="stop base unset" data-name="EndpointRow/Unset">
			<span class="base-ico"><Icon name="home" /></span>
			<div class="txt">
				<span class="cap">START &amp; END</span>
				<span class="nm" style="font-size: var(--fs-small-2)">Where does Day {index + 1} begin?</span>
			</div>
			<Button size="sm" variant="secondary" onclick={() => itinerary.openEndsEditor(day.id, 'start')}>Set start</Button>
		</div>
	{/if}
{:else if day.end.kind === 'open'}
	<div class="stop base open" data-name="EndpointRow/Open">
		<span class="base-ico" style="background: var(--ink-3)"><Icon name="ban" /></span>
		<div class="txt">
			<span class="cap">END</span>
			<span class="nm" style="font-size: var(--fs-small-2)">No fixed end · finishes at the last stop</span>
		</div>
		{@render kebab('End point options')}
		{@render endMenu()}
	</div>
{:else if ends.end}
	<div class="stop base" data-name={loop ? 'EndpointRow/BackAtStart' : 'EndpointRow/End'}>
		<span class="base-ico {loop ? '' : 'end'}"><Icon name={placeIcon(ends.end.name, loop ? 'home' : 'flag')} /></span>
		<div class="txt">
			<span class="cap">{loop ? 'BACK AT' : 'END'}</span>
			<span class="nm" style="font-size: var(--fs-body)">{ends.end.name}</span>
		</div>
		{#if linked}
			<span class="linkchip" title="Day {index + 2} starts here"><Icon name="link" />Day {index + 2} starts here</span>
		{/if}
		{@render kebab('End point options')}
		{@render endMenu()}
	</div>
{/if}

{#snippet endMenu()}
	<Menu {open} onclose={() => (open = false)} label="Where Day {index + 1} ends" anchor={trigger}>
		<MenuHeading>DAY {index + 1} ENDS…</MenuHeading>
		<MenuItem icon="loop" selected={day.end.kind === 'start'} disabled={!ends.start} hint={startName || 'Set a start first'} onclick={act(() => itinerary.setEnd(day.id, { kind: 'start' }))}>
			Back at the start
		</MenuItem>
		<MenuItem icon="pin" selected={day.end.kind === 'place'} hint={day.end.kind === 'place' ? day.end.place.name : undefined} onclick={act(() => itinerary.openEndsEditor(day.id, 'end'))}>
			{day.end.kind === 'place' ? 'Another place…' : 'A different place…'}
		</MenuItem>
		{#if next && next.start.kind === 'place'}
			<MenuItem icon="link" hint={next.start.place.name} onclick={act(() => itinerary.setEnd(day.id, { kind: 'place', place: next.start.kind === 'place' ? next.start.place : ends.end! }))}>
				Where Day {index + 2} starts
			</MenuItem>
		{/if}
		<MenuItem icon="ban" selected={day.end.kind === 'open'} hint="Finish at the last stop" onclick={act(() => itinerary.setEnd(day.id, { kind: 'open' }))}>No fixed end</MenuItem>
		<div class="msep"></div>
		<MenuItem icon="home" onclick={act(() => itinerary.openEndsEditor(day.id, 'end'))}>Edit start &amp; end…</MenuItem>
		{#if itinerary.nextChainsFrom(day.id)}
			<div class="help info" style="padding: var(--sp-6) var(--sp-10) var(--sp-8); margin: 0; align-items: flex-start; line-height: 1.4">
				<Icon name="info" size="sm" />
				<span>Day {index + 2} starts where this day ends, so changing this also moves its start.</span>
			</div>
		{/if}
	</Menu>
{/snippet}
