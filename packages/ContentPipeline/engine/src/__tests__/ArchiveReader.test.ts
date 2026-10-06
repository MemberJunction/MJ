import { describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { ReadRequest, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { ArchiveReader, ArchiveMember } from '../readers/ArchiveReader.js';
import { PlainTextReader } from '../readers/PlainTextReader.js';

/** A reader standing in for a real archive format. */
@RegisterClass(ArchiveReader, 'TestArchive')
class TestArchiveReader extends ArchiveReader {
    public Members: ArchiveMember[] = [];
    protected async Unpack(): Promise<ArchiveMember[]> {
        return this.Members;
    }
}

function request(signal?: AbortSignal): ReadRequest {
    return {
        Content: new Uint8Array(),
        FileType: 'zip',
        URL: 'https://x.test/bundle.zip',
        Parameters: {},
        Signal: signal ?? new AbortController().signal,
        ReportProgress: () => {},
    };
}

function member(path: string, text: string): ArchiveMember {
    return { Path: path, Content: new TextEncoder().encode(text) };
}

describe('ArchiveReader', () => {
    it('returns one block per member', async () => {
        const reader = new TestArchiveReader();
        reader.Members = [member('a.txt', 'alpha'), member('b.txt', 'beta')];
        const result = await reader.Read(request());
        expect(result.Blocks).toHaveLength(2);
        expect(result.Blocks.map((b) => b.Text)).toEqual(['alpha', 'beta']);
    });

    it("keys each block by the member's path, so identity survives re-extraction", async () => {
        const reader = new TestArchiveReader();
        reader.Members = [member('docs/intro.md', '# Intro')];
        const result = await reader.Read(request());
        expect(result.Blocks[0].Key).toBe('docs/intro.md');
    });

    it("names each member's own file type, so the cascade routes it correctly", async () => {
        const reader = new TestArchiveReader();
        reader.Members = [member('sheet.xlsx', 'data'), member('page.html', '<p>x</p>')];
        const result = await reader.Read(request());
        expect(result.Blocks.map((b) => b.FileType)).toEqual(['xlsx', 'html']);
    });

    it('derives a readable title from the member path', async () => {
        const reader = new TestArchiveReader();
        reader.Members = [member('deep/folder/Quarterly Report.pdf', 'x')];
        const result = await reader.Read(request());
        expect(result.Blocks[0].Title).toBe('Quarterly Report');
    });

    it('stops unpacking when the signal fires', async () => {
        const reader = new TestArchiveReader();
        reader.Members = [member('a.txt', 'a'), member('b.txt', 'b')];
        const controller = new AbortController();
        controller.abort();
        const result = await reader.Read(request(controller.signal));
        expect(result.Blocks).toHaveLength(0);
    });

    it('returns nothing rather than guessing when unpacking is not implemented', async () => {
        const result = await new ArchiveReader().Read(request());
        expect(result.Blocks).toEqual([]);
    });

    it('declares the archive formats it handles, and not others', () => {
        const reader = new ArchiveReader();
        expect(reader.Supports('zip')).toBe(true);
        expect(reader.Supports('pdf')).toBe(false);
    });
});

describe('PlainTextReader', () => {
    it('decodes bytes and marks itself a fallback', async () => {
        const result = await new PlainTextReader().Read({
            ...request(),
            Content: new TextEncoder().encode('hello'),
        });
        expect(result.Blocks[0].Text).toBe('hello');
        expect(result.IsFallback).toBe(true);
    });

    it('returns no block for empty content', async () => {
        const result = await new PlainTextReader().Read(request());
        expect(result.Blocks).toEqual([]);
    });

    it("supports everything, which is only appropriate for the fallback rung", () => {
        expect(new PlainTextReader().Supports('anything-at-all')).toBe(true);
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
        const reader = new TestArchiveReader();
        const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0x01, 0x02, 0xff, 0xfe]);
        reader.Members = [{ Path: 'report.pdf', Content: pdf }];
        const result = await reader.Read(request());
        expect(result.Blocks[0].Text).toBe('');
        expect(result.Blocks[0].Content).toEqual(pdf);
        expect(result.Blocks[0].FileType).toBe('pdf');
    });

    it('still decodes a genuinely textual member', async () => {
        const reader = new TestArchiveReader();
        reader.Members = [member('notes.txt', 'plain readable text')];
        const result = await reader.Read(request());
        expect(result.Blocks[0].Text).toBe('plain readable text');
        expect(result.Blocks[0].Content).toBeUndefined();
    });

    it('treats a member with a null byte as binary whatever its extension claims', async () => {
        const reader = new TestArchiveReader();
        reader.Members = [{ Path: 'lies.txt', Content: new Uint8Array([0x68, 0x69, 0x00, 0x68, 0x69]) }];
        const result = await reader.Read(request());
        expect(result.Blocks[0].Text).toBe('');
        expect(result.Blocks[0].Content).toBeDefined();
    });
});

