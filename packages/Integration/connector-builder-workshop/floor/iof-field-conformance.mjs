/**
 * Deterministic gate: every column a connector's metadata emits must EXIST on the DEPLOYED entity schema.
 *
 * Why this is a hard gate (the netFORUM build-against-wrong-schema hole):
 *   The extractor emitted `IsForeignKey` / `ForeignKeyTarget` into IOF rows — columns that exist on a newer
 *   framework schema but NOT on the target's deployed 25-column `IntegrationObjectField`. `mj sync push` →
 *   `BaseEntity.SetLocal` SILENTLY NO-OPS unknown fields, so the push "succeeds" while those values never
 *   persist. The connector was built against a schema the target lacks, and nothing caught it until the FK
 *   relationships were mysteriously absent at runtime. Same trap for the ideal-but-unmigrated IO columns the
 *   metadata-file conventions call out (`SupportsCreate/Update/Delete`, `SyncStrategy`, `StableOrderingKey`,
 *   `IsMutable`, `IsAppendOnly`, `ContentHashApplicable`, `IncludeInActionGeneration`, and `Source` whose real
 *   column is `MetadataSource`).
 *
 * The fix: diff each emitted row's column keys against the set of columns that ACTUALLY EXIST on the deployed
 * entity, and BLOCK on any unknown column. A silently-dropped column is an accuracy hole — fail loudly instead.
 *
 * PROVABLE-ONLY: the allowed-column set is an INPUT (the caller introspects the live
 * `__mj.IntegrationObject*` columns and passes their names). This gate NEVER bakes a column list — a baked
 * list would freeze the very schema-drift it exists to catch. Pure set arithmetic in, verdict out.
 *
 * Comparison is case-insensitive (SQL Server column names are case-insensitive; the metadata may vary casing).
 */

/** mj-sync structural keys that are NOT entity columns — never flagged. */
export const STRUCTURAL_KEYS = new Set(['primarykey', 'sync', 'deleterecord', 'relatedentities', 'fields']);

const lower = (s) => String(s ?? '').toLowerCase();

/**
 * Unknown columns in one row: the keys of `row.fields` that are neither a deployed column nor a structural key.
 * @param {Record<string, unknown>} fields  the row's `fields` object (column → value)
 * @param {Set<string>} allowedLower  deployed column names, lowercased
 * @returns {string[]} the offending column names (original casing preserved)
 */
export function unknownColumnsInRow(fields, allowedLower) {
    if (!fields || typeof fields !== 'object') return [];
    return Object.keys(fields).filter((k) => !STRUCTURAL_KEYS.has(lower(k)) && !allowedLower.has(lower(k)));
}

/**
 * Walk an mj-sync integration doc into the three row-buckets (defensive about exact nesting). Returns
 * `{ integration, ios, iofs }` where each entry is `{ label, fields }`.
 * @param {unknown} doc parsed `.<vendor>.integration.json`
 */
export function walkMetadata(doc) {
    const out = { integration: [], ios: [], iofs: [] };
    const roots = Array.isArray(doc) ? doc : [doc];
    const ioEntityKeys = ['MJ: Integration Objects', 'Integration Objects'];
    const iofEntityKeys = ['MJ: Integration Object Fields', 'Integration Object Fields'];
    const childArr = (re, keys) => {
        if (!re || typeof re !== 'object') return [];
        for (const k of keys) if (Array.isArray(re[k])) return re[k];
        return [];
    };
    for (const root of roots) {
        if (!root || typeof root !== 'object') continue;
        out.integration.push({ label: lower(root.fields?.Name) || 'integration', fields: root.fields ?? {} });
        const ioRows = childArr(root.relatedEntities, ioEntityKeys);
        for (const io of ioRows) {
            out.ios.push({ label: lower(io.fields?.Name) || 'io', fields: io.fields ?? {} });
            const iofRows = childArr(io.relatedEntities, iofEntityKeys);
            for (const iof of iofRows) {
                out.iofs.push({ label: `${lower(io.fields?.Name)}.${lower(iof.fields?.Name)}`, fields: iof.fields ?? {} });
            }
        }
    }
    return out;
}

/**
 * Grade a parsed metadata doc against the deployed column sets.
 * @param {unknown} doc parsed integration metadata
 * @param {{ integration?: string[], io?: string[], iof?: string[] }} allowed deployed column names per entity
 * @returns {{ pass: boolean, violations: Array<{ kind: 'integration'|'io'|'iof', label: string, unknownColumns: string[] }> }}
 */
export function gradeConformance(doc, allowed) {
    const setOf = (arr) => new Set((arr ?? []).map(lower));
    const allowedIntegration = setOf(allowed?.integration);
    const allowedIO = setOf(allowed?.io);
    const allowedIOF = setOf(allowed?.iof);
    const { integration, ios, iofs } = walkMetadata(doc);
    const violations = [];
    for (const r of integration) {
        const u = unknownColumnsInRow(r.fields, allowedIntegration);
        if (u.length) violations.push({ kind: 'integration', label: r.label, unknownColumns: u });
    }
    for (const r of ios) {
        const u = unknownColumnsInRow(r.fields, allowedIO);
        if (u.length) violations.push({ kind: 'io', label: r.label, unknownColumns: u });
    }
    for (const r of iofs) {
        const u = unknownColumnsInRow(r.fields, allowedIOF);
        if (u.length) violations.push({ kind: 'iof', label: r.label, unknownColumns: u });
    }
    return { pass: violations.length === 0, violations };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Usage: node iof-field-conformance.mjs <metadata.json> <allowed-columns.json> [--json]
//   allowed-columns.json = { "integration": ["Name", ...], "io": [...], "iof": [...] }  (deployed column names)
if (import.meta.url === `file://${process.argv[1]}`) {
    const { readFileSync } = await import('node:fs');
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const [metaFile, allowedFile] = args.filter((a) => !a.startsWith('--'));
    if (!metaFile || !allowedFile) {
        process.stderr.write('usage: iof-field-conformance.mjs <metadata.json> <allowed-columns.json> [--json]\n');
        process.exit(2);
    }
    let doc, allowed;
    try {
        doc = JSON.parse(readFileSync(metaFile, 'utf8'));
        allowed = JSON.parse(readFileSync(allowedFile, 'utf8'));
    } catch (e) {
        process.stderr.write(`✗ iof-field-conformance: unreadable input: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }
    const verdict = gradeConformance(doc, allowed);
    if (json) {
        process.stdout.write(JSON.stringify({ pass: verdict.pass, violations: verdict.violations }));
        process.exit(0);
    }
    if (verdict.pass) {
        process.stdout.write('✓ iof-field-conformance: every emitted column exists on the deployed schema\n');
        process.exit(0);
    }
    process.stdout.write(`✗ iof-field-conformance: ${verdict.violations.length} row(s) emit columns absent from the deployed schema (mj-sync would SILENTLY DROP them):\n`);
    for (const v of verdict.violations) {
        process.stdout.write(`    - [${v.kind}] ${v.label}: ${v.unknownColumns.join(', ')}\n`);
    }
    process.exit(1);
}
