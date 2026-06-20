/**
 * Deterministic gate: an IOF `RelatedIntegrationObjectID` `@lookup` must qualify its sibling-object
 * lookup with the INTEGRATION's id — i.e. `&IntegrationID=@parent:IntegrationID`.
 *
 * Why this is a hard gate (the recurring authoring defect this catches):
 *   A metadata file nests Integration Object Fields (IOFs) UNDER their Integration Object (IO), which is
 *   nested under the Integration. So for an IOF, `@parent` is its IO. The IO carries BOTH `ID` (the IO's
 *   own id) and `IntegrationID` (the FK to the Integration). The FK lookup needs to find a SIBLING IO by
 *   name *within the same Integration*, so its `&IntegrationID=` qualifier must resolve to the INTEGRATION's
 *   id — which on the IOF is reached as `@parent:IntegrationID` (the IO's IntegrationID field).
 *
 *   The defect: writing `&IntegrationID=@parent:ID`. That resolves to the IO's OWN id, matches no sibling
 *   object, and `mj sync push` rolls the entire transaction back on a "Lookup failed" — the exact failure
 *   that blocked the iMIS / GrowthZone connectors from deploying. `@parent:ID` is a *valid* keyword in other
 *   contexts (the IOF's own `IntegrationObjectID:@parent:ID` and the IO's own `IntegrationID:@parent:ID` are
 *   both correct parent refs), so it is NOT malformed — it is silently wrong only here, which is why a
 *   generic mj-sync validator can't catch it and this integration-specific floor check must.
 *
 * Pure: a parsed metadata record (or array of records) in → `[{integration, io, iof, value}]` out. No I/O.
 * The CLI at the bottom is the CI / standalone gate (`--all` scans the whole metadata tree); the workshop
 * floor-check runs this same script as a subprocess over one metadata file (mirroring enumerate-catalog.mjs).
 */

const CORRECT_FORM = '@parent:IntegrationID';
const BAD_VALUE = '@parent:ID';

/**
 * Is this `RelatedIntegrationObjectID` value an `@lookup` whose `IntegrationID` qualifier is the wrong
 * `@parent:ID` (instead of `@parent:IntegrationID`)? Parses the qualifier params exactly — substring
 * matching would false-flag the correct `@parent:IntegrationID` (no false positives, no false negatives).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBadFkQualifier(value) {
    if (typeof value !== 'string') return false;
    if (!value.includes('@lookup')) return false; // soft-FK (Configuration.ReferencedType, no @lookup) is fine
    for (const part of value.split('&')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const key = part.slice(0, eq).trim();
        const val = part.slice(eq + 1).trim();
        if (key === 'IntegrationID' && val === BAD_VALUE) return true;
    }
    return false;
}

function iosOf(rec) {
    const re = (rec && rec.relatedEntities) || {};
    return re['MJ: Integration Objects'] || re['Integration Objects'] || [];
}

function iofsOf(io) {
    const re = (io && io.relatedEntities) || {};
    return re['MJ: Integration Object Fields'] || re['Integration Object Fields'] || [];
}

/**
 * Walk a parsed metadata record (array or object) and collect every IOF whose `RelatedIntegrationObjectID`
 * `@lookup` uses the wrong `&IntegrationID=@parent:ID` qualifier.
 *
 * @param {unknown} metadata  parsed `.integration.json` content (array of records or a single record)
 * @returns {Array<{integration: string|undefined, io: string, iof: string, value: string}>}
 */
export function findBadFkQualifiers(metadata) {
    const records = Array.isArray(metadata) ? metadata : [metadata];
    const violations = [];
    for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;
        const integration = (rec.fields && rec.fields.Name) || undefined;
        for (const io of iosOf(rec)) {
            const ioName = (io && io.fields && io.fields.Name) || '?';
            for (const iof of iofsOf(io)) {
                const value = iof && iof.fields ? iof.fields.RelatedIntegrationObjectID : undefined;
                if (isBadFkQualifier(value)) {
                    violations.push({
                        integration,
                        io: ioName,
                        iof: (iof.fields && iof.fields.Name) || '?',
                        value,
                    });
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
    return { file, violations: findBadFkQualifiers(parsed).map((v) => ({ ...v, file })) };
}

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const all = args.includes('--all');
    const positional = args.filter((a) => !a.startsWith('--'));

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(__dirname, '..', '..', '..', '..'); // floor → workshop → Integration → packages → repo

    let files;
    if (all) {
        const root = positional[0] ? resolve(positional[0]) : join(repoRoot, 'metadata', 'integrations');
        files = walkIntegrationFiles(root);
    } else if (positional.length > 0) {
        files = positional.map((p) => resolve(p));
    } else {
        process.stderr.write('usage: node fk-lookup-qualifier.mjs <metadata-file...> [--json]\n       node fk-lookup-qualifier.mjs --all [<metadata/integrations root>] [--json]\n');
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
            correctForm: CORRECT_FORM,
        }));
        process.exit(0);
    }

    // Human / CI output. Exit 1 on any violation so CI fails loudly.
    if (violations.length === 0) {
        process.stdout.write(`✓ fk-lookup-qualifier: ${files.length} file(s) clean — every IOF RelatedIntegrationObjectID @lookup uses &IntegrationID=${CORRECT_FORM}\n`);
        if (readErrors.length > 0) {
            process.stdout.write(`  (note: ${readErrors.length} file(s) could not be parsed; not scanned)\n`);
            for (const r of readErrors) process.stdout.write(`    - ${r.file}: ${r.error}\n`);
        }
        process.exit(0);
    }
    process.stdout.write(`✗ fk-lookup-qualifier: ${violations.length} violation(s) — IOF RelatedIntegrationObjectID @lookup uses &IntegrationID=${BAD_VALUE} (resolves to the IntegrationObject's own id, matches no sibling → mj sync push ROLLS BACK). Change each to &IntegrationID=${CORRECT_FORM}:\n`);
    for (const v of violations) {
        process.stdout.write(`    - ${v.integration ? v.integration + ' / ' : ''}${v.io}.${v.iof}  (${v.file})\n        ${v.value}\n`);
    }
    process.exit(1);
}
