<script lang="ts">
	import { IconButton } from '#lib/ui/index.ts';

	interface Props {
		onzoomin?: () => void;
		onzoomout?: () => void;
		onfit?: () => void;
		onlocate: () => void;
		/** The mobile layout has only fit + locate (pinch zooms). */
		variant?: 'desktop' | 'mobile';
	}

	let { onzoomin, onzoomout, onfit, onlocate, variant = 'desktop' }: Props = $props();
</script>

<div class={variant === 'mobile' ? 'm-ctl' : 'mctl'} data-name="MapControls" style={variant === 'mobile' ? 'top: 76px' : undefined}>
	{#if variant === 'desktop'}
		<div class="mgroup">
			<IconButton label="Zoom in" icon="plus" onclick={onzoomin} />
			<IconButton label="Zoom out" icon="minus" onclick={onzoomout} />
		</div>
	{/if}
	<div class="mgroup">
		{#if onfit}<IconButton label="Fit to route" icon="fit" onclick={onfit} />{/if}
		<IconButton label="Show my location" icon="locate" onclick={onlocate} />
	</div>
</div>
