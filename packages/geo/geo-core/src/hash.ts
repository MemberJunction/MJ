import { createHash } from 'crypto';
import { BaseEntity } from '@memberjunction/core';

/**
 * Computes a SHA-256 hash of the geo-relevant field values for change detection.
 * When source fields change on entity save, the hash won't match the stored
 * SourceFieldHash in RecordGeoCode, triggering re-geocoding.
 *
 * @param entity - The entity instance to extract field values from
 * @param fieldNames - The field names that contribute to geocoding
 * @returns SHA-256 hex digest of the concatenated field values
 */
export function ComputeGeoSourceHash(entity: BaseEntity, fieldNames: string[]): string {
    const values = fieldNames.map(f => {
        const val: unknown = entity.Get(f);
        return val != null ? String(val).trim() : '';
    });
    const input = values.join('|');
    return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Normalizes an address string for use as a shared cache key: lowercased,
 * trimmed, with internal whitespace runs collapsed to single spaces. Two
 * records whose addresses differ only in casing/whitespace normalize to the
 * same key and share one geocoding result.
 *
 * @param address - The single-line address string (from buildAddressString)
 * @returns The normalized address string
 */
export function NormalizeAddress(address: string): string {
    return address.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Computes the SHA-256 hex digest of a normalized address string. This is the
 * AddressHash key of the MJ: Geo Address Caches table — the shared,
 * cross-record/cross-entity geocode cache.
 *
 * @param normalizedAddress - Output of {@link NormalizeAddress}
 * @returns SHA-256 hex digest (64 chars)
 */
export function ComputeAddressHash(normalizedAddress: string): string {
    return createHash('sha256').update(normalizedAddress, 'utf8').digest('hex');
}
