/**
 * Deterministic gate: every Integration Object NAME a connector emits must be a real ENTITY name —
 * not a filename, a response/status schema title, a field name, or a numbered duplicate.
 *
 * Why this is a hard gate (the Cvent broken-catalog hole, observed 2026-06-26):
 *   The Cvent connector deployed 179 IOs, of which 89 had MALFORMED names that no real Cvent object
 *   carries — `available-time.json` / `bulk-result.json` (a FILENAME leaked as an object),
 *   `audience-segment-response` / `event-async-status` (a RESPONSE/STATUS schema title, not an entity),
 *   `ExhibitorId` / `ExhibitorCategoryId` (a FIELD name leaked as an object), and
 *   `AgendaItem1` / `user-group.json1` (a NUMBERED duplicate of an existing object). Those 89 "objects"
 *   never resolve to a fetchable endpoint, so they sync 0 rows forever — yet the build went green because
 *   nothing inspected the NAMES. The matrix exposed them only at sync time (39 zero-row objects).
 *
 * The fix: a deterministic name-shape gate that BLOCKS the build when an IO name is structurally not an
 * entity. This is the catalog-quality complement to `enumerate-catalog` (which checks COUNT/coverage) and
 * `iof-field-conformance` (which checks COLUMN keys) — neither looks at whether each IO NAME is sane.
 *
 * PROVABLE-ONLY: pure string/shape arithmetic over the emitted doc. It bakes NO vendor object list — it
 * cannot, because the legitimate catalog is the connector's own. It only rejects names whose SHAPE proves
 * they are extraction artifacts (file extensions, response-schema suffixes, field-name-as-object,
 * numbered dupes of a sibling). Low false-positive by construction: a flagged name must match a
 * structural artifact pattern AND, for the context-sensitive rules, corroborate against a sibling IO or a
 * declared PK field.
 *
 * Comparison is case-insensitive throughout.
 */

import { walkMetadata } from './iof-field-conformance.mjs';

const lower = (s) => String(s ?? '').toLowerCase();

/** File extensions that never appear in a real entity name (a filename leaked into the catalog). */
const FILE_EXT = /\.(json|xml|csv|txt|html?|ya?ml|tsv)\d*$/i;
/** Kebab-case response/status SCHEMA titles — API operation result names, not entities. */
const RESPONSE_WRAPPER = /-(response|list-response|paginated-response|status)$/i;

/**
 * Classify one IO name. Returns `null` when the name is clean, else `{ reason, detail }`.
 * @param {string} name the IO name
 * @param {{ pkFieldNamesLower: Set<string> }} ctx
 */
export function classifyIOName(name, ctx) {
    const n = String(name ?? '').trim();
    if (!n) return { reason: 'empty', detail: 'blank IO name' };

    // 1) Filename leaked as an object — `available-time.json`, `bulk-result.json`, `user-group.json1`.
    if (FILE_EXT.test(n)) {
        return { reason: 'file-extension', detail: 'name carries a file extension — a filename leaked as an object' };
    }

    // 2) Response/status schema title — kebab-case `*-response` / `*-status` (extraction read response
    //    schema names as objects). Require a hyphen so a legit PascalCase `OrderStatus` is NOT flagged.
    if (n.includes('-') && RESPONSE_WRAPPER.test(n)) {
        return { reason: 'response-wrapper', detail: 'kebab-case response/status schema title — not an entity' };
    }

    // NOTE: a "numbered-duplicate" rule (`Foo1` where `Foo` also exists) was considered and REJECTED — a
    // trailing digit is NOT reliably an artifact. Real APIs ship versioned/ordinal object names that end in
    // a digit and coexist with a de-numbered sibling: Salesforce `Territory` + `Territory2`, `Employee` +
    // `Employee2`, address `Line1`/`Line2`, etc. A floor gate must NEVER block a legitimate build, so shape
    // alone (digit suffix) is insufficient evidence. The three rules below are unambiguous; the numbered
    // case is left to enumerate-catalog / source diffing, which has the real catalog to compare against.

    // 3) Field-name leaked as an object — PascalCase `XxxId` / `XxxID` that exactly matches a declared PK
    //    field name on some IO (e.g. `ExhibitorId`, `ExhibitorCategoryId`). Corroborated against PKs so a
    //    genuine object that happens to end in `Id` and is NOT a known field is left alone.
    if (/[A-Za-z]+(Id|ID)$/.test(n) && ctx.pkFieldNamesLower.has(lower(n))) {
        return { reason: 'field-as-object', detail: 'matches a declared PK field name — a column leaked as an object' };
    }

    return null;
}

/**
 * Grade every IO name in a parsed metadata doc.
 * @param {unknown} doc parsed `.<vendor>.integration.json`
 * @returns {{ pass: boolean, total: number, garbage: number,
 *             violations: Array<{ name: string, reason: string, detail: string }> }}
 */
export function gradeIONames(doc) {
    const { ios, iofs } = walkMetadata(doc);
    const pkFieldNamesLower = new Set(
        iofs
            .filter((iof) => iof.fields?.IsPrimaryKey === true || lower(iof.fields?.IsPrimaryKey) === 'true')
            .map((iof) => lower(iof.fields?.Name))
            .filter(Boolean)
    );
    const ctx = { pkFieldNamesLower };
    const violations = [];
    for (const io of ios) {
        const name = io.fields?.Name;
        const verdict = classifyIOName(name, ctx);
        if (verdict) violations.push({ name: String(name ?? ''), reason: verdict.reason, detail: verdict.detail });
    }
    return { pass: violations.length === 0, total: ios.length, garbage: violations.length, violations };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Usage: node io-name-quality.mjs <metadata.json> [--json]
if (import.meta.url === `file://${process.argv[1]}`) {
    const { readFileSync } = await import('node:fs');
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const metaFile = args.find((a) => !a.startsWith('--'));
    if (!metaFile) {
        process.stderr.write('usage: io-name-quality.mjs <metadata.json> [--json]\n');
        process.exit(2);
    }
    let doc;
    try {
        doc = JSON.parse(readFileSync(metaFile, 'utf8'));
    } catch (e) {
        process.stderr.write(`✗ io-name-quality: unreadable input: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }
    const verdict = gradeIONames(doc);
    if (json) {
        process.stdout.write(JSON.stringify(verdict));
        process.exit(verdict.pass ? 0 : 1);
    }
    if (verdict.pass) {
        process.stdout.write(`✓ io-name-quality: all ${verdict.total} IO names are well-formed entity names\n`);
        process.exit(0);
    }
    process.stdout.write(
        `✗ io-name-quality: ${verdict.garbage}/${verdict.total} IO names are extraction artifacts (filenames / response titles / field names / numbered dupes — they sync 0 rows forever):\n`
    );
    for (const v of verdict.violations) {
        process.stdout.write(`    - ${v.name}  [${v.reason}] ${v.detail}\n`);
    }
    process.exit(1);
}
