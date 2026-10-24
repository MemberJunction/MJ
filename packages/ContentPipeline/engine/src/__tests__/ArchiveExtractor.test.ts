import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { RegisterClass } from '@memberjunction/global';
import { ExtractRequest, ResolveTuning, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { ArchiveExtractor, ArchiveMember } from '../extractors/ArchiveExtractor.js';
import { PlainTextExtractor } from '../extractors/PlainTextExtractor.js';
import { HtmlExtractor } from '../extractors/HtmlExtractor.js';

/** A extractor standing in for a real archive format. */
@RegisterClass(ArchiveExtractor, 'TestArchive')
class TestArchiveExtractor extends ArchiveExtractor {
    public Members: ArchiveMember[] = [];
    protected async Unpack(): Promise<ArchiveMember[]> {
        return this.Members;
    }
}

function request(signal?: AbortSignal): ExtractRequest {
    return {
        Content: new Uint8Array(),
        FileType: 'zip',
        URL: 'https://x.test/bundle.zip',
        Parameters: {},
        Signal: signal ?? new AbortController().signal,
        ReportProgress: () => {},
    };
}

/** Limits as the shipped Extract Record Process configures them. */
const TUNING = ResolveTuning({ Tuning: { MaxArchiveMembers: 10000, MaxArchiveBytes: 512 * 1024 * 1024 } });

function member(path: string, text: string): ArchiveMember {
    return { Path: path, Content: new TextEncoder().encode(text) };
}

describe('ArchiveExtractor', () => {
    it('returns one block per member', async () => {
        const extractor = new TestArchiveExtractor();
        extractor.Members = [member('a.txt', 'alpha'), member('b.txt', 'beta')];
        const result = await extractor.Extract(request());
        expect(result.Blocks).toHaveLength(2);
        // Bytes, never decoded here: every member goes through Extract's own cascade.
        expect(result.Blocks.map((b) => new TextDecoder().decode(b.Content))).toEqual(['alpha', 'beta']);
        expect(result.Blocks.every((b) => b.Text === '')).toBe(true);
    });

    it("keys each block by the member's path, so identity survives re-extraction", async () => {
        const extractor = new TestArchiveExtractor();
        extractor.Members = [member('docs/intro.md', '# Intro')];
        const result = await extractor.Extract(request());
        expect(result.Blocks[0].Key).toBe('docs/intro.md');
    });

    it("names each member's own file type, so the cascade routes it correctly", async () => {
        const extractor = new TestArchiveExtractor();
        extractor.Members = [member('sheet.xlsx', 'data'), member('page.html', '<p>x</p>')];
        const result = await extractor.Extract(request());
        expect(result.Blocks.map((b) => b.FileType)).toEqual(['xlsx', 'html']);
    });

    it('derives a readable title from the member path', async () => {
        const extractor = new TestArchiveExtractor();
        extractor.Members = [member('deep/folder/Quarterly Report.pdf', 'x')];
        const result = await extractor.Extract(request());
        expect(result.Blocks[0].Title).toBe('Quarterly Report');
    });

    it('stops unpacking when the signal fires', async () => {
        const extractor = new TestArchiveExtractor();
        extractor.Members = [member('a.txt', 'a'), member('b.txt', 'b')];
        const controller = new AbortController();
        controller.abort();
        const result = await extractor.Extract(request(controller.signal));
        expect(result.Blocks).toHaveLength(0);
    });

    it('FAILS on bytes that are not an archive, rather than reporting an empty one as read', async () => {
        await expect(
            new ArchiveExtractor().Extract({ ...request(), Tuning: TUNING, Content: new TextEncoder().encode('not an archive') }),
        ).rejects.toThrow();
    });

    it('refuses a file type it does not unpack', async () => {
        await expect(new ArchiveExtractor().Extract({ ...request(), Tuning: TUNING, FileType: 'tar' })).rejects.toThrow(/not an archive format/);
    });

    it('declares the archive formats it handles, and not others', () => {
        const extractor = new ArchiveExtractor();
        expect(extractor.Supports('zip')).toBe(true);
        expect(extractor.Supports('pdf')).toBe(false);
    });
});

describe('PlainTextExtractor', () => {
    it('decodes bytes and marks itself a fallback', async () => {
        const result = await new PlainTextExtractor().Extract({
            ...request(),
            Content: new TextEncoder().encode('hello'),
        });
        expect(result.Blocks[0].Text).toBe('hello');
        expect(result.IsFallback).toBe(true);
    });

    it('returns no block for empty content', async () => {
        const result = await new PlainTextExtractor().Extract(request());
        expect(result.Blocks).toEqual([]);
    });

    it("supports everything, which is only appropriate for the fallback rung", () => {
        expect(new PlainTextExtractor().Supports('anything-at-all')).toBe(true);
    });
});

describe('the split pattern end to end', () => {
    it('produces children whose URLs are derived from the parent plus the member path', () => {
        // Mirrors what ExtractStage does with blocks beyond the first.
        const parent = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/bundle.zip', 'P1'));
        const childURL = `${parent.Identity.EphemeralID}#docs/intro.md`;
        expect(childURL).toBe('https://x.test/bundle.zip#docs/intro.md');
    });
});

describe('members that are not text', () => {
    it('does NOT decode a PDF member as UTF-8', async () => {
        // The defect: every member was decoded as UTF-8, so a PDF inside a zip became mojibake that
        // looked like a successful extraction and was then chunked, embedded and served.
        const extractor = new TestArchiveExtractor();
        const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0x01, 0x02, 0xff, 0xfe]);
        extractor.Members = [{ Path: 'report.pdf', Content: pdf }];
        const result = await extractor.Extract(request());
        expect(result.Blocks[0].Text).toBe('');
        expect(result.Blocks[0].Content).toEqual(pdf);
        expect(result.Blocks[0].FileType).toBe('pdf');
    });

    it('hands back even a textual member as bytes, so HTML is read by the HTML extractor', async () => {
        // Decoding text members here landed HTML as raw markup.
        const extractor = new TestArchiveExtractor();
        extractor.Members = [member('page.html', '<p>hello</p>')];
        const result = await extractor.Extract(request());
        expect(result.Blocks[0].Text).toBe('');
        expect(new TextDecoder().decode(result.Blocks[0].Content)).toBe('<p>hello</p>');
    });

    it('treats a member with a null byte as binary whatever its extension claims', async () => {
        const extractor = new TestArchiveExtractor();
        extractor.Members = [{ Path: 'lies.txt', Content: new Uint8Array([0x68, 0x69, 0x00, 0x68, 0x69]) }];
        const result = await extractor.Extract(request());
        expect(result.Blocks[0].Text).toBe('');
        expect(result.Blocks[0].Content).toBeDefined();
    });
});


