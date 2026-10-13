import Sortable from 'sortablejs';

interface Options {
	/** CSS selector of the drag handle inside each item. */
	handle: string;
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
		handle: options.handle,
		ghostClass: 'drag-ghost',
		chosenClass: 'drag-chosen',
		onStart({ item }) {
			originalNext = item.nextSibling;
		},
		onEnd({ oldIndex, newIndex, item, from }) {
			if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
			from.insertBefore(item, originalNext);
			current.onMove(oldIndex, newIndex);
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
