import { describe, expect, it } from 'vitest';
import {
    ClassifyUnresolved,
    IsPlausibleText,
    ResolveFileType,
} from '../extract/FileTypeResolution.js';

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
    });
});

describe('ClassifyUnresolved — the three-way fallback', () => {
    it('routes a recognized non-text format to multi-modal, extractor or not', () => {
        expect(ClassifyUnresolved('png')).toBe('MultiModal');
        expect(ClassifyUnresolved('mp4')).toBe('MultiModal');
    });

    it('routes a recognized text format to its extractor', () => {
        expect(ClassifyUnresolved('html')).toBe('TextExtractor');
    });

    it('routes anything unrecognized to the sanity-checked plain-text read', () => {
        expect(ClassifyUnresolved('bizarre')).toBe('PlainTextFallback');
        expect(ClassifyUnresolved(null)).toBe('PlainTextFallback');
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
