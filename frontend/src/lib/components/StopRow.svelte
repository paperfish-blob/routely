<script lang="ts">
	import type { ClusterStyle } from '#lib/clusters.ts';
	import { dayCaption, dayClass } from '#lib/days.ts';
	import { placeSubtitle } from '#lib/format.ts';
	import type { ItineraryState } from '#lib/state/itinerary.svelte.ts';
	import type { Stop } from '#lib/types.ts';
	import { Badge, ClusterTag, Icon, IconButton, Menu, MenuHeading, MenuItem } from '#lib/ui/index.ts';

	interface Props {
		stop: Stop;
		index: number;
		cluster: ClusterStyle;
		selected?: boolean;
		itinerary: ItineraryState;
		onselect: () => void;
		onkeymove: (e: KeyboardEvent) => void;
	}

	let { stop, index, cluster, selected = false, itinerary, onselect, onkeymove }: Props = $props();

	const dayId = $derived(itinerary.dayOfStop(stop.id)?.id ?? '');
	let open = $state(false);
	let trigger = $state<HTMLElement | null>(null);

	const act = (fn: () => void) => () => {
		open = false;
		fn();
	};

	function moveToNewDay() {
		const day = itinerary.addDay({ afterId: dayId, activate: false });
		itinerary.moveStop(stop.id, day.id);
	}
</script>

<div class="stop {selected ? 'sel' : ''} {!selected && itinerary.areaStopIds.has(stop.id) ? `areahl ${cluster.colorClass}` : ''}" data-id={stop.id} data-name={selected ? 'StopRow/Selected' : 'StopRow/Default'}>
	<button class="grip" aria-label="Reorder {stop.name}. Use arrow keys or drag." onkeydown={onkeymove}>
		<Icon name="grip" />
	</button>
	<Badge n={index + 1} {cluster} />
	<button class="txt" aria-pressed={selected} onclick={onselect}>
		<span class="nm">{stop.name}</span>
		<span class="sb">{placeSubtitle(stop.address, stop.name)}</span>
	</button>
	<ClusterTag {cluster} />
	<span bind:this={trigger} style="display: inline-flex">
		<IconButton
			label="More options for {stop.name}"
			icon="more"
			aria-haspopup="menu"
			aria-expanded={open}
			class={open ? 'hov' : ''}
			onclick={() => (open = !open)}
		/>
	</span>
	<Menu {open} onclose={() => (open = false)} label="{stop.name} options" anchor={trigger}>
		<MenuHeading>MOVE {stop.name.toUpperCase()} TO</MenuHeading>
		{#each itinerary.days as day, i (day.id)}
			<MenuItem
				selected={day.id === dayId}
				disabled={day.id === dayId || day.stops.length >= itinerary.maxStops}
				hint={`${day.stops.length} ${day.stops.length === 1 ? 'stop' : 'stops'}`}
				onclick={act(() => itinerary.moveStop(stop.id, day.id))}
			>
				<span class="dtag {dayClass(i)}">D{i + 1}</span>
				Day {i + 1} · {dayCaption(itinerary.startDate, i, day.stops.length)}
			</MenuItem>
		{/each}
		<MenuItem icon="insert" onclick={act(moveToNewDay)}>New day after {itinerary.dayLabel(dayId)}</MenuItem>
		{#if itinerary.multiDay}
			<div class="msep"></div>
			<MenuHeading>ALSO VISIT ON</MenuHeading>
			{#each itinerary.days as day, i (day.id)}
				{#if day.id !== dayId}
					<MenuItem
						icon="copy"
						disabled={day.stops.length >= itinerary.maxStops}
						onclick={act(() => itinerary.copyStop(stop.id, day.id))}
					>
						<span class="dtag {dayClass(i)}">D{i + 1}</span>
						Day {i + 1}
					</MenuItem>
				{/if}
			{/each}
		{/if}
		<div class="msep"></div>
		<MenuItem icon="trash" danger hint="Undo available" onclick={act(() => itinerary.removeStop(stop.id))}>Remove from trip</MenuItem>
	</Menu>
</div>
