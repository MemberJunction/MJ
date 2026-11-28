/**
 * @fileoverview Canonical URL scheme (`upload://<normalized-file-id>`) and helpers for caller-pushed
 * `MJ: Content Items` rows created by `ContentUploadIngestor`.
 *
 * @module @memberjunction/content-pipeline
 */

import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/** Prefix used for the synthetic URL of an uploaded Content Item (`upload://<normalized-file-id>`). */
export const UPLOAD_URL_PREFIX = 'upload://';

/** Build the deterministic synthetic URL for an uploaded file (`upload://<normalized-file-id>`). */
export function UploadItemURL(fileID: string): string {
    return `${UPLOAD_URL_PREFIX}${NormalizeUUID(fileID)}`;
}

/** True when the given Content Item URL uses the `upload://` scheme. */
export function IsUploadItemURL(url: string | null | undefined): boolean {
    return typeof url === 'string' && url.startsWith(UPLOAD_URL_PREFIX);
}

/**
 * True when `url` is the root `upload://<FileID>` locator for `fileID` (and not an archive member
 * locator such as `upload://<rootFileID>#member`), meaning the `MJ: Files` row belongs to the caller.
 */
export function IsCallerOwnedUploadURL(url: string | null | undefined, fileID: string | null | undefined): boolean {
    if (!url || !fileID) {
        return false;
    }
    const trimmedUrl = url.trim();
    if (!IsUploadItemURL(trimmedUrl)) {
        return false;
    }
    const locatorPart = trimmedUrl.slice(UPLOAD_URL_PREFIX.length);
    return Boolean(locatorPart) && !locatorPart.includes('#') && UUIDsEqual(locatorPart, fileID);
}

/** Prefix of the synthetic URL of a Content Item pushed as text for an entity record (`record://<entity>/<record id>`). */
export const RECORD_TEXT_URL_PREFIX = 'record://';

/**
 * Deterministic synthetic URL for text pushed on behalf of an entity record, so re-pushing the same
 * record finds its existing Content Item. `recordID` should be the record's compact URL segment.
 */
export function RecordTextItemURL(entityName: string, recordID: string): string {
    return `${RECORD_TEXT_URL_PREFIX}${encodeURIComponent(entityName.trim())}/${encodeURIComponent(recordID.trim())}`;
}

/** True when `url` is a `record://` locator for text pushed on behalf of an entity record ({@link RecordTextItemURL}). */
export function IsRecordTextItemURL(url: string | null | undefined): boolean {
    return typeof url === 'string' && url.startsWith(RECORD_TEXT_URL_PREFIX);
}
