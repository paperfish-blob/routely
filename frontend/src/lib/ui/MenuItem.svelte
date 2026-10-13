<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	interface Props extends Omit<HTMLButtonAttributes, 'class' | 'role'> {
		icon?: IconName;
		/** Right-aligned secondary text. */
		hint?: string;
		danger?: boolean;
		/** Marks the current choice in a radio-style list. */
		selected?: boolean;
		/** Renders a switch; the item acts as a checkbox. */
		checked?: boolean;
		children: Snippet;
	}

	let { icon, hint, danger = false, selected, checked, type = 'button', children, ...rest }: Props = $props();

	const role = $derived(checked !== undefined ? 'menuitemcheckbox' : selected !== undefined ? 'menuitemradio' : 'menuitem');
</script>

<button
	{type}
	{role}
	class="mi {danger ? 'danger' : ''} {selected ? 'on' : ''}"
	aria-checked={checked ?? selected}
	{...rest}
>
	{#if icon}<Icon name={icon} />{/if}
	{@render children()}
	{#if hint}<span class="kb num">{hint}</span>{/if}
	{#if checked !== undefined}<span class="sw" aria-hidden="true"></span>{/if}
	{#if selected}<Icon name="check" class="" />{/if}
</button>
