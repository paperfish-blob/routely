<script lang="ts">
	import type { Snippet } from 'svelte';

	export type SheetState = 'collapsed' | 'half' | 'full';

	interface Props {
		state: SheetState;
		onstate: (next: SheetState) => void;
		label: string;
		children: Snippet;
	}

	let { state: sheet, onstate, label, children }: Props = $props();

	const ORDER: SheetState[] = ['collapsed', 'half', 'full'];

	function step(delta: number) {
		const i = ORDER.indexOf(sheet) + delta;
		onstate(ORDER[Math.min(ORDER.length - 1, Math.max(0, i))]);
	}

	let startY: number | null = null;
	function down(e: PointerEvent) {
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function up(e: PointerEvent) {
		if (startY === null) return;
		const dy = e.clientY - startY;
		startY = null;
		if (Math.abs(dy) < 12) step(sheet === 'full' ? -2 : 1); // tap: expand / collapse
		else step(dy < 0 ? 1 : -1);
	}
</script>

<section class="sheet" aria-label={label} data-name="BottomSheet/{sheet}">
	<button
		class="grab"
		aria-label={sheet === 'collapsed' ? 'Drag up to see your stops' : 'Drag to resize the itinerary sheet'}
		aria-expanded={sheet !== 'collapsed'}
		onpointerdown={down}
		onpointerup={up}
		onkeydown={(e) => {
			if (e.key === 'ArrowUp') step(1);
			else if (e.key === 'ArrowDown') step(-1);
		}}
		style="touch-action: none"
	>
		<span></span>
	</button>
	{@render children()}
</section>
