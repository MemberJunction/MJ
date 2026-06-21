/**
 * Deterministic SCOPING gate: which objects can be DDL-materialized as-is, and which OVERFLOW the dialect's
 * per-table column limit — computed UP FRONT from the field counts, not discovered when CREATE TABLE crashes.
 *
 * Why this exists (the "extract everything provable, then crash at minute 30" failure):
 *   "Surface every field the source allows" is correct for completeness — but a wide vendor facade (netFORUM:
 *   7 of 34 facades exceeded SQL Server's 1024-column-per-table limit) produces a catalog that is partly
 *   UN-materializable on the target dialect. The old behavior discovered this at ApplyAll, ~30 minutes in,
 *   as a raw `CREATE TABLE` failure that sank the WHOLE run. The right behavior: compute the materializable
 *   subset + the overflow set + a per-object plan BEFORE syncing, sync the subset, and REPORT the excluded
 *   set — never fail the whole ApplyAll for a wide-facade subset.
 *
 * This is a SCOPING aid, not a hard blocker (default exit 0): overflow objects are routed to the framework's
 * custom-overflow capture (`__mj_integration_CustomOverflow` + post-sync promotion) or split base/extension.
 * `--strict` flips overflow into a hard failure for a CI context that wants zero overflow.
 *
 * PROVABLE-ONLY: the limit is the DIALECT's documented hard limit; the field counts are the emitted truth.
 * Nothing is invented — a column count over the limit is a fact about the target, computed deterministically.
 */

/** Documented hard per-table column limits. SQL Server: 1024. PostgreSQL: 1600 (practical headroom lower). */
export const DIALECT_COLUMN_LIMITS = { sqlserver: 1024, postgres: 1600 };

/** CodeGen appends system columns (ID, __mj_CreatedAt, __mj_UpdatedAt, plus FK indexes' columns). Reserve a margin. */
export const SYSTEM_COLUMN_RESERVE = 8;

/**
 * Column count for one object. Accepts either `{ name, fieldCount }` or `{ name, fields: [...] }`.
 * @param {{ name?: string, fieldCount?: number, fields?: unknown[] }} obj
 * @returns {number}
 */
export function objectColumnCount(obj) {
    if (!obj || typeof obj !== 'object') return 0;
    if (typeof obj.fieldCount === 'number') return obj.fieldCount;
    if (Array.isArray(obj.fields)) return obj.fields.length;
    return 0;
}

/** Recommended plan for an overflow object: how to make it syncable without losing fields. */
function planForOverflow(name, columns, budget) {
    return {
        object: name,
        columns,
        budget,
        over: columns - budget,
        strategy: 'custom-overflow-capture',
        detail:
            `Materialize the first ${budget} columns as real columns; route the remaining ${columns - budget} ` +
            `to the framework custom-overflow capture (__mj_integration_CustomOverflow) for post-sync promotion, ` +
            `OR split into a base table + a 1:1 extension table. Do NOT drop fields — full-record pass-through is preserved.`,
    };
}

/**
 * Partition objects into materializable vs overflow for a dialect.
 * @param {Array<{ name?: string, fieldCount?: number, fields?: unknown[] }>} objects
 * @param {{ dialect?: 'sqlserver'|'postgres', reserve?: number }} [opts]
 * @returns {{ ok: boolean, dialect: string, limit: number, budget: number,
 *            materializable: Array<{name:string, columns:number}>,
 *            overflow: Array<{object:string, columns:number, budget:number, over:number, strategy:string, detail:string}>,
 *            excluded: string[] }}
 */
export function gradeMaterializability(objects, opts = {}) {
    const dialect = opts.dialect ?? 'sqlserver';
    const limit = DIALECT_COLUMN_LIMITS[dialect] ?? DIALECT_COLUMN_LIMITS.sqlserver;
    const reserve = opts.reserve ?? SYSTEM_COLUMN_RESERVE;
    const budget = limit - reserve;
    const materializable = [];
    const overflow = [];
    for (const obj of objects ?? []) {
        const name = String(obj?.name ?? '?');
        const columns = objectColumnCount(obj);
        if (columns > budget) overflow.push(planForOverflow(name, columns, budget));
        else materializable.push({ name, columns });
    }
    return {
        ok: overflow.length === 0,
        dialect,
        limit,
        budget,
        materializable,
        overflow,
        excluded: overflow.map((o) => o.object),
    };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Usage: node materializability.mjs <objects.json> [--dialect sqlserver|postgres] [--strict] [--json]
//   objects.json = [{ "name": "...", "fieldCount": N }, ...]  (or { "fields": [...] } per object)
if (import.meta.url === `file://${process.argv[1]}`) {
    const { readFileSync } = await import('node:fs');
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const strict = args.includes('--strict');
    const dialect = (args[args.indexOf('--dialect') + 1] && args.includes('--dialect')) ? args[args.indexOf('--dialect') + 1] : 'sqlserver';
    const file = args.find((a) => !a.startsWith('--') && a !== dialect);
    if (!file) {
        process.stderr.write('usage: materializability.mjs <objects.json> [--dialect sqlserver|postgres] [--strict] [--json]\n');
        process.exit(2);
    }
    let objects;
    try {
        objects = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
        process.stderr.write(`✗ materializability: unreadable input: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }
    const verdict = gradeMaterializability(objects, { dialect });
    if (json) {
        process.stdout.write(JSON.stringify(verdict));
        process.exit(0);
    }
    if (verdict.ok) {
        process.stdout.write(`✓ materializability: all ${verdict.materializable.length} object(s) fit within the ${verdict.dialect} ${verdict.budget}-column budget\n`);
        process.exit(0);
    }
    process.stdout.write(`⚠ materializability: ${verdict.overflow.length} object(s) OVERFLOW the ${verdict.dialect} ${verdict.budget}-column budget — scope them out of direct DDL and route to overflow capture:\n`);
    for (const o of verdict.overflow) {
        process.stdout.write(`    - ${o.object}: ${o.columns} cols (over by ${o.over}) → ${o.strategy}\n`);
    }
    // Advisory by default (exit 0): the consumer excludes these + tests the rest. --strict makes it a hard fail.
    process.exit(strict ? 1 : 0);
}
