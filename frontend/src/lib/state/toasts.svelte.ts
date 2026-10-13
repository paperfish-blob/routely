export interface ToastItem {
	id: number;
	message: string;
	actionLabel?: string;
	onaction?: () => void;
}

interface PushOptions {
	actionLabel?: string;
	onaction?: () => void;
	ttlMs?: number;
}

const DEFAULT_TTL_MS = 6000;

/** App-wide toast queue. Components push; <ToastHost> renders. */
class ToastState {
	items = $state<ToastItem[]>([]);
	private nextId = 1;
	private timers = new Map<number, ReturnType<typeof setTimeout>>();

	push(message: string, options: PushOptions = {}): number {
		const id = this.nextId++;
		this.items.push({ id, message, actionLabel: options.actionLabel, onaction: options.onaction });
		this.timers.set(
			id,
			setTimeout(() => this.dismiss(id), options.ttlMs ?? DEFAULT_TTL_MS)
		);
		return id;
	}

	dismiss(id: number): void {
		clearTimeout(this.timers.get(id));
		this.timers.delete(id);
		this.items = this.items.filter((t) => t.id !== id);
	}

	/** Run the toast's action (e.g. Undo) and close it. */
	act(id: number): void {
		const toast = this.items.find((t) => t.id === id);
		this.dismiss(id);
		toast?.onaction?.();
	}
}

export const toasts = new ToastState();
