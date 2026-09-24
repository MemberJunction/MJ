import { describe, expect, it } from 'vitest';
import type { ComponentSpec } from '@memberjunction/react-runtime';
import {
    CollectHierarchyLibraries,
    DESKTOP_ONLY,
    FindMobileLibrary,
    InteropModule,
    MOBILE_LIBRARIES,
    PublishLibraryGlobals,
    ResolveMobileLibraries,
} from '../interactive/library-registry';
import { AssessSpec } from '../interactive/mobile-safety';

/**
 * @fileoverview The library seam that gives mobile parity with the Angular react bridge.
 *
 * The bug these cover is silent: when `RuntimeContext.libraries` lacks a key, the compiler still
 * emits `const _ = libraries['_']`, the binding is `undefined`, and the component throws on its
 * first call with a message that names neither the library nor the cause. Every assertion here is
 * about that map being correctly keyed and correctly filled.
 *
 * The imports are real — these tests load lodash, d3 and the rest exactly as the device will, so a
 * package whose export shape does not match its declared `Shape` fails here rather than on a phone.
 */

/** Builds a minimal renderable spec declaring the given libraries. */
function SpecWith(libraries: NonNullable<ComponentSpec['libraries']>): ComponentSpec {
    return {
        name: 'Test',
        code: 'function createComponent() { return () => null; }',
        libraries,
    } as ComponentSpec;
}

describe('MOBILE_LIBRARIES', () => {
    it('keys every entry by a unique global variable', () => {
        const globals = MOBILE_LIBRARIES.map((l) => l.GlobalVariable);
        expect(new Set(globals).size).toBe(globals.length);
    });

    it('never claims a library the desktop-only list rules out', () => {
        // A library in both tables would be offered and refused at once — the two must not overlap.
        for (const entry of MOBILE_LIBRARIES) {
            expect(DESKTOP_ONLY[entry.GlobalVariable]).toBeUndefined();
        }
    });

    it('declares the global variables MJ metadata uses', () => {
        // Spot-check against `__mj.ComponentLibrary`: these globals are what agent-authored specs
        // reference, and a drift here is invisible until a component fails to bind.
        const globals = MOBILE_LIBRARIES.map((l) => l.GlobalVariable);
        expect(globals).toContain('_');
        expect(globals).toContain('ss');
        expect(globals).toContain('math');
        expect(globals).toContain('chroma');
        expect(globals).toContain('XLSX');
    });
});

describe('FindMobileLibrary', () => {
    it('matches on global variable, which is what the compiler binds', () => {
        // A spec is free to name the package anything; the binding is the contract.
        const found = FindMobileLibrary({ name: 'whatever-the-agent-called-it', globalVariable: '_' });
        expect(found?.Name).toBe('lodash');
    });

    it('falls back to the package name, case-insensitively', () => {
        const found = FindMobileLibrary({ name: 'Simple-Statistics', globalVariable: '' });
        expect(found?.GlobalVariable).toBe('ss');
    });

    it('returns undefined for a library mobile cannot provide', () => {
        expect(FindMobileLibrary({ name: 'chart.js', globalVariable: 'Chart' })).toBeUndefined();
    });
});

describe('InteropModule', () => {
    it('unwraps a callable library to its default export', () => {
        const fn = () => 'called';
        expect(InteropModule({ default: fn }, 'callable')).toBe(fn);
    });

    it('keeps the namespace when a callable library has no default', () => {
        // Bundlers disagree about CommonJS interop; handing back `undefined` would be worse than
        // handing back the namespace, which at least carries the named exports.
        const ns = { someExport: 1 };
        expect(InteropModule(ns, 'callable')).toBe(ns);
    });

    it('keeps the namespace for a namespace library that also carries a default', () => {
        const ns = { DateTime: {}, default: { DateTime: {} } };
        expect(InteropModule(ns, 'namespace')).toBe(ns);
    });

    it('unwraps a namespace library that the bundler collapsed into default only', () => {
        const inner = { DateTime: {} };
        expect(InteropModule({ default: inner, __esModule: true }, 'namespace')).toBe(inner);
    });

    it('prefers the default object for an object-shaped library', () => {
        const inner = { utils: {} };
        expect(InteropModule({ default: inner, utils: {} }, 'object')).toBe(inner);
    });
});

