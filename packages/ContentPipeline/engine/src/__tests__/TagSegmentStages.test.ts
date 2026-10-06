import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentClassifier,
    ClassifyRequest,
    ClassifyResult,
    StageContext,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { TagStage } from '../stages/TagStage.js';
import { SegmentStage } from '../stages/SegmentStage.js';

let classifyImpl: (r: ClassifyRequest) => Promise<ClassifyResult> = async () => ({ Tags: [] });

@RegisterClass(BaseContentClassifier, 'test-classifier')
class TestClassifier extends BaseContentClassifier {
    public readonly Key = 'test-classifier';
    public async Classify(request: ClassifyRequest): Promise<ClassifyResult> {
        return classifyImpl(request);
    }
}

/** Tag rows the stage saved, so a test can assert tagging actually persisted something. */
export const savedTags: { ItemID: string; Tag: string; Weight?: number }[] = [];

/**
 * A provider that records what the stage writes.
 *
 * Tagging's whole point is the rows it leaves behind, so a stub that cannot accept a write would
 * only re-prove the defect this replaced: tags computed, nothing saved.
 */
function recordingProvider() {
    return {
        RunView: async () => ({ Success: true, Results: [] as { ID: string }[] }),
        GetEntityObject: async () => {
            const row: Record<string, unknown> = {};
            return {
                NewRecord: () => true,
                Save: async () => {
                    savedTags.push({
                        ItemID: row.ItemID as string,
                        Tag: row.Tag as string,
                        Weight: row.Weight as number | undefined,
                    });
                    return true;
                },
                Delete: async () => true,
                InnerLoad: async () => true,
                get ItemID() {
                    return row.ItemID as string;
                },
                set ItemID(v: string) {
                    row.ItemID = v;
                },
                get Tag() {
                    return row.Tag as string;
                },
                set Tag(v: string) {
                    row.Tag = v;
                },
                get Weight() {
                    return row.Weight as number;
                },
                set Weight(v: number) {
                    row.Weight = v;
                },
                LatestResult: null,
            };
        },
    } as never;
}

function contextWith(configuration: Record<string, unknown> = {}, signal?: AbortSignal): StageContext {
    return {
        ContextUser: {} as never,
        Provider: recordingProvider(),
        Configuration: configuration,
        IsTest: false,
        Scope: 'Filter',
        Attempt: 1,
        MaxAttempts: 1,
        IsReplay: false,
        Signal: signal ?? new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
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
    classifyImpl = async () => ({ Tags: [] });
    vi.restoreAllMocks();
    savedTags.length = 0;
});

describe('TagStage', () => {
    it('delegates classification and records the tags', async () => {
        classifyImpl = async () => ({ Tags: [{ Name: 'finance', Score: 0.9 }, { Name: 'policy' }] });
        const record = item('some text');
        const outcome = await new TagStage().Run(record, contextWith({ ClassifierKey: 'test-classifier' }));
        expect(outcome.Status).toBe('Complete');
        expect(record.GetExtension<{ Name: string }[]>('Tag', 'tags')).toHaveLength(2);
    });

    it('SAVES the tags, rather than leaving them in the extension space', async () => {
        // The defect this replaced: a successful Tag stage wrote tags nowhere, so the record went
        // Complete and nothing was tagged.
        classifyImpl = async () => ({ Tags: [{ Name: 'finance', Score: 0.9 }, { Name: 'policy' }] });
        const record = item('some text');
        await new TagStage().Run(record, contextWith({ ClassifierKey: 'test-classifier' }));
        expect(savedTags.map((t) => t.Tag)).toEqual(['finance', 'policy']);
        expect(savedTags[0]).toMatchObject({ ItemID: 'ITEM-1', Weight: 0.9 });
    });

    it('clamps a score outside 0-1 rather than storing it', async () => {
        classifyImpl = async () => ({ Tags: [{ Name: 'odd', Score: 4 }] });
        await new TagStage().Run(item('some text'), contextWith({ ClassifierKey: 'test-classifier' }));
        expect(savedTags[0].Weight).toBe(1);
    });

    it('saves nothing on a test run, which commits nothing by definition', async () => {
        classifyImpl = async () => ({ Tags: [{ Name: 'finance' }] });
        const context = { ...contextWith({ ClassifierKey: 'test-classifier' }), IsTest: true };
        const outcome = await new TagStage().Run(item('some text'), context);
        expect(outcome.Status).toBe('Complete');
        expect(savedTags).toHaveLength(0);
    });

    it('records which classifier ran', async () => {
        const record = item('some text');
        await new TagStage().Run(record, contextWith({ ClassifierKey: 'test-classifier' }));
        expect(record.GetExtension<string>('Tag', 'classifierKey')).toBe('test-classifier');
    });

    it('passes the title through as a signal', async () => {
        let sawTitle: string | null = 'unset';
        classifyImpl = async (r) => {
            sawTitle = r.Title;
            return { Tags: [] };
        };
        const record = item('some text');
        record.Propose('Title', 'Quarterly results', 6, 'Extract');
        await new TagStage().Run(record, contextWith({ ClassifierKey: 'test-classifier' }));
        expect(sawTitle).toBe('Quarterly results');
    });

    it('writes tags to the EXTENSION space, not a well-known field', async () => {
        classifyImpl = async () => ({ Tags: [{ Name: 'finance' }] });
        const record = item('some text');
        await new TagStage().Run(record, contextWith({ ClassifierKey: 'test-classifier' }));
        // Nothing durable is proposed: what a deployment does with tags is its own business.
        expect(record.ChangedFields).toEqual(['Text']);
    });

    it('skips a record with no text', async () => {
        const outcome = await new TagStage().Run(item(null), contextWith({ ClassifierKey: 'test-classifier' }));
        expect(outcome.Status).toBe('Skipped');
    });

    it('is fatal when no classifier is configured', async () => {
        await expect(new TagStage().Run(item('text'), contextWith())).rejects.toThrow(/No classifier is configured/);
    });

    it('is fatal when the configured classifier is not registered', async () => {
        await expect(
            new TagStage().Run(item('text'), contextWith({ ClassifierKey: 'nope' })),
        ).rejects.toThrow(/is not registered/);
    });

    it('treats a classifier throwing as transient — it usually reached a model or service', async () => {
        classifyImpl = async () => {
            throw new Error('503 from the model');
        };
        await expect(
            new TagStage().Run(item('text'), contextWith({ ClassifierKey: 'test-classifier' })),
        ).rejects.toThrow(/Classifying with/);
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
});
