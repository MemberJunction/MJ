/**
 * @fileoverview EmbedStage — the per-record step, and the decisions that are ours.
 *
 * Covered here is what the stage decides: which operation a record gets, whether there is anything
 * to embed, which id a vector gets, and what rides alongside it. Routing is in EmbedRouting.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { AIEmbeddingRunner, type EmbeddingContent, type EmbeddingContentBlock } from '@memberjunction/ai-prompts';
import * as contentAutotagging from '@memberjunction/content-autotagging';
import { EmbedContentItemStage, EmbedStage } from '../stages/EmbedStage.js';
import type { VectorRoute } from '../VectorRouting.js';
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
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
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
        vectorIdFor(r: WorkingRecord, item: unknown): string;
        textFor(r: WorkingRecord): string;
        BuildVectorMetadata(r: WorkingRecord, route: unknown, tags: string[], context: StageContext): Record<string, unknown>;
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

    it('SKIPS a non-text record with no text, rather than embedding an empty string', async () => {
        // Embedding is text-in: every image would get the vector of '' and be equally "similar" to
        // every query.
        const record = chunk('c1', null);
        record.Propose('Modality', 'image', 5, 'Extract');
        const outcome = await new EmbedStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Skipped');
        expect(outcome.Message).toContain('text-only');
    });

    it('embeds a non-text record that DOES carry text, such as a caption', async () => {
        const record = chunk('c1', 'A bar chart of quarterly revenue');
        record.Propose('Modality', 'image', 5, 'Extract');
        expect((await new EmbedStage().Run(record, contextWith())).Status).toBe('Complete');
    });

    it('takes the operation from the HYDRATED status, never from a message', async () => {
        const stage = internals(new EmbedStage());
        const embedded = chunk('c1', 'text', 'MetadataOnly');
        embedded.SetExtension('Pipeline', 'vectorRecordID', 'v1');
        expect(stage.operationFor(embedded)).toBe('MetadataOnly');
        expect(stage.operationFor(chunk('c2', 'text', 'Pending'))).toBe('Full');
        expect(stage.operationFor(chunk('c3', 'text'))).toBe('Full');
    });

    it('turns a metadata refresh with no stored vector into a full embed — there is nothing to update', () => {
        expect(internals(new EmbedStage()).operationFor(chunk('c1', 'text', 'MetadataOnly'))).toBe('Full');
    });
});

describe('what Embed writes to the store', () => {
    const owner = { ID: 'I1', ContentSourceID: 'S1', ContentTypeID: 'CT1' };

    it('reuses the id this record was stored under, so a re-embed replaces its vector', () => {
        const record = chunk('c1', 'text');
        record.SetExtension('Pipeline', 'vectorRecordID', 'previously-stored-id');
        expect(internals(new EmbedStage()).vectorIdFor(record, owner)).toBe('previously-stored-id');
    });

    it('falls back to the record key when nothing was stored before', () => {
        expect(internals(new EmbedStage()).vectorIdFor(chunk('c1', 'text'), owner)).toBe('c1');
    });

    it("derives the autotagger's id under the 'hash' strategy, so both writers address the same vector", () => {
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockReturnValue({
            ConfigurationObject: { VectorIDStrategy: 'hash' },
        } as never);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentTypeByID').mockReturnValue(undefined);
        const record = chunk('c1', 'text');
        record.SetExtension('Pipeline', 'sequence', 2);
        const expected = createHash('sha1').update('content-item-chunk_I1_2').digest('hex');
        expect(internals(new EmbedStage()).vectorIdFor(record, owner)).toBe(expected);
    });

    it('puts the decorator ahead of the text, so a chunk still reads in context', () => {
        const record = chunk('c1', 'the body');
        record.Propose('Decorator', 'From: Quarterly Report', 5, 'Segment');
        expect(internals(new EmbedStage()).textFor(record)).toBe('From: Quarterly Report\n\nthe body');
    });

    const item = (fields: Record<string, unknown>) =>
        ({ ...fields, GetAll: () => fields }) as never;
    const metadataContext = { ...contextWith(), Provider: { EntityByName: () => undefined } as never };

    it('writes the same metadata keys the autotagger does, tags included', () => {
        const record = chunk('c1', 'text');
        record.SetExtension('Pipeline', 'sequence', 3);
        const route = {
            Item: item({ ID: 'I1', ContentSourceID: 'S1', ContentSourceTypeID: 'T1', ContentTypeID: 'CT1', Name: 'Report', Description: null, URL: 'https://x/r' }),
        };
        expect(internals(new EmbedStage()).BuildVectorMetadata(record, route, ['finance', 'q3'], metadataContext)).toEqual({
            Entity: 'MJ: Content Item Chunks',
            RecordID: 'c1',
            ContentItemID: 'I1',
            Sequence: 3,
            ContentSourceID: 'S1',
            ContentSourceTypeID: 'T1',
            Title: 'Report',
            URL: 'https://x/r',
            Tags: ['finance', 'q3'],
        });
    });

    it("takes its shape from the source's VectorMetadata, not from code — truncation, tags, text", () => {
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockReturnValue({
            ConfigurationObject: { VectorMetadata: { DefaultTruncationLimit: 4, IncludeTags: false, IncludeText: true } },
        } as never);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentTypeByID').mockReturnValue(undefined);
        const route = {
            Item: item({ ID: 'I1', ContentSourceID: 'S1', ContentSourceTypeID: 'T1', ContentTypeID: 'CT1', Name: 'Quarterly Report', URL: 'u' }),
        };
        const meta = internals(new EmbedStage()).BuildVectorMetadata(chunk('c1', 'the body'), route, ['finance'], metadataContext);
        expect(meta.Title).toBe('Quar');
        expect(meta.Text).toBe('the ');
        expect(meta.Tags).toBeUndefined();
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
            { Stages: stages, IsTest: true, Configuration: {} },
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

describe('multimodal EmbedStage hooks and mixed-batch routing', () => {
    it('allows a textless video/image chunk through Run when Pipeline.embedContent carries media blocks', async () => {
        const record = chunk('vid-1', null);
        record.Propose('Modality', 'video', 6, 'Segment');
        const mediaBlocks: EmbeddingContentBlock[] = [
            { type: 'video_url', content: 'AAAA', mimeType: 'video/mp4' },
        ];
        record.SetExtension('Pipeline', 'embedContent', mediaBlocks);

        const outcome = await new EmbedStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
    });

    it('partitions a mixed page into batched Texts and multimodal Contents and upserts both vectors', async () => {
        const textChunk = chunk('txt-1', 'Quarterly membership policy summary.');
        const videoChunk = chunk('vid-1', 'Walkthrough of the renewal dashboard');
        videoChunk.Propose('Modality', 'video', 6, 'Segment');
        videoChunk.SetExtension('Pipeline', 'embedContent', [
            { type: 'video_url', content: 'AAAA', mimeType: 'video/mp4' },
        ]);
        const imageChunk = chunk('img-1', null);
        imageChunk.Propose('Modality', 'image', 6, 'Segment');
        imageChunk.SetExtension('Pipeline', 'embedContent', [
            { type: 'image_url', content: 'BBBB', mimeType: 'image/png' },
        ]);

        const runEmbeddingSpy = vi.spyOn(AIEmbeddingRunner.prototype, 'RunEmbedding').mockImplementation(async (params) => {
            if (params.Texts) {
                return {
                    Success: true,
                    Vectors: params.Texts.map(() => [0.1, 0.2]),
                    PromptRunID: null,
                    TokensUsed: 5,
                    Cost: 0,
                    ErrorMessage: null,
                    ExecutionTimeMs: 1,
                    ModelID: 'M1',
                };
            }
            return {
                Success: true,
                Vectors: (params.Contents ?? []).map((_, idx) => [0.8 + idx * 0.1, 0.9]),
                PromptRunID: null,
                TokensUsed: 20,
                Cost: 0,
                ErrorMessage: null,
                ExecutionTimeMs: 2,
                ModelID: 'M1',
            };
        });
        const upsertSpy = vi.spyOn(contentAutotagging, 'UpsertVectorRecords').mockResolvedValue({ success: true } as never);

        const stage = new EmbedStage();
        const item = {
            ID: 'I1',
            ContentSourceID: 'S1',
            ContentSourceTypeID: 'T1',
            ContentTypeID: 'CT1',
            Name: 'Media Item',
            Description: null,
            URL: 'https://example.test/video',
            GetAll: () => ({ ID: 'I1', Name: 'Media Item' }),
        };
        const route: VectorRoute = {
            GroupKey: 'M1::idx',
            Item: item as never,
            Infrastructure: {
                embeddingModelID: 'M1',
                dimensions: 2,
                indexName: 'idx',
                vectorDB: { IsReadOnly: false } as never,
                providerConfig: {} as never,
            } as never,
        };
        const ctx = { ...contextWith(), Provider: { EntityByName: () => undefined } as never };

        const embedAndStore = (
            stage as unknown as {
                embedAndStore(
                    group: Array<{ Record: WorkingRecord; Route: VectorRoute }>,
                    tags: ReadonlyMap<string, string[]>,
                    context: StageContext,
                ): Promise<Array<{ Key: string; Outcome: { Status: string } }>>;
            }
        ).embedAndStore.bind(stage);

        const results = await embedAndStore(
            [
                { Record: textChunk, Route: route },
                { Record: videoChunk, Route: route },
                { Record: imageChunk, Route: route },
            ],
            new Map(),
            ctx,
        );

        expect(results.every((r) => r.Outcome.Status === 'Complete')).toBe(true);
        expect(runEmbeddingSpy).toHaveBeenCalledTimes(2);
        expect(runEmbeddingSpy.mock.calls[0][0].Texts).toEqual(['Quarterly membership policy summary.']);
        const sentContents = runEmbeddingSpy.mock.calls[1][0].Contents as EmbeddingContent[];
        expect(sentContents).toHaveLength(2);
        // Video chunk fuses text + video_url; textless image chunk sends pure image_url block
        expect(sentContents[0]).toEqual([
            { type: 'text', content: 'Walkthrough of the renewal dashboard' },
            { type: 'video_url', content: 'AAAA', mimeType: 'video/mp4' },
        ]);
        expect(sentContents[1]).toEqual([
            { type: 'image_url', content: 'BBBB', mimeType: 'image/png' },
        ]);
        expect(upsertSpy).toHaveBeenCalledTimes(1);
        expect(upsertSpy.mock.calls[0][0]).toHaveLength(3);
    });
});
