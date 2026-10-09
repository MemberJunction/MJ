/**
 * Unit tests for the Action/Agent record processors' pure mapping + extraction helpers (the
 * record -> work-input mapping and work-output -> result-payload extraction). The engine-invoking
 * ProcessRecord paths are covered by integration tests; here we verify the deterministic logic.
 */

import { describe, it, expect } from 'vitest';
import { RecordRef } from '@memberjunction/record-set-processor-base';
import { ActionRecordProcessor, AgentRecordProcessor, WriteBackProcessor } from '../index';

const record: RecordRef = { EntityID: 'ENT-1', RecordID: 'c1', Record: { ID: 'c1', Name: 'Ada', Tier: 3 } };

describe('ActionRecordProcessor', () => {
    it('builds action input params from the input mapping', () => {
        const params = ActionRecordProcessor.buildActionParams(
            { CustomerID: 'record.ID', Tier: 'record.Tier', Label: 'static:VIP' },
            record,
        );
        expect(params).toEqual([
            { Name: 'CustomerID', Value: 'c1', Type: 'Input' },
            { Name: 'Tier', Value: 3, Type: 'Input' },
            { Name: 'Label', Value: 'VIP', Type: 'Input' },
        ]);
    });

    it('returns no params when there is no input mapping', () => {
        expect(ActionRecordProcessor.buildActionParams(undefined, record)).toEqual([]);
    });

    it('exposes recordId / entityId as mapping sources', () => {
        const params = ActionRecordProcessor.buildActionParams({ rid: 'recordId', eid: 'entityId' }, record);
        expect(params).toEqual([
            { Name: 'rid', Value: 'c1', Type: 'Input' },
            { Name: 'eid', Value: 'ENT-1', Type: 'Input' },
        ]);
    });

    it('extracts only Output / Both params into the result payload', () => {
        const out = ActionRecordProcessor.extractOutputs([
            { Name: 'In1', Value: 'x', Type: 'Input' },
            { Name: 'Out1', Value: 42, Type: 'Output' },
            { Name: 'Both1', Value: true, Type: 'Both' },
        ]);
        expect(out).toEqual({ Out1: 42, Both1: true });
    });

    it('handles missing output params gracefully', () => {
        expect(ActionRecordProcessor.extractOutputs(undefined)).toEqual({});
    });
});

describe('AgentRecordProcessor', () => {
    it('builds agent data from the input mapping', () => {
        const data = AgentRecordProcessor.buildData({ name: 'record.Name', tier: 'record.Tier' }, record);
        expect(data).toEqual({ name: 'Ada', tier: 3 });
    });

    it('passes the whole record as data when there is no mapping', () => {
        const data = AgentRecordProcessor.buildData(undefined, record);
        expect(data).toEqual({ record: { ID: 'c1', Name: 'Ada', Tier: 3 }, recordId: 'c1', entityId: 'ENT-1' });
    });
});

describe('WriteBackProcessor — run-level Preflight forwarding', () => {
    const ctx = { contextUser: {} as never, provider: {} as never };

    it('forwards Preflight to the wrapped processor so its refusal reaches the engine', async () => {
        const inner = {
            ProcessRecord: async () => ({ Status: 'Succeeded' as const }),
            Preflight: async () => { throw new Error('needs training'); },
        };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        await expect(wrapped.Preflight(ctx)).rejects.toThrow('needs training');
    });

    it('is a no-op when the wrapped processor declares no Preflight', async () => {
        const inner = { ProcessRecord: async () => ({ Status: 'Succeeded' as const }) };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        await expect(wrapped.Preflight(ctx)).resolves.toBeUndefined();
    });
});

describe('WriteBackProcessor.ProcessBatch — inner result shapes', () => {
    const ctx = { contextUser: {} as never, provider: {} as never };
    const recordsIn: RecordRef[] = [
        { EntityID: 'E', RecordID: 'a' },
        { EntityID: 'E', RecordID: 'b' },
    ];

    it('accepts a positionally-aligned array from the inner processor (as the ML scorer returns)', async () => {
        const inner = {
            ProcessRecord: async () => ({ Status: 'Failed' as const }),
            ProcessBatch: async () => [
                { Status: 'Failed' as const, ErrorMessage: 'first' },
                { Status: 'Failed' as const, ErrorMessage: 'second' },
            ],
        };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        const out = await wrapped.ProcessBatch(recordsIn, ctx);
        expect(out.get('a')?.ErrorMessage).toBe('first');
        expect(out.get('b')?.ErrorMessage).toBe('second');
    });

    it('still accepts a RecordID-keyed Map', async () => {
        const inner = {
            ProcessRecord: async () => ({ Status: 'Failed' as const }),
            ProcessBatch: async () => new Map([['b', { Status: 'Failed' as const, ErrorMessage: 'only-b' }]]),
        };
        const wrapped = new WriteBackProcessor(inner, { fields: { Score: '$.score' } });
        const out = await wrapped.ProcessBatch(recordsIn, ctx);
        expect(out.get('a')?.ErrorMessage).toBe('No result returned from batch processor');
        expect(out.get('b')?.ErrorMessage).toBe('only-b');
    });
});
