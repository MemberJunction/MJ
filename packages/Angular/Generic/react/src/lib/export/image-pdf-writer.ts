/**
 * @fileoverview A minimal PDF writer for pages that are each one JPEG image.
 *
 * Whole-component export only needs "one picture per page", which PDF expresses directly: a JPEG
 * is embedded as-is (DCTDecode) and drawn by a one-line content stream. Writing it here keeps the
 * export free of a PDF library, whose lazy imports also do not resolve through Angular's dev-server
 * prebundling in pnpm workspaces.
 * @module @memberjunction/ng-react
 */

/** One page: a JPEG drawn at a position and size on a page, all in millimetres from the top left. */
export interface PdfImagePage {
    /** The JPEG file bytes. */
    Jpeg: Uint8Array;
    /** The JPEG's pixel size; written as whole numbers (a fractional size makes Apple's and Edge's viewers draw nothing). */
    PixelWidth: number;
    PixelHeight: number;
    PageWidthMM: number;
    PageHeightMM: number;
    XMM: number;
    YMM: number;
    DrawWidthMM: number;
    DrawHeightMM: number;
}

const POINTS_PER_MM = 72 / 25.4;

/** Collects the file as byte chunks and tracks the offset of every object for the xref table. */
class PdfByteWriter {
    private readonly chunks: Uint8Array[] = [];
    private readonly encoder = new TextEncoder();
    private length = 0;
    readonly ObjectOffsets: number[] = [];

    get Length(): number {
        return this.length;
    }

    Text(text: string): void {
        this.Bytes(this.encoder.encode(text));
    }

    Bytes(bytes: Uint8Array): void {
        this.chunks.push(bytes);
        this.length += bytes.length;
    }

    /** Writes `n 0 obj … endobj`; objects must be written in number order starting at 1. */
    Object(body: string): void {
        this.ObjectOffsets.push(this.length);
        this.Text(`${this.ObjectOffsets.length} 0 obj\n${body}\nendobj\n`);
    }

    /** Writes an object whose body ends in a binary stream. */
    StreamObject(dictionary: string, stream: Uint8Array): void {
        this.ObjectOffsets.push(this.length);
        this.Text(`${this.ObjectOffsets.length} 0 obj\n${dictionary}\nstream\n`);
        this.Bytes(stream);
        this.Text('\nendstream\nendobj\n');
    }

    Join(): Uint8Array<ArrayBuffer> {
        const result = new Uint8Array(this.length);
        let offset = 0;
        for (const chunk of this.chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }
}

function points(mm: number): string {
    return (mm * POINTS_PER_MM).toFixed(2);
}

/** The page's three objects: page, content stream (draws the image), image. */
function writePage(writer: PdfByteWriter, page: PdfImagePage, pageObject: number): void {
    const content = new TextEncoder().encode(
        `q ${points(page.DrawWidthMM)} 0 0 ${points(page.DrawHeightMM)} ${points(page.XMM)} ` +
        `${points(page.PageHeightMM - page.YMM - page.DrawHeightMM)} cm /Im0 Do Q`);
    writer.Object(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${points(page.PageWidthMM)} ${points(page.PageHeightMM)}] ` +
        `/Resources << /XObject << /Im0 ${pageObject + 2} 0 R >> >> /Contents ${pageObject + 1} 0 R >>`);
    writer.StreamObject(`<< /Length ${content.length} >>`, content);
    writer.StreamObject(
        `<< /Type /XObject /Subtype /Image /Width ${Math.round(page.PixelWidth)} /Height ${Math.round(page.PixelHeight)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.Jpeg.length} >>`, page.Jpeg);
}

function writeXrefAndTrailer(writer: PdfByteWriter): void {
    const xrefOffset = writer.Length;
    const entries = writer.ObjectOffsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    writer.Text(`xref\n0 ${writer.ObjectOffsets.length + 1}\n0000000000 65535 f \n${entries}`);
    writer.Text(`trailer\n<< /Size ${writer.ObjectOffsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
}

/** Builds a PDF with one JPEG per page. Object 1 is the catalog, 2 the page tree, then 3 per page. */
export function BuildImagePdf(pages: PdfImagePage[]): Uint8Array<ArrayBuffer> {
    const writer = new PdfByteWriter();
    writer.Text('%PDF-1.4\n');
    writer.Bytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment
    const pageObjects = pages.map((_, index) => 3 + index * 3);
    writer.Object('<< /Type /Catalog /Pages 2 0 R >>');
    writer.Object(`<< /Type /Pages /Kids [${pageObjects.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);
    pages.forEach((page, index) => writePage(writer, page, pageObjects[index]));
    writeXrefAndTrailer(writer);
    return writer.Join();
}
