import { describe, it, expect } from 'vitest';
import { BuildImagePdf, PdfImagePage } from '../lib/export/image-pdf-writer';

function page(jpeg: number[], overrides: Partial<PdfImagePage> = {}): PdfImagePage {
    return {
        Jpeg: new Uint8Array(jpeg), PixelWidth: 1900, PixelHeight: 2770,
        PageWidthMM: 210, PageHeightMM: 297, XMM: 10, YMM: 10, DrawWidthMM: 190, DrawHeightMM: 277,
        ...overrides,
    };
}

/** The file as latin1 text, so byte offsets and string offsets agree. */
function asText(bytes: Uint8Array): string {
    return Array.from(bytes, b => String.fromCharCode(b)).join('');
}

describe('BuildImagePdf', () => {
    const pdf = BuildImagePdf([page([0xff, 0xd8, 0x01, 0xff, 0xd9]), page([0xff, 0xd8, 0x02, 0x03, 0xff, 0xd9], { PixelHeight: 100, DrawHeightMM: 10 })]);
    const text = asText(pdf);

    it('writes a header, a catalog and a page tree with one kid per page', () => {
        expect(text.startsWith('%PDF-1.4\n')).toBe(true);
        expect(text).toContain('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>');
        expect(text).toContain('<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>');
        expect(text.endsWith('%%EOF\n')).toBe(true);
    });

    it('declares the image size in whole pixels even when given fractions', () => {
        const text = asText(BuildImagePdf([page([0xff, 0xd8, 0xff, 0xd9], { PixelWidth: 1598, PixelHeight: 2316.40625 })]));
        expect(text).toContain('/Width 1598 /Height 2316 ');
        expect(text).not.toMatch(/\/Height \d+\.\d/);
    });

    it('points every xref entry at its object, and startxref at the xref table', () => {
        const xrefAt = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
        expect(text.slice(xrefAt, xrefAt + 5)).toBe('xref\n');
        const entries = text.slice(xrefAt).match(/^(\d{10}) 00000 n $/gm) ?? [];
        expect(entries).toHaveLength(8); // catalog, pages, 3 objects for each of 2 pages
        entries.forEach((entry, index) => {
            const offset = Number(entry.slice(0, 10));
            expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
        });
    });

    it('embeds each JPEG unchanged with its size and draws it in points from the bottom left', () => {
        expect(text).toContain('/Width 1900 /Height 2770 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 5 >>\nstream\n\xff\xd8\x01\xff\xd9\nendstream');
        // 190mm x 277mm at (10mm, 297 - 10 - 277 = 10mm)
        expect(text).toContain('q 538.58 0 0 785.20 28.35 28.35 cm /Im0 Do Q');
        expect(text).toContain('/MediaBox [0 0 595.28 841.89]');
    });
});
