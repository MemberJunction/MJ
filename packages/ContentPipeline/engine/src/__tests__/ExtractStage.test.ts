import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { HttpError } from '@memberjunction/network-utils';
import {
    BaseContentExtractor,
    ExtractRequest,
    ExtractResult,
    StageContext,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
const fetchContent = vi.hoisted(() => vi.fn());
vi.mock('../ContentFetcher.js', () => ({ FetchContent: fetchContent }));

import { ExtractStage } from '../stages/ExtractStage.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import type { DetectionRow } from '../DetectionCatalog.js';

/** Detection rules as metadata supplies them: html read by the test extractor, media not text. */
const FILE_TYPES: DetectionRow[] = [
    { Name: 'HTML', FileExtension: '.html', ByteSignature: null, IsText: true, ExtractorKey: 'extract-html' },
    { Name: 'PNG', FileExtension: '.png', ByteSignature: null, IsText: false, ExtractorKey: null },
    { Name: 'MP3', FileExtension: '.mp3', ByteSignature: null, IsText: false, ExtractorKey: null },
    { Name: 'MP4', FileExtension: '.mp4', ByteSignature: null, IsText: false, ExtractorKey: null },
    { Name: 'ZIP', FileExtension: '.zip', ByteSignature: null, IsText: false, ExtractorKey: 'extract-zip' },
];

let blocks: ExtractResult = { Blocks: [{ Text: 'read by the html extractor', Title: 'Document title' }] };

@RegisterClass(BaseContentExtractor, 'extract-html')
class HtmlTestExtractor extends BaseContentExtractor {
    public readonly Key = 'extract-html';
    public readonly SupportedFileTypes = ['html'];
    public async Extract(_request: ExtractRequest): Promise<ExtractResult> {
        return blocks;
    }
}

/** An archive standing in for zip: its members come back as bytes, as ArchiveExtractor's do. */
@RegisterClass(BaseContentExtractor, 'extract-zip')
class ZipTestExtractor extends BaseContentExtractor {
    public readonly Key = 'extract-zip';
    public readonly SupportedFileTypes = ['zip'];
    public async Extract(_request: ExtractRequest): Promise<ExtractResult> {
        const member = (key: string, text: string) => ({ Text: '', Key: key, FileType: key.split('.').pop(), Content: new TextEncoder().encode(text) });
        return { Blocks: [member('page.html', '<html>x</html>'), member('photo.png', 'binary'), member('notes.bizarre', 'plain notes')] };
    }
}

function contextWith(configuration: Record<string, unknown> = {}, signal?: AbortSignal): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
        Configuration: configuration,
        IsTest: false,
        Signal: signal ?? new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };
}

function itemAt(url: string): WorkingRecord {
    return new WorkingRecord(new WorkingRecordIdentity('Content Item', url, 'ITEM-1'));
}

function stubFetch(text: string): void {
    fetchContent.mockResolvedValue({ Content: new TextEncoder().encode(text), ResolvedURL: undefined });
}

beforeEach(() => {
    vi.restoreAllMocks();
    // ContentType.ExtractorKey is read from the Knowledge Hub cache; no database here, so no rows.
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockReturnValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'ContentFileTypes', 'get').mockReturnValue(FILE_TYPES as never);
    fetchContent.mockReset();
    blocks = { Blocks: [{ Text: 'read by the html extractor', Title: 'Document title' }] };
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        ContentSourceID: 'SRC-1',
        URL: 'https://x.test',
        Settings: {},
        Parameters: {},
        Configuration: {},
        Problems: [],
        IsValid: true,
    } as never);
});

describe('ExtractStage — reading', () => {
    it("reads with the file type's extractor from metadata and proposes the text", async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(record.Get('Text')).toBe('read by the html extractor');
    });

    it('proposes a title the extractor found in the document structure', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith());
        expect(record.Get('Title')).toBe('Document title');
    });

    it('does not overwrite a title Discover proposed more confidently', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        record.Propose('Title', 'From the listing', 9, 'Discover.RSS');
        await new ExtractStage().Run(record, contextWith());
        expect(record.Get('Title')).toBe('From the listing');
    });

    it('resolves file type from the URL extension when nothing was declared', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith());
        expect(record.Get('FileType')).toBe('html');
    });

    it('records which extractor actually ran', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith());
        expect(record.GetExtension<string>('Extract', 'extractorKey')).toBe('extract-html');
    });

    it('skips when the extractor finds no content', async () => {
        stubFetch('<html></html>');
        blocks = { Blocks: [] };
        const record = itemAt('https://x.test/page.html');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Skipped');
    });
});

