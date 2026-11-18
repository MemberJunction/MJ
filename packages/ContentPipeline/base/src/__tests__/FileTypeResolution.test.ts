import { describe, expect, it } from 'vitest';
import { IsPlausibleText, ResolveFileType } from '../extract/FileTypeResolution.js';

describe('ResolveFileType — precedence', () => {
    it('treats a source declaration as authoritative', () => {
        expect(ResolveFileType({ Declared: 'PDF', Signature: null })).toEqual({
            FileType: 'pdf',
            Evidence: 'Declared',
        });
    });

    it('does NOT override a declaration on ambiguous byte evidence', () => {
        // A source that states a type is usually right; a sniffer that is unsure usually is not.
        const resolved = ResolveFileType({ Declared: 'docx', Signature: 'zip', SignatureIsUnambiguous: false });
        expect(resolved).toEqual({ FileType: 'docx', Evidence: 'Declared' });
    });

    it('DOES override a declaration on unambiguous byte evidence', () => {
        const resolved = ResolveFileType({ Declared: 'csv', Signature: 'pdf', SignatureIsUnambiguous: true });
        expect(resolved).toEqual({ FileType: 'pdf', Evidence: 'ByteCorrection' });
    });

    it('keeps the declaration when the signature agrees with it', () => {
        const resolved = ResolveFileType({ Declared: 'pdf', Signature: 'pdf', SignatureIsUnambiguous: true });
        expect(resolved.Evidence).toBe('Declared');
    });

    it('sniffs when nothing was declared', () => {
        expect(ResolveFileType({ Signature: 'png' })).toEqual({ FileType: 'png', Evidence: 'Signature' });
    });

    it('falls back to a filename extension as the weakest signal', () => {
        expect(ResolveFileType({ FileName: 'report.XLSX' })).toEqual({ FileType: 'xlsx', Evidence: 'Extension' });
    });

    it('prefers a signature over an extension', () => {
        const resolved = ResolveFileType({ Signature: 'pdf', FileName: 'mislabelled.txt' });
        expect(resolved).toEqual({ FileType: 'pdf', Evidence: 'Signature' });
    });

    it('lets a named extension beat an AMBIGUOUS signature — every .xlsx is a zip underneath', () => {
        expect(ResolveFileType({ Signature: 'zip', SignatureIsUnambiguous: false, FileName: 'budget.xlsx' })).toEqual({
            FileType: 'xlsx',
            Evidence: 'Extension',
        });
        // With no extension to say otherwise, the container is still recognised.
        expect(ResolveFileType({ Signature: 'zip', SignatureIsUnambiguous: false, FileName: 'upload' }).FileType).toBe('zip');
    });

    it('takes the extension from a URL, ignoring query and fragment', () => {
        expect(ResolveFileType({ FileName: 'https://x.test/a/b/doc.pdf?v=2#page' }).FileType).toBe('pdf');
    });

    it('resolves nothing when there is nothing to go on', () => {
        expect(ResolveFileType({ FileName: 'https://x.test/no-extension' })).toEqual({
            FileType: null,
            Evidence: null,
        });
    });

    it('ignores a dotfile with no real extension', () => {
        expect(ResolveFileType({ FileName: '.gitignore' }).FileType).toBeNull();
        expect(ResolveFileType({ FileName: 'C:\\dir\\.html' }).FileType).toBeNull();
        expect(ResolveFileType({ FileName: 'C:\\docs\\report.pdf' }).FileType).toBe('pdf');
    });
});

describe('IsPlausibleText — the fallback sanity check', () => {
    it('accepts ordinary prose', () => {
        expect(IsPlausibleText('The quick brown fox.\nSecond line.\tTabbed.')).toBe(true);
    });

    it('rejects binary that decoded into mostly control characters', () => {
        expect(IsPlausibleText('\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007ab')).toBe(false);
    });

    it('rejects empty text', () => {
        expect(IsPlausibleText('')).toBe(false);
    });

    it('accepts text with a little noise, below the threshold', () => {
        expect(IsPlausibleText('Mostly fine text here\u0000')).toBe(true);
    });

    it('honours a stricter threshold', () => {
        expect(IsPlausibleText('Mostly fine text here\u0000', 1)).toBe(false);
    });

    it('counts accented and non-Latin characters as printable', () => {
        expect(IsPlausibleText('café — naïve — 日本語')).toBe(true);
    });
});

describe("the source's default file type", () => {
    it('loses to the item\'s own extension — a source set to "HTML" holds the odd .xlsx', () => {
        expect(ResolveFileType({ SourceDefault: 'html', FileName: 'https://x.test/q3.xlsx' })).toEqual({
            FileType: 'xlsx',
            Evidence: 'Extension',
        });
    });

    it('loses to a byte signature', () => {
        expect(ResolveFileType({ SourceDefault: 'html', Signature: 'pdf' }).FileType).toBe('pdf');
    });

    it('answers only when nothing about the item itself said anything', () => {
        expect(ResolveFileType({ SourceDefault: 'HTML', FileName: 'https://x.test/page' })).toEqual({
            FileType: 'html',
            Evidence: 'SourceDefault',
        });
    });
});
