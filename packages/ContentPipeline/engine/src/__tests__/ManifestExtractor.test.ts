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

    it('throws when the stop signal is aborted instead of returning partial rows', async () => {
        const controller = new AbortController();
        controller.abort('shutting down');
        await expect(new ManifestExtractor().Extract(request(MANIFEST, OPTIONS, { Signal: controller.signal }))).rejects.toThrow(
            /manifest extraction stopped/,
        );
    });
});

describe('the manifest extractor deciding from the header', () => {
    const DATASET = 'Region,Revenue\nNorth,100\nSouth,"1,200"';
    const BETTY: ManifestOptions = {
        DetectByHeader: true,
        DetectionColumns: ['ContentLink', 'ContentText', 'UserLink'],
        LinkColumn: 'ContentLink',
        FallbackLinkColumns: ['UserLink'],
        TextColumn: 'ContentText',
        TitleColumn: 'Title',
        KeyColumns: [['UserLink', 'Title'], 'UserLink', 'Title'],
        KeyAsURL: true,
    };

    it('reads a dataset as one document, as the plain-text read would, when detection is on', async () => {
        const result = await new ManifestExtractor().Extract(request(DATASET, { ...OPTIONS, DetectByHeader: true }));

        expect(result).toEqual({ Blocks: [{ Text: DATASET }], IsFallback: true });
    });

    it('needs no row limit to read a dataset as a document', async () => {
        const result = await new ManifestExtractor().Extract(request(DATASET, { ...OPTIONS, DetectByHeader: true }, { Tuning: { MaxArchiveMembers: null } }));
        expect(result.Blocks).toHaveLength(1);
    });

    it('reads nothing from a dataset whose bytes are not plausible text', async () => {
        const garbage = String.fromCharCode(...Array.from({ length: 40 }, (_, i) => i % 8));
        const result = await new ManifestExtractor().Extract(request(garbage, { ...OPTIONS, DetectByHeader: true }));
        expect(result.Blocks).toEqual([]);
    });

    it('still expands a manifest when detection is on and the header has the link or text column', async () => {
        const result = await new ManifestExtractor().Extract(request(MANIFEST, { ...OPTIONS, DetectByHeader: true }));
        expect(result.IsContainer).toBe(true);
        expect(result.Blocks).toHaveLength(3);
    });

    it('with detection off, a dataset is still read as a manifest and fails on the missing columns, as before', async () => {
        await expect(new ManifestExtractor().Extract(request(DATASET, OPTIONS))).rejects.toThrow(/no column named 'link', 'Body'/);
    });

    it('detects by the explicit detection columns, not the link and text columns, when they are given', async () => {
        const byOther = { ...OPTIONS, DetectByHeader: true, DetectionColumns: ['UserLink'] };
        const notManifest = await new ManifestExtractor().Extract(request(MANIFEST, byOther));
        expect(notManifest.IsContainer).toBeUndefined();
        expect(notManifest.Blocks).toHaveLength(1);

        const manifest = await new ManifestExtractor().Extract(request('Title,userlink\nGuide,https://x.test/g', { ...BETTY }));
        expect(manifest.IsContainer).toBe(true);
        expect(manifest.Blocks[0]).toMatchObject({ URL: 'https://x.test/g', Text: '' });
    });

    it('treats configured columns the header lacks as empty when detection is on', async () => {
        const result = await new ManifestExtractor().Extract(request('ContentText\nJust text', BETTY));
        expect(result.Blocks).toEqual([expect.objectContaining({ Text: 'Just text', URL: undefined, Key: 'row-1' })]);
    });

    it('fetches a row without text from its fallback link, but never gives a text row a fallback link', async () => {
        const csv = ['ContentLink,UserLink,ContentText,Title', ',https://x.test/page,,Page', ',https://x.test/page,Body,Section'].join('\n');
        const result = await new ManifestExtractor().Extract(request(csv, { ...BETTY, KeyAsURL: false }));

        expect(result.Blocks[0]).toMatchObject({ URL: 'https://x.test/page', Text: '' });
        expect(result.Blocks[1]).toMatchObject({ URL: undefined, Text: 'Body', Key: 'https://x.test/page | Section' });
    });

    it("identifies rows by Betty's rule: ContentLink, else UserLink, else UserLink | Title for a text row, else Title", async () => {
        const csv = [
            'ContentLink,UserLink,ContentText,Title',
            'https://x.test/doc.pdf,https://x.test/landing,,Doc',
            ',https://x.test/landing,,Landing',
            ',https://x.test/landing,Inline text,Inline',
            ',,Bare text,Bare',
        ].join('\n');
        const result = await new ManifestExtractor().Extract(request(csv, BETTY));

        expect(result.Blocks.map((b) => b.URL)).toEqual([
            'https://x.test/doc.pdf',
            'https://x.test/landing',
            'https://x.test/landing | Inline',
            'Bare',
        ]);
    });

    it('tries key columns in order and skips a composite with a missing part or a column the header lacks', async () => {
        const options: ManifestOptions = { TextColumn: 'Body', KeyColumns: ['Missing', ['Area', 'Code'], 'Code'] };
        const result = await new ManifestExtractor().Extract(request('Body,Area,Code\nA,North,7\nB,,8\nC,,', options));

        expect(result.Blocks.map((b) => b.Key)).toEqual(['North | 7', '8', 'row-3']);
        expect(result.Blocks.every((b) => b.URL === undefined)).toBe(true); // KeyAsURL off: the URL comes from the manifest
    });

    it('joins a composite key with the configured separator, and prefers KeyColumn to KeyColumns', async () => {
        const csv = 'Body,ID,Area,Code\nA,,North,7\nB,P-2,South,8';
        const result = await new ManifestExtractor().Extract(
            request(csv, { TextColumn: 'Body', KeyColumn: 'ID', KeyColumns: [['Area', 'Code']], KeySeparator: '/' }),
        );
        expect(result.Blocks.map((b) => b.Key)).toEqual(['North/7', 'P-2']);
    });

    it('never makes a bare position a URL, even with KeyAsURL', async () => {
        const result = await new ManifestExtractor().Extract(request('Body\nA', { TextColumn: 'Body', KeyAsURL: true }));
        expect(result.Blocks[0]).toMatchObject({ URL: undefined, Key: 'row-1' });
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

    it('with header detection, reads a dataset as the document itself and a manifest as its rows', async () => {
        const detect = { ...RUN, ExtractorOptions: { Manifest: { ...OPTIONS, DetectByHeader: true } } };
        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode('Region,Revenue\nNorth,100'), ResolvedURL: undefined });
        const dataset = manifestItem();

        const outcome = await new ExtractStage().Run(dataset, contextWith(detect));

        expect(outcome.Status).toBe('Complete');
        expect(dataset.Children).toHaveLength(0);
        expect(dataset.Get('Text')).toBe('Region,Revenue\nNorth,100');

        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode(MANIFEST), ResolvedURL: undefined });
        const manifest = manifestItem();
        await new ExtractStage().Run(manifest, contextWith(detect));
        expect(manifest.Children).toHaveLength(3);
    });

    it('gives a keyed text row the manifest URL plus its key, or the key itself with KeyAsURL', async () => {
        fetchContent.mockResolvedValue({ Content: new TextEncoder().encode('Body,UserLink,Title\nText,https://x.test/l,T'), ResolvedURL: undefined });
        const keyed = { TextColumn: 'Body', KeyColumns: [['UserLink', 'Title']] };
        const plain = manifestItem();
        await new ExtractStage().Run(plain, contextWith({ ...RUN, ExtractorOptions: { Manifest: keyed } }));
        expect(plain.Children[0].Identity.EphemeralID).toBe('https://x.test/manifest.csv#https://x.test/l | T');

        const asURL = manifestItem();
        await new ExtractStage().Run(asURL, contextWith({ ...RUN, ExtractorOptions: { Manifest: { ...keyed, KeyAsURL: true } } }));
        expect(asURL.Children[0].Identity.EphemeralID).toBe('https://x.test/l | T');
    });

    it('records manifest row fields as listing data so high-confidence titles survive the linked document Extract', async () => {
        const record = manifestItem();
        await new ExtractStage().Run(record, contextWith({ ...RUN, Confidence: { DiscoveredTitle: 8 } }));
        const linked = record.Children[0];
        expect(linked.GetField('Title')?.SetBy).toBe('Listing.Block');
        // Simulate hydrating and running Extract on the linked HTML page (ExtractorTitle is 6 < 8).
        expect(linked.Propose('Title', 'HTML Title', ConfidenceScale.ExtractorTitle, 'Extract')).toBe(false);
        expect(linked.Get('Title')).toBe('Annual Report');
    });
});
