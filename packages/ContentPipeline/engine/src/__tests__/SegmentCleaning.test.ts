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

function context(configuration: Record<string, unknown> = {}, warnings: string[] = []): StageContext {
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
function stubSource(source: {
    CleanerKey?: string | null;
    ContentTypeCleanerKey?: string | null;
    ContentTypeConfiguration?: Record<string, unknown>;
    Configuration?: Record<string, unknown>;
    Settings?: Record<string, unknown>;
    TypeConfiguration?: Record<string, unknown>;
    FileTypes?: { Name: string; FileExtension: string | null }[];
}) {
    const engine = KnowledgeHubMetadataEngine.Instance;
    vi.spyOn(engine, 'Config').mockResolvedValue(undefined as never);
    vi.spyOn(engine, 'ContentSources', 'get').mockReturnValue([
        { ID: 'S1', ContentTypeID: 'T1', SegmenterKey: null, CleanerKey: source.CleanerKey ?? null },
    ] as never);
    vi.spyOn(engine, 'ContentTypes', 'get').mockReturnValue([
        { ID: 'T1', SegmenterKey: null, CleanerKey: source.ContentTypeCleanerKey ?? null, ConfigurationObject: source.ContentTypeConfiguration ?? null },
    ] as never);
    vi.spyOn(engine, 'ContentFileTypes', 'get').mockReturnValue((source.FileTypes ?? []) as never);
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        Settings: source.Settings ?? {},
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

    it("layers CleaningOptions from ContentType.ConfigurationObject under source and run", async () => {
        stubSource({
            ContentTypeCleanerKey: 'MarkerCleaner',
            ContentTypeConfiguration: { CleaningOptions: { Label: 'by content type' } },
        });
        const record = item('x', null, 'S1');

        await new SegmentStage().Run(record, context());
        expect(chunkText(record)).toBe('cleaned by content type');

        const overridden = item('x', null, 'S1');
        stubSource({
            ContentTypeCleanerKey: 'MarkerCleaner',
            ContentTypeConfiguration: { CleaningOptions: { Label: 'by content type' } },
            Configuration: { CleaningOptions: { Label: 'by source' } },
        });
        await new SegmentStage().Run(overridden, context());
        expect(chunkText(overridden)).toBe('cleaned by source');
    });

    it('falls back to the built-in choice (plain text, for text) for a key nothing registered, and records the one that ran', async () => {
        const record = item('Some text.', null);

        await new SegmentStage().Run(record, context({ CleanerKey: 'NoSuchCleaner' }));

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
    });
});

/** An item of one source with its detected file type, as Extract records it or the database loads it. */
function typedItem(text: string, fileType: string, url = 'https://x.test/a'): WorkingRecord {
    const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', url, 'I1'));
    record.Propose('Text', text, 6, 'Extract');
    record.Propose('FileType', fileType, 6, 'Extract');
    record.SetExtension('Pipeline', 'contentSourceID', 'S1');
    return record;
}

