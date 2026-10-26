/**
 * @fileoverview Recognising a file type from its bytes. The matcher is code; which bytes mean which
 * format is metadata (`ContentFileType.ByteSignature`), loaded by the engine's `DetectionCatalog`.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** One recognizable file signature. */
export interface Signature {
    /** The file type key it identifies. */
    FileType: string;
    /** Bytes that must match at {@link Offset}. Empty for a {@link TextPrefix} signature. */
    Magic: readonly number[];
    /** Where the magic starts. Defaults to 0. */
    Offset?: number;
    /** Opening text, matched after a BOM and leading whitespace are stripped and case is folded. */
    TextPrefix?: string;
    /** Whether a match may overrule a declared type. False for containers like zip (docx, xlsx are zips). */
    Unambiguous: boolean;
}

/** What the bytes say. */
export interface ByteSignatureMatch {
    FileType: string;
    Unambiguous: boolean;
}

/**
 * Identify a file type from its leading bytes, or null. Magic numbers are tried before text
 * prefixes, since a prefix like `{` is weak evidence.
 */
export function DetectByteSignature(content: Uint8Array, signatures: readonly Signature[]): ByteSignatureMatch | null {
    const magic = signatures.find((s) => matchesMagic(content, s));
    if (magic) {
        return { FileType: magic.FileType, Unambiguous: magic.Unambiguous };
    }
    const head = textHead(content);
    const prefix = signatures.find((s) => s.Magic.length === 0 && s.TextPrefix && head.startsWith(s.TextPrefix));
    return prefix ? { FileType: prefix.FileType, Unambiguous: prefix.Unambiguous } : null;
}

function matchesMagic(content: Uint8Array, signature: Signature): boolean {
    const offset = signature.Offset ?? 0;
    return (
        signature.Magic.length > 0 &&
        content.length >= offset + signature.Magic.length &&
        signature.Magic.every((byte, index) => content[offset + index] === byte)
    );
}

/** The opening of the content as comparable text: no BOM, no leading whitespace, lower-cased. */
function textHead(content: Uint8Array): string {
    return new TextDecoder('utf-8', { fatal: false })
        .decode(content.subarray(0, 512))
        .replace(/^﻿/, '')
        .trimStart()
        .toLowerCase();
}
