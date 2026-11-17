/**
 * @fileoverview A manifest (a CSV or TSV listing documents) expands into child items, like an archive.
 *
 * Rows with text are complete; link-only rows become items at their link, for their own Extract. Which
 * columns hold what is configuration, and a CSV is never a manifest unless something selects it. Covered:
 * the delimited reader, the extractor's row mapping and refusals, and Extract applying the result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { ConfidenceScale, StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
const fetchContent = vi.hoisted(() => vi.fn());
vi.mock('../ContentFetcher.js', () => ({ FetchContent: fetchContent }));

import { ExtractStage } from '../stages/ExtractStage.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { ManifestExtractor, ManifestOptions, ParseDelimited } from '../extractors/ManifestExtractor.js';
import type { DetectionRow } from '../DetectionCatalog.js';

/** As shipped: CSV is text with no extractor of its own, so nothing reads one as a manifest by default. */
const FILE_TYPES: DetectionRow[] = [{ Name: 'CSV', FileExtension: '.csv', ByteSignature: null, IsText: true, ExtractorKey: null }];

const MANIFEST = [
    'Link,Body,Title,Published,Journal,Member Type',
    'https://x.test/docs/a.pdf,,Annual Report,2026-03-01,Journal of X,Members',
    ',"Inline policy text, with a comma",Policy,,Journal of X,Staff',
    'docs/b.html,,Relative,,,',
    ',,,,,',
].join('\r\n');

const OPTIONS: ManifestOptions = {
    LinkColumn: 'link',
    TextColumn: 'Body',
    TitleColumn: 'Title',
    DateColumn: 'Published',
    DecoratorColumn: 'Journal',
    Columns: { 'Member Type': 'Audience' },
};

function request(text: string, options: ManifestOptions | undefined = OPTIONS, extra: Record<string, unknown> = {}) {
    return {
        Content: new TextEncoder().encode(text),
        FileType: 'csv',
        URL: 'https://x.test/manifest.csv',
        Parameters: {},
        Tuning: { MaxArchiveMembers: 100 } as never,
        Options: options as Record<string, unknown> | undefined,
        Confidence: { ...ConfidenceScale },
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        ...extra,
    };
}

describe('reading delimited text', () => {
    it('handles quotes, doubled quotes, delimiters and line breaks inside quotes, and CRLF', () => {
        expect(ParseDelimited('a,b\r\n"x, y","he said ""hi""\nthen left"\n')).toEqual([
            ['a', 'b'],
            ['x, y', 'he said "hi"\nthen left'],
        ]);
    });

    it('reads tab-separated text and drops empty lines', () => {
        expect(ParseDelimited('a\tb\n\n1\t2', '\t')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });
});

describe('the manifest extractor', () => {
    it('makes one block per listed row, at its link, with its fields and mapped columns', async () => {
        const result = await new ManifestExtractor().Extract(request(MANIFEST));

        expect(result.IsContainer).toBe(true);
        expect(result.Blocks).toHaveLength(3); // the empty row is skipped
        const [linked, inline, relative] = result.Blocks;
        expect(linked).toMatchObject({ Text: '', URL: 'https://x.test/docs/a.pdf', Key: 'https://x.test/docs/a.pdf', Columns: { Audience: 'Members' } });
        expect(linked.Fields).toEqual([
            { Field: 'Title', Value: 'Annual Report', Confidence: ConfidenceScale.DiscoveredTitle },
            { Field: 'Date', Value: new Date('2026-03-01'), Confidence: ConfidenceScale.DiscoveredDate },
            { Field: 'Decorator', Value: 'Journal of X', Confidence: ConfidenceScale.DiscoveredDecorator },
        ]);
        expect(inline).toMatchObject({ Text: 'Inline policy text, with a comma', URL: undefined, Key: 'row-2' });
        expect(relative.URL).toBe('https://x.test/docs/b.html');
    });

    it('identifies text-only rows by the key column when one is set', async () => {
        const result = await new ManifestExtractor().Extract(request('ID,Body\nP-7,Policy text', { TextColumn: 'Body', KeyColumn: 'ID' }));
        expect(result.Blocks[0].Key).toBe('P-7');
    });

    it('refuses a manifest with no link or text column configured', async () => {
        await expect(new ManifestExtractor().Extract(request(MANIFEST, {}))).rejects.toThrow(/LinkColumn or TextColumn/);
    });

    it('refuses a configured column the header does not have', async () => {
        await expect(new ManifestExtractor().Extract(request(MANIFEST, { ...OPTIONS, TitleColumn: 'Headline' }))).rejects.toThrow(
            /no column named 'Headline'/,
        );
    });

    it('refuses a date it cannot read', async () => {
        await expect(new ManifestExtractor().Extract(request('Link,Published\nhttps://x.test/a,someday', { LinkColumn: 'Link', DateColumn: 'Published' }))).rejects.toThrow(
            /'someday' in Published is not a date/,
        );
    });

    it('refuses more rows than the member limit, and refuses to read without one', async () => {
        await expect(new ManifestExtractor().Extract(request(MANIFEST, OPTIONS, { Tuning: { MaxArchiveMembers: 2 } }))).rejects.toThrow(/more than the limit of 2/);
        await expect(new ManifestExtractor().Extract(request(MANIFEST, OPTIONS, { Tuning: { MaxArchiveMembers: null } }))).rejects.toThrow(/no row limit/);
    });
});

// ─── through Extract ──────────────────────────────────────────────────────────────────────────────────

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

function manifestItem(): WorkingRecord {
    const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/manifest.csv', 'M1'));
    record.Propose('Date', new Date('2020-01-01'), 6, 'Discover');
    return record;
}

function stubSource(configuration: Record<string, unknown> = {}, typeConfiguration: Record<string, unknown> = {}): void {
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        ContentSourceID: 'SRC-1',
        URL: 'https://x.test',
        Settings: {},
        Parameters: {},
        Configuration: configuration,
        TypeConfiguration: typeConfiguration,
        Problems: [],
        IsValid: true,
    } as never);
}

