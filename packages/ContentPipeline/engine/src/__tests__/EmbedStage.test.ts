/**
 * @fileoverview EmbedStage — the per-record step, and the decisions that are ours.
 *
 * The finalize now talks to MJ's own providers (`VectorDBBase` via `MJ: Vector Indexes`, and
 * `AIEmbeddingRunner`) rather than a pipeline-local writer contract. Standing all of that up in a
 * unit test would mean mocking most of MJ and proving only that the mocks agree with each other, so
 * what is covered here is what the stage actually decides: which operation a record gets, whether
 * there is anything to embed, which id a re-embed reuses, and what rides alongside the vector.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { EmbedContentItemStage, EmbedStage } from '../stages/EmbedStage.js';
// Importing the barrel fires every stage's @RegisterClass, which is what a host does via
// LoadContentPipelineStages().
import '../stages/index.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';

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

function chunk(key: string, text: string | null, status?: string): WorkingRecord {
    const r = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', `u/${key}`, key));
    if (text !== null) {
        r.Propose('Text', text, 6, 'Segment');
    }
    if (status) {
        r.SetExtension('Pipeline', 'embeddingStatus', status);
    }
    return r;
}

/** Reach the stage's private decisions without standing up a vector store. */
function internals(stage: EmbedStage) {
    return stage as unknown as {
        vectorIdFor(r: WorkingRecord): string;
        textFor(r: WorkingRecord): string;
        metadataFor(r: WorkingRecord): Record<string, unknown>;
        operationFor(r: WorkingRecord): string;
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('EmbedStage — the per-record step is light', () => {
    it('completes without writing anything, leaving the work to the finalize', async () => {
        const outcome = await new EmbedStage().Run(chunk('c1', 'some text'), contextWith());
        expect(outcome.Status).toBe('Complete');
    });

    it('skips a record with no text', async () => {
        const outcome = await new EmbedStage().Run(chunk('c1', null), contextWith());
        expect(outcome.Status).toBe('Skipped');
    });

    it('does NOT skip a non-text record, which is embedded from its own bytes', async () => {
        // An image or a video has no text by nature. Skipping it for "no text" made the entire
        // non-text corpus silently unsearchable.
        const record = chunk('c1', null);
        record.Propose('Modality', 'image', 5, 'Extract');
        const outcome = await new EmbedStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
    });

    it('takes the operation from the HYDRATED status, never from a message', async () => {
        const stage = internals(new EmbedStage());
        expect(stage.operationFor(chunk('c1', 'text', 'MetadataOnly'))).toBe('MetadataOnly');
        expect(stage.operationFor(chunk('c2', 'text', 'Pending'))).toBe('Full');
        expect(stage.operationFor(chunk('c3', 'text'))).toBe('Full');
    });
});

describe('what Embed writes to the store', () => {
    it('reuses the id this record was stored under, so a re-embed replaces its vector', () => {
        const record = chunk('c1', 'text');
        record.SetExtension('Pipeline', 'vectorRecordID', 'previously-stored-id');
        expect(internals(new EmbedStage()).vectorIdFor(record)).toBe('previously-stored-id');
    });

    it('falls back to the record key when nothing was stored before', () => {
        expect(internals(new EmbedStage()).vectorIdFor(chunk('c1', 'text'))).toBe('c1');
    });

    it('puts the decorator ahead of the text, so a chunk still reads in context', () => {
        const record = chunk('c1', 'the body');
        record.Propose('Decorator', 'From: Quarterly Report', 5, 'Segment');
        expect(internals(new EmbedStage()).textFor(record)).toBe('From: Quarterly Report\n\nthe body');
    });

    it('carries title and modality alongside the vector', () => {
        const record = chunk('c1', 'text');
        record.Propose('Title', 'Quarterly', 5, 'Extract');
        record.Propose('Modality', 'text', 5, 'Extract');
        expect(internals(new EmbedStage()).metadataFor(record)).toMatchObject({
            RecordID: 'c1',
            Title: 'Quarterly',
            Modality: 'text',
        });
    });
});

describe('Embed runs over items as well as chunks', () => {
    it('ships a Content Item variant, because segmenting is not a precondition of embedding', () => {
        // MJ embeds content items directly elsewhere; requiring a chunk per item would mean
        // manufacturing a one-chunk row for every short document.
        expect(new EmbedContentItemStage().Entity).toBe('Content Item');
        expect(new EmbedStage().Entity).toBe('Content Item Chunk');
        expect(new EmbedContentItemStage().StatusField).toBe('EmbeddingStatus');
    });
});

describe('the batch hook', () => {
    const processor = (stages: string[]) =>
        new PipelineProcessor(
            { Stages: stages, IsTest: true, Scope: 'Filter', Configuration: {} },
            {
                Hydrator: () => ({}) as WorkingRecordHydrator,
                Committer: () => ({}) as WorkingRecordCommitter,
            },
        );

    it('is present when the LAST stage implements a finalize', () => {
        expect(typeof processor(['Embed']).ProcessBatch).toBe('function');
    });

    it('is ABSENT when the last stage does not, so the run stays per-record', () => {
        expect(processor(['Tag']).ProcessBatch).toBeUndefined();
    });
});
