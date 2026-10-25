/**
 * @fileoverview Resolving a file type from whatever is known, and checking a plain-text read.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** Where a resolved file type came from, most authoritative first. */
export type FileTypeEvidence = 'Declared' | 'ByteCorrection' | 'Signature' | 'Extension' | 'SourceDefault';

/** A resolved file type and why. */
export interface ResolvedFileType {
    /** The file type key, lowercased, e.g. `pdf`. Null when nothing resolved one. */
    FileType: string | null;
    Evidence: FileTypeEvidence | null;
}

/** What is known about an item before resolution. */
export interface FileTypeInputs {
    /** What something said about this item specifically. */
    Declared?: string | null;
    /** What a byte signature says. */
    Signature?: string | null;
    /** Whether the signature may overrule a declaration. */
    SignatureIsUnambiguous?: boolean;
    /** The filename or URL to take an extension from. */
    FileName?: string | null;
    /** The source's default — answers only when nothing about the item said anything. */
    SourceDefault?: string | null;
}

/**
 * Resolve a file type. Precedence: a declaration (unless unambiguous bytes contradict it), then an
 * unambiguous signature, then the extension (which beats an ambiguous signature — every .xlsx is a
 * zip), then the source's default.
 */
export function ResolveFileType(inputs: FileTypeInputs): ResolvedFileType {
    const declared = normalize(inputs.Declared);
    const signature = normalize(inputs.Signature);
    if (declared) {
        const corrected = signature !== null && signature !== declared && inputs.SignatureIsUnambiguous === true;
        return corrected ? { FileType: signature, Evidence: 'ByteCorrection' } : { FileType: declared, Evidence: 'Declared' };
    }
    const extension = normalize(extensionOf(inputs.FileName?.split(/[?#]/)[0] ?? ''));
    if (signature && (inputs.SignatureIsUnambiguous !== false || !extension)) {
        return { FileType: signature, Evidence: 'Signature' };
    }
    if (extension) {
        return { FileType: extension, Evidence: 'Extension' };
    }
    const sourceDefault = normalize(inputs.SourceDefault);
    return sourceDefault ? { FileType: sourceDefault, Evidence: 'SourceDefault' } : { FileType: null, Evidence: null };
}

/** Maximum UTF-16 code units sampled by {@link IsPlausibleText} so large unknown files stay O(1) in memory. */
const PLAUSIBLE_TEXT_SAMPLE_LIMIT = 65536;

/** Whether a plain-text fallback read is real text, so mojibake never reaches tags, chunks or vectors. */
export function IsPlausibleText(text: string, minimumPrintableRatio = 0.85): boolean {
    if (text.length === 0) {
        return false;
    }
    const sample = text.length > PLAUSIBLE_TEXT_SAMPLE_LIMIT ? text.slice(0, PLAUSIBLE_TEXT_SAMPLE_LIMIT) : text;
    let printable = 0;
    let total = 0;
    for (const char of sample) {
        total++;
        const code = char.codePointAt(0) ?? 0;
        // Tab, newline, carriage return, or anything from space upward that is not a C1 control.
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && !(code >= 127 && code <= 159))) {
            printable++;
        }
    }
    return total > 0 && printable / total >= minimumPrintableRatio;
}

/** Extract the file extension (without the leading dot), matching `path.extname(p).slice(1)` without a Node dependency. */
function extensionOf(filePath: string): string {
    const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    const base = lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(dot + 1) : '';
}

/** Lowercase and trim, mapping empty to null. */
function normalize(value: string | null | undefined): string | null {
    const trimmed = value?.trim().toLowerCase();
    return trimmed ? trimmed : null;
}
