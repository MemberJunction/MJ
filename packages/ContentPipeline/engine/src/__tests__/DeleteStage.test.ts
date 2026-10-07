/**
 * @fileoverview DeleteStage — what it removes, and when it refuses to say it did.
 *
 * Removal itself now goes through MJ's registered providers (`VectorDBBase` for the vector,
 * `FileStorageBase` for the kept bytes) rather than a pipeline-local writer contract, so what is
 * covered here is the decision the stage owns: telling "there was nothing to remove" apart from
 * "there was something and it could not be reached". Only the first may be marked Deleted — nothing
 * revisits a Deleted row, so marking the second strands the artifact permanently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { DeleteStage } from '../stages/DeleteStage.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';
import '../stages/index.js';

function contextWith(configuration: Record<string, unknown> = {}): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: configuration,
        IsTest: false,
        Scope: 'Filter',
        Attempt: 1,
        MaxAttempts: 1,
        IsReplay: false,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };
}

const chunk = () => new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', 'u/C1', 'C1'));

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('nothing to remove', () => {
    it('completes for a record that was never embedded and never kept', async () => {
        const outcome = await new DeleteStage().Run(chunk(), contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(outcome.Message).toContain('nothing to remove');
    });

    it('marks Deleted, because absent really is absent', () => {
        expect(new DeleteStage().CompleteStatus).toBe('Deleted');
    });
});

describe('something to remove that cannot be reached', () => {
    it('REFUSES to mark Deleted when a vector exists but its index cannot be resolved', async () => {
        // VectorRecordID says a vector is out there; no Content Source says which index holds it.
        // Marking this Deleted would leave it searchable forever with nothing left pointing at it.
        const record = chunk();
        record.SetExtension('Pipeline', 'vectorRecordID', 'vec-1');
        const outcome = await new DeleteStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Skipped');
        expect(outcome.Message).toContain('vector');
        expect(record.GetExtension<string[]>('Delete', 'skipped')).toEqual(['vector']);
    });

    it('leaves the record pending rather than failing it, so a later run can finish the job', async () => {
        const record = chunk();
        record.SetExtension('Pipeline', 'vectorRecordID', 'vec-1');
        const outcome = await new DeleteStage().Run(record, contextWith());
        expect(outcome.Status).not.toBe('Failed');
    });
});

describe('every other stage skips a pending-delete record', () => {
    const storage = (record: WorkingRecord) => ({
        Hydrator: () => ({ Hydrate: async () => record }) as unknown as WorkingRecordHydrator,
        Committer: () =>
            ({ Commit: async () => ({ RecordID: 'C1', ColumnsWritten: [], Created: false }) }) as unknown as WorkingRecordCommitter,
    });
    const rsContext = { contextUser: {}, provider: {} } as never;
    const ref = { EntityID: 'E1', RecordID: 'C1' } as never;

    it('skips a record marked pending delete', async () => {
        const record = chunk();
        record.SetExtension('Pipeline', 'deleteStatus', 'Pending');
        const processor = new PipelineProcessor(
            { Stages: ['NoOp'], IsTest: false, Scope: 'Filter', Configuration: {} },
            storage(record),
        );
        const result = await processor.ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Skipped');
    });

    it('does NOT skip for Delete itself, which would mean never removing it', async () => {
        const record = chunk();
        record.SetExtension('Pipeline', 'deleteStatus', 'Pending');
        const processor = new PipelineProcessor(
            { Stages: ['Delete'], IsTest: false, Scope: 'Filter', Configuration: {} },
            storage(record),
        );
        const result = await processor.ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Succeeded');
    });

    it('runs normally for a record not marked', async () => {
        const processor = new PipelineProcessor(
            { Stages: ['NoOp'], IsTest: false, Scope: 'Filter', Configuration: {} },
            storage(chunk()),
        );
        const result = await processor.ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Succeeded');
    });
});
