/**
 * Deterministic gate: the capability ↔ per-operation-column BIJECTION on every Integration Object.
 *
 * Why this is a hard gate (the recurring authoring defect this catches):
 *   The generic CRUD path on `BaseRESTIntegrationConnector` (v5.39.x) reads the per-operation IO columns at
 *   runtime — `CreateAPIPath`/`CreateMethod`/`CreateBodyShape`/`CreateIDLocation` for create, the `Update*`
 *   quartet for update, `DeleteAPIPath`/`DeleteMethod` for delete, and `IncrementalWatermarkField` for
 *   incremental sync. If an IO declares the CAPABILITY flag (`SupportsCreate=true`) but leaves any of its
 *   columns null/empty, the generic path THROWS at the first write of that verb (e.g. "CreateRecord not
 *   supported ... CreateAPIPath / CreateMethod not configured"). So a capability flag set `true` while its
 *   columns are blank is a latent runtime crash, not a documentation gap.
 *
 *   The rule is a bijection: capability flag set ⟺ its required column set fully populated. This gate checks
 *   the forward direction (flag set ⇒ columns present); the inverse (column set ⇒ generic path usable) holds
 *   by construction in the base class.
 *
 *   Delete is special: it has NO body shape/key — only `DeleteAPIPath` + `DeleteMethod` (the verb is metadata-
 *   driven, NOT assumed `DELETE`, since some vendors soft-delete via POST/PUT). Incremental sync requires only
 *   the single `IncrementalWatermarkField`.
 *
 * Pure: a parsed metadata record (or array of records) in → `[{io, capability, missing:[...]}]` out. No I/O.
 * The CLI at the bottom is the CI / standalone gate (`--all` scans the whole metadata tree); the workshop
 * floor-check runs this same script as a subprocess over one metadata file (mirroring fk-lookup-qualifier.mjs).
 */

/**
 * The required per-operation columns for each capability flag. A flag set to `true` requires EVERY listed
 * column to be non-empty. Delete deliberately has no body fields; incremental sync needs only the watermark.
 */
const CAPABILITY_REQUIREMENTS = {
    SupportsCreate: ['CreateAPIPath', 'CreateMethod', 'CreateBodyShape', 'CreateIDLocation'],
    SupportsUpdate: ['UpdateAPIPath', 'UpdateMethod', 'UpdateBodyShape', 'UpdateIDLocation'],
    SupportsDelete: ['DeleteAPIPath', 'DeleteMethod'],
    SupportsIncrementalSync: ['IncrementalWatermarkField'],
};

/**
 * A required column value is "missing" when it is null, undefined, an empty string, or whitespace-only.
 * (A non-string truthy value — should one ever appear — is treated as present.)
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMissingValue(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    return false;
}

function iosOf(rec) {
    const re = (rec && rec.relatedEntities) || {};
    return re['MJ: Integration Objects'] || re['Integration Objects'] || [];
}

/**
 * Walk a parsed metadata record (array or object) and collect every IO that declares a capability flag
 * (`SupportsCreate` / `SupportsUpdate` / `SupportsDelete` / `SupportsIncrementalSync` === true) while any of
 * that capability's required per-operation columns are missing.
 *
 * @param {unknown} metadata  parsed `.integration.json` content (array of records or a single record)
 * @returns {Array<{integration: string|undefined, io: string, capability: string, missing: string[]}>}
 */
export function findBijectionViolations(metadata) {
    const records = Array.isArray(metadata) ? metadata : [metadata];
    const violations = [];
    for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;
        const integration = (rec.fields && rec.fields.Name) || undefined;
        for (const io of iosOf(rec)) {
            const fields = (io && io.fields) || {};
            const ioName = fields.Name || '?';
            for (const [capability, requiredColumns] of Object.entries(CAPABILITY_REQUIREMENTS)) {
                if (fields[capability] !== true) continue; // capability not declared → no requirement
                const missing = requiredColumns.filter((col) => isMissingValue(fields[col]));
                if (missing.length > 0) {
                    violations.push({ integration, io: ioName, capability, missing });
                }
            }
        }
    }
    return violations;
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const isMain = (() => {
    try {
        return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();

function walkIntegrationFiles(root) {
    const out = [];
    let entries;
    try {
        entries = readdirSync(root);
    } catch {
        return out;
    }
    for (const name of entries) {
        if (name === '.backups' || name === 'node_modules') continue;
        const full = join(root, name);
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) {
            out.push(...walkIntegrationFiles(full));
        } else if (name.endsWith('.integration.json') && !name.endsWith('.bak')) {
            out.push(full);
        }
    }
    return out;
}

function scanFile(file) {
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
        return { file, error: `unreadable/invalid JSON: ${String(e && e.message ? e.message : e)}`, violations: [] };
    }
    return { file, violations: findBijectionViolations(parsed).map((v) => ({ ...v, file })) };
}

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const all = args.includes('--all');
    const positional = args.filter((a) => !a.startsWith('--'));

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..'); // graders → floor → workshop → Integration → packages → repo

    let files;
    if (all) {
        const root = positional[0] ? resolve(positional[0]) : join(repoRoot, 'metadata', 'integrations');
        files = walkIntegrationFiles(root);
    } else if (positional.length > 0) {
        files = positional.map((p) => resolve(p));
    } else {
        process.stderr.write('usage: node bijection.mjs <metadata-file...> [--json]\n       node bijection.mjs --all [<metadata/integrations root>] [--json]\n');
        process.exit(2);
    }

    const results = files.map(scanFile);
    const violations = results.flatMap((r) => r.violations);
    const readErrors = results.filter((r) => r.error);

    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify({
            scanned: files,
            violations,
            count: violations.length,
            clean: violations.length === 0,
            readErrors: readErrors.map((r) => ({ file: r.file, error: r.error })),
        }));
        process.exit(0);
    }

    // Human / CI output. Exit 1 on any violation so CI fails loudly.
    if (violations.length === 0) {
        process.stdout.write(`✓ bijection: ${files.length} file(s) clean — every declared capability has its required per-operation columns populated\n`);
        if (readErrors.length > 0) {
            process.stdout.write(`  (note: ${readErrors.length} file(s) could not be parsed; not scanned)\n`);
            for (const r of readErrors) process.stdout.write(`    - ${r.file}: ${r.error}\n`);
        }
        process.exit(0);
    }
    process.stdout.write(`✗ bijection: ${violations.length} violation(s) — an IO declares a capability flag while its required per-operation column(s) are blank (the generic CRUD path will THROW at runtime). Populate the missing column(s) OR set the capability flag false:\n`);
    for (const v of violations) {
        process.stdout.write(`    - ${v.integration ? v.integration + ' / ' : ''}${v.io}  [${v.capability}]  missing: ${v.missing.join(', ')}  (${v.file})\n`);
    }
    process.exit(1);
}
