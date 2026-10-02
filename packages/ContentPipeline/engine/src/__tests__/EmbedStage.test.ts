import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseVectorWriter,
    StageContext,
    VectorMetadataUpdate,
    VectorRecord,
    VectorWriteOutcome,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { EmbedStage } from '../stages/EmbedStage.js';
// Importing the barrel fires every stage's @RegisterClass, which is what a host does via
// LoadContentPipelineStages().
import '../stages/index.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';

const upserted: VectorRecord[][] = [];
const metadataUpdated: VectorMetadataUpdate[][] = [];
let upsertOutcome: (r: readonly VectorRecord[]) => VectorWriteOutcome[] = (r) =>
    r.map((x) => ({ RecordID: x.RecordID, Success: true }));

@RegisterClass(BaseVectorWriter, 'test-writer')
class TestWriter extends BaseVectorWriter {
    public readonly Key = 'test-writer';
    public async Upsert(records: readonly VectorRecord[]): Promise<VectorWriteOutcome[]> {
        upserted.push([...records]);
        return upsertOutcome(records);
    }
    public async UpdateMetadata(records: readonly VectorMetadataUpdate[]): Promise<VectorWriteOutcome[]> {
        metadataUpdated.push([...records]);
        return records.map((r) => ({ RecordID: r.RecordID, Success: true }));
    }
}

/** A writer with no metadata-only support, to show the full-embed fallback. */
@RegisterClass(BaseVectorWriter, 'test-writer-basic')
class BasicWriter extends BaseVectorWriter {
    public readonly Key = 'test-writer-basic';
    public async Upsert(records: readonly VectorRecord[]): Promise<VectorWriteOutcome[]> {
        upserted.push([...records]);
        return records.map((r) => ({ RecordID: r.RecordID, Success: true }));
    }
}

function contextWith(configuration: Record<string, unknown> = {}): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: { VectorWriterKey: 'test-writer', ...configuration },
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

function chunk(key: string, text: string, status?: string): WorkingRecord {
    const r = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', `u/${key}`, key));
    r.Propose('Text', text, 6, 'Segment');
    if (status) {
        r.SetExtension('Pipeline', 'embeddingStatus', status);
    }
    return r;
}

beforeEach(() => {
    upserted.length = 0;
    metadataUpdated.length = 0;
    upsertOutcome = (r) => r.map((x) => ({ RecordID: x.RecordID, Success: true }));
    vi.restoreAllMocks();
});

describe('EmbedStage — the per-record step is light', () => {
    it('completes without writing anything, leaving the work to the finalize', async () => {
        const outcome = await new EmbedStage().Run(chunk('C1', 'text'), contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(upserted).toHaveLength(0);
    });

    it('skips a record with no text', async () => {
        const outcome = await new EmbedStage().Run(chunk('C1', ''), contextWith());
        expect(outcome.Status).toBe('Skipped');
    });
});

describe('EmbedStage — the finalize is one call for the page', () => {
    it('upserts the whole page in a single call', async () => {
        const stage = new EmbedStage();
        const records = [chunk('C1', 'one'), chunk('C2', 'two'), chunk('C3', 'three')];
        for (const r of records) await stage.Run(r, contextWith());
        const results = await stage.Finalize(records, contextWith());
        expect(upserted).toHaveLength(1);
        expect(upserted[0]).toHaveLength(3);
        expect(results.map((r) => r.Outcome.Status)).toEqual(['Complete', 'Complete', 'Complete']);
    });

    it('reports a per-record failure without failing the page', async () => {
        upsertOutcome = (r) => r.map((x, i) => ({ RecordID: x.RecordID, Success: i !== 1, Message: 'rejected' }));
        const stage = new EmbedStage();
        const records = [chunk('C1', 'one'), chunk('C2', 'two')];
        for (const r of records) await stage.Run(r, contextWith());
        const results = await stage.Finalize(records, contextWith());
        expect(results.map((r) => r.Outcome.Status)).toEqual(['Complete', 'Failed']);
    });

    it('marks a transient per-record failure as retryable', async () => {
        upsertOutcome = (r) => r.map((x) => ({ RecordID: x.RecordID, Success: false, IsTransient: true, Message: 'rate limited' }));
        const stage = new EmbedStage();
        const records = [chunk('C1', 'one')];
        for (const r of records) await stage.Run(r, contextWith());
        const results = await stage.Finalize(records, contextWith());
        expect(results[0].Outcome.Status).toBe('Retry');
    });

    it('fails the whole page when the bulk call throws', async () => {
        vi.spyOn(TestWriter.prototype, 'Upsert').mockRejectedValue(new Error('store down'));
        const stage = new EmbedStage();
        const records = [chunk('C1', 'one')];
        for (const r of records) await stage.Run(r, contextWith());
        await expect(stage.Finalize(records, contextWith())).rejects.toThrow(/Vector write failed for the page/);
    });
});

describe('EmbedStage — the metadata-only operation', () => {
    it('updates metadata without re-embedding', async () => {
        const stage = new EmbedStage();
        const records = [chunk('C1', 'one', 'MetadataOnly')];
        for (const r of records) await stage.Run(r, contextWith());
        await stage.Finalize(records, contextWith());
        expect(metadataUpdated).toHaveLength(1);
        expect(upserted).toHaveLength(0);
    });

    it('splits a mixed page by operation', async () => {
        const stage = new EmbedStage();
        const records = [chunk('C1', 'one'), chunk('C2', 'two', 'MetadataOnly')];
        for (const r of records) await stage.Run(r, contextWith());
        const results = await stage.Finalize(records, contextWith());
        expect(upserted[0].map((r) => r.RecordID)).toEqual(['C1']);
        expect(metadataUpdated[0].map((r) => r.RecordID)).toEqual(['C2']);
        expect(results).toHaveLength(2);
    });

    it('falls back to a full embed when the writer cannot update metadata', async () => {
        const stage = new EmbedStage();
        const records = [chunk('C1', 'one', 'MetadataOnly')];
        const context = contextWith({ VectorWriterKey: 'test-writer-basic' });
        for (const r of records) await stage.Run(r, context);
        await stage.Finalize(records, context);
        // A full embed writes the metadata anyway, so falling back is correct rather than a failure.
        expect(upserted).toHaveLength(1);
    });

    it('takes the operation from the HYDRATED status, never from a message', async () => {
        const stage = new EmbedStage();
        const record = chunk('C1', 'one', 'MetadataOnly');
        await stage.Run(record, contextWith());
        expect(record.GetExtension<string>('Embed', 'operation')).toBe('MetadataOnly');
    });
});

describe('PipelineProcessor — the batch seam', () => {
    const storage = {
        Hydrator: () => ({ Hydrate: async () => chunk('C1', 'text') }) as unknown as WorkingRecordHydrator,
        Committer: () =>
            ({ Commit: async () => ({ RecordID: 'C1', ColumnsWritten: [], Created: false }) }) as unknown as WorkingRecordCommitter,
    };

    it('is present when the LAST stage implements a finalize', () => {
        const processor = new PipelineProcessor(
            { Stages: ['Embed'], IsTest: false, Scope: 'Filter', Configuration: {} },
            storage,
        );
        expect(typeof processor.ProcessBatch).toBe('function');
    });

    it('is ABSENT when the last stage does not, so the run stays per-record', () => {
        const processor = new PipelineProcessor(
            { Stages: ['Embed', 'Tag'], IsTest: false, Scope: 'Filter', Configuration: {} },
            storage,
        );
        expect(processor.ProcessBatch).toBeUndefined();
    });
});
