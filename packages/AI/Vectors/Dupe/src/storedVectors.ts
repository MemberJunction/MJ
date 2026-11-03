import { Base64ToFloat32Vector, UUIDsEqual } from '@memberjunction/global';

/**
 * The `MJ: Entity Record Documents` columns a batch run reads to reuse the vector sync stored for a
 * record instead of embedding it again (#5203).
 */
export type StoredVectorRow = {
    RecordID: string;
    VectorIndexID: string | null;
    VectorBinary: string | null;
    VectorJSON: string | null;
    /** When sync last embedded the record. */
    EntityRecordUpdatedAt: Date | string | null;
    __mj_UpdatedAt: Date | string | null;
};

function toTime(value: Date | string | null | undefined): number | null {
    if (value == null) return null;
    const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(t) ? t : null;
}

/**
 * Decodes a stored vector: the float32 bytes (`VectorBinary`, base64) when present, else `VectorJSON`.
 * Returns null when neither decodes to a non-empty numeric array.
 */
export function DecodeStoredVector(row: Pick<StoredVectorRow, 'VectorBinary' | 'VectorJSON'>): number[] | null {
    const binary = Base64ToFloat32Vector(row.VectorBinary);
    if (binary && binary.length > 0) {
        return Array.from(binary);
    }
    if (!row.VectorJSON) return null;
    try {
        const parsed: unknown = JSON.parse(row.VectorJSON);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((v): v is number => typeof v === 'number' && Number.isFinite(v))) {
            return parsed;
        }
    } catch {
        // not usable; the record is embedded instead
    }
    return null;
}

/**
 * The stored vector a batch run may use for one record, or null when it must embed the record.
 *
 * Usable only when it was written to the document's current index, has the index's width (when
 * the index declares one), and is not older than the record (`EntityRecordUpdatedAt` at or after
 * the record's `__mj_UpdatedAt`). With several rows for the record, the newest is used.
 *
 * @param rows the record's stored rows for the run's entity document
 * @param vectorIndexID the document's current `VectorIndexID`
 * @param dimensions the index's `Dimensions`, or undefined when it declares none
 * @param recordUpdatedAt the record's `__mj_UpdatedAt`, or null when the entity has none
 */
export function SelectStoredVector(
    rows: ReadonlyArray<StoredVectorRow>,
    vectorIndexID: string | null | undefined,
    dimensions: number | undefined,
    recordUpdatedAt: Date | string | null
): number[] | null {
    if (!vectorIndexID || rows.length === 0) return null;
    const newest = [...rows].sort((a, b) => (toTime(b.__mj_UpdatedAt) ?? 0) - (toTime(a.__mj_UpdatedAt) ?? 0))[0];
    if (!UUIDsEqual(newest.VectorIndexID, vectorIndexID)) return null;

    const recordTime = toTime(recordUpdatedAt);
    const embeddedTime = toTime(newest.EntityRecordUpdatedAt);
    if (recordTime != null && (embeddedTime == null || embeddedTime < recordTime)) return null;

    const vector = DecodeStoredVector(newest);
    if (!vector) return null;
    if (dimensions != null && vector.length !== dimensions) return null;
    return vector;
}
