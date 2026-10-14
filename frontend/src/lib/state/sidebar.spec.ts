import { describe, expect, it } from 'vitest';
import type { ViewPrefs, ViewPrefsStore } from '../storage/ViewPrefsStore';
import { SidebarState } from './sidebar.svelte';

function make(initial: ViewPrefs = {}, windowWidth = 1600) {
	let saved: ViewPrefs = initial;
	const prefs: ViewPrefsStore = { load: () => saved, save: (p) => (saved = p) };
	const s = new SidebarState(prefs);
	s.windowWidth = windowWidth;
	s.load();
	return { s, saved: () => saved };
}

describe('SidebarState', () => {
	it('starts at 400 and restores a saved width', () => {
		expect(make().s.effective).toBe(400);
		expect(make({ sidebarWidth: 520 }).s.effective).toBe(520);
	});

	it('restores a collapsed rail and the width it had', () => {
		const { s } = make({ sidebarWidth: 520, sidebarCollapsed: true });
		expect(s.effective).toBe(56);
		s.expand();
		expect(s.effective).toBe(520);
	});

	it('follows a drag live, clamped, and saves on release', () => {
		const { s, saved } = make();
		s.startDrag();
		s.drag(900);
		expect(s.effective).toBe(640);
		s.drag(470);
		expect(s.effective).toBe(470);
		s.endDrag();
		expect(s.width).toBe(470);
		expect(saved()).toEqual({ sidebarWidth: 470, sidebarCollapsed: false });
	});

	it('collapses when released past the minimum, remembering the old width', () => {
		const { s, saved } = make({ sidebarWidth: 480 });
		s.startDrag();
		s.drag(200);
		expect(s.willCollapse).toBe(true);
		expect(s.effective).toBe(320); // shows the minimum while you decide
		s.endDrag();
		expect(s.collapsed).toBe(true);
		expect(s.effective).toBe(56);
		expect(saved()).toEqual({ sidebarWidth: 480, sidebarCollapsed: true });
	});

	it('between 260 and 320 it stops at the minimum instead of collapsing', () => {
		const { s } = make();
		s.startDrag();
		s.drag(290);
		s.endDrag();
		expect(s.collapsed).toBe(false);
		expect(s.width).toBe(320);
	});

	it('resizes from the keyboard', () => {
		const { s } = make();
		s.nudge(1);
		expect(s.width).toBe(416);
		s.nudge(-1, true);
		expect(s.width).toBe(352);
		s.toMax();
		expect(s.width).toBe(640);
		s.toMin();
		expect(s.width).toBe(320);
		s.reset();
		expect(s.width).toBe(400);
	});

	it('is held to half of a small window and recovers when it grows', () => {
		const { s } = make({ sidebarWidth: 600 }, 1000);
		expect(s.effective).toBe(500);
		s.windowWidth = 1600;
		expect(s.effective).toBe(600);
	});

	it('toggles', () => {
		const { s } = make();
		s.toggle();
		expect(s.collapsed).toBe(true);
		s.toggle();
		expect(s.collapsed).toBe(false);
	});
});
