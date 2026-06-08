/**
 * Name of the per-record custom-overflow column. Written on every integration table
 * alongside the other `__mj_integration_*` columns when present. Holds a JSON object of
 * the source fields a record returned that have NO field map — the "extra" keys the
 * target table doesn't (yet) have a column for.
 *
 * This is the capture half of framework-level custom-column support (gaps.md §2). A
 * source with no schema/describe endpoint (the PropFuel class) can only learn its full
 * field set by reading data; a static catalog then silently drops any extra key at
 * {@link MapSingleRecord} (only mapped fields get persisted). Rather than lose them, the
 * unmapped keys are parked here, on the row, in the SAME write as the mapped fields — so
 * capture costs no extra round-trip. A post-sync Runtime-Schema-Updation (RSU) pass later
 * reads this column back out, promotes pervasive keys to real columns, spreads the values
 * in, and clears them from here (at which point they are mapped → no longer "unmapped" →
 * not re-captured: the loop converges).
 *
 * Shape mirrors {@link CONTENT_HASH_COLUMN}: a JSON-serialized string sidecar, identical
 * in kind to `__mj_integration_LastSyncedSnapshot`. SS `NVARCHAR(MAX)` / PG `TEXT`; the
 * post-sync coverage scan + spread cast `::jsonb` on Postgres when they query it.
 *
 * This is BACKEND PLUMBING, not user-facing metadata. It is a SYSTEM field — in the same
 * hidden/internal class as `__mj_integration_ContentHash` & the other `__mj_integration_*`
 * columns: metadata-registered only so the engine's `entity.Set(...)`/`entity.Fields` write
 * path is permitted to touch it (so it is NOT an out-of-band "phantom" column the engine
 * writes blind), but NOT surfaced or managed through the metadata-driven framework — not in
 * forms, not user-mappable, not "a field" anyone works with. It is machinery.
 *
 * The things that genuinely ENTER the metadata-driven framework are the columns this gets
 * PROMOTED into: a pervasive key here is turned into a real user-facing, mappable EntityField
 * (IntegrationSchemaSync IOF → RSU ADD COLUMN → CodeGen → md.Refresh) BEFORE the engine maps
 * to it. So: backend staging until promotion, first-class metadata-driven schema after. Only
 * the JSON *values* parked here are ever transient.
 *
 * Gated everywhere by EntityInfo field presence, so it is a no-op on tables that predate
 * the column. CRUCIAL invariant: when a record has NO unmapped keys, NOTHING is written
 * here — empty across all rows is the signal that no RSU pass is needed, which is what
 * keeps a customs-free sync byte-identical to today (single-stage, zero overhead).
 */
export const CUSTOM_OVERFLOW_COLUMN = '__mj_integration_CustomOverflow';

/**
 * Computes the unmapped subset of a record's external fields: every key the source
 * returned that is NOT the SourceFieldName of any active field map.
 *
 * Pure + O(columns) — no per-row allocation beyond the result object, which is empty
 * (and discarded by the caller) for the common no-customs case.
 *
 * Honest limit (documented in gaps.md §2): a field consumed only indirectly — e.g. as a
 * `combine`/`custom` transform input rather than as a map's own SourceFieldName — will
 * also appear here. That is harmless (the value is still in `Fields`); the post-sync
 * promotion stage applies a coverage + novelty filter before it ever creates a column.
 *
 * @param externalFields - the full source record (`ExternalRecord.Fields`)
 * @param mappedSourceFieldNames - SourceFieldName of every active field map
 * @returns the extra keys + values, or an empty object when everything was mapped
 */
export function computeUnmappedFields(
    externalFields: Record<string, unknown>,
    mappedSourceFieldNames: ReadonlySet<string>
): Record<string, unknown> {
    const unmapped: Record<string, unknown> = {};
    for (const key of Object.keys(externalFields)) {
        if (!mappedSourceFieldNames.has(key)) {
            unmapped[key] = externalFields[key];
        }
    }
    return unmapped;
}

/**
 * Whether a computed unmapped-field object carries anything worth persisting. Used by
 * both the per-record write gate and (later) the post-sync RSU trigger gate.
 */
export function hasUnmappedFields(unmapped: Record<string, unknown> | undefined | null): boolean {
    return unmapped != null && Object.keys(unmapped).length > 0;
}
