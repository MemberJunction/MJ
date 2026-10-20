/**
 * @fileoverview Selecting a content extractor: override → source → content type → file type. When
 * no rung applies, Extract does its plain-text fallback.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseContentExtractor } from '@memberjunction/content-pipeline-base';

/** The cascade's rungs, most specific first. */
export interface ExtractorCascadeInputs {
    /** The resolved file type. An extractor that does not support it is skipped. */
    FileType: string;
    /** `ContentItem.ExtractorKeyOverride`, or one a splitting extractor stamped on its child. */
    ExtractorKeyOverride?: string | null;
    /** The source's `Configuration.ExtractorKey`. */
    SourceExtractorKey?: string | null;
    /** `ContentType.ExtractorKey`. */
    ContentTypeExtractorKey?: string | null;
    /** `ContentFileType.ExtractorKey`. */
    FileTypeExtractorKey?: string | null;
}

/** The selected extractor and its key. */
export interface SelectedExtractor {
    Extractor: BaseContentExtractor;
    Key: string;
}

/**
 * The first rung naming a registered extractor that supports the file type. A rung that cannot
 * read this format falls through as if unset, so a source can name a PDF extractor without it having
 * to handle the spreadsheets beside the PDFs.
 */
export function SelectExtractor(inputs: ExtractorCascadeInputs): SelectedExtractor | null {
    const rungs = [inputs.ExtractorKeyOverride, inputs.SourceExtractorKey, inputs.ContentTypeExtractorKey, inputs.FileTypeExtractorKey];
    for (const key of rungs) {
        const extractor = key ? BaseContentExtractor.Resolve(key) : null;
        if (key && extractor?.Supports(inputs.FileType)) {
            return { Extractor: extractor, Key: key };
        }
    }
    return null;
}
