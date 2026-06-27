/**
 * Deterministic gate: every readable Integration Object must carry at least one Integration Object FIELD.
 *
 * Why this is a hard gate (the SOAP/zero-field-stub hole, observed across the fleet 2026-06-26):
 *   The fleet structural re-assessment (ERRORS.md E-FLEET1, io-name-checks over all 20 connectors) found
 *   ZERO-FIELD objects on several connectors — netFORUM 10 (SOAP stubs the extractor never gave WSDL/XSD
 *   field extraction), cvent 4, neon-crm 3, imis 2, novi 3, pheedloop/propfuel 1 each. A `SupportsRead` IO
 *   with no IOFs has no columns to map, so `FieldMappingEngine.MapSingleRecord` drops every record → it
 *   syncs 0 rows forever, yet the build goes green because nothing asserts an IO has fields. It is the
 *   field-side complement to `io-name-quality` (which checks the NAME) and `enumerate-catalog` (which checks
 *   the COUNT): an object can have a perfect name and be counted in the universe, and STILL be an empty
 *   shell that enumerates nothing.
 *
 *   This is exactly how a SOAP or GraphQL connector ships "complete" while its non-REST objects are hollow:
 *   the REST extractor parsed JSON example payloads for fields, but the SOAP objects' WSDL/XSD (or the
 *   GraphQL SDL types) were never walked for fields → the IO exists, named correctly, with 0 IOFs.
 *
 * The fix: block any IO that the connector will READ (SupportsRead, default true) which declares 0 fields.
 * A genuinely field-less object does not exist — even a thin record has an id. A 0-field IO is always either
 * (a) an extraction gap (the field walk didn't run for this object's protocol) or (b) an over-emission (a DTO
 * with no record shape). Both are defects; fail loudly at build time instead of at sync time.
 *
 * PROVABLE-ONLY: pure structural arithmetic over the emitted doc — counts each IO's IOF children. Bakes NO
 * vendor knowledge. The ONLY judgment is the SupportsRead gate (a write-only DTO legitimately may be modeled
 * thin) and an explicit opt-out marker for a deliberately field-less object.
 *
 * Comparison is case-insensitive; boolean fields tolerate string 'true'/'false' (mj-sync metadata varies).
 */

import { walkMetadata } from './iof-field-conformance.mjs';

const lower = (s) => String(s ?? '').toLowerCase();

/** Coerce an mj-sync metadata boolean that may be a real bool or the strings 'true'/'false'/''. */
function asBool(v, dflt) {
    if (v === true || v === false) return v;
    const s = lower(v);
    if (s === 'true') return true;
    if (s === 'false') return false;
    return dflt;
}

/**
 * Does this IO read records (so it needs fields)? Default TRUE — an IO is readable unless it explicitly
 * declares SupportsRead=false (a write-only DTO) or marks itself field-less-by-design.
 * @param {Record<string, unknown>} f  the IO's `fields` object
 */
export function ioIsReadable(f) {
    if (!f || typeof f !== 'object') return true;
    // explicit write-only DTO — legitimately may carry no read fields
    if (asBool(f.SupportsRead, true) === false) return false;
    // explicit, auditable opt-out for a genuinely structureless object (rare; must be a conscious decision)
    if (asBool(f.AllowZeroFields, false) === true) return false;
    return true;
}

/**
 * Grade a parsed metadata doc: every readable IO must have ≥1 IOF.
 * Reuses `walkMetadata` so the IO→IOF nesting handling is shared with `iof-field-conformance`.
 * @param {unknown} doc parsed `.<vendor>.integration.json`
 * @returns {{ pass: boolean, totalReadable: number, empty: number,
 *             violations: Array<{ io: string, supportsRead: boolean }> }}
 */
export function gradeZeroFieldIOs(doc) {
    const { ios, iofs } = walkMetadata(doc);
    // count IOFs per IO name (walkMetadata labels each IOF `<ioName>.<iofName>`)
    const fieldCountByIO = new Map();
    for (const io of ios) fieldCountByIO.set(lower(io.fields?.Name), 0);
    for (const iof of iofs) {
        const ioName = String(iof.label ?? '').split('.')[0]; // label = `<ioName>.<iofName>`, already lowercased
        fieldCountByIO.set(ioName, (fieldCountByIO.get(ioName) ?? 0) + 1);
    }
    const violations = [];
    let totalReadable = 0;
    for (const io of ios) {
        if (!ioIsReadable(io.fields)) continue;
        totalReadable++;
        const n = fieldCountByIO.get(lower(io.fields?.Name)) ?? 0;
        if (n === 0) {
            violations.push({ io: String(io.fields?.Name ?? ''), supportsRead: true });
        }
    }
    return { pass: violations.length === 0, totalReadable, empty: violations.length, violations };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Usage: node zero-field-io.mjs <metadata.json> [--json]
if (import.meta.url === `file://${process.argv[1]}`) {
    const { readFileSync } = await import('node:fs');
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const metaFile = args.find((a) => !a.startsWith('--'));
    if (!metaFile) {
        process.stderr.write('usage: zero-field-io.mjs <metadata.json> [--json]\n');
        process.exit(2);
    }
    let doc;
    try {
        doc = JSON.parse(readFileSync(metaFile, 'utf8'));
    } catch (e) {
        process.stderr.write(`✗ zero-field-io: unreadable input: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }
    const verdict = gradeZeroFieldIOs(doc);
    if (json) {
        process.stdout.write(JSON.stringify(verdict));
        process.exit(verdict.pass ? 0 : 1);
    }
    if (verdict.pass) {
        process.stdout.write(`✓ zero-field-io: all ${verdict.totalReadable} readable IO(s) declare ≥1 field\n`);
        process.exit(0);
    }
    process.stdout.write(
        `✗ zero-field-io: ${verdict.empty}/${verdict.totalReadable} readable IO(s) declare ZERO fields (they sync 0 rows forever — SOAP/GraphQL field-extraction gap or DTO over-emission):\n`
    );
    for (const v of verdict.violations) {
        process.stdout.write(`    - ${v.io}  [readable IO with no IOFs]\n`);
    }
    process.exit(1);
}
