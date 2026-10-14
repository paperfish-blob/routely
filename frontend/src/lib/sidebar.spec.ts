import { describe, expect, it } from 'vitest';
import { clampSidebar, maxSidebarFor, SIDEBAR_MAX, SIDEBAR_MIN } from './sidebar';

describe('sidebar width limits', () => {
	it('stays within 320–640', () => {
		expect(clampSidebar(100, 1600)).toBe(SIDEBAR_MIN);
		expect(clampSidebar(900, 1600)).toBe(SIDEBAR_MAX);
		expect(clampSidebar(452.4, 1600)).toBe(452);
	});

	it('never takes more than half the window', () => {
		expect(maxSidebarFor(1000)).toBe(500);
		expect(clampSidebar(640, 1000)).toBe(500);
	});

	it('never goes below the minimum, even in a small window', () => {
		expect(maxSidebarFor(600)).toBe(SIDEBAR_MIN);
		expect(clampSidebar(400, 600)).toBe(SIDEBAR_MIN);
	});
});
