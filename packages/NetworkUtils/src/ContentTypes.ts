/**
 * @fileoverview What a content type means.
 *
 * These were private methods on an action, which meant anything else needing the same judgement had
 * to restate it — and the restatements drifted, because a list of Office MIME types is exactly the
 * kind of thing one copy gets a new entry and the other does not.
 *
 * Moved here from `@memberjunction/document-parsing` (which never used them itself) so that any package can share them:
 * this package has no dependencies.
 *
 * @module @memberjunction/network-utils
 */

/** MIME types that are text, or close enough to decode as text. */
const TEXT_TYPES: readonly string[] = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript',
];

/** Whether this is an image. */
export function IsImageContentType(contentType: string): boolean {
    return contentType.startsWith('image/');
}

/** Whether this decodes as text without a parser. */
export function IsTextContentType(contentType: string): boolean {
    return TEXT_TYPES.some((t) => contentType.startsWith(t));
}

/** Whether this is a PDF. */
export function IsPdfContentType(contentType: string): boolean {
    return contentType === 'application/pdf';
}

/** Whether this is an Excel workbook, in either generation's format. */
export function IsSpreadsheetContentType(contentType: string): boolean {
    return (
        contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        contentType === 'application/vnd.ms-excel'
    );
}

/** Whether this is a Word document, in either generation's format. */
export function IsWordContentType(contentType: string): boolean {
    return (
        contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        contentType === 'application/msword'
    );
}

/** Office, OpenDocument and other document formats beyond Word and Excel (by prefix or exactly). */
const OTHER_DOCUMENT_TYPES: readonly string[] = [
    'application/vnd.openxmlformats-officedocument.',
    'application/vnd.oasis.opendocument.',
    'application/vnd.ms-powerpoint',
    'application/rtf',
    'text/rtf',
    'application/epub+zip',
    'application/zip',
    'text/csv',
    'audio/',
    'video/',
];

/**
 * Whether a `Content-Type` names a document file a browser would download rather than render: a PDF, Word, Excel,
 * PowerPoint or OpenDocument file, RTF, EPUB, CSV, a zip, or an image, audio or video file. Anything else,
 * `application/octet-stream` and `text/plain` included, is not known to be a file (servers send those for pages too).
 */
export function IsDocumentContentType(contentType: string | null | undefined): boolean {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    return (
        IsPdfContentType(type) ||
        IsWordContentType(type) ||
        IsSpreadsheetContentType(type) ||
        IsImageContentType(type) ||
        OTHER_DOCUMENT_TYPES.some((t) => (t.endsWith('/') || t.endsWith('.') ? type.startsWith(t) : type === t))
    );
}
