import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseVectorWriter,
    StageContext,
    VectorRecord,
    VectorWriteOutcome,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { DeleteStage } from '../stages/DeleteStage.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';
import '../stages/index.js';

const deleted: string[][] = [];
let deleteThrows = false;

@RegisterClass(BaseVectorWriter, 'delete-test-writer')
class DeletingWriter extends BaseVectorWriter {
    public readonly Key = 'delete-test-writer';
    public async Upsert(r: readonly VectorRecord[]): Promise<VectorWriteOutcome[]> {
        return r.map((x) => ({ RecordID: x.RecordID, Success: true }));
    }
    public async Delete(ids: readonly string[]): Promise<void> {
        if (deleteThrows) {
            throw new Error('store unreachable');
        }
        deleted.push([...ids]);
    }
}

/** A writer with no delete support — a deployment that never wrote vectors. */
@RegisterClass(BaseVectorWriter, 'delete-test-nodelete')
class NoDeleteWriter extends BaseVectorWriter {
    public readonly Key = 'delete-test-nodelete';
    public async Upsert(r: readonly VectorRecord[]): Promise<VectorWriteOutcome[]> {
        return r.map((x) => ({ RecordID: x.RecordID, Success: true }));
    }
}

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
    };
}

const chunk = () => new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', 'u/C1', 'C1'));

beforeEach(() => {
    deleted.length = 0;
    deleteThrows = false;
    vi.restoreAllMocks();
});

describe('DeleteStage', () => {
    it("removes the record's vector", async () => {
        const outcome = await new DeleteStage().Run(chunk(), contextWith({ VectorWriterKey: 'delete-test-writer' }));
        expect(outcome.Status).toBe('Complete');
        expect(deleted).toEqual([['C1']]);
    });

    it('records what it removed', async () => {
        const record = chunk();
        await new DeleteStage().Run(record, contextWith({ VectorWriterKey: 'delete-test-writer' }));
        expect(record.GetExtension<string[]>('Delete', 'removed')).toEqual(['vector']);
    });

    it('completes when there is nothing to remove', async () => {
        const outcome = await new DeleteStage().Run(chunk(), contextWith({ VectorWriterKey: 'delete-test-nodelete' }));
        expect(outcome.Status).toBe('Complete');
        expect(deleted).toEqual([]);
    });

    it('completes when no vector writer is configured at all', async () => {
        const outcome = await new DeleteStage().Run(chunk(), contextWith());
        expect(outcome.Status).toBe('Complete');
    });

    it('REMOVES FIRST and leaves the record pending when removal fails', async () => {
        // Marking deleted now would strand the vector forever; staying Pending means the next
        // attempt repeats an idempotent removal.
        deleteThrows = true;
        await expect(
            new DeleteStage().Run(chunk(), contextWith({ VectorWriterKey: 'delete-test-writer' })),
        ).rejects.toThrow(/Removing the vector/);
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
