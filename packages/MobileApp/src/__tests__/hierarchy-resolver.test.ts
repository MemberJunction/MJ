import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ComponentSpec } from '@memberjunction/react-runtime';

/**
 * @fileoverview Resolving registry-backed children before anything compiles.
 *
 * The bug this guards is timing, not correctness of the fetch. `loadHierarchy` fetches registry
 * children itself — but it *compiles each one as it fetches it*, and a component's library bindings
 * are emitted at the top of its factory. So a child whose spec lives in the registry declares
 * libraries that are unknowable until it is too late to load them. This pre-pass exists purely to
 * learn them in time.
 *
 * `ComponentMetadataEngine` is mocked: these are about the walk, not about the registry read.
 */

const { findComponent } = vi.hoisted(() => ({ findComponent: vi.fn() }));

vi.mock('@memberjunction/core-entities', () => ({
    ComponentMetadataEngine: { Instance: { FindComponent: findComponent } },
}));

const { ResolveHierarchy } = await import('../interactive/hierarchy-resolver');

/** Registers a fake registry row for a component name. */
function Registry(entries: Record<string, object>): void {
    findComponent.mockImplementation(async (name: string) =>
        entries[name] ? { Specification: JSON.stringify(entries[name]) } : undefined,
    );
}

beforeEach(() => {
    findComponent.mockReset();
});

describe('ResolveHierarchy', () => {
    it('finds a library declared only by a registry-backed child', () => {
        // The whole point: the root's spec says nothing about dayjs, and without the registry read
        // the child would compile with `dayjs` undefined.
        Registry({
            VendorRollup: { name: 'VendorRollup', code: 'function VendorRollup(){}', libraries: [{ name: 'dayjs', globalVariable: 'dayjs' }] },
        });
        const spec = {
            name: 'Board',
            code: 'function Board(){}',
            libraries: [{ name: 'lodash', globalVariable: '_' }],
            dependencies: [{ name: 'VendorRollup', location: 'registry' }],
        } as ComponentSpec;

        return ResolveHierarchy(spec).then((r) => {
            expect(r.Libraries.map((l) => l.globalVariable).sort()).toEqual(['_', 'dayjs']);
            expect(r.Unresolved).toEqual([]);
        });
    });

    it('walks registry children recursively', async () => {
        Registry({
            Mid: { name: 'Mid', code: 'x', dependencies: [{ name: 'Leaf', location: 'registry' }] },
            Leaf: { name: 'Leaf', code: 'x', libraries: [{ name: 'd3', globalVariable: 'd3' }] },
        });
        const spec = { name: 'Root', code: 'x', dependencies: [{ name: 'Mid', location: 'registry' }] } as ComponentSpec;
        const r = await ResolveHierarchy(spec);
        expect(r.Libraries.map((l) => l.globalVariable)).toEqual(['d3']);
    });

    it('does not read the registry for a child that carries its own code', async () => {
        const spec = {
            name: 'Root',
            code: 'x',
            dependencies: [{ name: 'Inline', code: 'function Inline(){}', libraries: [{ name: 'lodash', globalVariable: '_' }] }],
        } as ComponentSpec;
        const r = await ResolveHierarchy(spec);
        expect(r.Libraries.map((l) => l.globalVariable)).toEqual(['_']);
        expect(findComponent).not.toHaveBeenCalled();
    });

    it('names a child the registry does not have rather than throwing', async () => {
        // A failed lookup must not cost the reader the component: `loadHierarchy` has paths this
        // pre-pass does not, so the decision belongs to the caller.
        Registry({});
        const spec = { name: 'Root', code: 'x', dependencies: [{ name: 'Missing', location: 'registry' }] } as ComponentSpec;
        const r = await ResolveHierarchy(spec);
        expect(r.Unresolved).toEqual(['Missing']);
        expect(r.Libraries).toEqual([]);
    });

    it('names an external-registry child instead of guessing at its libraries', async () => {
        // Fetching those needs the runtime's GraphQL registry client; reporting the subtree as
        // unscanned is honest, where returning an empty library list would look like "declares none".
        const spec = {
            name: 'Root',
            code: 'x',
            dependencies: [{ name: 'Remote', location: 'registry', registry: 'SomeExternalRegistry' }],
        } as ComponentSpec;
        const r = await ResolveHierarchy(spec);
        expect(r.Unresolved).toEqual(['Remote']);
        expect(findComponent).not.toHaveBeenCalled();
    });

    it('survives a registry read that throws', async () => {
        findComponent.mockRejectedValue(new Error('network down'));
        const spec = { name: 'Root', code: 'x', dependencies: [{ name: 'Flaky', location: 'registry' }] } as ComponentSpec;
        const r = await ResolveHierarchy(spec);
        expect(r.Unresolved).toEqual(['Flaky']);
    });

    it('visits a repeated child once', async () => {
        Registry({ Shared: { name: 'Shared', code: 'x', libraries: [{ name: 'lodash', globalVariable: '_' }] } });
        const spec = {
            name: 'Root',
            code: 'x',
            dependencies: [{ name: 'Shared', location: 'registry' }, { name: 'Shared', location: 'registry' }],
        } as ComponentSpec;
        const r = await ResolveHierarchy(spec);
        expect(r.Libraries).toHaveLength(1);
        expect(findComponent).toHaveBeenCalledTimes(1);
    });

    it('returns nothing for an absent spec', async () => {
        expect(await ResolveHierarchy(null)).toEqual({ Libraries: [], Unresolved: [] });
    });
});