describe('ExtractStage — an artifact that expands into other items', () => {
    it('makes EVERY block a child and leaves the container intact', async () => {
        // Applying the first block to the container would lose the container and mislabel one of
        // its members as the whole thing — the failure Betty's zip extractor guards against.
        stubFetch('<html>body</html>');
        blocks = { Blocks: [{ Text: 'first', Key: 'a' }, { Text: 'second', Key: 'b' }, { Text: 'third', Key: 'c' }] };
        const record = itemAt('https://x.test/bundle.html');
        await new ExtractStage().Run(record, contextWith());
        expect(record.Get('Text')).toBeNull();
        expect(record.Children).toHaveLength(3);
        expect(record.Children.map((c) => c.Identity.EphemeralID)).toEqual([
            'https://x.test/bundle.html#a',
            'https://x.test/bundle.html#b',
            'https://x.test/bundle.html#c',
        ]);
    });

    it('applies a SINGLE block to the record itself — that is the document, not a container', async () => {
        stubFetch('<html>body</html>');
        blocks = { Blocks: [{ Text: 'the whole document' }] };
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith());
        expect(record.Get('Text')).toBe('the whole document');
        expect(record.Children).toHaveLength(0);
    });

    it('gives a split child its PARENT date, not the moment of the split', async () => {
        stubFetch('<html>body</html>');
        const authored = new Date('2020-01-01T00:00:00Z');
        blocks = { Blocks: [{ Text: 'first' }, { Text: 'second', Key: 'b' }] };
        const record = itemAt('https://x.test/page.html');
        record.Propose('Date', authored, 5, 'Discover.RSS');
        await new ExtractStage().Run(record, contextWith());
        expect(record.Children[0].Get('Date')).toBe(authored);
    });

    it("carries a extractor's routing instruction onto the child", async () => {
        stubFetch('<html>body</html>');
        blocks = { Blocks: [{ Text: 'first', Key: 'a' }, { Text: 'sheet', Key: 'b', ExtractorKeyOverride: 'extract-html' }] };
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith());
        expect(record.Children[1].GetExtension<string>('Pipeline', 'extractorKeyOverride')).toBe('extract-html');
    });
});

describe('ExtractStage — archive members take the same path as any document', () => {
    it('reads each member now: through its extractor, as non-text, or as plain text', async () => {
        stubFetch('PK');
        const record = itemAt('https://x.test/bundle.zip');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        const [page, photo, notes] = record.Children;
        expect(page.Get('Text')).toBe('read by the html extractor');
        expect(page.GetExtension<string>('Extract', 'extractorKey')).toBe('extract-html');
        // Non-text and no durable copies configured: closed out, never left Pending behind the container's URL.
        expect(photo.Get('Modality')).toBe('image');
        expect(photo.IsComplete).toBe(true);
        expect(notes.Get('Text')).toBe('plain notes');
    });
});

