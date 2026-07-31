import { describe, it, expect } from 'vitest';
import { NoConsoleErrorsOracle } from '../test-driver/oracles/NoConsoleErrorsOracle.js';
import { DomAssertOracle } from '../test-driver/oracles/DomAssertOracle.js';
import type { OracleInput } from '@memberjunction/testing-engine';

// Minimal OracleInput — the deterministic oracles only read actualOutput.
function input(actualOutput: Record<string, unknown>): OracleInput {
    return { actualOutput } as unknown as OracleInput;
}

describe('NoConsoleErrorsOracle (CU-D2)', () => {
    const oracle = new NoConsoleErrorsOracle();

    it('passes when there are no diagnostics', async () => {
        const r = await oracle.evaluate(input({ browserDiagnostics: [] }), {});
        expect(r.passed).toBe(true);
    });

    it('passes when actualOutput has no diagnostics field at all', async () => {
        const r = await oracle.evaluate(input({}), {});
        expect(r.passed).toBe(true);
    });

    it('fails on a console error / failed request', async () => {
        const r = await oracle.evaluate(input({
            browserDiagnostics: [
                { type: 'console', level: 'error', message: 'ChunkLoadError: Loading chunk 5 failed' },
                { type: 'requestfailed', message: 'POST /graphql net::ERR_ABORTED', url: 'http://x/graphql' },
            ],
        }), {});
        expect(r.passed).toBe(false);
        expect(r.message).toContain('2 browser error');
    });

    it('excludes diagnostics matching the ignore list', async () => {
        const r = await oracle.evaluate(input({
            browserDiagnostics: [{ type: 'requestfailed', message: 'GET /favicon.ico 404', url: '/favicon.ico' }],
        }), { ignore: ['favicon'] });
        expect(r.passed).toBe(true);
    });
});

describe('DomAssertOracle (CU-D2)', () => {
    const oracle = new DomAssertOracle();
    const elements = [
        { role: 'button', name: 'Save Record', selector: 'xpath=/x' },
        { role: 'button', name: 'Delete', selector: 'xpath=/y' },
        { role: 'row', name: 'Alice', selector: 'xpath=/r1' },
        { role: 'row', name: 'Bob', selector: 'xpath=/r2' },
    ];

    it('passes when a role+name match exists', async () => {
        const r = await oracle.evaluate(input({ interactiveElements: elements }), { role: 'button', name: 'save' });
        expect(r.passed).toBe(true);
    });

    it('honors minCount (e.g. grid rows)', async () => {
        expect((await oracle.evaluate(input({ interactiveElements: elements }), { role: 'row', minCount: 2 })).passed).toBe(true);
        expect((await oracle.evaluate(input({ interactiveElements: elements }), { role: 'row', minCount: 3 })).passed).toBe(false);
    });

    it('fails clearly when no elements were recorded (grounding off)', async () => {
        const r = await oracle.evaluate(input({}), { role: 'button' });
        expect(r.passed).toBe(false);
        expect(r.message).toContain('elementGrounding');
    });

    it('requires at least one of role/name', async () => {
        const r = await oracle.evaluate(input({ interactiveElements: elements }), {});
        expect(r.passed).toBe(false);
    });
});
