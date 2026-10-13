<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '#lib/ui/index.ts';

	let {
		search,
		examples,
		ontry
	}: { search: Snippet; examples: string[]; ontry: (query: string) => void } = $props();
</script>

<div class="empty" data-name="EmptyState">
	<svg width="260" height="170" viewBox="0 0 260 170" role="img" aria-label="Illustration of a folded map with a dotted route between three pins" style="margin-top: var(--sp-18)">
		<ellipse cx="130" cy="152" rx="96" ry="10" style="fill: var(--primary-soft)" />
		<path d="M40 40L100 28V128L40 140Z" style="fill: var(--primary-soft); stroke: var(--line); stroke-width: 2" stroke-linejoin="round" />
		<path d="M100 28L160 44V144L100 128Z" style="fill: var(--surface-2); stroke: var(--line); stroke-width: 2" stroke-linejoin="round" />
		<path d="M160 44L220 30V130L160 144Z" style="fill: var(--primary-soft); stroke: var(--line); stroke-width: 2" stroke-linejoin="round" />
		<path d="M52 70C70 78 84 62 100 70" style="stroke: var(--grab); stroke-width: 3; fill: none" stroke-linecap="round" />
		<path d="M110 110C128 100 140 114 156 104" style="stroke: var(--grab); stroke-width: 3; fill: none" stroke-linecap="round" />
		<path d="M172 78C190 70 204 82 214 72" style="stroke: var(--grab); stroke-width: 3; fill: none" stroke-linecap="round" />
		<path d="M62 112C90 70 120 112 142 82S188 62 200 52" style="stroke: var(--primary); stroke-width: 4; fill: none" stroke-dasharray="1 9" stroke-linecap="round" />
		<circle cx="62" cy="112" r="11" style="fill: var(--cA); stroke: var(--surface); stroke-width: 3" />
		<circle cx="142" cy="82" r="11" style="fill: var(--accent); stroke: var(--surface); stroke-width: 3" />
		<circle cx="200" cy="52" r="11" style="fill: var(--cB); stroke: var(--surface); stroke-width: 3" />
	</svg>
	<h1>Where are you headed?</h1>
	<p>Add your first stop to see it on the map, then keep adding to build the route.</p>
	<div style="width: 100%; margin-top: var(--sp-12); text-align: left">{@render search()}</div>
	<div class="exchips" data-name="ExampleChips">
		<span style="font-size: var(--fs-small); font-weight: var(--fw-bold); color: var(--ink-2)">Try:</span>
		{#each examples as place (place)}
			<button type="button" class="exchip" onclick={() => ontry(place)}>
				<Icon name="pin" />{place}
			</button>
		{/each}
	</div>
</div>