describe('ResolveMobileLibraries', () => {
    it('returns an empty map for a spec with no libraries', async () => {
        const resolved = await ResolveMobileLibraries(undefined);
        expect(resolved.Libraries).toEqual({});
        expect(resolved.Missing).toEqual([]);
    });

    it('loads a real library under the global variable the component will bind', async () => {
        const resolved = await ResolveMobileLibraries([{ name: 'lodash', globalVariable: '_' }]);
        const lodash = resolved.Libraries['_'] as { sumBy?: unknown };
        expect(typeof lodash?.sumBy).toBe('function');
    });

    it('loads every declared library the app can supply, with a working export each', async () => {
        // The whole registry, imported for real: this is the test that catches a package whose
        // export shape does not match its declared `Shape`.
        const refs = MOBILE_LIBRARIES.map((l) => ({ name: l.Name, globalVariable: l.GlobalVariable }));
        const resolved = await ResolveMobileLibraries(refs);

        expect(resolved.Missing).toEqual([]);
        expect(Object.keys(resolved.Libraries).sort()).toEqual(refs.map((r) => r.globalVariable).sort());

        // One real call per library family, so "it imported" isn't mistaken for "it works".
        const lib = <T>(g: string): T => resolved.Libraries[g] as T;
        expect(lib<{ sumBy: (a: unknown[], k: string) => number }>('_').sumBy([{ n: 2 }, { n: 3 }], 'n')).toBe(5);
        expect(lib<{ median: (a: number[]) => number }>('ss').median([1, 5, 3])).toBe(3);
        expect(lib<{ evaluate: (s: string) => number }>('math').evaluate('2 + 3')).toBe(5);
        expect(typeof lib<(d: string) => { format: (f: string) => string }>('dayjs')('2026-01-02').format).toBe('function');
        expect(lib<{ DateTime: unknown }>('luxon').DateTime).toBeDefined();
        expect(typeof lib<{ scaleLinear: unknown }>('d3').scaleLinear).toBe('function');
        expect(typeof lib<{ v4: () => string }>('uuid').v4).toBe('function');
        expect(typeof lib<{ feature: unknown }>('topojson').feature).toBe('function');
        expect(lib<{ utils: unknown }>('XLSX').utils).toBeDefined();
        expect(typeof lib<{ parse: unknown }>('marked').parse).toBe('function');
        expect(typeof lib<(c: string) => { hex: () => string }>('chroma')).toBe('function');
        expect(typeof lib<{ get: unknown }>('axios').get).toBe('function');
        expect(typeof lib<(d: string) => { format: (f: string) => string }>('moment')('2026-01-02').format).toBe('function');
    });

    it('names an unprovidable library with the reason rather than dropping it', async () => {
        const resolved = await ResolveMobileLibraries([{ name: 'chart.js', globalVariable: 'Chart' }]);
        expect(resolved.Libraries).toEqual({});
        expect(resolved.Missing).toHaveLength(1);
        expect(resolved.Missing[0]).toContain('chart.js');
        expect(resolved.Missing[0]).toContain('canvas');
    });

    it('supplies what it can even when one library is unprovidable', async () => {
        // Partial resolution matters because the caller, not this function, decides whether a
        // partial set is worth rendering.
        const resolved = await ResolveMobileLibraries([
            { name: 'lodash', globalVariable: '_' },
            { name: 'leaflet', globalVariable: 'L' },
        ]);
        expect(resolved.Libraries['_']).toBeDefined();
        expect(resolved.Missing).toHaveLength(1);
    });
});

describe('CollectHierarchyLibraries', () => {
    it('gathers libraries from every component in the tree', () => {
        // `loadHierarchy` compiles each component against its OWN declared libraries, so the root's
        // list says nothing about what a child needs — every one must be loaded before any compile.
        const spec = {
            name: 'Root',
            code: 'function Root() { return null; }',
            libraries: [{ name: 'lodash', globalVariable: '_' }],
            dependencies: [
                {
                    name: 'Child',
                    code: 'function Child() { return null; }',
                    libraries: [{ name: 'd3', globalVariable: 'd3' }],
                    dependencies: [
                        {
                            name: 'GrandChild',
                            code: 'function GrandChild() { return null; }',
                            libraries: [{ name: 'dayjs', globalVariable: 'dayjs' }],
                        },
                    ],
                },
            ],
        } as ComponentSpec;
        const globals = CollectHierarchyLibraries(spec).map((l) => l.globalVariable);
        expect(globals.sort()).toEqual(['_', 'd3', 'dayjs']);
    });

    it('de-duplicates a library two components both declare', () => {
        const child = {
            name: 'Child',
            code: 'function Child() { return null; }',
            libraries: [{ name: 'lodash', globalVariable: '_' }],
        };
        const spec = {
            name: 'Root',
            code: 'function Root() { return null; }',
            libraries: [{ name: 'lodash', globalVariable: '_' }],
            dependencies: [child],
        } as ComponentSpec;
        expect(CollectHierarchyLibraries(spec)).toHaveLength(1);
    });

    it('terminates on a hierarchy that references a spec twice', () => {
        // Identity-tracked, so a shared child object is visited once instead of forever.
        const shared = {
            name: 'Shared',
            code: 'function Shared() { return null; }',
            libraries: [{ name: 'dayjs', globalVariable: 'dayjs' }],
        } as ComponentSpec;
        const spec = {
            name: 'Root',
            code: 'function Root() { return null; }',
            dependencies: [shared, shared],
        } as ComponentSpec;
        expect(CollectHierarchyLibraries(spec).map((l) => l.globalVariable)).toEqual(['dayjs']);
    });

    it('returns nothing for a spec that declares nothing', () => {
        expect(CollectHierarchyLibraries(undefined)).toEqual([]);
    });
});

