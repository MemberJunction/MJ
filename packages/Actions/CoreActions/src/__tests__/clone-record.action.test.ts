import { describe, it, expect, vi, beforeEach } from 'vitest';

const cloneMock = vi.fn();
const planMock = vi.fn();

vi.mock('@memberjunction/record-cloning', () => {
    return {
        RecordCloneEngine: class {
            Clone = cloneMock;
            Plan = planMock;
        },
    };
});

const mockEntityInfo = {
    Name: 'TestEntity',
    PrimaryKeys: [{ Name: 'ID' }],
    FirstPrimaryKey: { Name: 'ID' },
};

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class CompositeKeyMock {
        public KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
        public static FromRecordID(_entity: unknown, recordId: string) {
            const ck = new CompositeKeyMock();
            ck.KeyValuePairs = [{ FieldName: 'ID', Value: recordId }];
            return ck;
        }
        public ToConcatenatedString() {
            return this.KeyValuePairs.map((p) => `${p.FieldName}|${p.Value}`).join('||');
        }
    }

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
        CompositeKey: CompositeKeyMock,
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
        planMock.mockReset();
    });

    it('requires EntityName and RecordID', async () => {
        const params: RunActionParams = {
            Action: { Name: 'Clone Record' } as never,
            Params: [],
            ContextUser: { ID: 'user-1' } as never,
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
        planMock.mockResolvedValueOnce({
            Blocked: false,
            Counts: { Create: 3 },
            Warnings: [],
        });

        const params: RunActionParams = {
            Action: { Name: 'Clone Record' } as never,
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'TestEntity' },
                { Name: 'RecordID', Type: 'Input', Value: '123' },
                { Name: 'DryRun', Type: 'Input', Value: true },
            ],
            ContextUser: { ID: 'user-1' } as never,
        };

        const res = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(planMock).toHaveBeenCalled();
        expect(cloneMock).not.toHaveBeenCalled();
    });

    it('clones record and pushes outputs', async () => {
        cloneMock.mockResolvedValueOnce({
            Success: true,
            ResultCode: 'SUCCESS',
            CloneLogID: 'log-uuid',
            Roots: [{ TargetKey: '456' }],
            Created: [{ TargetKey: '456' }, { TargetKey: '789' }],
            Warnings: [],
        });

        const params: RunActionParams = {
            Action: { Name: 'Clone Record' } as never,
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'TestEntity' },
                { Name: 'RecordID', Type: 'Input', Value: '123' },
            ],
            ContextUser: { ID: 'user-1' } as never,
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
        planMock.mockReset();
    });

    it('requires EntityName and RecordIDs', async () => {
        const params: RunActionParams = {
            Action: { Name: 'Clone Records' } as never,
            Params: [],
            ContextUser: { ID: 'user-1' } as never,
        };

        const res1 = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res1.Success).toBe(false);
        expect(res1.ResultCode).toBe('MISSING_PARAMETERS');
    });

    it('clones multiple records and pushes outputs', async () => {
        cloneMock.mockResolvedValueOnce({
            Success: true,
            ResultCode: 'SUCCESS',
            CloneLogID: 'log-uuid-bulk',
            Created: [{ TargetKey: '10' }, { TargetKey: '20' }],
            Warnings: [],
        });

        const params: RunActionParams = {
            Action: { Name: 'Clone Records' } as never,
            Params: [
                { Name: 'EntityName', Type: 'Input', Value: 'TestEntity' },
                { Name: 'RecordIDs', Type: 'Input', Value: JSON.stringify(['1', '2']) },
            ],
            ContextUser: { ID: 'user-1' } as never,
        };

        const res = await (action as unknown as { InternalRunAction(p: RunActionParams): Promise<{ Success: boolean; ResultCode: string }> }).InternalRunAction(params);
        expect(res.Success).toBe(true);
        expect(res.ResultCode).toBe('SUCCESS');
        expect(cloneMock).toHaveBeenCalled();

        const count = params.Params.find((p) => p.Name === 'CreatedCount')?.Value;
        expect(count).toBe(2);
    });
});
