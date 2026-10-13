<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		/** Accessible name of the menu. */
		label: string;
		/** Place the menu next to this element (fixed, so scrolling lists can't clip it). */
		anchor?: HTMLElement | null;
		/** Extra inline positioning when there is no anchor; the parent must be position: relative. */
		style?: string;
		class?: string;
		children: Snippet;
	}

	let { open, onclose, label, anchor = null, style = '', class: className = '', children }: Props = $props();

	let el = $state<HTMLDivElement>();
	let pos = $state<string>('');

	/** Right-align under the anchor; flip above it when there is no room below. */
	function place() {
		if (!anchor || !el) return;
		const r = anchor.getBoundingClientRect();
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		const gap = 6;
		const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
		let top = r.bottom + gap;
		if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - gap);
		pos = `left: ${left}px; top: ${top}px`;
	}

	const items = () =>
		Array.from(el?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);

	$effect(() => {
		if (!open) return;
		place();
		items()[0]?.focus();
		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		// Attach after the opening click has finished propagating, or it would close us at once.
		const t = setTimeout(() => {
			document.addEventListener('pointerdown', onOutside, true);
		}, 0);
		return () => {
			clearTimeout(t);
			document.removeEventListener('pointerdown', onOutside, true);
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
		};
	});

	function onOutside(e: Event) {
		if (el && !el.contains(e.target as Node)) onclose();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
			return;
		}
		const list = items();
		const i = list.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus();
		else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
		else if (e.key === 'Home') list[0]?.focus();
		else if (e.key === 'End') list[list.length - 1]?.focus();
		else if (e.key === 'Tab') onclose();
		else return;
		if (e.key !== 'Tab') e.preventDefault();
	}
</script>

{#if open}
	<div
		bind:this={el}
		class="menu {anchor ? 'fixed' : ''} {className}"
		role="menu"
		aria-label={label}
		tabindex="-1"
		style={anchor ? pos : style}
		{onkeydown}
	>
		{@render children()}
	</div>
{/if}
