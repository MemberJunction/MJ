import { describe, expect, it } from 'vitest';
import { transform } from '@babel/standalone';
import { HERMES_COMPILER_CONFIG } from '../interactive/hermes-babel';

/**
 * @fileoverview The Babel settings that let a component's `async/await` run under Hermes.
 *
 * Hermes compiles the app's own modules to bytecode ahead of time, where `async` is fully
 * supported. Interactive components take a different path: they are compiled at runtime and
 * executed through `new Function`, which goes through Hermes's *runtime* compiler — and that one
 * rejects async outright with `async functions are unsupported`.
 *
 * A component doing `const rows = await utilities.rv.RunView(…)` is the normal way to load data,
 * so this was not an edge case: it failed to compile, with an error naming neither cause nor
 * remedy. These tests assert the emitted code contains no `async` for Hermes to reject.
 *
 * `transform-regenerator` is deliberately NOT in the plugin list. It would also remove the
 * generators this produces, but in this Babel version it miscompiles real component code
 * (`Property name expected type of string but got undefined`) — measured against the component
 * registry, it broke 12 components that otherwise transpile cleanly. Hermes accepts generators in
 * runtime-compiled code; it is only `async` it refuses. The narrower transform is the correct one.
 */

/** Transpiles source the way the interactive runtime will. */
function Transpile(code: string): string {
    return transform(code, {
        presets: HERMES_COMPILER_CONFIG.babel.presets,
        plugins: HERMES_COMPILER_CONFIG.babel.plugins,
        filename: 'Test.jsx',
    }).code as string;
}

describe('HERMES_COMPILER_CONFIG', () => {
    it('keeps the react preset, because it replaces the default list rather than extending it', () => {
        expect(HERMES_COMPILER_CONFIG.babel.presets).toContain('react');
    });

    it('removes async from an async arrow inside an effect', () => {
        // The shape essentially every data-backed component uses.
        const out = Transpile(`function C({ utilities }) {
            useEffect(() => {
                (async () => {
                    const r = await utilities.rv.RunView({ EntityName: 'MJ: AI Models' });
                    setRows(r.Results);
                })();
            }, []);
            return null;
        }`);
        expect(out).not.toMatch(/\basync\b/);
        expect(out).not.toMatch(/\bawait\b/);
    });

    it('removes async from an async function declaration and method', () => {
        const out = Transpile(`function C() {
            async function load() { return await go(); }
            const obj = { async fetchIt() { return await go(); } };
            return [load, obj];
        }`);
        expect(out).not.toMatch(/\basync\b/);
        expect(out).not.toMatch(/\bawait\b/);
    });

    it('still compiles JSX', () => {
        const out = Transpile('function C() { return <div className="x">hi</div>; }');
        expect(out).toContain('createElement');
        expect(out).not.toContain('<div');
    });

    it('leaves code without async untouched in behaviour', () => {
        // A promise-chain component must not be rewritten into something else.
        const out = Transpile('function C() { return fetchIt().then(function (r) { return r; }); }');
        expect(out).toContain('.then(');
    });

    it('does not include transform-regenerator', () => {
        // Guards the finding above: adding it back silently breaks real components.
        expect(HERMES_COMPILER_CONFIG.babel.plugins).not.toContain('transform-regenerator');
    });
});
