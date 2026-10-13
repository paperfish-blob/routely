<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	interface Props extends Omit<HTMLButtonAttributes, 'class'> {
		variant?: 'primary' | 'secondary' | 'accent' | 'ghost';
		size?: 'md' | 'sm';
		icon?: IconName;
		class?: string;
		children?: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		icon,
		type = 'button',
		class: className = '',
		children,
		...rest
	}: Props = $props();
</script>

<button {type} class="btn btn-{variant} {size === 'sm' ? 'sm' : ''} {className}" {...rest}>
	{#if icon}<Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} />{/if}
	{@render children?.()}
</button>
