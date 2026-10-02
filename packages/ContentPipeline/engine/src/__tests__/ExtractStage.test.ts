import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentReader,
    ReadRequest,
    ReadResult,
    StageContext,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { ExtractStage } from '../stages/ExtractStage.js';
import { ContentFetcher } from '../ContentFetcher.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';

let blocks: ReadResult = { Blocks: [{ Text: 'read by the html reader', Title: 'Document title' }] };

@RegisterClass(BaseContentReader, 'extract-html')
class HtmlTestReader extends BaseContentReader {
    public readonly Key = 'extract-html';
    public readonly SupportedFileTypes = ['html'];
    public async Read(_request: ReadRequest): Promise<ReadResult> {
        return blocks;
    }
}

function contextWith(configuration: Record<string, unknown> = {}, signal?: AbortSignal): StageContext {
    return {
        ContextUser: {} as never,
        Provider: {} as never,
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

function itemAt(url: string): WorkingRecord {
    return new WorkingRecord(new WorkingRecordIdentity('Content Item', url, 'ITEM-1'));
}

function stubFetch(text: string): void {
    vi.spyOn(ContentFetcher.prototype, 'Fetch').mockResolvedValue({
        Content: new TextEncoder().encode(text),
        ResolvedURL: undefined,
    });
}

beforeEach(() => {
    vi.restoreAllMocks();
    blocks = { Blocks: [{ Text: 'read by the html reader', Title: 'Document title' }] };
    vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
        ContentSourceID: 'SRC-1',
        URL: 'https://x.test',
        Settings: {},
        Parameters: {},
        Configuration: {},
        DeclaredFields: [],
        Problems: [],
        IsValid: true,
    } as never);
});

describe('ExtractStage — reading', () => {
    it('reads with the content-type default reader and proposes the text', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        const outcome = await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(outcome.Status).toBe('Complete');
        expect(record.Get('Text')).toBe('read by the html reader');
    });

    it('proposes a title the reader found in the document structure', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(record.Get('Title')).toBe('Document title');
    });

    it('does not overwrite a title Discover proposed more confidently', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        record.Propose('Title', 'From the listing', 9, 'Discover.RSS');
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(record.Get('Title')).toBe('From the listing');
    });

    it('resolves file type from the URL extension when nothing was declared', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(record.Get('FileType')).toBe('html');
    });

    it('records which reader actually ran', async () => {
        stubFetch('<html>body</html>');
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(record.GetExtension<string>('Extract', 'extractorKey')).toBe('extract-html');
    });

    it('skips when the reader finds no content', async () => {
        stubFetch('<html></html>');
        blocks = { Blocks: [] };
        const record = itemAt('https://x.test/page.html');
        const outcome = await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(outcome.Status).toBe('Skipped');
    });
});

describe('ExtractStage — an artifact that expands into other items', () => {
    it('makes EVERY block a child and leaves the container intact', async () => {
        // Applying the first block to the container would lose the container and mislabel one of
        // its members as the whole thing — the failure Betty's zip reader guards against.
        stubFetch('<html>body</html>');
        blocks = { Blocks: [{ Text: 'first', Key: 'a' }, { Text: 'second', Key: 'b' }, { Text: 'third', Key: 'c' }] };
        const record = itemAt('https://x.test/bundle.html');
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
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
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(record.Get('Text')).toBe('the whole document');
        expect(record.Children).toHaveLength(0);
    });

    it('gives a split child its PARENT date, not the moment of the split', async () => {
        stubFetch('<html>body</html>');
        const authored = new Date('2020-01-01T00:00:00Z');
        blocks = { Blocks: [{ Text: 'first' }, { Text: 'second', Key: 'b' }] };
        const record = itemAt('https://x.test/page.html');
        record.Propose('Date', authored, 5, 'Discover.RSS');
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(record.Children[0].Get('Date')).toBe(authored);
    });

    it("carries a reader's routing instruction onto the child", async () => {
        stubFetch('<html>body</html>');
        blocks = { Blocks: [{ Text: 'first', Key: 'a' }, { Text: 'sheet', Key: 'b', ExtractorKeyOverride: 'extract-html' }] };
        const record = itemAt('https://x.test/page.html');
        await new ExtractStage().Run(record, contextWith({ ContentTypeExtractorKey: 'extract-html' }));
        expect(record.Children[1].GetExtension<string>('Extract', 'keyOverride')).toBe('extract-html');
    });
});

describe('ExtractStage — the plain-text fallback is sanity-checked', () => {
    it('accepts readable text when no reader handles the format', async () => {
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

    it('marks fallback text with low confidence, so a real reader later wins', async () => {
        stubFetch('Plain readable content.');
        const record = itemAt('https://x.test/file.bizarre');
        await new ExtractStage().Run(record, contextWith());
        expect(record.GetConfidence('Text')).toBeLessThan(6);
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
        vi.spyOn(ContentFetcher.prototype, 'Fetch').mockRejectedValue(new Error('HTTP 404 Not Found'));
        const record = itemAt('https://x.test/gone.html');
        await expect(new ExtractStage().Run(record, contextWith())).rejects.toThrow(/Cannot fetch/);
    });

    it('treats a network blip as transient', async () => {
        vi.spyOn(ContentFetcher.prototype, 'Fetch').mockRejectedValue(new Error('socket hang up'));
        const record = itemAt('https://x.test/page.html');
        await expect(new ExtractStage().Run(record, contextWith())).rejects.toThrow(/Fetching/);
    });

    it('does not fetch at all when already cancelled', async () => {
        const fetchSpy = vi.spyOn(ContentFetcher.prototype, 'Fetch');
        const controller = new AbortController();
        controller.abort();
        const outcome = await new ExtractStage().Run(itemAt('https://x.test/a.html'), contextWith({}, controller.signal));
        expect(outcome.Status).toBe('Retry');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
