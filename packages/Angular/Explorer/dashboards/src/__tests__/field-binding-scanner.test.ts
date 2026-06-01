import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanFieldBindings } from '../ComponentStudio/services/field-binding-scanner';

/**
 * The scanner is consumed by the Field Binding Inspector to drive the
 * "which fields are already bound" checklist. Both modes (AST and regex
 * fallback) are exercised — AST requires window.Babel from the React
 * runtime, the regex path is the fallback when that global isn't loaded.
 *
 * For test runs we never install Babel, so the AST branch is implicitly
 * exercised only by manually installing a stub global. The regex branch
 * is the production-realistic case in test mode.
 */

describe('scanFieldBindings — regex fallback path', () => {
    it('returns an empty set for falsy input', () => {
        expect(scanFieldBindings('').boundFields.size).toBe(0);
        expect(scanFieldBindings(null).boundFields.size).toBe(0);
        expect(scanFieldBindings(undefined).boundFields.size).toBe(0);
    });

    it('captures simple `record.Field` accesses', () => {
        const code = `function F({record}){return <div>{record.Name}</div>;}`;
        const r = scanFieldBindings(code);
        expect(r.boundFields.has('Name')).toBe(true);
    });

    it('captures `record?.Field` (optional chaining)', () => {
        const code = `const v = record?.Description;`;
        expect(scanFieldBindings(code).boundFields.has('Description')).toBe(true);
    });

    it('captures bracket-string access', () => {
        const code = `const v = record["Name"]; const w = record['Description'];`;
        const r = scanFieldBindings(code);
        expect(r.boundFields.has('Name')).toBe(true);
        expect(r.boundFields.has('Description')).toBe(true);
    });

    it('captures multiple distinct fields', () => {
        const code = `
            const n = record.Name;
            const d = record.Description;
            const i = record.Icon;
        `;
        const r = scanFieldBindings(code);
        expect(r.boundFields).toEqual(new Set(['Name', 'Description', 'Icon']));
    });

    it('does NOT capture dynamic bracket access (record[someVar])', () => {
        // Dynamic computed access is unknowable statically; both modes skip it.
        const code = `const v = record[someVar];`;
        expect(scanFieldBindings(code).boundFields.size).toBe(0);
    });

    it('does NOT pull "fields" out of comments', () => {
        const code = `
            // someone might write record.Phantom in a comment
            /* record.AlsoPhantom in a block comment */
            const real = record.Real;
        `;
        const r = scanFieldBindings(code);
        expect(r.boundFields.has('Real')).toBe(true);
        expect(r.boundFields.has('Phantom')).toBe(false);
        expect(r.boundFields.has('AlsoPhantom')).toBe(false);
    });

    it('marks regex mode in result', () => {
        const r = scanFieldBindings('record.X');
        // Babel isn't installed in unit tests, so we get the regex path.
        expect(r.usedAst).toBe(false);
    });

    it('ignores accesses on identifiers that are not exactly `record`', () => {
        const code = `
            const a = records.Name;     // plural
            const b = myrecord.Name;    // different identifier
            const c = record.Real;
        `;
        const r = scanFieldBindings(code);
        expect(Array.from(r.boundFields).sort()).toEqual(['Real']);
    });
});

describe('scanFieldBindings — AST path', () => {
    let originalBabel: unknown;

    beforeEach(() => {
        originalBabel = (globalThis as { Babel?: unknown }).Babel;
    });

    afterEach(() => {
        (globalThis as { Babel?: unknown }).Babel = originalBabel as never;
    });

    it('falls through to regex when stub Babel lacks .parse', () => {
        (globalThis as { Babel?: unknown }).Babel = { packages: {} }; // no parser
        const r = scanFieldBindings('record.X');
        expect(r.usedAst).toBe(false);
        expect(r.boundFields.has('X')).toBe(true);
    });
});
