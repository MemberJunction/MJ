/**
 * @fileoverview UUID comparison utility functions for MemberJunction
 *
 * Provides case-insensitive UUID comparison to handle the difference between
 * SQL Server (returns UUIDs in UPPERCASE) and PostgreSQL (returns UUIDs in lowercase).
 * These utilities ensure consistent UUID handling across all database platforms.
 *
 * @module @memberjunction/global/UUIDUtils
 */

/**
 * Normalizes a UUID string for consistent comparison by trimming whitespace
 * and converting to lowercase. Returns an empty string for null/undefined input.
 *
 * @param uuid - The UUID string to normalize
 * @returns The normalized (lowercased, trimmed) UUID string, or empty string if input is nullish
 *
 * @example
 * NormalizeUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')
 * // Returns: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 *
 * NormalizeUUID(null) // Returns: ''
 * NormalizeUUID('  A1B2C3D4  ') // Returns: 'a1b2c3d4'
 */
export function NormalizeUUID(uuid: string | null | undefined): string {
    if (uuid == null) return '';
    return uuid.trim().toLowerCase();
}

/**
 * Performs a case-insensitive comparison of two UUID strings.
 * Handles null/undefined gracefully — two nullish values are considered equal,
 * but a nullish value is never equal to a non-nullish value.
 *
 * @param uuid1 - First UUID to compare
 * @param uuid2 - Second UUID to compare
 * @returns true if the UUIDs are equal (case-insensitive), false otherwise
 *
 * @example
 * // Cross-platform comparison (SQL Server uppercase vs PostgreSQL lowercase)
 * UUIDsEqual('A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
 *            'a1b2c3d4-e5f6-7890-abcd-ef1234567890') // true
 *
 * UUIDsEqual(null, null) // true
 * UUIDsEqual(null, 'some-id') // false
 * UUIDsEqual('abc', 'ABC') // true
 */
export function UUIDsEqual(uuid1: string | null | undefined, uuid2: string | null | undefined): boolean {
    if (uuid1 == null && uuid2 == null) return true;
    if (uuid1 == null || uuid2 == null) return false;
    // Fast path: identical references / already-equal strings (same value, same platform casing).
    if (uuid1 === uuid2) return true;
    // Compare without allocating. `trim().toLowerCase()` on both sides built two new strings per
    // call, and most calls in a `.filter`/`.some` scan are MISMATCHES, which the `===` path above
    // never catches. The ASCII compare below settles every UUID-shaped input; anything it cannot
    // settle exactly (a non-ASCII character) falls back to the original expression, so the
    // result is identical to `uuid1.trim().toLowerCase() === uuid2.trim().toLowerCase()`.
    const settled = compareTrimmedAsciiCaseInsensitive(uuid1, uuid2);
    if (settled !== undefined) return settled;
    return uuid1.trim().toLowerCase() === uuid2.trim().toLowerCase();
}

/** Characters `String.prototype.trim` removes: ECMAScript WhiteSpace plus LineTerminator. */
function isTrimmable(code: number): boolean {
    return (
        code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680 ||
        (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f ||
        code === 0x205f || code === 0x3000 || code === 0xfeff
    );
}

function hasNonAscii(value: string, start: number, end: number): boolean {
    for (let i = start; i < end; i++) {
        if (value.charCodeAt(i) > 0x7f) return true;
    }
    return false;
}

/**
 * Compares the trimmed ranges of `a` and `b`, folding ASCII A-Z to a-z, without allocating.
 * Returns the answer when ASCII rules decide it, or `undefined` when a non-ASCII character is
 * involved (Unicode lower-casing can change a string's length or map outside ASCII, so only the
 * original `toLowerCase()` path can answer those exactly).
 */
function compareTrimmedAsciiCaseInsensitive(a: string, b: string): boolean | undefined {
    let aStart = 0, aEnd = a.length, bStart = 0, bEnd = b.length;
    while (aStart < aEnd && isTrimmable(a.charCodeAt(aStart))) aStart++;
    while (aEnd > aStart && isTrimmable(a.charCodeAt(aEnd - 1))) aEnd--;
    while (bStart < bEnd && isTrimmable(b.charCodeAt(bStart))) bStart++;
    while (bEnd > bStart && isTrimmable(b.charCodeAt(bEnd - 1))) bEnd--;

    const length = aEnd - aStart;
    if (length !== bEnd - bStart) {
        return hasNonAscii(a, aStart, aEnd) || hasNonAscii(b, bStart, bEnd) ? undefined : false;
    }
    for (let i = 0; i < length; i++) {
        let x = a.charCodeAt(aStart + i);
        let y = b.charCodeAt(bStart + i);
        if (x === y) continue;
        if (x > 0x7f || y > 0x7f) return undefined;
        if (x >= 0x41 && x <= 0x5a) x += 0x20;
        if (y >= 0x41 && y <= 0x5a) y += 0x20;
        if (x !== y) return false;
    }
    return true;
}

/**
 * Canonical UUID format (8-4-4-4-12 hex groups). Case-insensitive; the version/variant digits are
 * NOT constrained, so this validates SHAPE rather than RFC version — which is exactly what is needed
 * to make a value safe to interpolate into a SQL filter or trust as an entity key.
 */
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when the input is a well-formed UUID string (canonical 8-4-4-4-12 hex form,
 * case-insensitive, surrounding whitespace tolerated). Null/undefined/empty are not valid.
 *
 * Use this to validate any externally-supplied id BEFORE interpolating it into a SQL filter or
 * trusting it as an entity key — it guards against injection and malformed lookups.
 *
 * @param uuid - The value to test
 * @returns true if `uuid` is a syntactically valid UUID, false otherwise
 *
 * @example
 * IsValidUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890') // true
 * IsValidUUID('  A1B2C3D4-E5F6-7890-ABCD-EF1234567890  ') // true (trimmed, case-insensitive)
 * IsValidUUID('not-a-uuid') // false
 * IsValidUUID(null) // false
 */
export function IsValidUUID(uuid: string | null | undefined): boolean {
    if (uuid == null) return false;
    return UUID_FORMAT.test(uuid.trim());
}
