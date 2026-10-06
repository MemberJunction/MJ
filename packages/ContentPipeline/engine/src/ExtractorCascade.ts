/**
 * @fileoverview Selecting a content extractor for resolved bytes.
 *
 * Selection is by what the content **is**. A source type gets no vote: how a source is reached has
 * nothing to do with how its content should be read, and the same source routinely holds several
 * formats.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseContentExtractor } from '@memberjunction/content-pipeline-base';

/** One candidate extractor a source nominates, with its rank. */
export interface SourceExtractorCandidate {
    /** The extractor's registration key. */
    ExtractorKey: string;
    /** Higher wins. Unique per source by convention. */
    Priority: number;
}

/** What the cascade has to work with. */
export interface ExtractorCascadeInputs {
    /** The resolved file type. A candidate not supporting it is not applicable. */
    FileType: string;
    /** An override stamped on the record — how a splitting extractor routes its own children. */
    ExtractorKeyOverride?: string | null;
    /** Candidate extractors from `ContentSource.Configuration.Extractors`, in any order. */
    SourceCandidates?: readonly SourceExtractorCandidate[];
    /** `ContentSource.ExtractorKey` — one sensible default for this source. */
    SourceExtractorKey?: string | null;
    /** `ContentType.ExtractorKey` — one sensible default for this kind of content generally. */
    ContentTypeExtractorKey?: string | null;
    /** The built-in last rung. */
    FallbackExtractorKey?: string | null;
}

/** Which rung of the cascade produced the extractor. */
export type ExtractorSource = 'Override' | 'SourceCandidate' | 'Source' | 'ContentType' | 'Fallback';

/** The selected extractor and where it came from. */
export interface SelectedExtractor {
    Extractor: BaseContentExtractor;
    Key: string;
    From: ExtractorSource;
}

/**
 * Select a extractor, most specific rung first.
 *
 * **At every rung, a candidate that does not declare support for the resolved file type is treated
 * as not applicable and falls through exactly as an unset rung does.** That is what lets a source
 * mixing formats — object storage holding both PDFs and spreadsheets — escalate its PDFs to a
 * specific extractor without that extractor having to handle anything else, and without a
 * source-by-file-type mapping table.
 *
 * @returns The selected extractor, or null when no rung produced an applicable one.
 */
export function SelectReader(inputs: ExtractorCascadeInputs): SelectedExtractor | null {
    const fileType = inputs.FileType.toLowerCase();

    const override = applicable(inputs.ExtractorKeyOverride, fileType);
    if (override) {
        return { ...override, From: 'Override' };
    }

    const ranked = [...(inputs.SourceCandidates ?? [])].sort((a, b) => b.Priority - a.Priority);
    for (const candidate of ranked) {
        const resolved = applicable(candidate.ExtractorKey, fileType);
        if (resolved) {
            return { ...resolved, From: 'SourceCandidate' };
        }
    }

    const source = applicable(inputs.SourceExtractorKey, fileType);
    if (source) {
        return { ...source, From: 'Source' };
    }

    const contentType = applicable(inputs.ContentTypeExtractorKey, fileType);
    if (contentType) {
        return { ...contentType, From: 'ContentType' };
    }

    const fallback = applicable(inputs.FallbackExtractorKey, fileType);
    return fallback ? { ...fallback, From: 'Fallback' } : null;
}

/** Resolve a key and keep it only if it supports this file type. */
function applicable(key: string | null | undefined, fileType: string): { Extractor: BaseContentExtractor; Key: string } | null {
    if (!key) {
        return null;
    }
    const extractor = BaseContentExtractor.Resolve(key);
    if (!extractor || !extractor.Supports(fileType)) {
        return null;
    }
    return { Extractor: extractor, Key: key };
}
