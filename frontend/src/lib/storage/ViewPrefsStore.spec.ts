import { describe, expect, it } from 'vitest';
import { LocalViewPrefsStore, parseViewPrefs } from './ViewPrefsStore';

describe('view preferences', () => {
	it('ignores missing, corrupt and out-of-range data', () => {
		expect(parseViewPrefs(null)).toEqual({});
		expect(parseViewPrefs('{nope')).toEqual({});
		expect(parseViewPrefs('{"sidebarWidth":"wide","sidebarCollapsed":1}')).toEqual({});
		expect(parseViewPrefs('{"sidebarWidth":-5}')).toEqual({});
	});

	it('round-trips through storage', () => {
		const mem = new Map<string, string>();
		const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
		const store = new LocalViewPrefsStore(storage);
		store.save({ sidebarWidth: 480, sidebarCollapsed: true, summaryCollapsed: true });
		expect(store.load()).toEqual({ sidebarWidth: 480, sidebarCollapsed: true, summaryCollapsed: true });
	});

	it('survives storage that throws', () => {
		const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
		const store = new LocalViewPrefsStore(broken);
		expect(store.load()).toEqual({});
		expect(() => store.save({ sidebarWidth: 400 })).not.toThrow();
	});
});
