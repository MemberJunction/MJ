import { describe, it, expect } from 'vitest';
import { lintText, stripComments, hasAdjacentKnownLimitation, ALLOWLIST } from '../../../scripts/check-spec-antipatterns.mjs';

const whys = (text, kind) => lintText(text, kind).map((f) => f.why);

describe('stripComments', () => {
    it('strips line comments so prose about an anti-pattern does not trip a rule', () => {
        expect(whys(`// mentioning expect(true) or as any here is fine\nexpect(x).toBe(1);\n`, 'node')).toEqual([]);
    });

    it('strips block-comment interiors line-wise', () => {
        const stripped = stripComments(['/* expect(true)', 'still comment as any', '*/ expect(x).toBe(1);']);
        expect(stripped.join('\n')).not.toContain('expect(true)');
        expect(stripped.join('\n')).toContain('expect(x).toBe(1);');
    });
});

describe('node-spec rules', () => {
    it('flags expect(true) vacuous assertions', () => {
        expect(whys(`it('x', () => { expect(true).toBe(true); });`, 'node')).toContain(
            'vacuous assertion — expect(true) cannot fail'
        );
    });

    it('flags expect(1).toBe(1)', () => {
        expect(whys(`expect(1).toBe(1);`, 'node')).toContain('vacuous assertion — expect(1).toBe(1) cannot fail');
    });

    it('flags `x || true` inside expect', () => {
        expect(whys(`expect(result || true).toBeTruthy();`, 'node')).toContain(
            'vacuous assertion — `x || true` is always true'
        );
    });

    it('flags a bare it.skip', () => {
        expect(whys(`it.skip('later', () => {});`, 'node').some((w) => w.includes('disabled test'))).toBe(true);
    });

    it('does NOT flag it.skip with an adjacent KNOWN LIMITATION comment (line above)', () => {
        expect(whys(`// KNOWN LIMITATION: needs a real DB\nit.skip('later', () => {});`, 'node')).toEqual([]);
    });

    it('does NOT flag it.skip with KNOWN LIMITATION within the 3-line window', () => {
        const text = `// KNOWN LIMITATION: needs a real DB\n// spanning two more lines\n// of explanation\nit.skip('later', () => {});`;
        expect(whys(text, 'node')).toEqual([]);
    });

    it('does NOT flag conditional it.skipIf — that is gating, not disabling', () => {
        expect(whys(`it.skipIf(!process.env.REDIS_URL)('needs redis', () => {});`, 'node')).toEqual([]);
    });

    it('flags `as any`', () => {
        expect(whys(`const x = {} as any;`, 'node')).toContain('`as any` — banned repo-wide (CLAUDE.md)');
    });

    it('does NOT apply the DOM-only rules to node specs', () => {
        // `: any` annotations, `as never`, and blanket schemas gate DOM specs only.
        expect(whys(`const x: any = 1; const y = {} as never; NO_ERRORS_SCHEMA;`, 'node')).toEqual([]);
    });
});

describe('dom-spec rules (unchanged)', () => {
    it('flags a skipped DOM spec even WITH a KNOWN LIMITATION comment — no escape hatch', () => {
        const text = `// KNOWN LIMITATION: whatever\nit.skip('x', () => {});`;
        expect(whys(text, 'dom').some((w) => w.includes('disabled test'))).toBe(true);
    });

    it('flags `: any` and `as never` in DOM specs', () => {
        const found = whys(`const a: any = 1; const b = {} as never;`, 'dom');
        expect(found).toContain('`any` — banned repo-wide (CLAUDE.md)');
        expect(found.some((w) => w.includes('as never'))).toBe(true);
    });

    it('flags blanket schemas', () => {
        expect(whys(`schemas: [NO_ERRORS_SCHEMA]`, 'dom').some((w) => w.includes('blanket schema'))).toBe(true);
    });
});

describe('hasAdjacentKnownLimitation', () => {
    it('honors the marker on the same raw line (e.g. inside the skip title or trailing comment)', () => {
        expect(hasAdjacentKnownLimitation([`it.skip('x (KNOWN LIMITATION: y)', () => {});`], 0)).toBe(true);
    });

    it('rejects a marker outside the window', () => {
        const lines = ['// KNOWN LIMITATION: too far away', '', '', '', 'it.skip(...);'];
        expect(hasAdjacentKnownLimitation(lines, 4)).toBe(false);
    });
});

describe('ALLOWLIST', () => {
    it('is a burn-down list of repo-relative paths under packages/', () => {
        for (const entry of ALLOWLIST) {
            expect(entry.startsWith('packages/'), `bad allowlist entry: ${entry}`).toBe(true);
            expect(entry.endsWith('.test.ts'), `allowlist entry is not a spec file: ${entry}`).toBe(true);
            expect(entry.includes('\\'), `allowlist entries use forward slashes: ${entry}`).toBe(false);
        }
    });
});
