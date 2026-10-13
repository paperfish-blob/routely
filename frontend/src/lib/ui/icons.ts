/**
 * Icon glyphs (24x24 viewBox, stroke-based, inherit `currentColor`), extracted from Routely.html.
 * To add an icon: draw it in the same style (1.8 stroke, round caps/joins), add it here, nothing else.
 */
export const ICONS = {
	'route-mark': `<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 18H13a3.5 3.5 0 0 0 0-7h-2a3.5 3.5 0 0 1 0-7h4.8"/>`,
	pencil: `<path d="M4 20l1-4L16 5l3 3L8 19z"/>`,
	search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
	close: `<path d="M6 6l12 12M18 6 6 18"/>`,
	pin: `<path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>`,
	plus: `<path d="M12 5v14M5 12h14"/>`,
	grip: `<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>`,
	trash: `<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>`,
	car: `<path d="M5 17h14M5 17v-5l2-5h10l2 5v5M7 17v2M17 17v2"/>`,
	line: `<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5l11-11"/>`,
	walk: `<circle cx="13" cy="4.5" r="1.7"/><path d="M9 21l2-6 3 2v4M11 15l-1-5 4-1 2 3 3 1M10 10l-3 2"/>`,
	sparkles: `<path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>`,
	minus: `<path d="M5 12h14"/>`,
	fit: `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
	locate: `<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>`,
	'arrow-up': `<path d="M12 19V5M6 11l6-6 6 6"/>`,
	'arrow-down': `<path d="M12 5v14M6 13l6 6 6-6"/>`,
	check: `<path d="m5 12 5 5 9-10"/>`,
	warn: `<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>`,
	alert: `<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01"/>`,
	clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
	info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`,
	'check-circle': `<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>`,
} as const;

export type IconName = keyof typeof ICONS;
