<script lang="ts">
	import { toasts } from '#lib/state/toasts.svelte.ts';
	import { Toast } from '#lib/ui/index.ts';
</script>

<div class="toasts" aria-live="polite">
	{#each toasts.items as t (t.id)}
		<Toast message={t.message} actionLabel={t.actionLabel} onaction={() => toasts.act(t.id)} />
	{/each}
</div>
