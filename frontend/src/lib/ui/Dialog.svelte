<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		title: string;
		description?: string;
		children: Snippet;
		footer?: Snippet;
	}

	let { open, onclose, title, description, children, footer }: Props = $props();

	const uid = $props.id();
	let el = $state<HTMLDivElement>();
	let returnTo: HTMLElement | null = null;

	const focusable = () =>
		Array.from(
			el?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? []
		);

	$effect(() => {
		if (!open) return;
		returnTo = document.activeElement as HTMLElement | null;
		// Focus the first control inside the body (not the close button) so typing can start at once.
		const body = el?.querySelector<HTMLElement>('.dlg-b input, .dlg-b [role="radio"][aria-checked="true"], .dlg-b button');
		(body ?? focusable()[0])?.focus();
		return () => returnTo?.focus?.();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			onclose();
		} else if (e.key === 'Tab') {
			const list = focusable();
			if (list.length === 0) return;
			const first = list[0];
			const last = list[list.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="scrim" onpointerdown={(e) => e.target === e.currentTarget && onclose()}>
		<div bind:this={el} class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-{uid}-t" tabindex="-1" {onkeydown}>
			<div class="dlg-h">
				<div style="flex: 1">
					<h2 id="dlg-{uid}-t">{title}</h2>
					{#if description}<p>{description}</p>{/if}
				</div>
				<IconButton label="Close" icon="close" onclick={onclose} />
			</div>
			<div class="dlg-b">{@render children()}</div>
			{#if footer}<div class="dlg-f">{@render footer()}</div>{/if}
		</div>
	</div>
{/if}
