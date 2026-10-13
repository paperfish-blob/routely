<script lang="ts">
	import { api, ApiError } from '#lib/api.ts';
	import type { GeocodeCandidate } from '#lib/types.ts';

	interface Props {
		onselect: (candidate: GeocodeCandidate) => void;
		onfocus?: () => void;
		disabled?: boolean;
		placeholder?: string;
	}

	let { onselect, onfocus, disabled = false, placeholder = 'Search for a place…' }: Props = $props();

	const MIN_CHARS = 3;
	const DEBOUNCE_MS = 400;

	let query = $state('');
	let results = $state<GeocodeCandidate[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searched = $state(false);
	let open = $state(false);
	let active = $state(0);

	$effect(() => {
		const q = query.trim();
		if (q.length < MIN_CHARS) {
			results = [];
			loading = false;
			error = null;
			searched = false;
			return;
		}
		loading = true;
		error = null;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				results = await api.geocode(q, controller.signal);
				active = 0;
				searched = true;
				open = true;
			} catch (err) {
				if (controller.signal.aborted) return;
				results = [];
				error = err instanceof ApiError ? err.message : 'Search failed';
				open = true;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	function choose(candidate: GeocodeCandidate) {
		onselect(candidate);
		query = '';
		open = false;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		} else if (e.key === 'ArrowDown' && results.length) {
			e.preventDefault();
			open = true;
			active = (active + 1) % results.length;
		} else if (e.key === 'ArrowUp' && results.length) {
			e.preventDefault();
			active = (active - 1 + results.length) % results.length;
		} else if (e.key === 'Enter' && open && results[active]) {
			e.preventDefault();
			choose(results[active]);
		}
	}

	const showPanel = $derived(open && query.trim().length >= MIN_CHARS && !loading);
</script>

<div class="search">
	<div class="field">
		<input
			type="search"
			role="combobox"
			aria-expanded={showPanel}
			aria-controls="search-results"
			aria-autocomplete="list"
			autocomplete="off"
			{placeholder}
			{disabled}
			bind:value={query}
			onfocus={() => {
				open = true;
				onfocus?.();
			}}
			onblur={() => (open = false)}
			{onkeydown}
		/>
		{#if loading}<span class="spinner" role="status" aria-label="Searching"></span>{/if}
	</div>

	{#if disabled}
		<p class="hint">Stop limit reached. Remove a stop to add another.</p>
	{/if}

	{#if showPanel}
		<ul id="search-results" class="results" role="listbox">
			{#if error}
				<li class="state error" role="alert">{error}</li>
			{:else if searched && results.length === 0}
				<li class="state">No places found for “{query.trim()}”.</li>
			{:else}
				{#each results as r, i (r.display_name + i)}
					<li
						role="option"
						aria-selected={i === active}
						class:active={i === active}
						onpointerdown={(e) => {
							e.preventDefault(); // keep input focus so blur doesn't close first
							choose(r);
						}}
						onpointerenter={() => (active = i)}
					>
						<span class="label">{r.display_name}</span>
						<span class="add">Add stop</span>
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.search {
		position: relative;
	}
	.field {
		position: relative;
	}
	input {
		width: 100%;
		padding: 0.7rem 2.2rem 0.7rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font: inherit;
	}
	input:focus {
		outline: 2px solid var(--brand);
		outline-offset: -1px;
	}
	.spinner {
		position: absolute;
		right: 0.8rem;
		top: 50%;
		width: 1rem;
		height: 1rem;
		margin-top: -0.5rem;
		border: 2px solid var(--border);
		border-top-color: var(--brand);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.hint {
		margin: 0.4rem 0 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.results {
		position: absolute;
		z-index: 20;
		left: 0;
		right: 0;
		margin: 0.25rem 0 0;
		padding: 0.25rem;
		list-style: none;
		max-height: 18rem;
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	li[role='option'] {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.55rem 0.65rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.88rem;
	}
	li.active {
		background: var(--brand-soft);
	}
	.label {
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.add {
		flex: none;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--brand);
	}
	.state {
		padding: 0.7rem;
		font-size: 0.88rem;
		color: var(--muted);
	}
	.state.error {
		color: var(--danger);
	}
</style>
