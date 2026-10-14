<script lang="ts">
	import { SIDEBAR_COLLAPSE_BELOW, SIDEBAR_DEFAULT, SIDEBAR_MIN } from '#lib/sidebar.ts';
	import type { SidebarState } from '#lib/state/sidebar.svelte.ts';
	import { Icon } from '#lib/ui/index.ts';

	/** The drag handle on the sidebar's edge. A real separator: pointer, keyboard and double-click all work. */
	let { sidebar }: { sidebar: SidebarState } = $props();

	let startX = 0;
	let startWidth = 0;
	let pointerY = $state(0);

	function down(e: PointerEvent) {
		if (e.button !== 0) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		startX = e.clientX;
		startWidth = sidebar.effective;
		pointerY = e.clientY;
		sidebar.startDrag();
		e.preventDefault();
	}
	function move(e: PointerEvent) {
		if (!sidebar.dragging) return;
		sidebar.drag(startWidth + e.clientX - startX);
		pointerY = e.clientY;
	}
	function up() {
		sidebar.endDrag();
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') sidebar.nudge(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey);
		else if (e.key === 'Home') sidebar.toMin();
		else if (e.key === 'End') sidebar.toMax();
		else if (e.key === 'Enter') sidebar.reset();
		else return;
		e.preventDefault();
	}

	// Keep the cursor and text selection stable while dragging, even over the map.
	$effect(() => {
		document.body.classList.toggle('rz-dragging', sidebar.dragging);
		return () => document.body.classList.remove('rz-dragging');
	});
</script>

<!-- A focusable separator is the ARIA "window splitter" widget: it takes keyboard and pointer input. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="rzh {sidebar.dragging ? 'drag' : ''}"
	role="separator"
	aria-orientation="vertical"
	aria-label="Resize sidebar"
	aria-valuemin={SIDEBAR_MIN}
	aria-valuemax={sidebar.max}
	aria-valuenow={sidebar.effective}
	title="Drag to resize · double-click to reset"
	tabindex="0"
	data-name="SidebarResizer"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	ondblclick={() => sidebar.reset()}
	onkeydown={key}
>
	<span class="gp"></span>
</div>

{#if sidebar.dragging}
	<div class="rzr" aria-hidden="true">
		<em style="left: {SIDEBAR_MIN}px; width: {sidebar.max - SIDEBAR_MIN}px"></em>
		<i style="left: {SIDEBAR_MIN}px"></i><b style="left: {SIDEBAR_MIN}px">MIN {SIDEBAR_MIN}</b>
		<i style="left: {SIDEBAR_DEFAULT}px"></i><b class="low" style="left: {SIDEBAR_DEFAULT}px">DEFAULT {SIDEBAR_DEFAULT}</b>
		<i style="left: {sidebar.max}px"></i><b style="left: {sidebar.max}px">MAX {sidebar.max}</b>
	</div>
	<div class="rzt w" style="left: {sidebar.effective + 22}px; top: {pointerY - 14}px" role="status">
		<Icon name={sidebar.willCollapse ? 'chevron-right' : 'arrow-right'} />
		{sidebar.willCollapse ? 'Release to collapse' : `${sidebar.effective} px`}
	</div>
{/if}
