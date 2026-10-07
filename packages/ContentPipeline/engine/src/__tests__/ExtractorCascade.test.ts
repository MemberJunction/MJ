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
        const selected = SelectExtractor({
            FileType: 'pdf',
            ExtractorKeyOverride: 'cascade-pdf',
            SourceExtractorKey: 'cascade-any',
        });
        expect(selected).toMatchObject({ Key: 'cascade-pdf', From: 'Override' });
    });

    it('takes the highest-priority source candidate that supports the file type', () => {
        const selected = SelectExtractor({
            FileType: 'pdf',
            SourceCandidates: [
                { ExtractorKey: 'cascade-any', Priority: 1 },
                { ExtractorKey: 'cascade-pdf', Priority: 10 },
            ],
        });
        expect(selected).toMatchObject({ Key: 'cascade-pdf', From: 'SourceCandidate' });
    });

    it('falls to the source default when no candidate applies', () => {
        const selected = SelectExtractor({
            FileType: 'html',
            SourceCandidates: [{ ExtractorKey: 'cascade-pdf', Priority: 10 }],
            SourceExtractorKey: 'cascade-html',
        });
        expect(selected).toMatchObject({ Key: 'cascade-html', From: 'Source' });
    });

    it('falls to the content-type default', () => {
        const selected = SelectExtractor({ FileType: 'html', ContentTypeExtractorKey: 'cascade-html' });
        expect(selected).toMatchObject({ From: 'ContentType' });
    });

    it('falls to the built-in last rung', () => {
        const selected = SelectExtractor({ FileType: 'whatever', FallbackExtractorKey: 'cascade-any' });
        expect(selected).toMatchObject({ From: 'Fallback' });
    });

    it('returns null when nothing applies anywhere', () => {
        expect(SelectExtractor({ FileType: 'pdf' })).toBeNull();
    });
});

describe('SelectExtractor — non-applicable candidates fall through', () => {
    it('skips an OVERRIDE that does not support the file type', () => {
        // The key behaviour: a rung that cannot handle this content is not applicable, and falls
        // through exactly as an unset rung does — rather than being selected and then failing.
        const selected = SelectExtractor({
            FileType: 'html',
            ExtractorKeyOverride: 'cascade-pdf',
            SourceExtractorKey: 'cascade-html',
        });
        expect(selected).toMatchObject({ Key: 'cascade-html', From: 'Source' });
    });

    it('skips a higher-priority candidate that does not support the file type', () => {
        // A source holding both PDFs and spreadsheets escalates its PDFs without that extractor
        // having to handle anything else.
        const selected = SelectExtractor({
            FileType: 'xlsx',
            SourceCandidates: [
                { ExtractorKey: 'cascade-pdf', Priority: 100 },
                { ExtractorKey: 'cascade-sheet', Priority: 1 },
            ],
        });
        expect(selected).toMatchObject({ Key: 'cascade-sheet', From: 'SourceCandidate' });
    });

    it('skips a source default that does not support the file type', () => {
        const selected = SelectExtractor({
            FileType: 'html',
            SourceExtractorKey: 'cascade-pdf',
            ContentTypeExtractorKey: 'cascade-html',
        });
        expect(selected).toMatchObject({ From: 'ContentType' });
    });

    it('skips a key nothing registered', () => {
        const selected = SelectExtractor({
            FileType: 'pdf',
            ExtractorKeyOverride: 'never-registered',
            SourceExtractorKey: 'cascade-pdf',
        });
        expect(selected).toMatchObject({ From: 'Source' });
    });

    it('matches file type case-insensitively', () => {
        expect(SelectExtractor({ FileType: 'PDF', SourceExtractorKey: 'cascade-pdf' })).not.toBeNull();
    });
});
