<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	interface Props extends Omit<HTMLButtonAttributes, 'class' | 'aria-label'> {
		/** Required: icon-only buttons need an accessible name. */
		label: string;
		icon: IconName;
		accent?: boolean;
		class?: string;
	}

	let { label, icon, accent = false, type = 'button', class: className = '', ...rest }: Props = $props();
</script>

<button {type} class="ibtn {accent ? 'accent' : ''} {className}" aria-label={label} {...rest}>
	<Icon name={icon} />
</button>
