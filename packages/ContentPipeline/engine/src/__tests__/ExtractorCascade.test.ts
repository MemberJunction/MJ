import { describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseContentExtractor, ExtractResult } from '@memberjunction/content-pipeline-base';
import { SelectExtractor } from '../ExtractorCascade.js';

function extractor(key: string, types: string[]) {
    @RegisterClass(BaseContentExtractor, key)
    class R extends BaseContentExtractor {
        public readonly Key = key;
        public readonly SupportedFileTypes = types;
        public async Extract(): Promise<ExtractResult> {
            return { Blocks: [] };
        }
    }
    return R;
}

extractor('cascade-pdf', ['pdf']);
extractor('cascade-sheet', ['xlsx', 'csv']);
extractor('cascade-html', ['html']);
extractor('cascade-any', ['*']);

describe('SelectExtractor — rung precedence', () => {
    it('takes an explicit override first', () => {
        expect(SelectExtractor({ FileType: 'pdf', ExtractorKeyOverride: 'cascade-pdf', SourceExtractorKey: 'cascade-any' })?.Key).toBe('cascade-pdf');
    });

    it('takes the source before the content type', () => {
        expect(SelectExtractor({ FileType: 'html', SourceExtractorKey: 'cascade-any', ContentTypeExtractorKey: 'cascade-html' })?.Key).toBe('cascade-any');
    });

    it('takes the content type before the file type', () => {
        expect(SelectExtractor({ FileType: 'pdf', ContentTypeExtractorKey: 'cascade-any', FileTypeExtractorKey: 'cascade-pdf' })?.Key).toBe('cascade-any');
    });

    it("takes the file type's extractor from metadata when nothing else is set", () => {
        expect(SelectExtractor({ FileType: 'csv', FileTypeExtractorKey: 'cascade-sheet' })?.Key).toBe('cascade-sheet');
    });

    it('returns null when no rung applies, leaving Extract to its plain-text fallback', () => {
        expect(SelectExtractor({ FileType: 'pdf' })).toBeNull();
    });
});

describe('SelectExtractor — non-applicable rungs fall through', () => {
    it('skips an override that does not support the file type', () => {
        expect(SelectExtractor({ FileType: 'html', ExtractorKeyOverride: 'cascade-pdf', SourceExtractorKey: 'cascade-html' })?.Key).toBe('cascade-html');
    });

    it('skips a source default that does not support the file type', () => {
        expect(SelectExtractor({ FileType: 'html', SourceExtractorKey: 'cascade-pdf', ContentTypeExtractorKey: 'cascade-html' })?.Key).toBe('cascade-html');
    });

    it('skips a key nothing registered', () => {
        expect(SelectExtractor({ FileType: 'pdf', ExtractorKeyOverride: 'never-registered', SourceExtractorKey: 'cascade-pdf' })?.Key).toBe('cascade-pdf');
    });

    it('matches file type case-insensitively', () => {
        expect(SelectExtractor({ FileType: 'PDF', SourceExtractorKey: 'cascade-pdf' })).not.toBeNull();
    });
});
