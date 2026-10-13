import Sortable from 'sortablejs';

interface Options {
	/** CSS selector of the draggable items (siblings may include non-draggable ones, e.g. leg connectors). */
	item: string;
	/** CSS selector of the drag handle inside each item. */
	handle: string;
	/** Called with indices counted among draggable items only. */
	onMove: (from: number, to: number) => void;
}

/**
 * Svelte action wrapping SortableJS (touch-friendly). Sortable moves DOM nodes
 * itself; we put the node back and let Svelte re-render from state so the
 * keyed {#each} stays in sync.
 */
export function sortable(node: HTMLElement, options: Options) {
	let current = options;
	// Svelte keeps an anchor text node after the last {#each} item, so we must put the
	// dragged node back before its original sibling, not blindly append it.
	let originalNext: Node | null = null;
	const instance = Sortable.create(node, {
		animation: 150,
		draggable: options.item,
		handle: options.handle,
		// Pointer-driven drag with a styled clone: same look on desktop and touch.
		forceFallback: true,
		fallbackOnBody: true,
		fallbackClass: 'drag',
		ghostClass: 'drag-ghost',
		onStart({ item }) {
			originalNext = item.nextSibling;
		},
		onEnd({ oldDraggableIndex, newDraggableIndex, item, from }) {
			if (oldDraggableIndex == null || newDraggableIndex == null) return;
			if (oldDraggableIndex === newDraggableIndex) return;
			from.insertBefore(item, originalNext);
			current.onMove(oldDraggableIndex, newDraggableIndex);
		}
	});
	return {
		update(next: Options) {
			current = next;
		},
		destroy() {
			instance.destroy();
		}
	};
}
