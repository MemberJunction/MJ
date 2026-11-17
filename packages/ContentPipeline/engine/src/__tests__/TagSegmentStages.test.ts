import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { ContentItemTagBridge } from '@memberjunction/tag-engine';
import { BaseSegmenter, LoadContentSegmenters } from '@memberjunction/ai-segmentation';
import {
    BaseContentClassifier,
    ClassifiedTag,
    ClassifyRequest,
    ClassifyResult,
    FatalStageError,
    StageContext,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { ManagedPromptClassifier } from '../ManagedPromptClassifier.js';
import { TagStage } from '../stages/TagStage.js';
import { SegmentStage } from '../stages/SegmentStage.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';
import '../stages/index.js';

LoadContentSegmenters();

const keyword = (Name: string, Score = 0.5, extra: Partial<ClassifiedTag> = {}): ClassifiedTag => ({
    Name,
    Score,
    Parent: null,
    Reasoning: null,
    ...extra,
});
const classified = (Tags: ClassifiedTag[], extra: Partial<ClassifyResult> = {}): ClassifyResult => ({
    Tags,
    PromptRunID: null,
    IsValidContent: true,
    ...extra,
});

let classifyImpl: (text: string, title: string | null) => Promise<ClassifyResult> = async () => classified([]);

@RegisterClass(BaseContentClassifier, 'CustomTestClassifier')
class CustomTestClassifier extends BaseContentClassifier {
    public readonly Key = 'CustomTestClassifier';
    public async Classify(request: ClassifyRequest): Promise<ClassifyResult> {
        return {
            Tags: [{ Name: `custom:${request.Title ?? 'untitled'}`, Score: 0.95 }],
            PromptRunID: null,
            IsValidContent: true,
        };
    }
}

/** Tag rows the stage saved, so a test can assert tagging actually persisted something. */
export const savedTags: { ItemID: string; Tag: string; Weight?: number; AIPromptRunID?: string; Reasoning?: string }[] = [];
export const savedAttributes: { ContentItemID: string; Name: string; Value: string }[] = [];

/**
 * A provider that records what the stage writes. Tagging's whole point is the rows it leaves
 * behind, so a stub that cannot accept a write would only re-prove "tags computed, nothing saved".
 */
function recordingProvider() {
    return {
        RunView: async () => ({ Success: true, Results: [] as { ID: string }[] }),
        GetEntityObject: async (entityName: string) => {
            const row: Record<string, unknown> = {};
            const field = (name: string) => ({
                get: () => row[name],
                set: (v: unknown) => {
                    row[name] = v;
                },
                enumerable: true,
            });
            const entity = {
                NewRecord: () => true,
                Save: async () => {
                    if (entityName === 'MJ: Content Item Attributes') {
                        savedAttributes.push({ ...row } as (typeof savedAttributes)[number]);
                    } else {
                        savedTags.push({ ...row } as (typeof savedTags)[number]);
                    }
                    return true;
                },
                Delete: async () => true,
                InnerLoad: async () => true,
                LatestResult: null,
            };
            for (const name of ['ItemID', 'Tag', 'Weight', 'AIPromptRunID', 'Reasoning', 'ContentItemID', 'Name', 'Value']) {
                Object.defineProperty(entity, name, field(name));
            }
            return entity;
        },
    } as never;
}

function contextWith(configuration: Record<string, unknown> = {}, signal?: AbortSignal): StageContext {
    return {
        ContextUser: {} as never,
        Provider: recordingProvider(),
        Configuration: configuration,
        IsTest: false,
        Signal: signal ?? new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };
}

function item(text: string | null): WorkingRecord {
    const r = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'ITEM-1'));
    if (text !== null) {
        r.Propose('Text', text, 6, 'Extract');
    }
    return r;
}

beforeEach(() => {
    classifyImpl = async () => classified([]);
    // The prompt and the taxonomy need AIEngine, TagEngine and a database; covered here are the
    // stage's own decisions, so the classifier and the shared bridge are stubbed.
    vi.spyOn(ManagedPromptClassifier.prototype, 'Classify').mockImplementation((req: ClassifyRequest) =>
        classifyImpl(req.Text, req.Title ?? null),
    );
    vi.spyOn(ContentItemTagBridge.prototype, 'Bridge').mockResolvedValue(undefined);
    savedTags.length = 0;
    savedAttributes.length = 0;
});

