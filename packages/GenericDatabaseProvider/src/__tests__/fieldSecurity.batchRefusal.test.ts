/**
 * A field-security refusal of one view in a `RunViews` batch is that view's own failure: the
 * refused item comes back `Success: false` with the refusal's message, and every other view in
 * the batch still returns its rows. Covers the plain, the concurrency-limited and the
 * all-`count_only` batch paths.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return { Config: vi.fn(), Encrypt: vi.fn(), IsEncrypted: vi.fn().mockReturnValue(false), GetKeyByID: vi.fn() };
        },
    },
}));

import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import { FieldSecurityError, type RunViewParams, type RunViewResult } from '@memberjunction/core';

const REFUSED = 'REFUSE';

function okResult(entityName: string): RunViewResult {
    return { Success: true, Results: [{ Name: entityName }], RowCount: 1, TotalRowCount: 1, ErrorMessage: '' } as unknown as RunViewResult;
}

/** The slice of the provider `InternalRunViews` touches; a view whose filter is REFUSE throws a field-security refusal. */
function fakeProvider() {
    const proto = GenericDatabaseProvider.prototype as unknown as Record<string, Function>;
    const run = async (p: RunViewParams): Promise<RunViewResult> => {
        if (p.ExtraFilter === REFUSED) {
            throw new FieldSecurityError('Salary', p.EntityName ?? '');
        }
        return okResult(p.EntityName ?? '');
    };
    const self: Record<string, unknown> = {
        InternalRunView: vi.fn(run),
        RunViewCore: vi.fn(run),
        ExecuteSQL: vi.fn(async () => []),
        QuoteIdentifier: (n: string) => `[${n}]`,
        isConnectionError: () => false,
    };
    self.runBatchedView = proto.runBatchedView;
    self.RunCoalescedCountBatch = proto.RunCoalescedCountBatch;
    return (params: RunViewParams[]) => (proto.InternalRunViews as Function).call(self, params) as Promise<RunViewResult[]>;
}

const batch = (resultType?: 'count_only'): RunViewParams[] => [
    { EntityName: 'Projects', ResultType: resultType },
    { EntityName: 'Employees', ExtraFilter: REFUSED, ResultType: resultType },
    { EntityName: 'Tasks', ResultType: resultType },
];

function expectOnlyTheRefusedItemFailed(results: RunViewResult[]): void {
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ Success: true, Results: [{ Name: 'Projects' }] });
    expect(results[2]).toMatchObject({ Success: true, Results: [{ Name: 'Tasks' }] });
    expect(results[1].Success).toBe(false);
    expect(results[1].Results).toEqual([]);
    expect(results[1].ErrorMessage).toBe(new FieldSecurityError('Salary', 'Employees').message);
}

describe('InternalRunViews: a field-security refusal fails only its own item', () => {
    const defaultLimit = GenericDatabaseProvider.MaxConcurrentViewsPerBatch;
    afterEach(() => {
        GenericDatabaseProvider.MaxConcurrentViewsPerBatch = defaultLimit;
    });

    it('on an unlimited batch', async () => {
        GenericDatabaseProvider.MaxConcurrentViewsPerBatch = 0;
        expectOnlyTheRefusedItemFailed(await fakeProvider()(batch()));
    });

    it('on a concurrency-limited batch', async () => {
        GenericDatabaseProvider.MaxConcurrentViewsPerBatch = 1;
        expectOnlyTheRefusedItemFailed(await fakeProvider()(batch()));
    });

    it('on an all-count_only batch', async () => {
        expectOnlyTheRefusedItemFailed(await fakeProvider()(batch('count_only')));
    });

    it('still throws an error that is not a field-security refusal', async () => {
        const proto = GenericDatabaseProvider.prototype as unknown as Record<string, Function>;
        const boom = new Error('pool closed');
        const self: Record<string, unknown> = { InternalRunView: vi.fn(async () => { throw boom; }) };
        self.runBatchedView = proto.runBatchedView;
        self.RunCoalescedCountBatch = proto.RunCoalescedCountBatch;
        GenericDatabaseProvider.MaxConcurrentViewsPerBatch = 0;
        await expect((proto.InternalRunViews as Function).call(self, [{ EntityName: 'A' }, { EntityName: 'B' }])).rejects.toBe(boom);
    });
});