describe('PublishLibraryGlobals', () => {
    /** Removes a global this suite defined, so tests stay independent of each other. */
    function DropGlobal(name: string): void {
        delete (globalThis as Record<string, unknown>)[name];
    }

    it('defines the library under its global variable name', () => {
        // This is the half that actually makes components work. The compiler declares
        // `const _ = libraries['_']` inside `DestructureWrapperUserComponent`, one scope in from
        // where it splices the component source — so a component body reading `_` reads a free
        // variable, which on the web is the global a UMD script tag defined.
        const marker = { marker: true };
        PublishLibraryGlobals({ __mjTestLib: marker });
        expect((globalThis as Record<string, unknown>).__mjTestLib).toBe(marker);
        DropGlobal('__mjTestLib');
    });

    it('never overwrites a name something else already owns', () => {
        // Mirrors LibraryLoader's own `if (!window.React)` guard: an existing owner wins.
        Object.defineProperty(globalThis, '__mjTestTaken', { value: 'original', configurable: true });
        PublishLibraryGlobals({ __mjTestTaken: 'library' });
        expect((globalThis as Record<string, unknown>).__mjTestTaken).toBe('original');
        DropGlobal('__mjTestTaken');
    });

    it('does not enumerate onto the global object', () => {
        PublishLibraryGlobals({ __mjTestHidden: 1 });
        expect(Object.keys(globalThis)).not.toContain('__mjTestHidden');
        expect((globalThis as Record<string, unknown>).__mjTestHidden).toBe(1);
        DropGlobal('__mjTestHidden');
    });
});

describe('AssessSpec — libraries', () => {
    it('renders natively when every library can be supplied on-device', () => {
        // The regression this guards: every one of these used to hit "best viewed on desktop".
        const spec = SpecWith([
            { name: 'lodash', globalVariable: '_' },
            { name: 'simple-statistics', globalVariable: 'ss' },
            { name: 'dayjs', globalVariable: 'dayjs' },
        ]);
        const verdict = AssessSpec(spec);
        expect(verdict.Renderable).toBe(true);
        expect(verdict.Mode).toBe('native');
    });

    it('routes to the DOM host for a library the native runtime cannot supply', () => {
        // Chart.js draws into a canvas. Rather than refuse, the component gets a real browser
        // document — see `dom-host/`. It is still renderable; only the renderer changes.
        const spec = SpecWith([
            { name: 'lodash', globalVariable: '_' },
            { name: 'chart.js', globalVariable: 'Chart' },
        ]);
        const verdict = AssessSpec(spec);
        expect(verdict.Renderable).toBe(true);
        expect(verdict.Mode).toBe('dom');
        expect(verdict.DomLibraries).toContain('chart.js');
        expect(verdict.DomLibraries).not.toContain('lodash');
    });

    it('renders a spec whose child carries its own code and its own libraries', () => {
        // The regression this guards: child components used to be refused outright, so a component
        // built out of parts — which is how non-trivial agent output is shaped — never rendered.
        const spec = {
            ...SpecWith([{ name: 'lodash', globalVariable: '_' }]),
            dependencies: [
                {
                    name: 'Child',
                    code: 'function Child() { return null; }',
                    libraries: [{ name: 'd3', globalVariable: 'd3' }],
                },
            ],
        } as ComponentSpec;
        expect(AssessSpec(spec).Renderable).toBe(true);
    });

    it('routes the whole component to the DOM host when a CHILD needs a browser library', () => {
        // All-or-nothing per component: a component's libraries have to coexist in one document,
        // so one canvas-bound child sends the whole tree to the browser.
        const spec = {
            ...SpecWith([{ name: 'lodash', globalVariable: '_' }]),
            dependencies: [
                {
                    name: 'Child',
                    code: 'function Child() { return null; }',
                    libraries: [{ name: 'chart.js', globalVariable: 'Chart' }],
                },
            ],
        } as ComponentSpec;
        const verdict = AssessSpec(spec);
        expect(verdict.Mode).toBe('dom');
        expect(verdict.DomLibraries).toContain('chart.js');
    });

    it('does not decline a child the spec names instead of carrying', () => {
        // Naming children rather than inlining them is what the component authoring guide
        // prescribes, and it is how most registry components are built. Refusing them here — as
        // this gate once did — declined the majority of real components over a registry lookup the
        // app can perform. Resolution is the renderer's job now; see `hierarchy-resolver.ts`.
        const spec = {
            ...SpecWith([]),
            dependencies: [{ name: 'DataGrid', location: 'registry' }],
        } as ComponentSpec;
        expect(AssessSpec(spec).Renderable).toBe(true);
    });

    it('detects a browser-only library at any depth, not just the first', () => {
        const spec = {
            ...SpecWith([]),
            dependencies: [
                {
                    name: 'Child',
                    code: 'function Child() { return null; }',
                    dependencies: [
                        {
                            name: 'GrandChild',
                            code: 'function GrandChild() { return null; }',
                            libraries: [{ name: 'leaflet', globalVariable: 'L' }],
                        },
                    ],
                },
            ],
        } as ComponentSpec;
        expect(AssessSpec(spec).DomLibraries).toContain('leaflet');
    });

    it('still declines a spec with no code', () => {
        expect(AssessSpec({ name: 'X', code: '' } as ComponentSpec).Renderable).toBe(false);
    });
});