describe('TagStage', () => {
    it('classifies and records the tags', async () => {
        classifyImpl = async () => classified([keyword('finance', 0.9), keyword('policy')]);
        const record = item('some text');
        const outcome = await new TagStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(record.GetExtension<ClassifiedTag[]>('Tag', 'tags')).toHaveLength(2);
    });

    it('SAVES the tags, rather than leaving them in the extension space', async () => {
        // The defect this replaced: a successful Tag stage wrote tags nowhere.
        classifyImpl = async () => classified([keyword('finance', 0.9), keyword('policy')]);
        await new TagStage().Run(item('some text'), contextWith());
        expect(savedTags.map((t) => t.Tag)).toEqual(['finance', 'policy']);
        expect(savedTags[0]).toMatchObject({ ItemID: 'ITEM-1', Weight: 0.9 });
    });

    it('records the prompt run and the reasoning on a new tag, as the autotagger does', async () => {
        classifyImpl = async () => classified([keyword('finance', 0.9, { Reasoning: 'central topic' })], { PromptRunID: 'run-1' });
        await new TagStage().Run(item('some text'), contextWith());
        expect(savedTags[0]).toMatchObject({ AIPromptRunID: 'run-1', Reasoning: 'central topic' });
    });

    it('persists custom Content Type Attributes returned in Extensions.attributes', async () => {
        classifyImpl = async () =>
            classified([keyword('finance', 0.9)], {
                Extensions: { attributes: { author: 'Jane Doe', readingLevel: 'Advanced' } },
            });
        await new TagStage().Run(item('some text'), contextWith());
        expect(savedAttributes).toEqual([
            { ContentItemID: 'ITEM-1', Name: 'author', Value: 'Jane Doe' },
            { ContentItemID: 'ITEM-1', Name: 'readingLevel', Value: 'Advanced' },
        ]);
    });

    it('resolves a custom BaseContentClassifier registered by ClassifierKey', async () => {
        const record = item('some text');
        record.Propose('Title', 'Board Minutes', 6, 'Extract');
        const outcome = await new TagStage().Run(record, contextWith({ ClassifierKey: 'CustomTestClassifier' }));
        expect(outcome.Status).toBe('Complete');
        expect(record.GetExtension<string>('Tag', 'classifierKey')).toBe('CustomTestClassifier');
        expect(savedTags.map((t) => t.Tag)).toEqual(['custom:Board Minutes']);
    });

    it('saves nothing on a test run, which commits nothing by definition', async () => {
        classifyImpl = async () => classified([keyword('finance')]);
        const context = { ...contextWith(), IsTest: true };
        const outcome = await new TagStage().Run(item('some text'), context);
        expect(outcome.Status).toBe('Complete');
        expect(savedTags).toHaveLength(0);
    });

    it('keeps the existing tags when the model concludes nothing', async () => {
        classifyImpl = async () => classified([], { IsValidContent: false });
        const outcome = await new TagStage().Run(item('some text'), contextWith());
        expect(outcome.Status).toBe('Skipped');
        expect(outcome.Message).toContain('existing tags kept');
        expect(savedTags).toHaveLength(0);
    });

    it('passes the title through as a signal', async () => {
        let sawTitle: string | null = 'unset';
        classifyImpl = async (_text, title) => {
            sawTitle = title;
            return classified([]);
        };
        const record = item('some text');
        record.Propose('Title', 'Quarterly results', 6, 'Extract');
        await new TagStage().Run(record, contextWith());
        expect(sawTitle).toBe('Quarterly results');
    });

    it('writes tags to the EXTENSION space, not a well-known field', async () => {
        classifyImpl = async () => classified([keyword('finance')]);
        const record = item('some text');
        await new TagStage().Run(record, contextWith());
        // Nothing durable is proposed: what a deployment does with tags is its own business.
        expect(record.ChangedFields).toEqual(['Text']);
    });

    it('skips a record with no text', async () => {
        const outcome = await new TagStage().Run(item(null), contextWith());
        expect(outcome.Status).toBe('Skipped');
    });

    it('stays fatal when the classifier says so — a source with no content type will not grow one', async () => {
        classifyImpl = async () => {
            throw new FatalStageError('no tag bounds');
        };
        await expect(new TagStage().Run(item('text'), contextWith())).rejects.toBeInstanceOf(FatalStageError);
    });

    it('treats any other classifier failure as transient — it usually reached a model or service', async () => {
        classifyImpl = async () => {
            throw new Error('503 from the model');
        };
        await expect(new TagStage().Run(item('text'), contextWith())).rejects.toThrow(/Classifying with 'ManagedPrompt' failed: 503/);
    });
});

