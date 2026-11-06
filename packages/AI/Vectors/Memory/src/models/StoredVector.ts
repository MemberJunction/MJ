/**
 * Reading embedding vectors that MemberJunction persists in entity columns.
 *
 * Each persisted embedding has two columns:
 *
 * | Column | Content | Example |
 * |---|---|---|
 * | Binary (`varbinary(MAX)` / `bytea`) | Little-endian IEEE-754 float32 bytes, 4 per dimension, no header. In a `BaseEntity` and on the wire it is a base64 string. | `EntityRecordDocument.VectorBinary`, `AIAgentNote.EmbeddingVectorBinary` |
 * | JSON (`nvarchar(MAX)` / `text`) | A JSON array of numbers. | `EntityRecordDocument.VectorJSON`, `AIAgentNote.EmbeddingVector` |
 *
 * Writers fill both. Readers prefer the binary column: decoding it is a copy, while parsing the JSON
 * builds a string per number (about 4.4 s for 20,000 × 1,536 vectors). The JSON column remains the
 * fallback for rows written before the binary column existed, for browser code (binary fields are
 * not fetched by default over the network), and for any value that fails validation.
 *
 * Browser-safe: no Node APIs.
 *
 * @module StoredVector
 */
import { Base64ToFloat32Vector } from '@memberjunction/global';

/**
 * Parses a JSON vector column into a number array.
 *
 * @param vectorJSON - The column value, e.g. `VectorJSON` or `EmbeddingVector`.
 * @returns The vector, or `null` when the value is missing, malformed, empty, or contains anything
 *   but finite numbers. A `null` means "no usable vector" — the next embedding of the record rewrites it.
 */
export function ParseVectorJSON(vectorJSON: string | null | undefined): number[] | null {
    if (!vectorJSON) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(vectorJSON);
    } catch {
        return null; // stale or corrupted JSON
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    for (const value of parsed) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    }
    return parsed as number[];
}

/**
 * Decodes a binary vector column (base64 of little-endian float32 bytes).
 *
 * @param vectorBinary - The column value as a `BaseEntity` holds it, e.g. `VectorBinary`.
 * @returns The vector, or `null` when the value is missing, not valid base64, not a whole number of
 *   float32 values, or contains a non-finite value — the same validity rule as {@link ParseVectorJSON}.
 */
export function DecodeVectorBinary(vectorBinary: string | null | undefined): Float32Array | null {
    const vector = Base64ToFloat32Vector(vectorBinary);
    if (!vector) return null;
    for (let i = 0; i < vector.length; i++) {
        if (!Number.isFinite(vector[i])) return null;
    }
    return vector;
}

/**
 * Reads a persisted embedding, preferring the binary column and falling back to the JSON column.
 *
 * The fallback also covers a binary value that fails validation, so a corrupt binary column never
 * hides a good JSON copy. The two shapes differ (`Float32Array` vs `number[]`); both are accepted by
 * `SimpleVectorService.LoadVectors` / `AddVector` / `AddOrUpdateVector`.
 *
 * @param vectorBinary - The binary column value (base64), or null when the row has none or it was not fetched.
 * @param vectorJSON - The JSON column value, or null.
 * @returns The vector, or `null` when neither column holds a usable vector.
 *
 * @example
 * ```typescript
 * const vector = ReadStoredVector(note.EmbeddingVectorBinary, note.EmbeddingVector);
 * if (vector) service.AddOrUpdateVector(note.ID, vector, metadata);
 * ```
 */
export function ReadStoredVector(
    vectorBinary: string | null | undefined,
    vectorJSON: string | null | undefined
): Float32Array | number[] | null {
    return DecodeVectorBinary(vectorBinary) ?? ParseVectorJSON(vectorJSON);
}
