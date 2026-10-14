import type { WeatherResponse } from '../types';
import { weatherKey, type WeatherPoint } from '../weather';

export type WeatherEntry = { status: 'loading' } | { status: 'ok'; wx: WeatherResponse } | { status: 'error' };

export type FetchWeather = (lat: number, lng: number, date: string, signal?: AbortSignal) => Promise<WeatherResponse>;

const FETCH_DELAY_MS = 300; // stops move around while editing; wait for them to settle
const MAX_PARALLEL = 4;

interface Want {
	place: WeatherPoint['place'];
	date: string;
}

/**
 * Weather lookups keyed by place (~1 km) and date. Shared by every day that needs the same place and date.
 * Weather is a bonus: a failure marks that lookup as `error` and never blocks routing.
 */
export class WeatherState {
	private entries = $state<Record<string, WeatherEntry>>({});
	private queue: { key: string; want: Want }[] = [];
	private running = new Map<string, AbortController>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private wanted = new Map<string, Want>();

	constructor(private readonly fetchWeather: FetchWeather) {}

	entry(place: { lat: number; lng: number }, date: string): WeatherEntry | undefined {
		return this.entries[weatherKey(place, date)];
	}

	/** Declares what is needed now. Missing lookups start after a short pause; stale in-flight ones are cancelled. */
	want(items: Want[]): void {
		this.wanted = new Map(items.map((w) => [weatherKey(w.place, w.date), w]));
		for (const [key, controller] of this.running) {
			if (!this.wanted.has(key)) {
				controller.abort();
				this.running.delete(key);
			}
		}
		// Drop queued or in-flight lookups nobody needs any more (settled results stay cached).
		this.queue = this.queue.filter((q) => this.wanted.has(q.key));
		for (const [key, entry] of Object.entries(this.entries)) {
			if (entry.status === 'loading' && !this.wanted.has(key)) delete this.entries[key];
		}
		clearTimeout(this.timer);
		if (![...this.wanted.keys()].some((k) => !this.entries[k])) return;
		this.timer = setTimeout(() => this.start(), FETCH_DELAY_MS);
	}

	/** Tries failed lookups again. */
	retry(): void {
		for (const key of this.wanted.keys()) if (this.entries[key]?.status === 'error') delete this.entries[key];
		clearTimeout(this.timer);
		this.start();
	}

	dispose(): void {
		clearTimeout(this.timer);
		for (const controller of this.running.values()) controller.abort();
		this.running.clear();
		this.queue = [];
	}

	private start(): void {
		for (const [key, want] of this.wanted) {
			if (this.entries[key] || this.running.has(key)) continue;
			this.entries[key] = { status: 'loading' };
			this.queue.push({ key, want });
		}
		this.pump();
	}

	private pump(): void {
		while (this.running.size < MAX_PARALLEL && this.queue.length > 0) {
			const { key, want } = this.queue.shift()!;
			const controller = new AbortController();
			this.running.set(key, controller);
			void this.run(key, want, controller);
		}
	}

	private async run(key: string, want: Want, controller: AbortController): Promise<void> {
		try {
			const wx = await this.fetchWeather(want.place.lat, want.place.lng, want.date, controller.signal);
			if (!controller.signal.aborted) this.entries[key] = { status: 'ok', wx };
		} catch {
			if (!controller.signal.aborted) this.entries[key] = { status: 'error' };
		} finally {
			if (this.running.get(key) === controller) this.running.delete(key);
			this.pump();
		}
	}
}
