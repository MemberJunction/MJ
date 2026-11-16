/**
 * @fileoverview Segment cleans an item's text before splitting it.
 *
 * Extract stores what it read (an HTML page keeps its markup), so the chunks are only clean if Segment
 * cleans. The cleaner is the configured one (run, then source, then content type) or, with none, the one
 * that suits the text: HTML for an item the Html extractor read, plain text otherwise. Written against the
 * stage with the knowledge-hub engine and the source configuration stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseContentCleaner, ContentCleaningParams } from '@memberjunction/ai-segmentation';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { SegmentStage } from '../stages/SegmentStage.js';

/** A cleaner that shows it ran, and with which options. */
@RegisterClass(BaseContentCleaner, 'MarkerCleaner')
class MarkerCleaner extends BaseContentCleaner {
    public get Key(): string {
        return 'MarkerCleaner';
    }
    protected CleanCore(params: ContentCleaningParams): string {
        return `cleaned ${String((params.Options as { Label?: string } | undefined)?.Label ?? 'plain')}`;
    }
}

/** A cleaner that finds no content at all (the base class would fall back to the original; this one does not). */
@RegisterClass(BaseContentCleaner, 'EmptyingCleaner')
class EmptyingCleaner extends BaseContentCleaner {
    public get Key(): string {
        return 'EmptyingCleaner';
    }
    protected CleanCore(): string {
        return '';
    }
    public override Clean() {
        return { Success: true, Content: '', CleanerKey: this.Key, Warnings: [], CharactersRemoved: 0 };
    }
}

const PAGE =
    '<html><head><title>T</title></head><body><nav>Home | About | Contact</nav>' +
    '<div class="article-body"><p>Revenue rose this quarter.</p></div>' +
    '<div class="share">Share on social</div><footer>Copyright</footer></body></html>';

function context(configuration: Record<string, unknown> = {}): StageContext {
    const warnings: string[] = [];
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: configuration,
        IsTest: false,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: (m: string) => warnings.push(m), Error: () => {} },
        ResolveAccess: async () => null,
    };
}

function item(text: string, extractorKey: string | null, contentSourceID: string | null = null): WorkingRecord {
    const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
    record.Propose('Text', text, 6, 'Extract');
    if (extractorKey) {
        record.SetExtension('Pipeline', 'extractorKey', extractorKey);
    }
    if (contentSourceID) {
        record.SetExtension('Pipeline', 'contentSourceID', contentSourceID);
    }
    return record;
}

function chunkText(record: WorkingRecord): string {
    return record.Children.map((c) => String(c.Get('Text'))).join('\n');
}

/** A source (and its content type) with these columns and Configuration. */
function stubSource(source: { CleanerKey?: string | null; ContentTypeCleanerKey?: string | null; Configuration?: Record<string, unknown>; TypeConfiguration?: Record<string, unknown> }) {
    const engine = KnowledgeHubMetadataEngine.Instance;
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(engine, 'ContentSources', 'get').mockReturnValue([
        { ID: 'S1', ContentTypeID: 'T1', SegmenterKey: null, CleanerKey: source.CleanerKey ?? null },
    ] as never);
    vi.spyOn(engine, 'ContentTypes', 'get').mockReturnValue([
        { ID: 'T1', SegmenterKey: null, CleanerKey: source.ContentTypeCleanerKey ?? null },
    ] as never);
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        Settings: {},
        Configuration: source.Configuration ?? {},
        TypeConfiguration: source.TypeConfiguration ?? {},
        Confidence: undefined,
    } as never);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Segment cleans before it splits', () => {
    it('cleans a page the Html extractor stored, so its chunks hold the article and not the markup or the chrome', async () => {
        const record = item(PAGE, 'Html');

        const outcome = await new SegmentStage().Run(record, context());

        expect(outcome.Status).toBe('Complete');
        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('Html');
        const text = chunkText(record);
        expect(text).toContain('Revenue rose this quarter.');
        expect(text).not.toContain('<');
        expect(text).not.toContain('Home | About');
        expect(text).not.toContain('Copyright');
    });

    it("applies the source's selectors, so only the article is kept", async () => {
        stubSource({ Configuration: { CleaningOptions: { IncludeSelectors: ['.article-body'] } } });
        const record = item(PAGE, 'Html', 'S1');

        await new SegmentStage().Run(record, context());

        expect(chunkText(record)).toBe('Revenue rose this quarter.');
    });

    it('only tidies text that is not HTML', async () => {
        const record = item('First   line.\n\n\n\nSecond line.', 'PlainText');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
        const text = chunkText(record);
        expect(text).toContain('First line.');
        expect(text).toContain('Second line.');
        expect(text).not.toMatch(/ {2}|\n{3}/);
    });

    it('treats an item stored before this change (no extractor recorded) as plain text', async () => {
        const record = item('Already text.', null);

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
        expect(chunkText(record)).toBe('Already text.');
    });

    it('skips an item that cleaning leaves without text, rather than cutting empty chunks', async () => {
        const record = item('<html><body><nav>Home</nav></body></html>', 'Html');

        const outcome = await new SegmentStage().Run(record, context({ CleanerKey: 'EmptyingCleaner' }));

        expect(outcome.Status).toBe('Skipped');
        expect(record.Children).toHaveLength(0);
    });
});

describe('which cleaner runs', () => {
    it("is the run's when the run names one", async () => {
        stubSource({ CleanerKey: 'Html', ContentTypeCleanerKey: 'Html' });
        const record = item('text', 'Html', 'S1');

        await new SegmentStage().Run(record, context({ CleanerKey: 'MarkerCleaner', CleaningOptions: { Label: 'by run' } }));

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
        expect(chunkText(record)).toBe('cleaned by run');
    });

    it("is the source's before its content type's", async () => {
        stubSource({ CleanerKey: 'MarkerCleaner', ContentTypeCleanerKey: 'Html' });
        const record = item(PAGE, 'Html', 'S1');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("can come from the source's Configuration JSON", async () => {
        stubSource({ Configuration: { CleanerKey: 'MarkerCleaner' } });
        const record = item(PAGE, 'Html', 'S1');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("is the content type's when the source names none", async () => {
        stubSource({ ContentTypeCleanerKey: 'MarkerCleaner' });
        const record = item('Plain.', 'PlainText', 'S1');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("layers the options: the source's over its type's", async () => {
        stubSource({
            CleanerKey: 'MarkerCleaner',
            TypeConfiguration: { CleaningOptions: { Label: 'by type' } },
            Configuration: { CleaningOptions: { Label: 'by source' } },
        });
        const record = item('x', null, 'S1');

        await new SegmentStage().Run(record, context());

        expect(chunkText(record)).toBe('cleaned by source');
    });

    it('falls back to the plain-text cleaner for a key nothing registered, and records the one that ran', async () => {
        const record = item('Some text.', null);

        await new SegmentStage().Run(record, context({ CleanerKey: 'NoSuchCleaner' }));

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
    });
});