describe('SegmentStage', () => {
    it('splits text into chunk children', async () => {
        const record = item('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.');
        const outcome = await new SegmentStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(record.Children.length).toBeGreaterThan(0);
        expect(record.Children[0].Entity).toBe('Content Item Chunk');
    });

    it('records which segmenter actually ran', async () => {
        const record = item('Some text to segment.');
        await new SegmentStage().Run(record, contextWith());
        expect(record.GetExtension<string>('Segment', 'segmenterKey')).toBeTruthy();
    });

    it("carries the parent decorator as the chunk's own field, so a chunk stands alone", async () => {
        const record = item('Body text here.');
        record.Propose('Decorator', 'From the 2026 handbook', 5, 'Discover');
        await new SegmentStage().Run(record, contextWith());
        expect(record.Children[0].Get('Decorator')).toBe('From the 2026 handbook');
    });

    it("keeps the chunk's text a faithful slice, not a concatenation", async () => {
        const record = item('Body text here.');
        record.Propose('Decorator', 'From the 2026 handbook', 5, 'Discover');
        await new SegmentStage().Run(record, contextWith());
        expect(record.Children[0].Get('Text')).toBe('Body text here.');
    });

    it('leaves the decorator unset when the parent has none', async () => {
        const record = item('Body text here.');
        await new SegmentStage().Run(record, contextWith());
        expect(record.Children[0].Get('Decorator')).toBeNull();
        expect(record.Children[0].Get('Text')).toBe('Body text here.');
    });

    it('skips a record with no text rather than failing', async () => {
        const outcome = await new SegmentStage().Run(item(null), contextWith());
        expect(outcome.Status).toBe('Skipped');
    });

    it('skips whitespace-only text', async () => {
        const outcome = await new SegmentStage().Run(item('   \n  '), contextWith());
        expect(outcome.Status).toBe('Skipped');
    });

    it('does not start when already cancelled', async () => {
        const controller = new AbortController();
        controller.abort();
        const outcome = await new SegmentStage().Run(item('text'), contextWith({}, controller.signal));
        expect(outcome.Status).toBe('Retry');
    });

    it('passes ContextUser into segmenter.Segment so server-side segmenters can invoke MJ services', async () => {
        const segmentSpy = vi.spyOn(BaseSegmenter.prototype, 'Segment');
        const sentinelUser = { ID: 'user-sentinel-42' };
        const ctx = { ...contextWith(), ContextUser: sentinelUser as never };
        const outcome = await new SegmentStage().Run(item('Segmented with user.'), ctx);
        expect(outcome.Status).toBe('Complete');
        expect(segmentSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                Text: 'Segmented with user.',
                ContextUser: sentinelUser,
            }),
        );
    });

    it('auto-selects TranscriptSegmenter for WebVTT text and populates StartMs, EndMs, SegmentTitle, Transcript and video Modality', async () => {
        const vtt = [
            'WEBVTT',
            '',
            '00:00:02.000 --> 00:00:05.500',
            '<v Presenter>Welcome to the product demo.',
            '',
            '00:00:12.000 --> 00:00:16.000',
            '<v Presenter>Here is how inline video works.',
        ].join('\n');
        const record = item(vtt);
        record.Propose('Modality', 'video', 6, 'Extract');

        const outcome = await new SegmentStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(record.GetExtension<string>('Segment', 'segmenterKey')).toBe('Transcript');
        expect(record.Children).toHaveLength(2);

        const first = record.Children[0];
        expect(first.Get('Modality')).toBe('video');
        expect(first.Get('Text')).toBe('Presenter: Welcome to the product demo.');
        expect(first.GetExtension<Record<string, unknown>>('Pipeline', 'columns')).toEqual({
            Sequence: 0,
            SegmenterKey: 'Transcript',
            StartMs: 2000,
            EndMs: 5500,
            SegmentTitle: 'Chapter 1',
            Transcript: 'Presenter: Welcome to the product demo.',
        });
    });

    it('persists chunk provenance columns and ParentChunkID through PipelineProcessor + WorkingRecordCommitter + WorkingRecordHydrator', async () => {
        const savedChunks: Record<string, unknown>[] = [];
        let nextChunkSeq = 1;
        const chunkFields = [
            'ID',
            'ContentItemID',
            'Sequence',
            'Text',
            'Modality',
            'Decorator',
            'StartMs',
            'EndMs',
            'StartOffset',
            'EndOffset',
            'PageNumber',
            'SegmentTitle',
            'Transcript',
            'Description',
            'SegmenterKey',
            'ParentChunkID',
            'TaggingStatus',
            'EmbeddingStatus',
            'DeleteStatus',
            'FieldConfidence',
        ];
        const itemFields = ['ID', 'URL', 'Text', 'Modality', 'SegmentationStatus', 'FieldConfidence'];

        const makeEntity = (names: readonly string[], onSave?: (row: Record<string, unknown>) => void) => {
            const row: Record<string, unknown> = {};
            const entity: Record<string, unknown> = {
                Fields: names.map((Name) => ({ Name })),
                NewRecord: () => {
                    row.ID = `CHUNK-${nextChunkSeq++}`;
                    return true;
                },
                InnerLoad: async () => true,
                Save: async () => {
                    onSave?.({ ...row });
                    return true;
                },
                LatestResult: null,
            };
            for (const name of names) {
                Object.defineProperty(entity, name, {
                    get: () => row[name],
                    set: (v: unknown) => {
                        row[name] = v;
                    },
                    enumerable: true,
                });
            }
            return { entity, row };
        };

        const provider = {
            EntityByName: (name: string) => ({ ID: name }),
            RunView: async () => ({ Success: true, Results: [] }),
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Content Items') {
                    const { entity, row } = makeEntity(itemFields);
                    row.ID = 'ITEM-99';
                    row.URL = 'https://video.example/demo.mp4';
                    row.Modality = 'video';
                    row.Text = [
                        'WEBVTT',
                        '',
                        '00:00:01.000 --> 00:00:02.000',
                        '<v Host>Welcome.',
                        '00:00:02.500 --> 00:00:04.000',
                        '<v Guest>Glad to be here.',
                    ].join('\n');
                    return entity;
                }
                return makeEntity(chunkFields, (saved) => savedChunks.push(saved)).entity;
            },
        };

        const processor = new PipelineProcessor(
            {
                Stages: ['Segment'],
                IsTest: false,
                Configuration: {
                    SegmenterKey: 'Transcript',
                    SegmentationOptions: { EmitSubChapters: true },
                },
            },
            {
                Hydrator: (p, u) => new WorkingRecordHydrator(p, u),
                Committer: (p, u) => new WorkingRecordCommitter(p, u),
            },
        );

        const result = await processor.ProcessRecord(
            { EntityID: 'MJ: Content Items', RecordID: 'ITEM-99' } as never,
            { Provider: provider as never, ContextUser: {} as never } as never,
        );

        expect(result.Status).toBe('Succeeded');
        expect(savedChunks).toHaveLength(3); // 1 parent chapter + 2 speaker sub-chapters
        expect(savedChunks[0]).toMatchObject({
            ID: 'CHUNK-1',
            ContentItemID: 'ITEM-99',
            Sequence: 0,
            Modality: 'video',
            StartMs: 1000,
            EndMs: 4000,
            SegmentTitle: 'Chapter 1',
            SegmenterKey: 'Transcript',
        });
        expect(savedChunks[1]).toMatchObject({
            ID: 'CHUNK-2',
            Sequence: 1,
            ParentChunkID: 'CHUNK-1',
            StartMs: 1000,
            EndMs: 2000,
            SegmentTitle: 'Host',
            Transcript: 'Host: Welcome.',
        });
        expect(savedChunks[2]).toMatchObject({
            ID: 'CHUNK-3',
            Sequence: 2,
            ParentChunkID: 'CHUNK-1',
            StartMs: 2500,
            EndMs: 4000,
            SegmentTitle: 'Guest',
            Transcript: 'Guest: Glad to be here.',
        });

        // Verify WorkingRecordHydrator restores the saved provenance extensions for downstream stages.
        const hydratedEntity = makeEntity(chunkFields);
        Object.assign(hydratedEntity.row, savedChunks[1]);
        const hydrated = new WorkingRecordHydrator(provider as never, {} as never).FromEntity(
            'Content Item Chunk',
            hydratedEntity.entity as never,
        );
        expect(hydrated.GetExtension<number>('Pipeline', 'startMs')).toBe(1000);
        expect(hydrated.GetExtension<number>('Pipeline', 'endMs')).toBe(2000);
        expect(hydrated.GetExtension<string>('Pipeline', 'segmentTitle')).toBe('Host');
        expect(hydrated.GetExtension<string>('Pipeline', 'transcript')).toBe('Host: Welcome.');
        expect(hydrated.GetExtension<string>('Pipeline', 'parentChunkID')).toBe('CHUNK-1');
    });
});
