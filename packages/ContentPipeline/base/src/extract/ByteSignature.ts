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
    /**
     * Bytes that must match at {@link Offset}.
     *
     * Empty for a signature that matches on {@link TextPrefix} instead.
     */
    Magic: readonly number[];
    /** Where the magic starts. Defaults to 0. */
    Offset?: number;
    /**
     * Opening characters a text format begins with, matched against the decoded head of the content
     * after a byte-order mark and leading whitespace are stripped and the case is folded.
     *
     * A separate field rather than more magic bytes because that normalization is the whole point: a
     * document is still HTML when it opens with a BOM, a newline and `<HTML`, and no fixed byte
     * comparison recognizes all three. The matcher stays generic; which prefix means HTML is data.
     */
    TextPrefix?: string;
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

/**
 * The built-in signature table.
 *
 * Metadata is consulted first — `ContentFileType.ByteSignature` — so a deployment adds a format or
 * corrects one of these by writing a row. Nothing is seeded: this table is the floor, what makes a
 * database recognize a PDF before anyone has configured anything, and what keeps this package
 * usable — and testable — with no database at all.
 *
 * Ordered longest magic first, so a signature that is a prefix of another never shadows it.
 */
const SIGNATURES: readonly Signature[] = [
    { FileType: 'png', Magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], Unambiguous: true },
    { FileType: 'rtf', Magic: [0x7b, 0x5c, 0x72, 0x74, 0x66], Unambiguous: true }, // {\rtf
    { FileType: 'pdf', Magic: [0x25, 0x50, 0x44, 0x46], Unambiguous: true }, // %PDF
    { FileType: 'gif', Magic: [0x47, 0x49, 0x46, 0x38], Unambiguous: true }, // GIF8
    { FileType: 'webp', Magic: [0x57, 0x45, 0x42, 0x50], Offset: 8, Unambiguous: true },
    { FileType: 'mp4', Magic: [0x66, 0x74, 0x79, 0x70], Offset: 4, Unambiguous: true }, // ftyp
    { FileType: 'ogg', Magic: [0x4f, 0x67, 0x67, 0x53], Unambiguous: true },
    { FileType: 'flac', Magic: [0x66, 0x4c, 0x61, 0x43], Unambiguous: true },
    // Recognition without identification: every Open Packaging format is a zip underneath.
    { FileType: 'zip', Magic: [0x50, 0x4b, 0x03, 0x04], Unambiguous: false },
    { FileType: 'jpg', Magic: [0xff, 0xd8, 0xff], Unambiguous: true },
    { FileType: 'bmp', Magic: [0x42, 0x4d], Unambiguous: true },
    { FileType: 'gz', Magic: [0x1f, 0x8b], Unambiguous: true },
];

/**
 * The built-in text-prefix table, the floor beneath any configured prefixes.
 *
 * Never unambiguous: a document can begin with an XML declaration and still be any number of
 * XML-based formats, so these inform rather than overrule.
 */
const TEXT_SIGNATURES: readonly Signature[] = [
    { FileType: 'html', Magic: [], TextPrefix: '<!doctype html', Unambiguous: false },
    { FileType: 'html', Magic: [], TextPrefix: '<html', Unambiguous: false },
    { FileType: 'xml', Magic: [], TextPrefix: '<?xml', Unambiguous: false },
    { FileType: 'json', Magic: [], TextPrefix: '{', Unambiguous: false },
    { FileType: 'json', Magic: [], TextPrefix: '[', Unambiguous: false },
    { FileType: 'ps', Magic: [], TextPrefix: '%!ps', Unambiguous: false },
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
 * @param configured Signatures from metadata. Consulted before the built-ins, so a deployment can
 *   recognize a format the built-in table does not — and correct one it gets wrong — without a
 *   release.
 * @returns The match, or `null` when nothing is recognized.
 */
export function DetectByteSignature(
    content: Uint8Array,
    configured: readonly Signature[] = [],
): ByteSignatureMatch | null {
    // Magic numbers are tried before text prefixes, in both tiers. A prefix match is a weaker claim
    // — `{` is every JSON document and a good many things that are not — so it must never beat a
    // format that announced itself in its first bytes.
    const configuredMagic = configured.filter((s) => s.Magic.length > 0);
    const configuredText = configured.filter((s) => s.Magic.length === 0 && s.TextPrefix);

    for (const signature of [...configuredMagic, ...SIGNATURES]) {
        if (matchesMagic(content, signature)) {
            return { FileType: signature.FileType, Unambiguous: signature.Unambiguous };
        }
    }

    const head = textHead(content);
    for (const signature of [...configuredText, ...TEXT_SIGNATURES]) {
        if (head.startsWith(signature.TextPrefix as string)) {
            return { FileType: signature.FileType, Unambiguous: signature.Unambiguous };
        }
    }
    return null;
}

/** Whether the content carries this signature's magic at its offset. */
function matchesMagic(content: Uint8Array, signature: Signature): boolean {
    if (signature.Magic.length === 0) {
        return false;
    }
    const offset = signature.Offset ?? 0;
    if (content.length < offset + signature.Magic.length) {
        return false;
    }
    return signature.Magic.every((byte, index) => content[offset + index] === byte);
}

/**
 * The opening of the content as comparable text.
 *
 * The normalization — byte-order mark, leading whitespace, case — is what makes a stored prefix a
 * usable rule rather than a guess about exactly how one producer wrote the file.
 */
function textHead(content: Uint8Array): string {
    return new TextDecoder('utf-8', { fatal: false })
        .decode(content.subarray(0, 512))
        .replace(/^\ufeff/, '')
        .trimStart()
        .toLowerCase();
}
