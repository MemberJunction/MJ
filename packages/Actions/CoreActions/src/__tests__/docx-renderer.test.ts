import { inflateRawSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_WORD_OPTIONS,
    HtmlToSections,
    NormalizeSections,
    RenderDocxFromSections,
} from '../custom/utilities/docx-renderer';

/**
 * Extract uncompressed XML text for a named entry inside a DOCX (ZIP) buffer.
 */
function readDocxEntryText(zipBuffer: Buffer, entryName: string): string | null {
    let offset = 0;
    while (offset + 30 <= zipBuffer.length) {
        const signature = zipBuffer.readUInt32LE(offset);
        if (signature !== 0x04034b50) {
            break;
        }
        const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
        const compressedSize = zipBuffer.readUInt32LE(offset + 18);
        const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
        const nameStart = offset + 30;
        const name = zipBuffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
        const dataStart = nameStart + fileNameLength + extraFieldLength;
        const dataEnd = dataStart + compressedSize;
        if (name === entryName) {
            const raw = zipBuffer.subarray(dataStart, dataEnd);
            if (compressionMethod === 0) {
                return raw.toString('utf8');
            }
            if (compressionMethod === 8) {
                return inflateRawSync(raw).toString('utf8');
            }
        }
        offset = dataEnd;
    }
    return null;
}

describe('docx-renderer', () => {
    describe('RenderDocxFromSections', () => {
        it('should define decimal numbering for ordered lists so items carry w:numPr in document.xml', async () => {
            const buffer = await RenderDocxFromSections(
                [
                    {
                        Heading: 'Action Plan',
                        Level: 1,
                        content: [
                            {
                                type: 'list',
                                Ordered: true,
                                Items: ['First step', 'Second step', 'Third step'],
                            },
                            {
                                type: 'list',
                                Ordered: false,
                                Items: ['Bullet A', 'Bullet B'],
                            },
                        ],
                    },
                ],
                DEFAULT_WORD_OPTIONS,
            );

            const documentXml = readDocxEntryText(buffer, 'word/document.xml');
            const numberingXml = readDocxEntryText(buffer, 'word/numbering.xml');

            expect(documentXml).not.toBeNull();
            expect(numberingXml).not.toBeNull();
            expect(numberingXml).toContain('w:val="decimal"');
            expect(numberingXml).toContain('w:val="%1."');
            expect(documentXml).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId');
            expect(documentXml).toContain('First step');
            expect(documentXml).toContain('Bullet A');
        });

        it('should preserve ordered list numbering when rendering normalized and HTML sections', async () => {
            const normalizedSections = NormalizeSections([
                { type: 'heading', level: 1, text: 'Steps' },
                { type: 'list', ordered: true, items: ['Gather sources', 'Draft brief'] },
            ]);
            const htmlSections = HtmlToSections('<h1>Steps</h1><ol><li>One</li><li>Two</li></ol>');

            const normalizedDocx = await RenderDocxFromSections(normalizedSections, DEFAULT_WORD_OPTIONS);
            const htmlDocx = await RenderDocxFromSections(htmlSections, DEFAULT_WORD_OPTIONS);

            expect(readDocxEntryText(normalizedDocx, 'word/numbering.xml')).toContain('w:val="decimal"');
            expect(readDocxEntryText(htmlDocx, 'word/numbering.xml')).toContain('w:val="decimal"');
        });

        it('should assign distinct w:numId instances to separate ordered lists so each restarts at 1', async () => {
            const buffer = await RenderDocxFromSections(
                [
                    {
                        Heading: 'Phase 1',
                        Level: 1,
                        content: [
                            { type: 'list', Ordered: true, Items: ['Step 1A', 'Step 1B'] },
                        ],
                    },
                    {
                        Heading: 'Phase 2',
                        Level: 1,
                        content: [
                            { type: 'list', Ordered: true, Items: ['Step 2A', 'Step 2B'] },
                        ],
                    },
                ],
                DEFAULT_WORD_OPTIONS,
            );

            const documentXml = readDocxEntryText(buffer, 'word/document.xml') ?? '';
            const numIds = Array.from(documentXml.matchAll(/<w:numId w:val="(\d+)"\/>/g), (m) => m[1]);
            expect(numIds).toHaveLength(4);
            expect(numIds[0]).toBe(numIds[1]);
            expect(numIds[2]).toBe(numIds[3]);
            expect(numIds[0]).not.toBe(numIds[2]);
        });
    });
});
