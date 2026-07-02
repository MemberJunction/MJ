import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadOraclesModule } from '../utils/oracle-module-loader';

/**
 * Tests the duck-typing + registration logic without needing a real
 * TestEngine. We use a minimal stub whose `RegisterOracle` captures what
 * gets registered.
 */
function makeStubEngine() {
    const registered: Array<{ type: string }> = [];
    const engine = {
        RegisterOracle(oracle: { type: string }) {
            registered.push(oracle);
        },
    };
    // The loader's signature accepts a TestEngine, but it only calls
    // RegisterOracle on it. The runtime shape is what matters.
    return { engine: engine as unknown as Parameters<typeof loadOraclesModule>[1], registered };
}

describe('loadOraclesModule', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(path.join(os.tmpdir(), 'oracle-loader-test-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeModule(filename: string, content: string): string {
        const modPath = path.join(tmpDir, filename);
        mkdirSync(path.dirname(modPath), { recursive: true });
        writeFileSync(modPath, content);
        return modPath;
    }

    it('registers a class-style IOracle export', async () => {
        const modulePath = writeModule(
            'class-export.cjs',
            `
            class MyOracle {
                constructor() { this.type = 'my-class'; }
                async evaluate() { return { oracleType: this.type, passed: true, score: 1.0, message: 'ok' }; }
            }
            module.exports = { MyOracle };
            `,
        );
        const { engine, registered } = makeStubEngine();
        const summary = await loadOraclesModule(modulePath, engine);

        expect(summary.registered).toEqual(['my-class']);
        expect(summary.skipped).toEqual([]);
        expect(registered).toHaveLength(1);
        expect(registered[0].type).toBe('my-class');
    });

    it('registers an instance-style IOracle export', async () => {
        const modulePath = writeModule(
            'instance-export.cjs',
            `
            module.exports = {
                myOracle: {
                    type: 'my-instance',
                    async evaluate() { return { oracleType: this.type, passed: true, score: 1.0, message: 'ok' }; }
                }
            };
            `,
        );
        const { engine, registered } = makeStubEngine();
        const summary = await loadOraclesModule(modulePath, engine);

        expect(summary.registered).toEqual(['my-instance']);
        expect(registered).toHaveLength(1);
    });

    it('handles mixed class + instance exports', async () => {
        const modulePath = writeModule(
            'mixed.cjs',
            `
            class A {
                constructor() { this.type = 'oracle-a'; }
                async evaluate() { return { oracleType: this.type, passed: true, score: 1, message: '' }; }
            }
            const b = { type: 'oracle-b', async evaluate() { return { oracleType: 'oracle-b', passed: true, score: 1, message: '' }; } };
            module.exports = { A, b };
            `,
        );
        const { engine, registered } = makeStubEngine();
        const summary = await loadOraclesModule(modulePath, engine);

        expect(summary.registered.sort()).toEqual(['oracle-a', 'oracle-b']);
        expect(registered).toHaveLength(2);
    });

    it('silently skips non-oracle exports', async () => {
        const modulePath = writeModule(
            'mixed-with-helpers.cjs',
            `
            class A {
                constructor() { this.type = 'oracle-a'; }
                async evaluate() { return { oracleType: this.type, passed: true, score: 1, message: '' }; }
            }
            const helper = () => 'just a function';
            const constant = 42;
            module.exports = { A, helper, constant };
            `,
        );
        const { engine, registered } = makeStubEngine();
        const summary = await loadOraclesModule(modulePath, engine);

        expect(summary.registered).toEqual(['oracle-a']);
        expect(summary.skipped.sort()).toEqual(['constant', 'helper']);
        expect(registered).toHaveLength(1);
    });

    it('throws when the module path does not exist', async () => {
        const { engine } = makeStubEngine();
        await expect(
            loadOraclesModule(path.join(tmpDir, 'missing.cjs'), engine),
        ).rejects.toThrow(/Oracle module not found/);
    });

    it('records instantiation failures in skipped (not registered) without crashing', async () => {
        const modulePath = writeModule(
            'throws-on-construct.cjs',
            `
            class Bad {
                constructor() { throw new Error('boom'); }
                async evaluate() { return { oracleType: 'bad', passed: true, score: 1, message: '' }; }
            }
            class Good {
                constructor() { this.type = 'good'; }
                async evaluate() { return { oracleType: this.type, passed: true, score: 1, message: '' }; }
            }
            module.exports = { Bad, Good };
            `,
        );
        const { engine, registered } = makeStubEngine();
        const summary = await loadOraclesModule(modulePath, engine);

        expect(summary.registered).toEqual(['good']);
        expect(summary.skipped.some((s) => s.startsWith('Bad'))).toBe(true);
        expect(registered).toHaveLength(1);
    });

    it('inspects module.exports = { A, B } shape (bare CJS without nesting)', async () => {
        // CJS `module.exports = obj` lands under `mod.default` when imported
        // via `import()` — make sure the loader walks that too.
        const modulePath = writeModule(
            'flat-cjs.cjs',
            `
            class FlatOracle {
                constructor() { this.type = 'flat-oracle'; }
                async evaluate() { return { oracleType: this.type, passed: true, score: 1, message: '' }; }
            }
            module.exports = { FlatOracle };
            `,
        );
        const { engine, registered } = makeStubEngine();
        const summary = await loadOraclesModule(modulePath, engine);

        expect(summary.registered).toContain('flat-oracle');
        expect(registered).toHaveLength(1);
    });
});