describe('HtmlExtractor', () => {
    const html = (body: string) => ({
        ...request(),
        Content: new TextEncoder().encode(body),
        FileType: 'html',
    });

    it('extracts readable text through MJ’s TextExtractor rather than a second implementation', async () => {
        const result = await new HtmlExtractor().Extract(
            html('<html><head><title>Quarterly</title><style>p{color:red}</style></head><body><p>Revenue rose.</p><script>x()</script></body></html>'),
        );
        expect(result.Blocks).toHaveLength(1);
        expect(result.Blocks[0].Text).toContain('Revenue rose.');
        expect(result.Blocks[0].Text).not.toContain('color:red');
        expect(result.Blocks[0].Text).not.toContain('x()');
    });

    it('takes the document title when it has one', async () => {
        const result = await new HtmlExtractor().Extract(html('<html><head><title>Quarterly</title></head><body><p>Body.</p></body></html>'));
        expect(result.Blocks[0].Title).toBe('Quarterly');
    });

    it('reports no blocks for a document that yields no text, rather than an empty one', async () => {
        const result = await new HtmlExtractor().Extract(html('<html><body><script>only()</script></body></html>'));
        expect(result.Blocks).toHaveLength(0);
    });
});

describe('real archive formats', () => {
    const extract = (content: Uint8Array, parameters: Record<string, string> = {}, url = 'https://x.test/bundle', fileType = 'zip') =>
        new ArchiveExtractor().Extract({ ...request(), Tuning: TUNING, Content: content, Parameters: parameters, URL: url, FileType: fileType });

    it('unzips every file and skips directories', async () => {
        const zip = new JSZip();
        zip.file('docs/a.txt', 'alpha');
        zip.file('b.html', '<p>beta</p>');
        zip.folder('empty');
        const result = await extract(await zip.generateAsync({ type: 'uint8array' }));
        expect(result.Blocks.map((b) => b.Key).sort()).toEqual(['b.html', 'docs/a.txt']);
        expect(result.Blocks.find((b) => b.Key === 'b.html')?.FileType).toBe('html');
    });

    it('treats a plain gzip as the one file it compresses, named from the archive', async () => {
        const result = await extract(new Uint8Array(gzipSync('a,b\n1,2')), {}, 'https://x.test/report.csv.gz', 'gz');
        expect(result.Blocks).toHaveLength(1);
        expect(result.Blocks[0].Key).toBe('report.csv');
        expect(result.Blocks[0].FileType).toBe('csv');
    });

    it('REFUSES an archive when no limits are configured anywhere, rather than unpacking it unbounded', async () => {
        const zip = new JSZip();
        zip.file('a.txt', 'x');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        await expect(new ArchiveExtractor().Extract({ ...request(), Content: bytes })).rejects.toThrow(/no archive limits/);
    });

    it("takes the source's own limit over the run's", async () => {
        const zip = new JSZip();
        for (let i = 0; i < 5; i++) {
            zip.file(`f${i}.txt`, 'x');
        }
        // The run allows 10,000; the source allows 3.
        await expect(extract(await zip.generateAsync({ type: 'uint8array' }), { MaxArchiveMembers: '3' })).rejects.toThrow(/over the limit of 3/);
    });

    it('refuses an archive with more members than allowed', async () => {
        const zip = new JSZip();
        for (let i = 0; i < 5; i++) {
            zip.file(`f${i}.txt`, 'x');
        }
        await expect(extract(await zip.generateAsync({ type: 'uint8array' }), { MaxArchiveMembers: '3' })).rejects.toThrow(
            /over the limit/,
        );
    });

    it('refuses an archive that expands past the size limit', async () => {
        const zip = new JSZip();
        zip.file('big.txt', 'x'.repeat(5000));
        await expect(
            extract(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), { MaxArchiveBytes: '1000' }),
        ).rejects.toThrow(/limit/);
    });

    it('shares ArchiveBudget across nested archives so inner archives cannot bypass MaxArchiveMembers or MaxArchiveBytes', async () => {
        const zipA = new JSZip();
        zipA.file('one.txt', 'alpha');
        zipA.file('two.txt', 'beta');
        const zipB = new JSZip();
        zipB.file('three.txt', 'gamma');
        zipB.file('four.txt', 'delta');

        const budget = { RemainingMembers: 3, RemainingBytes: 1000, CurrentDepth: 1, MaxDepth: 3 };
        await new ArchiveExtractor().Extract({
            ...request(),
            Tuning: TUNING,
            ArchiveBudget: budget,
            Content: await zipA.generateAsync({ type: 'uint8array' }),
        });
        expect(budget.RemainingMembers).toBe(1);

        await expect(
            new ArchiveExtractor().Extract({
                ...request(),
                Tuning: TUNING,
                ArchiveBudget: budget,
                Content: await zipB.generateAsync({ type: 'uint8array' }),
            }),
        ).rejects.toThrow(/over the limit of 1/);
    });

    it('enforces MaxArchiveDepth when CurrentDepth exceeds MaxDepth', async () => {
        const zip = new JSZip();
        zip.file('deep.txt', 'hello');
        const budget = { RemainingMembers: 100, RemainingBytes: 10000, CurrentDepth: 4, MaxDepth: 3 };
        await expect(
            new ArchiveExtractor().Extract({
                ...request(),
                Tuning: TUNING,
                ArchiveBudget: budget,
                Content: await zip.generateAsync({ type: 'uint8array' }),
            }),
        ).rejects.toThrow(/Options\.Tuning\.MaxArchiveDepth/);
    });
});
