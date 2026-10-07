/**
 * @fileoverview Recognising a file type from its bytes.
 *
 * File type often is not knowable before bytes are in hand, which is why this exists at all: a URL
 * ending `.html` that serves a PDF is a real and common case, and an extension is the weakest signal
 * there is.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** One recognizable file signature. */
export interface Signature {
    /** The file type key it identifies. */
    FileType: string;
    /** Bytes that must match at {@link Offset}. */
    Magic: readonly number[];
    /** Where the magic starts. Defaults to 0. */
    Offset?: number;
    /**
     * Whether a match is strong enough to overrule a source's declared type.
     *
     * Only true where the signature identifies exactly one format. A ZIP magic number is shared by
     * `docx`, `xlsx`, `pptx`, `epub` and `jar`, so it is *recognition* without being *identification*
     * — overruling a source that said `docx` with a bare `zip` would be a downgrade, not a
     * correction.
     */
    Unambiguous: boolean;
}

/** Magic numbers, longest first so a more specific match wins. */
const SIGNATURES: readonly Signature[] = [
    { FileType: 'pdf', Magic: [0x25, 0x50, 0x44, 0x46], Unambiguous: true }, // %PDF
    { FileType: 'png', Magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], Unambiguous: true },
    { FileType: 'gif', Magic: [0x47, 0x49, 0x46, 0x38], Unambiguous: true }, // GIF8
    { FileType: 'jpg', Magic: [0xff, 0xd8, 0xff], Unambiguous: true },
    { FileType: 'bmp', Magic: [0x42, 0x4d], Unambiguous: true },
    { FileType: 'gz', Magic: [0x1f, 0x8b], Unambiguous: true },
    { FileType: 'rtf', Magic: [0x7b, 0x5c, 0x72, 0x74, 0x66], Unambiguous: true }, // {\rtf
    { FileType: 'webp', Magic: [0x57, 0x45, 0x42, 0x50], Offset: 8, Unambiguous: true },
    { FileType: 'mp4', Magic: [0x66, 0x74, 0x79, 0x70], Offset: 4, Unambiguous: true }, // ftyp
    { FileType: 'ogg', Magic: [0x4f, 0x67, 0x67, 0x53], Unambiguous: true },
    { FileType: 'flac', Magic: [0x66, 0x4c, 0x61, 0x43], Unambiguous: true },
    // Recognition without identification: every Open Packaging format is a zip underneath.
    { FileType: 'zip', Magic: [0x50, 0x4b, 0x03, 0x04], Unambiguous: false },
];

/** What the bytes say. */
export interface ByteSignatureMatch {
    /** The recognized file type. */
    FileType: string;
    /** Whether it is specific enough to overrule a source's declaration. */
    Unambiguous: boolean;
}

/**
 * Identify a file type from its leading bytes.
 *
 * @returns The match, or `null` when nothing is recognized — which is the common case for text
 *   formats, and is why an extension remains a useful last resort.
 */
export function DetectByteSignature(
    content: Uint8Array,
    configured: readonly Signature[] = [],
): ByteSignatureMatch | null {
    // Configured signatures are consulted first, so a deployment can recognise a format the built-in
    // table does not — and can correct one it gets wrong — without editing this file. The built-ins
    // remain the answer for everything else, which is what makes a fresh database recognise a PDF.
    for (const signature of [...configured, ...SIGNATURES]) {
        if (matches(content, signature)) {
            return { FileType: signature.FileType, Unambiguous: signature.Unambiguous };
        }
    }
    const text = DetectTextSignature(content);
    return text ? { FileType: text, Unambiguous: false } : null;
}

/** Whether the content carries this signature's magic at its offset. */
function matches(content: Uint8Array, signature: Signature): boolean {
    const offset = signature.Offset ?? 0;
    if (content.length < offset + signature.Magic.length) {
        return false;
    }
    return signature.Magic.every((byte, index) => content[offset + index] === byte);
}

/**
 * Recognize a few text formats from their opening characters.
 *
 * Never unambiguous: a document can begin with an XML declaration and still be any number of
 * XML-based formats, so this informs rather than overrules.
 */
function DetectTextSignature(content: Uint8Array): string | null {
    const head = new TextDecoder('utf-8', { fatal: false })
        .decode(content.subarray(0, 512))
        .replace(/^﻿/, '')
        .trimStart()
        .toLowerCase();
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
        return 'html';
    }
    if (head.startsWith('<?xml')) {
        return 'xml';
    }
    if (head.startsWith('{') || head.startsWith('[')) {
        return 'json';
    }
    if (head.startsWith('%!ps')) {
        return 'ps';
    }
    return null;
}
