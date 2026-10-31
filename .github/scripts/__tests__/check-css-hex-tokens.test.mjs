/**
 * Suite for the hardcoded-colour gate (check-css-hex-tokens.sh).
 *
 * Each case writes a one-rule stylesheet to a temp dir and runs the real script on it with
 * `--file`, so the assertions cover the shipped perl detector rather than a copy of it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-css-hex-tokens.sh');

let dir;
let counter = 0;

beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'css-hex-tokens-'));
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

/** Runs the gate on `css` and returns the offending line numbers it printed. */
function check(css) {
    counter += 1;
    const file = join(dir, `case-${counter}.css`);
    writeFileSync(file, css);
    const result = spawnSync('bash', [SCRIPT, '--file', file], { encoding: 'utf8' });
    const flagged = result.stdout
        .split('\n')
        .map((line) => line.match(/^ {4}(\d+):/))
        .filter((match) => match !== null)
        .map((match) => Number(match[1]));
    return { status: result.status, flagged };
}

describe('named colour keywords', () => {
    it('fails background: white', () => {
        const { status, flagged } = check('.a {\n  background: white;\n}\n');
        expect(status).toBe(1);
        expect(flagged).toEqual([2]);
    });

    it('fails a keyword inside a shorthand, in any case', () => {
        expect(check('.a { border: 1px solid Black; }\n').flagged).toEqual([1]);
    });

    it('fails a keyword without surrounding whitespace', () => {
        expect(check('.a{color:red}\n').flagged).toEqual([1]);
    });

    it('fails a non-neutral keyword as a color-mix() partner', () => {
        expect(check('.a { color: color-mix(in srgb, var(--mj-brand-primary) 80%, purple); }\n').flagged).toEqual([1]);
    });

    it('passes a keyword used as a var() fallback', () => {
        const { status, flagged } = check('.a { color: var(--x, white); }\n');
        expect(status).toBe(0);
        expect(flagged).toEqual([]);
    });

    it('passes transparent, currentColor and the CSS-wide keywords', () => {
        const css = [
            '.a { color: transparent; }',
            '.b { border-color: currentColor; }',
            '.c { color: inherit; background: initial; outline-color: unset; fill: revert; }',
            '',
        ].join('\n');
        expect(check(css).flagged).toEqual([]);
    });

    it('passes black and white as a color-mix() partner (neutral shade or tint)', () => {
        const css = [
            '.a { background: color-mix(in srgb, var(--mj-brand-primary) 85%, black); }',
            '.b { border: 1px solid color-mix(in srgb, white 35%, transparent); }',
            '',
        ].join('\n');
        expect(check(css).flagged).toEqual([]);
    });

    it('ignores keywords outside colour properties, in strings, urls, comments and custom properties', () => {
        const css = [
            '.a { white-space: nowrap; }',
            '.b { background: url("red.png"); }',
            '.c { content: "white"; }',
            '/* background: white; */',
            '.d { --x: white; }',
            '.e { color: $white; }',
            '.f { font-family: Tan, sans-serif; }',
            '',
        ].join('\n');
        expect(check(css).flagged).toEqual([]);
    });
});

describe('existing detectors still fire', () => {
    it('passes a declaration with a color-exception comment directly above it', () => {
        expect(check('.a {\n  // color-exception: legacy published class\n  color: white;\n}\n').flagged).toEqual([]);
    });

    it('still fails when the color-exception comment has no reason or is not directly above', () => {
        expect(check('.a {\n  // color-exception:\n  color: white;\n}\n').flagged).toEqual([3]);
        expect(check('.a {\n  // color-exception: legacy\n  margin: 0;\n  color: white;\n}\n').flagged).toEqual([4]);
    });

    it('fails a hex literal and passes the rgba neutrals', () => {
        const css = ['.a { color: #333; }', '.b { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }', ''].join('\n');
        expect(check(css).flagged).toEqual([1]);
    });
});
