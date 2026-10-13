<script lang="ts" module>
	export interface AddTarget {
		/** The day new stops go to. */
		current: { id: string; label: string; dayClass: string };
		options: { id: string; label: string; caption: string; dayClass: string; tag: string }[];
		onpick: (id: string) => void;
	}
</script>

<script lang="ts">
	import { api, ApiError } from '#lib/api.ts';
	import { placeSubtitle } from '#lib/format.ts';
	import type { GeocodeCandidate } from '#lib/types.ts';
	import { Banner, Button, Field, Icon, IconButton, Menu, MenuHeading, MenuItem, Skeleton } from '#lib/ui/index.ts';

	interface Props {
		onselect: (candidate: GeocodeCandidate) => void;
		/** 'side' is the desktop sidebar field; 'float' is the mobile floating bar. */
		variant?: 'side' | 'float';
		disabled?: boolean;
		placeholder?: string;
		onfocus?: () => void;
		/** Focus the input when mounted (empty state). */
		autofocus?: boolean;
		/** Where the trip is: matches near this point are suggested first. */
		near?: { lat: number; lng: number } | null;
		/** Label of the hover button on each suggestion ("Add stop" when adding stops, "Choose" when picking a place). */
		actionLabel?: string;
		/** Which day a new stop goes to, with a picker (shown only for multi-day trips). */
		target?: AddTarget | null;
	}

	let {
		onselect,
		variant = 'side',
		disabled = false,
		placeholder = variant === 'float' ? 'Search places to add' : 'Search a city, landmark or address',
		onfocus,
		autofocus = false,
		near = null,
		target = null,
		actionLabel = 'Add stop'
	}: Props = $props();

	const MIN_CHARS = 3;
	const DEBOUNCE_MS = 400;
	let pickOpen = $state(false);
	let pickTrigger = $state<HTMLElement | null>(null);
	const NO_RESULTS = 'No places found. Try a different name.';

	let query = $state('');
	let inputEl = $state<HTMLInputElement>();
	let results = $state<GeocodeCandidate[]>([]);
	let loading = $state(false);
	let searched = $state(false);
	let rateLimited = $state(false);
	let failure = $state<string | null>(null);
	let open = $state(false);
	let active = $state(0);

	$effect(() => {
		const q = query.trim();
		if (q.length < MIN_CHARS) {
			results = [];
			loading = false;
			searched = false;
			failure = null;
			rateLimited = false;
			return;
		}
		const hint = near ? { lat: near.lat, lng: near.lng } : null;
		loading = true;
		failure = null;
		rateLimited = false;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				results = await api.geocode(q, hint, controller.signal);
				active = 0;
				searched = true;
				open = true;
			} catch (err) {
				if (controller.signal.aborted) return;
				results = [];
				searched = false;
				if (err instanceof ApiError && err.code === 'rate_limited') rateLimited = true;
				else failure = err instanceof ApiError ? err.message : 'Search failed';
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	$effect(() => {
		if (autofocus) inputEl?.focus();
	});

	const noResults = $derived(searched && !loading && results.length === 0);
	const showList = $derived(open && !disabled && query.trim().length >= MIN_CHARS && (loading || results.length > 0));
	const help = $derived(
		disabled
			? 'Stop limit reached. Remove a stop to add another.'
			: noResults
				? NO_RESULTS
				: failure
					? failure
					: undefined
	);

	function choose(candidate: GeocodeCandidate) {
		onselect(candidate);
		query = '';
		open = false;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
		else if (e.key === 'ArrowDown' && results.length) {
			e.preventDefault();
			open = true;
			active = (active + 1) % results.length;
		} else if (e.key === 'ArrowUp' && results.length) {
			e.preventDefault();
			active = (active - 1 + results.length) % results.length;
		} else if (e.key === 'Enter' && showList && results[active]) {
			e.preventDefault();
			choose(results[active]);
		}
	}

	/** Splits a title into [before, match, after] around the first case-insensitive query hit. */
	function split(title: string): [string, string, string] {
		const q = query.trim();
		const i = q ? title.toLowerCase().indexOf(q.toLowerCase()) : -1;
		return i < 0 ? [title, '', ''] : [title.slice(0, i), title.slice(i, i + q.length), title.slice(i + q.length)];
	}
	const titleOf = (c: GeocodeCandidate) => c.display_name.split(',')[0]?.trim() || c.display_name;
</script>

{#snippet addToChip()}
		{#if target}
			<span bind:this={pickTrigger} style="display: inline-flex">
				<button
					type="button"
					class="addto {target.current.dayClass}"
					aria-haspopup="menu"
					aria-expanded={pickOpen}
					aria-label="Adding to {target.current.label}. Change day"
					onclick={() => (pickOpen = !pickOpen)}
				>
					<span class="dtag">{target.options.find((o) => o.id === target.current.id)?.tag}</span>{target.current.label}<Icon name="chevron-down" />
				</button>
			</span>
			<Menu open={pickOpen} onclose={() => (pickOpen = false)} label="Add new stops to" anchor={pickTrigger}>
				<MenuHeading>ADD NEW STOPS TO</MenuHeading>
				{#each target.options as o (o.id)}
					<MenuItem selected={o.id === target.current.id} onclick={() => { pickOpen = false; target.onpick(o.id); }}>
						<span class="dtag {o.dayClass}">{o.tag}</span>{o.label} · {o.caption}
					</MenuItem>
				{/each}
			</Menu>
		{/if}
	{/snippet}

<div class="search" data-name="SearchBox">
	{#if variant === 'float'}
		<div class="m-search" data-name="FloatingSearch">
			<Icon name="search" />
			<label class="sr" for="m-search-input">Search for a place to add</label>
			<input
				id="m-search-input"
				type="search"
				autocomplete="off"
				{placeholder}
				{disabled}
				bind:value={query}
				bind:this={inputEl}
				onfocus={() => {
					open = true;
					onfocus?.();
				}}
				onblur={() => (open = false)}
				{onkeydown}
				role="combobox"
				aria-expanded={showList}
				aria-controls="search-results"
				aria-autocomplete="list"
			/>
			{#if query}
				<IconButton label="Clear search" icon="close" onclick={() => { query = ''; inputEl?.focus(); }} />
			{/if}
			{@render addToChip()}
		</div>
		{#if help}
			<div class="map-banner"><Banner variant={noResults ? 'warn' : 'err'}>{help}</Banner></div>
		{/if}
	{:else}
		<Field
			label="Search for a place"
			type="search"
			autocomplete="off"
			{placeholder}
			{disabled}
			bind:value={query}
			bind:inputEl
			error={noResults || failure !== null}
			help={help}
			role="combobox"
			aria-expanded={showList}
			aria-controls="search-results"
			aria-autocomplete="list"
			onfocus={() => {
				open = true;
				onfocus?.();
			}}
			onblur={() => (open = false)}
			{onkeydown}
		>
			{#snippet trailing()}{@render addToChip()}{/snippet}
		</Field>
	{/if}

	{#if rateLimited}
		<div style="margin-top: var(--sp-10)">
			<Banner variant="warn" icon="clock">Too many searches, try again in a moment.</Banner>
		</div>
	{/if}

	{#if showList}
		<div class="dd" id="search-results" role="listbox" aria-label="Place suggestions">
			{#if loading}
				<div role="status" aria-label="Searching" style="display: flex; flex-direction: column; gap: var(--sp-10); padding: var(--sp-8)">
					{#each [0, 1, 2] as n (n)}
						<div style="display: flex; align-items: center; gap: var(--sp-12)">
							<Skeleton width="32px" height="32px" radius="var(--r-lg)" />
							<div style="flex: 1; display: flex; flex-direction: column; gap: var(--sp-6)">
								<Skeleton width="{60 - n * 8}%" height="12px" />
								<Skeleton width="{40 - n * 4}%" height="10px" />
							</div>
						</div>
					{/each}
				</div>
			{:else}
				{#each results as r, i (r.display_name + i)}
					{@const title = titleOf(r)}
					{@const [pre, hit, post] = split(title)}
					<div
						class="sugg {i === active ? 'hov' : ''}"
						role="option"
						tabindex="-1"
						aria-selected={i === active}
						onpointerdown={(e) => {
							e.preventDefault(); // keep input focus so blur doesn't close the list first
							choose(r);
						}}
						onpointerenter={() => (active = i)}
					>
						<span class="pin"><Icon name="pin" /></span>
						<span class="tx">
							<span class="t">{pre}{#if hit}<span class="hit">{hit}</span>{/if}{post}</span>
							<span class="s">{placeSubtitle(r.display_name, title)}</span>
						</span>
						<Button size="sm" class="add" icon="plus" tabindex={-1} aria-label="{actionLabel} {title}">{actionLabel}</Button>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>
