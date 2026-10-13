<script lang="ts" module>
	import type { IconName } from './icons.ts';

	export interface SegmentOption<V extends string = string> {
		value: V;
		label: string;
		icon?: IconName;
		/** Shown but not selectable (e.g. Driving while routing is down). */
		disabled?: boolean;
	}
</script>

<script lang="ts" generics="T extends string">
	import Icon from './Icon.svelte';

	interface Props {
		options: SegmentOption<T>[];
		value: T;
		onchange: (value: T) => void;
		/** Accessible name of the radio group. */
		label: string;
		size?: 'md' | 'lg' | 'sm';
		class?: string;
	}

	let { options, value, onchange, label, size = 'md', class: className = '' }: Props = $props();

	function step(from: number, delta: number, buttons: HTMLElement) {
		for (let i = 1; i <= options.length; i++) {
			const next = (from + delta * i + options.length * i) % options.length;
			if (!options[next].disabled) {
				onchange(options[next].value);
				queueMicrotask(() =>
					buttons.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus()
				);
				return;
			}
		}
	}

	function onkeydown(e: KeyboardEvent, index: number) {
		const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
		if (!delta) return;
		e.preventDefault();
		step(index, delta, (e.currentTarget as HTMLElement).parentElement!);
	}
</script>

<div class="seg {size === 'lg' ? 'lg' : ''} {size === 'sm' ? 'sm' : ''} {className}" role="radiogroup" aria-label={label}>
	{#each options as option, i (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={option.value === value}
			aria-disabled={option.disabled || undefined}
			tabindex={option.value === value ? 0 : -1}
			style={option.disabled ? 'opacity: 0.55; cursor: not-allowed' : undefined}
			onclick={() => !option.disabled && onchange(option.value)}
			onkeydown={(e) => onkeydown(e, i)}
		>
			{#if option.icon}<Icon name={option.icon} />{/if}
			{option.label}
		</button>
	{/each}
</div>