describe('ExtractStage — the plain-text fallback is sanity-checked', () => {
    it('accepts readable text when no extractor handles the format', async () => {
        stubFetch('Plain readable content.');
        const record = itemAt('https://x.test/file.bizarre');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(record.Get('Text')).toBe('Plain readable content.');
        expect(record.GetExtension<boolean>('Extract', 'isFallback')).toBe(true);
    });

    it('FAILS rather than letting unreadable content propagate', async () => {
        stubFetch('\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007');
        const record = itemAt('https://x.test/file.bizarre');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Failed');
        expect(record.Get('Text')).toBeNull();
    });

    it('marks fallback text with low confidence, so a real extractor later wins', async () => {
        stubFetch('Plain readable content.');
        const record = itemAt('https://x.test/file.bizarre');
        await new ExtractStage().Run(record, contextWith());
        expect(record.GetConfidence('Text')).toBeLessThan(6);
    });

    it("honours per-source Tuning.MinimumPrintableRatio in fallbackText rather than reading only run Configuration", async () => {
        // 90% printable (9 'a's + 1 null byte) passes the 0.85 default but must fail when the source sets 0.99.
        stubFetch('aaaaaaaaa\u0000');
        vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
            ContentSourceID: 'SRC-1',
            URL: 'https://x.test',
            Settings: {},
            Parameters: {},
            Configuration: { Tuning: { MinimumPrintableRatio: 0.99 } },
            Problems: [],
            IsValid: true,
        } as never);
        const record = itemAt('https://x.test/file.bizarre');
        record.SetExtension('Pipeline', 'contentSourceID', 'SRC-1');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Failed');
        expect(record.Get('Text')).toBeNull();
    });
});

describe('ExtractStage — non-text content', () => {
    it('skips and completes a non-text record when multi-modal is off', async () => {
        stubFetch('binary');
        const record = itemAt('https://x.test/photo.png');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Skipped');
        expect(record.IsComplete).toBe(true);
        expect(record.Get('Modality')).toBe('image');
    });

    it('classifies audio and video modality', async () => {
        stubFetch('binary');
        const audio = itemAt('https://x.test/clip.mp3');
        await new ExtractStage().Run(audio, contextWith());
        expect(audio.Get('Modality')).toBe('audio');

        const video = itemAt('https://x.test/clip.mp4');
        await new ExtractStage().Run(video, contextWith());
        expect(video.Get('Modality')).toBe('video');
    });
});

describe('ExtractStage — failure classification', () => {
    it('treats a 404 as fatal, because it will never succeed', async () => {
        fetchContent.mockRejectedValue(new HttpError('Request failed with status code 404', { Status: 404, Url: 'https://x.test/gone.html', Method: 'GET' }));
        const record = itemAt('https://x.test/gone.html');
        await expect(new ExtractStage().Run(record, contextWith())).rejects.toThrow(/Cannot fetch/);
    });

    it('treats HTTP 408, 425, and 429 as transient so rate-limited or timed-out fetches retry', async () => {
        for (const status of [408, 425, 429]) {
            fetchContent.mockRejectedValueOnce(
                new HttpError(`Request failed with status code ${status}`, { Status: status, Url: 'https://x.test/page.html', Method: 'GET' }),
            );
            const record = itemAt('https://x.test/page.html');
            await expect(new ExtractStage().Run(record, contextWith())).rejects.toThrow(/Fetching/);
        }
    });

    it('treats a network blip as transient', async () => {
        fetchContent.mockRejectedValue(new Error('socket hang up'));
        const record = itemAt('https://x.test/page.html');
        await expect(new ExtractStage().Run(record, contextWith())).rejects.toThrow(/Fetching/);
    });

    it('does not fetch at all when already cancelled', async () => {
        const controller = new AbortController();
        controller.abort();
        const outcome = await new ExtractStage().Run(itemAt('https://x.test/a.html'), contextWith({}, controller.signal));
        expect(outcome.Status).toBe('Retry');
        expect(fetchContent).not.toHaveBeenCalled();
    });

    it('expands a single-member archive into a child item and extracts its bytes rather than discarding them', async () => {
        stubFetch('<html>wrapper</html>');
        blocks = {
            Blocks: [
                {
                    Text: '',
                    Key: 'report.txt',
                    FileType: 'bizarre',
                    Content: new TextEncoder().encode('Single member content inside archive.'),
                },
            ],
        };
        const record = itemAt('https://x.test/single.html');
        const outcome = await new ExtractStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(record.Get('Text')).toBeNull();
        expect(record.Children).toHaveLength(1);
        expect(record.Children[0].Get('Text')).toBe('Single member content inside archive.');
        expect(record.Children[0].GetExtension<string>('Pipeline', 'checksum')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('computes a SHA-256 checksum for extracted text so the committer can detect unchanged re-extractions', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith());
        expect(record.GetExtension<string>('Pipeline', 'checksum')).toMatch(/^[0-9a-f]{64}$/);
    });
});
