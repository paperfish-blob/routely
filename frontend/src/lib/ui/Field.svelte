<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import type { IconName } from './icons.ts';

	interface Props extends Omit<HTMLInputAttributes, 'class' | 'value'> {
		/** Accessible name (always rendered, visually hidden). */
		label: string;
		value: string;
		icon?: IconName;
		error?: boolean;
		/** Message under the field; announced as an alert when `error`. */
		help?: string;
		clearable?: boolean;
		inputEl?: HTMLInputElement;
		trailing?: Snippet;
		class?: string;
	}

	let {
		label,
		value = $bindable(),
		icon = 'search',
		error = false,
		help,
		clearable = true,
		inputEl = $bindable(),
		trailing,
		class: className = '',
		id,
		...rest
	}: Props = $props();

	const uid = $props.id();
	const inputId = $derived(id ?? `field-${uid}`);
</script>

<div class={className}>
	<div class="field {error ? 'err' : ''}">
		<Icon name={icon} />
		<label class="sr" for={inputId}>{label}</label>
		<input
			{...rest}
			id={inputId}
			bind:this={inputEl}
			bind:value
			aria-invalid={error || undefined}
			aria-describedby={help ? `${inputId}-help` : undefined}
		/>
		{#if clearable && value}
			<IconButton label="Clear {label.toLowerCase()}" icon="close" onclick={() => { value = ''; inputEl?.focus(); }} />
		{/if}
		{@render trailing?.()}
	</div>
	{#if help}
		<div class="help {error ? '' : 'info'}" id="{inputId}-help" role={error ? 'alert' : undefined}>
			{#if error}<Icon name="alert" size="sm" />{/if}
			{help}
		</div>
	{/if}
</div>
