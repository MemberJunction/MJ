import { describe, expect, it, vi } from 'vitest';
import type { ComponentUtilities } from '@memberjunction/interactive-component-types';
import { CapturedData, WrapUtilitiesWithCapture } from '../interactive/captured-data';

/**
 * @fileoverview Keeping a component's data when the component itself fails.
 *
 * By the time most components throw, the fetching has already succeeded — the failure is in the
 * drawing. Showing "this component ran into an error" instead of the rows discards the thing the
 * reader came for.
 *
 * The rule the wrapper must never break: capturing is invisible to the component. Same promises,
 * same values, and a fault in the recording cannot become a fault in the component's data.
 */

/** A utilities double whose view and query calls return canned results. */
function FakeUtilities(overrides: Partial<ComponentUtilities> = {}): ComponentUtilities {
    return {
        md: { Entities: [], GetEntityObject: vi.fn() },
        rv: {
            RunView: vi.fn(async () => ({ Success: true, Results: [{ ID: '1', Name: 'Row' }] })),
            RunViews: vi.fn(async () => [
                { Success: true, Results: [{ ID: 'a' }] },
                { Success: true, Results: [{ ID: 'b' }] },
            ]),
        },
        rq: { RunQuery: vi.fn(async () => ({ Success: true, Results: [{ Total: 7 }] })) },
        ...overrides,
    } as unknown as ComponentUtilities;
}

describe('CapturedData', () => {
    it('reports nothing to show until something is recorded', () => {
        expect(new CapturedData().HasData).toBe(false);
    });

    it('ignores anything that is not a non-empty row set', () => {
        // A successful call returning zero rows is not a fallback worth showing, and a malformed
        // result must not become a table of junk.
        const c = new CapturedData();
        for (const rows of [undefined, null, [], 'rows', 42, {}]) {
            c.Record('X', rows);
        }
        expect(c.HasData).toBe(false);
    });

    it('turns recorded rows into tables named for their source', () => {
        const c = new CapturedData();
        c.Record('MJ: AI Models', [{ Name: 'a' }, { Name: 'b' }]);
        const [table] = c.ToTables();
        expect(table.name).toBe('MJ: AI Models');
        expect(table.rows).toHaveLength(2);
    });

    it('keeps only the most recent results, so a polling component cannot grow without bound', () => {
        const c = new CapturedData();
        for (let i = 0; i < 20; i++) c.Record(`S${i}`, [{ i }]);
        const tables = c.ToTables();
        expect(tables.length).toBeLessThanOrEqual(8);
        // The newest survive — an older result has been superseded anyway.
        expect(tables[tables.length - 1].name).toBe('S19');
    });
});

describe('WrapUtilitiesWithCapture', () => {
    it('returns exactly what the underlying call returned', async () => {
        // The contract that matters most: a component must not be able to tell it is being watched.
        const inner = FakeUtilities();
        const wrapped = WrapUtilitiesWithCapture(inner, new CapturedData());
        const result = await wrapped.rv.RunView({ EntityName: 'MJ: AI Models' } as never);
        expect(result).toEqual({ Success: true, Results: [{ ID: '1', Name: 'Row' }] });
        expect(inner.rv.RunView).toHaveBeenCalledOnce();
    });

    it('records a view under its entity name', async () => {
        const captured = new CapturedData();
        const wrapped = WrapUtilitiesWithCapture(FakeUtilities(), captured);
        await wrapped.rv.RunView({ EntityName: 'MJ: AI Models' } as never);
        expect(captured.ToTables()[0].name).toBe('MJ: AI Models');
    });

    it('records each result of a batched RunViews against its own entity', async () => {
        const captured = new CapturedData();
        const wrapped = WrapUtilitiesWithCapture(FakeUtilities(), captured);
        await wrapped.rv.RunViews([{ EntityName: 'Users' }, { EntityName: 'Roles' }] as never);
        expect(captured.ToTables().map((t) => t.name)).toEqual(['Users', 'Roles']);
    });

    it('records a query under its name', async () => {
        const captured = new CapturedData();
        const wrapped = WrapUtilitiesWithCapture(FakeUtilities(), captured);
        await wrapped.rq.RunQuery({ QueryName: 'Active Users' } as never);
        expect(captured.ToTables()[0].name).toBe('Active Users');
    });

    it('leaves the other capabilities exactly as they were', async () => {
        // Only reads are recorded; nothing else about the utilities object changes.
        const inner = FakeUtilities();
        const wrapped = WrapUtilitiesWithCapture(inner, new CapturedData());
        expect(wrapped.md).toBe(inner.md);
    });

    it('never lets a failed call look successful', async () => {
        const inner = FakeUtilities({
            rv: {
                RunView: vi.fn(async () => {
                    throw new Error('backend down');
                }),
                RunViews: vi.fn(),
            },
        } as unknown as Partial<ComponentUtilities>);
        const wrapped = WrapUtilitiesWithCapture(inner, new CapturedData());
        await expect(wrapped.rv.RunView({ EntityName: 'X' } as never)).rejects.toThrow('backend down');
    });
});
