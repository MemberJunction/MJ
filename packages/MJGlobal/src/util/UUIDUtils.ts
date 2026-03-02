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
    return uuid1.trim().toLowerCase() === uuid2.trim().toLowerCase();
}
