<script lang="ts">
	import { ICONS, type IconName } from './icons.ts';

	let {
		name,
		size = 'md',
		class: className = ''
	}: { name: IconName; size?: 'sm' | 'md'; class?: string } = $props();
</script>

<svg class="ico {size === 'sm' ? 'sm' : ''} {className}" viewBox="0 0 24 24" aria-hidden="true">
	{@html ICONS[name]}
</svg>