const RUN = { ExtractorKey: 'Manifest', ExtractorOptions: { Manifest: OPTIONS }, Tuning: { MaxArchiveMembers: 100 } };

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockReturnValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'ContentFileTypes', 'get').mockReturnValue(FILE_TYPES as never);
    fetchContent.mockReset();
    fetchContent.mockResolvedValue({ Content: new TextEncoder().encode(MANIFEST), ResolvedURL: undefined });
    stubSource();
});

describe('Extract expanding a manifest', () => {
    it('makes each row a child item; text rows are complete, link rows are left for their own Extract', async () => {
        const record = manifestItem();

        const outcome = await new ExtractStage().Run(record, contextWith(RUN));

        expect(outcome.Status).toBe('Complete');
        expect(record.Children.map((c) => c.Identity.EphemeralID)).toEqual([
            'https://x.test/docs/a.pdf',
            'https://x.test/manifest.csv#row-2',
            'https://x.test/docs/b.html',
        ]);
        const [linked, inline] = record.Children;
        expect(linked.Get('Text')).toBeNull();
        expect(linked.IsComplete).toBe(false);
        expect(inline.Get('Text')).toBe('Inline policy text, with a comma');
        expect(linked.Get('Title')).toBe('Annual Report');
        expect(linked.Get('Decorator')).toBe('Journal of X');
        expect(linked.GetExtension('Pipeline', 'customColumns')).toEqual({ Audience: 'Members' });
    });

    it("gives a row its own date rather than the manifest's", async () => {
        const record = manifestItem();
        await new ExtractStage().Run(record, contextWith(RUN));
        expect(record.Children[0].Get('Date')).toEqual(new Date('2026-03-01'));
        expect(record.Children[1].Get('Date')).toEqual(new Date('2020-01-01')); // no date of its own: inherited
    });

    it('keeps a one-row manifest a container, rather than making the manifest that row', async () => {
        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode('Body\nOnly row'), ResolvedURL: undefined });
        const record = manifestItem();

        await new ExtractStage().Run(record, contextWith({ ...RUN, ExtractorOptions: { Manifest: { TextColumn: 'Body' } } }));

        expect(record.Get('Text')).toBeNull();
        expect(record.Children).toHaveLength(1);
        expect(record.Children[0].Get('Text')).toBe('Only row');
    });

    it('layers its options: the source type, then the source, then the run', async () => {
        stubSource({ ExtractorOptions: { Manifest: { TitleColumn: 'Journal' } } }, { ExtractorOptions: { Manifest: { LinkColumn: 'Link', TitleColumn: 'Title' } } });
        const record = manifestItem();
        record.SetExtension('Pipeline', 'contentSourceID', 'SRC-1');

        await new ExtractStage().Run(record, contextWith({ ExtractorKey: 'Manifest', Tuning: { MaxArchiveMembers: 100 } }));

        expect(record.Children[0].Get('Title')).toBe('Journal of X');
    });

    it('never reads a CSV as a manifest unless something selects the Manifest extractor', async () => {
        const record = manifestItem();

        await new ExtractStage().Run(record, contextWith({ ExtractorOptions: { Manifest: OPTIONS }, Tuning: { MaxArchiveMembers: 100 } }));

        expect(record.Children).toHaveLength(0);
        expect(String(record.Get('Text'))).toContain('Annual Report'); // read as plain text, a dataset
    });
});
