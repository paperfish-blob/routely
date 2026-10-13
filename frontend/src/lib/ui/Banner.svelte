<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import type { IconName } from './icons.ts';

	type Variant = 'info' | 'warn' | 'err' | 'ok';

	interface Props {
		variant?: Variant;
		/** Override the default icon (e.g. a clock for rate limits). */
		icon?: IconName;
		onclose?: () => void;
		class?: string;
		children: Snippet;
		actions?: Snippet;
	}

	const DEFAULT_ICON: Record<Variant, IconName> = {
		info: 'info',
		warn: 'warn',
		err: 'alert',
		ok: 'check-circle'
	};

	let { variant = 'info', icon, onclose, class: className = '', children, actions }: Props = $props();
</script>

<div class="banner {variant} {className}" role={variant === 'err' ? 'alert' : 'status'}>
	<Icon name={icon ?? DEFAULT_ICON[variant]} />
	<span style="flex: 1">{@render children()}</span>
	{@render actions?.()}
	{#if onclose}<IconButton class="bx" label="Dismiss" icon="close" onclick={onclose} />{/if}
</div>
