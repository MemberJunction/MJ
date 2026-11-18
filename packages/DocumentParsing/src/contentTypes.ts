/**
 * @fileoverview What a content type means.
 *
 * These were private methods on an action, which meant anything else needing the same judgement had
 * to restate it — and the restatements drifted, because a list of Office MIME types is exactly the
 * kind of thing one copy gets a new entry and the other does not.
 *
 * @module @memberjunction/document-parsing
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
