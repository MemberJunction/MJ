/**
 * @fileoverview Object-key canonicalization and the key-safety rule the storage access checks use.
 *
 * The tracked-file rule ("an object backing an `MJ: Files` row the caller cannot read is refused") compares the key a
 * client sends with the key an `MJ: Files` row stores. Drivers accept several spellings of the same object — S3 adds or
 * keeps its key prefix, Box strips leading and trailing `/`, Dropbox adds a leading `/` — so a raw string comparison would
 * let `/hr/secret.pdf` or `hr/secret.pdf/` through as "untracked" while the driver serves `hr/secret.pdf`. Both sides are
 * therefore put through ONE canonicalizer ({@link StorageObjectKeyNormalizer}, implemented by every driver as
 * `FileStorageBase.NormalizeObjectKey`) and compared case-insensitively.
 *
 * The canonical form is deliberately coarse: when two spellings might name the same object they canonicalize alike. A
 * coarse form can only make the rule refuse more, never less.
 *
 * @module @memberjunction/storage
 */

/** Turns an object key into the canonical form the storage access checks compare. */
export interface StorageObjectKeyNormalizer {
    /**
     * The canonical form of `objectKey` for this storage: the object the driver would address, relative to the driver's
     * own root or prefix, with no leading or trailing `/` and no repeated `/`. Case is preserved; callers compare
     * case-insensitively.
     */
    NormalizeObjectKey(objectKey: string): string;
}

/**
 * The default canonical form of an object key: trimmed, with runs of `/` collapsed to one and leading and trailing `/`
 * removed. Case is preserved (callers compare case-insensitively).
 *
 * Nothing else is rewritten. A key whose meaning depends on the provider (a backslash, a `.`/`..` segment, a
 * meaning-changing percent encoding) is refused by {@link IsSafeStorageObjectKey} before it is ever compared, so the
 * canonical form never has to guess what a driver would make of it.
 */
export function NormalizeStorageObjectKey(objectKey: string): string {
    return (objectKey ?? '')
        .trim()
        .replace(/\/{2,}/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

/** The default {@link StorageObjectKeyNormalizer}: {@link NormalizeStorageObjectKey}. */
export const DEFAULT_OBJECT_KEY_NORMALIZER: StorageObjectKeyNormalizer = {
    NormalizeObjectKey: NormalizeStorageObjectKey
};

/** Characters whose percent-encoded form a provider or URL layer could decode into a path-changing character. */
const MEANING_CHANGING_ENCODED = /%(2f|5c|2e|[01][0-9a-f]|7f)/i;

/** ASCII control characters, including NUL. */
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

/**
 * Whether an object key is one the storage access checks will compare at all. A key that fails is refused (treated as
 * an object the caller may not read) rather than canonicalized, because its meaning depends on the provider:
 *
 * - a `.` or `..` path segment — a hierarchical provider (Box, Dropbox, Google Drive, SharePoint) may resolve it as
 *   traversal, so the object served need not be the one compared;
 * - a backslash — some providers and URL layers treat it as a path separator;
 * - a percent-encoded `/`, `\`, `.` or control character (`%2F`, `%5C`, `%2E`, `%00`–`%1F`, `%7F`) — a pre-signed URL
 *   carries the key in its path, where the provider decodes it, so `hr%2Fsecret.pdf` would be compared as one segment and
 *   served as `hr/secret.pdf`. A literal `%` followed by anything else (`50% off.pdf`, `%20`) is allowed;
 * - a raw control character (including NUL).
 *
 * An empty or whitespace-only key is not unsafe — it names the root, which no `MJ: Files` row tracks.
 */
export function IsSafeStorageObjectKey(objectKey: string): boolean {
    if (typeof objectKey !== 'string') {
        return false;
    }
    if (objectKey.includes('\\') || CONTROL_CHARACTERS.test(objectKey) || MEANING_CHANGING_ENCODED.test(objectKey)) {
        return false;
    }
    return !objectKey.split('/').some(segment => segment.trim() === '.' || segment.trim() === '..');
}
