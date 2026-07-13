/**
 * Unit tests for the Action/Agent record processors' pure mapping + extraction helpers (the
 * record -> work-input mapping and work-output -> result-payload extraction). The engine-invoking
 * ProcessRecord paths are covered by integration tests; here we verify the deterministic logic.
 */

import { describe, it, expect } from 'vitest';
import { RecordRef } from '@memberjunction/record-set-processor-base';
import { ActionRecordProcessor, AgentRecordProcessor } from '../index';

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
