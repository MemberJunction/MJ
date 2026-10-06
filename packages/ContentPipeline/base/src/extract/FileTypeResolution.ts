/**
 * @fileoverview Resolving a file type, and what to do when nothing resolves one.
 *
 * File type often is not knowable before bytes are in hand, so this is a precedence question rather
 * than a lookup.
 *
 * The confidence each kind of evidence carries is NOT here: it comes from the run's resolved scale
 * via `FileTypeEvidenceConfidenceKey`, so a deployment can configure it. A constant here would have
 * been fixed at import time and silently ignored that configuration.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** Where a resolved file type came from, most authoritative first. */
export type FileTypeEvidence =
    /** The source declared it at discovery. Treated as authoritative. */
    | 'Declared'
    /** Byte-level evidence unambiguously contradicting what was declared. */
    | 'ByteCorrection'
    /** A byte signature, where nothing was declared. */
    | 'Signature'
    /** A filename extension — the weakest, last-resort signal. */
    | 'Extension';

/** A resolved file type and why. */
export interface ResolvedFileType {
    /** The file type key, lowercased, e.g. `pdf`. Null when nothing resolved one. */
    FileType: string | null;
    /** What resolved it. Null when nothing did. */
    Evidence: FileTypeEvidence | null;
}

/** What is known about a candidate before resolution. */
export interface FileTypeInputs {
    /** What the source said at discovery, if anything. */
    Declared?: string | null;
    /** What a byte signature says, if anything matched. */
    Signature?: string | null;
    /** Whether the signature evidence is unambiguous enough to override a declaration. */
    SignatureIsUnambiguous?: boolean;
    /** The filename or URL to take an extension from. */
    FileName?: string | null;
}

/** Formats a plain-text read is a reasonable fallback for. */
const TEXT_FORMATS = new Set(['txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'yaml', 'yml']);

/** Formats that are definitively not text, and route to multi-modal handling instead. */
const NON_TEXT_FORMATS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'mp3', 'wav', 'ogg', 'flac', 'mp4', 'mov', 'avi', 'mkv', 'webm']);

/**
 * Resolve a file type from whatever is known.
 *
 * Precedence, most authoritative first:
 * 1. **Declared by the source at discovery** — authoritative, not casually overridden.
 * 2. **A byte-level correction**, but only on unambiguous evidence contradicting the declaration.
 *    Ambiguous byte evidence leaves a declaration standing, because a source that states a type is
 *    usually right and a sniffer that is unsure is usually not.
 * 3. **Byte-signature sniffing**, when nothing was declared.
 * 4. **A filename extension**, the weakest and last-resort signal.
 */
export function ResolveFileType(inputs: FileTypeInputs): ResolvedFileType {
    const declared = normalize(inputs.Declared);
    const signature = normalize(inputs.Signature);

    if (declared) {
        const contradicts = signature !== null && signature !== declared;
        if (contradicts && inputs.SignatureIsUnambiguous === true) {
            return { FileType: signature, Evidence: 'ByteCorrection' };
        }
        return { FileType: declared, Evidence: 'Declared' };
    }
    if (signature) {
        return { FileType: signature, Evidence: 'Signature' };
    }
    const extension = extensionOf(inputs.FileName);
    if (extension) {
        return { FileType: extension, Evidence: 'Extension' };
    }
    return { FileType: null, Evidence: null };
}

/** What Extract should do when a file type did not resolve to a reader. */
export type UnresolvedStrategy =
    /** A recognized non-text signature: go down the multi-modal path, reader or not. */
    | 'MultiModal'
    /** A recognized text format: use its matching reader. */
    | 'TextReader'
    /** Nothing recognized it: attempt a sanity-checked plain-text read. */
    | 'PlainTextFallback';

/**
 * The three-way fallback for a file type with no matching reader.
 *
 * A recognized non-text signature proceeds down the multi-modal path **regardless of whether a text
 * reader exists for it** — "this is an image, not a document" is Extract doing its job, not Extract
 * failing.
 */
export function ClassifyUnresolved(fileType: string | null): UnresolvedStrategy {
    if (fileType && NON_TEXT_FORMATS.has(fileType)) {
        return 'MultiModal';
    }
    if (fileType && TEXT_FORMATS.has(fileType)) {
        return 'TextReader';
    }
    return 'PlainTextFallback';
}

/**
 * Whether a plain-text fallback read produced something worth keeping.
 *
 * Checked **before** committing, so corrupted text is marked Failed rather than propagating
 * silently into tags, chunks and vectors — where it is far more expensive to notice.
 *
 * @param text The decoded text.
 * @param minimumPrintableRatio How much of it must be printable. Default 0.85.
 */
export function IsPlausibleText(text: string, minimumPrintableRatio = 0.85): boolean {
    if (text.length === 0) {
        return false;
    }
    let printable = 0;
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        // Tab, newline, carriage return, or anything from space upward that is not a C1 control.
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && !(code >= 127 && code <= 159))) {
            printable++;
        }
    }
    return printable / [...text].length >= minimumPrintableRatio;
}

/** Lowercase and trim, mapping empty to null. */
function normalize(value: string | null | undefined): string | null {
    const trimmed = value?.trim().toLowerCase();
    return trimmed ? trimmed : null;
}

/** The extension of a filename or URL, without the dot. */
function extensionOf(fileName: string | null | undefined): string | null {
    if (!fileName) {
        return null;
    }
    const withoutQuery = fileName.split(/[?#]/)[0];
    const lastSegment = withoutQuery.split('/').pop() ?? '';
    const dot = lastSegment.lastIndexOf('.');
    if (dot <= 0 || dot === lastSegment.length - 1) {
        return null;
    }
    return lastSegment.slice(dot + 1).toLowerCase();
}

/**
 * Whether a run of bytes is text at all.
 *
 * Built on {@link IsPlausibleText} rather than beside it, so there is one answer to "is this text"
 * and one threshold to tune. A null byte short-circuits it: no text encoding this handles produces
 * one, and checking it first avoids decoding a large binary only to reject it.
 *
 * @param content The bytes to judge.
 * @param minimumPrintableRatio How much of the decoded result must be printable. Default 0.85.
 */
export function LooksLikeText(content: Uint8Array, minimumPrintableRatio = 0.85): boolean {
    if (content.length === 0) {
        return false;
    }
    const sample = content.subarray(0, 4096);
    if (sample.includes(0)) {
        return false;
    }
    return IsPlausibleText(new TextDecoder('utf-8', { fatal: false }).decode(sample), minimumPrintableRatio);
}
