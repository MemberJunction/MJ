/**
 * Key-value serialization for record identity.
 *
 * `serializeKeyValue` mirrors the engine's write-side value coercion (see
 * `IntegrationEngine` value-handling: object/array → `JSON.stringify`, NOT the JS default
 * `"[object Object]"`). It is used to build a record's composite ExternalID / load key from
 * its primary-key field VALUES, so the key derived at load time equals the value persisted in
 * the column for object-valued PKs — without this, every object-valued PK would collapse to
 * `"[object Object]"` and all such records would share one identity (the duplicate-row class
 * of bug).
 *
 * Contract (pinned by call sites in `BaseRESTIntegrationConnector`, `MatchEngine`,
 * `IntegrationEngine.extractMappedPrimaryKey`):
 * - `null` / `undefined` → `''` (empty string). Callers treat `''` as a missing key component
 *   (`if (s === '') return null` / `serializeKeyValue(v).length > 0`), which routes genuinely
 *   keyless / partial-key rows to the content-hash identity fallback rather than a bogus key.
 * - plain object / array (anything `typeof === 'object'` that is not a `Date`) → `JSON.stringify`.
 * - everything else (string / number / boolean / Date / bigint / symbol) → `String(value)`.
 */
export function serializeKeyValue(value: unknown): string {
    if (value == null) {
        return '';
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
        return JSON.stringify(value);
    }
    return String(value);
}
