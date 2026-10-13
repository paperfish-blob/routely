import Sortable from 'sortablejs';

interface Options {
	/** CSS selector of the draggable items (siblings may include non-draggable ones, e.g. leg connectors). */
	item: string;
	/** CSS selector of the drag handle inside each item. */
	handle: string;
	/** Reorder inside this list; indices count draggable items only. */
	onMove: (from: number, to: number) => void;
	/** Lists with the same group let items move between them. The list's `data-day-id` identifies it. */
	group?: string;
	onTransfer?: (oldIndex: number, newIndex: number, fromId: string, toId: string) => void;
	/** Elements marked `data-drop-day="<id>"` (day tabs/chips) accept dropped items. */
	onHoverDay?: (dayId: string | null) => void;
	onDropDay?: (oldIndex: number, dayId: string) => void;
}

const DROP_SELECTOR = '[data-drop-day]';

/**
 * Svelte action wrapping SortableJS (touch-friendly). Sortable moves DOM nodes
 * itself; we put the node back and let Svelte re-render from state so the
 * keyed {#each} stays in sync.
 */
export function sortable(node: HTMLElement, options: Options) {
	let current = options;
	// Svelte keeps an anchor text node after the last {#each} item, so we must put the
	// dragged node back before its original sibling, not blindly append it.
	let originalParent: Node | null = null;
	let originalNext: Node | null = null;
	let hovered: string | null = null;

	const dayUnder = (e: PointerEvent): string | null =>
		(document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(DROP_SELECTOR)?.dataset.dropDay ?? null);

	const onPointerMove = (e: PointerEvent) => {
		const id = dayUnder(e);
		if (id === hovered) return;
		hovered = id;
		current.onHoverDay?.(id);
	};

	const stopTracking = () => {
		document.removeEventListener('pointermove', onPointerMove, true);
		if (hovered !== null) current.onHoverDay?.(null);
		hovered = null;
	};

	const instance = Sortable.create(node, {
		animation: 150,
		draggable: options.item,
		handle: options.handle,
		group: options.group,
		// Pointer-driven drag with a styled clone: same look on desktop and touch.
		forceFallback: true,
		fallbackOnBody: true,
		fallbackClass: 'drag',
		ghostClass: 'drag-ghost',
		onStart({ item }) {
			originalParent = item.parentNode;
			originalNext = item.nextSibling;
			hovered = null;
			if (current.onDropDay || current.onHoverDay) {
				document.addEventListener('pointermove', onPointerMove, true);
			}
		},
		onEnd({ oldDraggableIndex, newDraggableIndex, item, from, to }) {
			const dropDay = hovered;
			stopTracking();
			if (oldDraggableIndex == null) return;
			const restore = () => originalParent?.insertBefore(item, originalNext);
			if (dropDay && current.onDropDay) {
				restore();
				current.onDropDay(oldDraggableIndex, dropDay);
				return;
			}
			if (newDraggableIndex == null) return;
			if (from !== to) {
				restore();
				current.onTransfer?.(oldDraggableIndex, newDraggableIndex, from.dataset.dayId ?? '', to.dataset.dayId ?? '');
				return;
			}
			if (oldDraggableIndex === newDraggableIndex) return;
			restore();
			current.onMove(oldDraggableIndex, newDraggableIndex);
		}
	});
	return {
		update(next: Options) {
			current = next;
		},
		destroy() {
			stopTracking();
			instance.destroy();
		}
	};
}
