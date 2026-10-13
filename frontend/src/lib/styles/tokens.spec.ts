import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design-system guard. The UI must stay on the tokens in tokens.css (see DESIGN.md):
 * no raw colours, font sizes or font families anywhere else, and no var(--typo).
 */
const SRC = join(process.cwd(), 'src');
const TOKENS = join(SRC, 'lib/styles/tokens.css');
const EXTENSIONS = ['.svelte', '.css', '.ts', '.html'];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === 'assets' ? [] : walk(path);
		return EXTENSIONS.some((e) => name.endsWith(e)) ? [path] : [];
	});
}

const files = walk(SRC).filter((f) => f !== TOKENS && !f.endsWith('.spec.ts') && !f.endsWith('app.html'));
const rel = (f: string) => relative(SRC, f);

interface Rule {
	name: string;
	pattern: RegExp;
}

const RULES: Rule[] = [
	{ name: 'hex colour', pattern: /(?<=[:\s(,"'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![-\w])/g },
	{ name: 'rgb/hsl colour function', pattern: /\b(?:rgb|rgba|hsl|hsla)\(/g },
	{ name: 'named colour', pattern: /\b(?:color|background|fill|stroke|border(?:-[a-z]+)*)\s*:\s*(?:white|black|red|blue|green|orange|gray|grey)\b/g },
	{ name: 'raw font-size', pattern: /font-size\s*:\s*[\d.]+(?:px|rem|em)\b/g },
	{ name: 'raw font-family', pattern: /font-family[ \t]*:[ \t]*(?![ \t]|var\(|inherit)[^;}]+/g }
];

describe('design tokens', () => {
	for (const rule of RULES) {
		it(`no ${rule.name} outside tokens.css`, () => {
			const offenders: string[] = [];
			for (const file of files) {
				// @font-face is the one place a raw family name is correct (it is what registers the font).
				const text = readFileSync(file, 'utf8').replace(/@font-face\s*\{[^}]*\}/g, (b) => b.replace(/[^\n]/g, ' '));
				for (const m of text.matchAll(rule.pattern)) {
					const line = text.slice(0, m.index).split('\n').length;
					offenders.push(`${rel(file)}:${line}  ${m[0]}`);
				}
			}
			expect(offenders, `Use a token from src/lib/styles/tokens.css (see DESIGN.md):\n${offenders.join('\n')}`).toEqual([]);
		});
	}

	it('every var(--x) refers to a defined custom property', () => {
		const all = [TOKENS, ...files];
		const defined = new Set<string>();
		for (const file of all) {
			for (const m of readFileSync(file, 'utf8').matchAll(/(?<![\w-])(--[a-zA-Z][\w-]*)\s*:/g)) defined.add(m[1]);
		}
		const missing: string[] = [];
		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			for (const m of text.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g)) {
				if (!defined.has(m[1])) missing.push(`${rel(file)}  ${m[1]}`);
			}
		}
		expect(missing, `Undefined custom properties:\n${missing.join('\n')}`).toEqual([]);
	});

	it('tokens.css is the only file that declares colour tokens', () => {
		const offenders = files.filter((f) => /(?<![\w-])--(?:primary|accent|surface|ink|line|danger|ok|focus)\s*:/.test(readFileSync(f, 'utf8'))).map(rel);
		expect(offenders).toEqual([]);
	});

	it('the browser theme colour matches the primary token', () => {
		const tokens = readFileSync(TOKENS, 'utf8');
		const primary = tokens.match(/--primary:\s*(#[0-9a-fA-F]{6})/)?.[1].toLowerCase();
		const html = readFileSync(join(SRC, 'app.html'), 'utf8');
		const theme = html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/)?.[1].toLowerCase();
		expect(theme).toBe(primary);
	});
});
