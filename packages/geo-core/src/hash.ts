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
