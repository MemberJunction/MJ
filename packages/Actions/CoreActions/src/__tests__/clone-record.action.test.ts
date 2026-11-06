import { describe, it, expect, vi, beforeEach } from 'vitest';

const cloneMock = vi.fn();
const canBatch = { value: true };

import { Metadata } from '@memberjunction/core';
// The real key formatting and authorization names; only the engine and the authorizer are stubbed.
vi.mock('@memberjunction/record-cloning', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/record-cloning')>();
    return {
        ...actual,
        RecordCloneEngine: class {
            Clone = cloneMock;
        },
        CloneAuthorizer: class {
            CanBatchClone = () => canBatch.value;
        },
    };
});

/** A target key in the shape the engine really returns: pairs, not a string. */
const key = (value: string) => ({ KeyValuePairs: [{ FieldName: 'ID', Value: value }] });

const mockEntityInfo = {
    Name: 'TestEntity',
    PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
    FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
};

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        Metadata: {
            ...actual.Metadata,
            Provider: {
                ...actual.Metadata?.Provider,
                EntityByName: vi.fn().mockImplementation((name: string) => {
                    if (name === 'TestEntity') return mockEntityInfo;
                    return null;
                }),
            },
        },
    };
});

import { CloneRecordAction } from '../custom/record-cloning/clone-record.action';
import { CloneRecordsAction } from '../custom/record-cloning/clone-records.action';
import { RunActionParams } from '@memberjunction/actions-base';

describe('CloneRecordAction', () => {
    let action: CloneRecordAction;

    beforeEach(() => {
        action = new CloneRecordAction();
        cloneMock.mockReset();
    });

    it('requires EntityName and RecordID', async () => {
        const params: RunActionParams = {
            Action: { Name: 'Clone Record' } as never,
            Params: [],
            ContextUser: { ID: 'user-1' } as never,
            Provider: Metadata.Provider as never,
        };

        const res1 = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res1.Success).toBe(false);
        expect(res1.ResultCode).toBe('MISSING_PARAMETERS');

        params.Params.push({ Name: 'EntityName', Type: 'Input', Value: 'TestEntity' });
        const res2 = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res2.Success).toBe(false);
        expect(res2.ResultCode).toBe('MISSING_PARAMETERS');
    });

    it('handles dry run planning successfully', async () => {
        cloneMock.mockResolvedValueOnce({ Success: true, ResultCode: 'SUCCESS', Created: [], Counts: { Create: 3 }, Warnings: [] });

        const params: RunActionParams = {
            Action: { Name: 'Clone Record' } as never,
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'TestEntity' },
                { Name: 'RecordID', Type: 'Input', Value: '123' },
                { Name: 'DryRun', Type: 'Input', Value: true },
            ],
            ContextUser: { ID: 'user-1' } as never,
            Provider: Metadata.Provider as never,
        };

        const res = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(cloneMock.mock.calls[0][0].Options.DryRun).toBe(true);
        expect(params.Params.find((p) => p.Name === 'CreatedCount')?.Value).toBe(3);
        expect(params.Params.find((p) => p.Name === 'NewRecordID')?.Value).toBeNull();
    });

    it('clones record and pushes outputs', async () => {
        cloneMock.mockResolvedValueOnce({
            Success: true,
            ResultCode: 'SUCCESS',
            CloneLogID: 'log-uuid',
            Roots: [{ EntityName: 'TestEntity', SourceKey: key('123'), TargetKey: key('456') }],
            Created: [{ TargetKey: key('456') }, { TargetKey: key('789') }],
            Warnings: [],
        });

        const params: RunActionParams = {
            Action: { Name: 'Clone Record' } as never,
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'TestEntity' },
                { Name: 'RecordID', Type: 'Input', Value: '123' },
            ],
            ContextUser: { ID: 'user-1' } as never,
            Provider: Metadata.Provider as never,
        };

        const res = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(cloneMock).toHaveBeenCalled();

        const newRecId = params.Params.find((p) => p.Name === 'NewRecordID')?.Value;
        expect(newRecId).toBe('456');
        const logId = params.Params.find((p) => p.Name === 'CloneLogID')?.Value;
        expect(logId).toBe('log-uuid');
        const count = params.Params.find((p) => p.Name === 'CreatedCount')?.Value;
        expect(count).toBe(2);
    });
});

describe('CloneRecordsAction', () => {
    let action: CloneRecordsAction;

    beforeEach(() => {
        action = new CloneRecordsAction();
        cloneMock.mockReset();
        canBatch.value = true;
    });

    it('requires EntityName and RecordIDs', async () => {
        const params: RunActionParams = {
            Action: { Name: 'Clone Records' } as never,
            Params: [],
            ContextUser: { ID: 'user-1' } as never,
            Provider: Metadata.Provider as never,
        };

        const res1 = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res1.Success).toBe(false);
        expect(res1.ResultCode).toBe('MISSING_PARAMETERS');
    });

    const batchParams = (): RunActionParams => ({
        Action: { Name: 'Clone Records' } as never,
        Params: [
            { Name: 'EntityName', Type: 'Input', Value: 'TestEntity' },
            { Name: 'RecordIDs', Type: 'Input', Value: JSON.stringify(['1', '2']) },
        ],
        ContextUser: { ID: 'user-1' } as never,
        Provider: Metadata.Provider as never,
    });
    const run = (params: RunActionParams) =>
        (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string; Message: string }> }).InternalRunAction(params);

    it('clones every root, not just the first, and reports each one', async () => {
        cloneMock
            .mockResolvedValueOnce({ Success: true, ResultCode: 'SUCCESS', CloneLogID: 'log-1', Roots: [{ TargetKey: key('10') }], Created: [{ TargetKey: key('10') }], Warnings: [] })
            .mockResolvedValueOnce({ Success: true, ResultCode: 'SUCCESS', CloneLogID: 'log-2', Roots: [{ TargetKey: key('20') }], Created: [{ TargetKey: key('20') }, { TargetKey: key('21') }], Warnings: [] });

        const params = batchParams();
        const res = await run(params);

        expect(res).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
        expect(cloneMock).toHaveBeenCalledTimes(2);
        expect(params.Params.find((p) => p.Name === 'CreatedCount')?.Value).toBe(3);
        const results = params.Params.find((p) => p.Name === 'Results')?.Value as Array<{ RecordID: string; NewRecordID: string }>;
        expect(results.map((r) => [r.RecordID, r.NewRecordID])).toEqual([['1', '10'], ['2', '20']]);
    });

    it('reports a partial batch so the caller retries only the failures', async () => {
        cloneMock
            .mockResolvedValueOnce({ Success: true, ResultCode: 'SUCCESS', Roots: [{ TargetKey: key('10') }], Created: [{ TargetKey: key('10') }], Warnings: [] })
            .mockResolvedValueOnce({ Success: false, ResultCode: 'BLOCKED', ErrorMessage: 'too many', Warnings: [] });

        const params = batchParams();
        const res = await run(params);

        expect(res).toMatchObject({ Success: false, ResultCode: 'PARTIAL' });
        expect(res.Message).toContain('2 (too many)');
        const results = params.Params.find((p) => p.Name === 'Results')?.Value as Array<{ RecordID: string; Success: boolean }>;
        expect(results.map((r) => r.Success)).toEqual([true, false]);
    });

    it('refuses without the Clone Records: Batch authorization', async () => {
        canBatch.value = false;
        const res = await run(batchParams());
        expect(res.ResultCode).toBe('FORBIDDEN');
        expect(res.Message).toContain('Clone Records: Batch');
        expect(cloneMock).not.toHaveBeenCalled();
    });
});