describe('which cleaner runs for an item, by its file type', () => {
    it("follows the content type's Cleaners map, so one source cleans each kind of item as what it is", async () => {
        stubSource({ ContentTypeConfiguration: { Cleaners: { html: 'MarkerCleaner' } } });
        const page = typedItem(PAGE, 'html', 'https://x.test/page');
        const notes = typedItem('Plain   notes.', 'txt', 'https://x.test/notes.txt');

        await new SegmentStage().Run(page, context());
        await new SegmentStage().Run(notes, context());

        expect(page.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
        expect(notes.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
        expect(chunkText(notes)).toBe('Plain notes.');
    });

    it("reads the type's map from the source type's configuration too", async () => {
        stubSource({ TypeConfiguration: { Cleaners: { pdf: 'MarkerCleaner' } } });
        const record = typedItem('Extracted PDF text.', 'pdf');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it('matches a file type loaded from the database by its Content File Type name, whatever its case', async () => {
        stubSource({ ContentTypeConfiguration: { Cleaners: { '.Html': 'MarkerCleaner' } } });
        const record = typedItem(PAGE, 'HTML');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("puts a level's map entry ahead of that level's single CleanerKey", async () => {
        stubSource({ ContentTypeCleanerKey: 'Html', ContentTypeConfiguration: { Cleaners: { txt: 'MarkerCleaner' } } });
        const record = typedItem('x', 'txt');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("puts the content type's standard cleaner for the file type ahead of the source's default", async () => {
        stubSource({ CleanerKey: 'PlainText', ContentTypeConfiguration: { Cleaners: { html: 'MarkerCleaner' } } });
        const record = typedItem('text', 'html');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("uses the source's default for a file type nothing maps", async () => {
        stubSource({ CleanerKey: 'MarkerCleaner', ContentTypeConfiguration: { Cleaners: { html: 'Html' } } });
        const record = typedItem('x', 'docx');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("uses the source's default for an item whose file type was not detected", async () => {
        stubSource({ CleanerKey: 'MarkerCleaner', ContentTypeConfiguration: { Cleaners: { html: 'Html' } } });
        const record = item('x', null, 'S1');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("falls to the content type's CleanerKey, then the built-in choice, when the source sets no default", async () => {
        stubSource({ ContentTypeCleanerKey: 'MarkerCleaner', ContentTypeConfiguration: { Cleaners: { html: 'Html' } } });
        const unmapped = typedItem('x', 'docx');
        await new SegmentStage().Run(unmapped, context());
        expect(unmapped.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');

        stubSource({ ContentTypeConfiguration: { Cleaners: { pdf: 'MarkerCleaner' } } });
        const plain = typedItem('Plain   text.', 'txt');
        await new SegmentStage().Run(plain, context());
        expect(plain.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
    });

    it('resolves one source in the documented order: its file-type entry, the standard one, its default', async () => {
        stubSource({
            CleanerKey: 'PlainText',
            Configuration: { Cleaners: { pdf: 'MarkerCleaner' } },
            ContentTypeConfiguration: { Cleaners: { pdf: 'Html', html: 'Html' } },
        });
        const pdf = typedItem('PDF text.', 'pdf', 'https://x.test/a.pdf');
        const page = typedItem(PAGE, 'html', 'https://x.test/page');
        const doc = typedItem('Doc text.', 'docx', 'https://x.test/a.docx');

        for (const record of [pdf, page, doc]) {
            await new SegmentStage().Run(record, context());
        }

        expect(pdf.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
        expect(page.GetExtension('Segment', 'cleanerKey')).toBe('Html');
        expect(doc.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
    });

    it("puts the source's Configuration map over its Settings map", async () => {
        stubSource({ Settings: { Cleaners: { html: 'Html' } }, Configuration: { Cleaners: { html: 'MarkerCleaner' } } });
        const fromConfiguration = typedItem('text', 'html');
        await new SegmentStage().Run(fromConfiguration, context());
        expect(fromConfiguration.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');

        stubSource({ Settings: { Cleaners: { html: 'MarkerCleaner' } } });
        const fromSettings = typedItem('text', 'html');
        await new SegmentStage().Run(fromSettings, context());
        expect(fromSettings.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("puts the content type's map over the source type's, as its CleanerKey is over the source type's", async () => {
        stubSource({ ContentTypeConfiguration: { Cleaners: { pdf: 'MarkerCleaner' } }, TypeConfiguration: { Cleaners: { pdf: 'Html' } } });
        const byMap = typedItem('PDF text.', 'pdf');
        await new SegmentStage().Run(byMap, context());
        expect(byMap.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');

        stubSource({ ContentTypeCleanerKey: 'MarkerCleaner', TypeConfiguration: { CleanerKey: 'Html' } });
        const byKey = typedItem('PDF text.', 'pdf');
        await new SegmentStage().Run(byKey, context());
        expect(byKey.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("reads the content type's CleanerKey from its Configuration JSON too, after the column", async () => {
        stubSource({ ContentTypeConfiguration: { CleanerKey: 'MarkerCleaner' }, TypeConfiguration: { CleanerKey: 'Html' } });
        const fromConfiguration = typedItem('x', 'txt');
        await new SegmentStage().Run(fromConfiguration, context());
        expect(fromConfiguration.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');

        stubSource({ ContentTypeCleanerKey: 'PlainText', ContentTypeConfiguration: { CleanerKey: 'MarkerCleaner' } });
        const fromColumn = typedItem('x', 'txt');
        await new SegmentStage().Run(fromColumn, context());
        expect(fromColumn.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
    });

    it("lets a run's CleanerKey override every source and content type setting", async () => {
        stubSource({ Configuration: { Cleaners: { html: 'Html' } }, ContentTypeConfiguration: { Cleaners: { html: 'Html' } } });
        const record = typedItem('text', 'html');

        await new SegmentStage().Run(record, context({ CleanerKey: 'MarkerCleaner' }));

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("puts the source's map over the content type's", async () => {
        stubSource({
            ContentTypeConfiguration: { Cleaners: { html: 'Html' } },
            Configuration: { Cleaners: { html: 'MarkerCleaner' } },
        });
        const record = typedItem('text', 'html');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("lets the run's map override every level, for that file type only", async () => {
        stubSource({ CleanerKey: 'Html' });
        const page = typedItem('text', 'html');
        const notes = typedItem(PAGE, 'txt');

        await new SegmentStage().Run(page, context({ Cleaners: { html: 'MarkerCleaner' } }));
        await new SegmentStage().Run(notes, context({ Cleaners: { html: 'MarkerCleaner' } }));

        expect(page.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
        expect(notes.GetExtension('Segment', 'cleanerKey')).toBe('Html');
    });

    it('ignores a map entry that names nothing, and falls through to the next choice', async () => {
        stubSource({ ContentTypeCleanerKey: 'MarkerCleaner', Configuration: { Cleaners: { html: '  ', txt: 7 } } });
        const record = typedItem('x', 'html');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it("matches a custom file type loaded from the database by its name to the extension key Extract uses", async () => {
        stubSource({
            ContentTypeConfiguration: { Cleaners: { docx: 'MarkerCleaner' } },
            FileTypes: [{ Name: 'Word Document', FileExtension: '.docx' }, { Name: 'HTML', FileExtension: '.html' }],
        });
        const loaded = typedItem('Doc text.', 'Word Document');
        const extracted = typedItem('Doc text.', 'docx');

        await new SegmentStage().Run(loaded, context());
        await new SegmentStage().Run(extracted, context());

        expect(loaded.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
        expect(extracted.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });

    it('treats .htm and .xhtml as their own file types, so a map lists each one it means', async () => {
        stubSource({
            CleanerKey: 'PlainText',
            ContentTypeConfiguration: { Cleaners: { html: 'MarkerCleaner' } },
            FileTypes: [{ Name: 'HTML', FileExtension: '.html' }, { Name: 'HTM', FileExtension: '.htm' }],
        });
        const record = typedItem('text', 'HTM');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('PlainText');
    });

    it('skips a cleaner nothing registered, with one warning, and uses the next one configured', async () => {
        stubSource({ Configuration: { Cleaners: { html: 'NoSuchCleaner' } }, ContentTypeConfiguration: { Cleaners: { html: 'MarkerCleaner' } } });
        const warnings: string[] = [];
        const stage = new SegmentStage();
        const first = typedItem('text', 'html', 'https://x.test/1');
        const second = typedItem('text', 'html', 'https://x.test/2');

        await stage.Run(first, context({}, warnings));
        await stage.Run(second, context({}, warnings));

        expect(first.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
        expect(second.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
        expect(warnings.filter((w) => w.includes("'NoSuchCleaner'"))).toHaveLength(1);
    });

    it('cleans markup as HTML, never as plain text, when every configured cleaner is unregistered', async () => {
        stubSource({ CleanerKey: 'NoSuchCleaner', ContentTypeConfiguration: { Cleaners: { html: 'AlsoMissing' } } });
        const record = item(PAGE, 'Html', 'S1');
        record.Propose('FileType', 'html', 6, 'Extract');

        await new SegmentStage().Run(record, context());

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('Html');
        expect(chunkText(record)).not.toContain('<');
    });

    it('works for an item with no source, from the run alone', async () => {
        const record = item('x', null);
        record.Propose('FileType', 'md', 6, 'Extract');

        await new SegmentStage().Run(record, context({ Cleaners: { md: 'MarkerCleaner' } }));

        expect(record.GetExtension('Segment', 'cleanerKey')).toBe('MarkerCleaner');
    });
});
