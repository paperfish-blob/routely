<script lang="ts">
	let {
		message,
		actionLabel,
		onaction
	}: { message: string; actionLabel?: string; onaction?: () => void } = $props();
</script>

<div class="toast" role="status">
	<span style="flex: 1">{message}</span>
	{#if actionLabel}<button type="button" class="act" onclick={onaction}>{actionLabel}</button>{/if}
</div>
