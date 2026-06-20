/**
 * Deterministic env-sanity precheck: catch the "the environment is corrupted but the agent invents a
 * framework-bug theory" failure by making sanity a CHECKED FACT, not a guess.
 *
 * Three signatures repeatedly cause silent connector-build failures that get mis-diagnosed as bugs in
 * the connector / framework:
 *
 *   1. STALE SPROC / BASELINE DRIFT — a fresh DB whose CodeGen sprocs were generated against a different
 *      column set. The sproc's parameter count no longer matches the table's column count, so an
 *      `mj sync push` (or any CRUD) silently writes the wrong columns / rolls back. The tell is purely
 *      structural: `sprocParamCount !== columnCount` for an entity. (project_orcid_connector_build,
 *      project_pg_v538_baseline_build_slip — "MetadataSource stale sprocs → codegen before sync-push".)
 *   2. MANIFEST NOT LOADED — the class-registration manifest failed to load, so `@RegisterClass` classes
 *      get tree-shaken out and the connector's driver class can't be resolved at runtime.
 *   3. STALE / MISSING DIST — a `@memberjunction/*` package whose `dist/` is older than its `src/`
 *      (or absent), so the running code is NOT the code on disk. Re-running against stale dist makes a
 *      fixed bug "still reproduce" (the classic false-red).
 *
 * Pure: every check takes PROVIDED facts (no live DB, no fs) → returns a list of violations, so the
 * logic unit-tests deterministically. The CLI at the bottom is a thin wrapper that loads a facts JSON
 * from argv and prints the verdict (exit 1 if not ok), mirroring floor/fk-lookup-qualifier.mjs.
 */

/**
 * @typedef {Object} EntityFact
 * @property {string} name              entity / table name
 * @property {number} sprocParamCount   number of parameters the spCreate/spUpdate sproc declares
 * @property {number} columnCount       number of columns the table actually has
 */

/**
 * @typedef {Object} DistFact
 * @property {string} package           package name (e.g. "@memberjunction/integration-engine")
 * @property {number} srcMtime          most-recent src mtime (ms epoch)
 * @property {number} distMtime         most-recent dist mtime (ms epoch)
 * @property {boolean} distExists       whether the dist build output exists at all
 */

/**
 * @typedef {Object} ManifestResult
 * @property {boolean} loaded           whether the class-registration manifest loaded successfully
 * @property {string} [error]           failure detail when not loaded
 */

/**
 * Sproc parameter count must equal the table's column count. A mismatch is the stale-sproc / baseline-drift
 * signature that silently breaks pushes. Pure over provided facts — no DB.
 *
 * @param {EntityFact[]} entities
 * @returns {Array<{entity: string, sprocParamCount: number, columnCount: number}>} one per mismatched entity
 */
export function checkSprocParamVsColumns(entities) {
    if (!Array.isArray(entities)) return [];
    const out = [];
    for (const e of entities) {
        if (!e || typeof e !== 'object') continue;
        const sprocParamCount = Number(e.sprocParamCount);
        const columnCount = Number(e.columnCount);
        if (sprocParamCount !== columnCount) {
            out.push({ entity: e.name, sprocParamCount, columnCount });
        }
    }
    return out;
}

/**
 * The class-registration manifest must load. If it didn't, the connector's `@RegisterClass` driver gets
 * tree-shaken out and is unresolvable at runtime.
 *
 * @param {ManifestResult} manifestResult
 * @returns {Array<{loaded: false, error: string}>} a single-element array when not loaded, else empty
 */
export function checkManifestLoads(manifestResult) {
    if (manifestResult && manifestResult.loaded) return [];
    const error = (manifestResult && manifestResult.error) || 'manifest did not load';
    return [{ loaded: false, error }];
}

/**
 * Every package's dist must exist AND be at least as new as its src. A missing or stale dist means the
 * running code is not the code on disk — the classic "fixed bug still reproduces" false-red.
 *
 * @param {DistFact[]} distFacts
 * @returns {Array<{package: string, reason: 'missing'|'stale', srcMtime: number, distMtime: number}>}
 */
export function checkDistBuilt(distFacts) {
    if (!Array.isArray(distFacts)) return [];
    const out = [];
    for (const d of distFacts) {
        if (!d || typeof d !== 'object') continue;
        if (!d.distExists) {
            out.push({ package: d.package, reason: 'missing', srcMtime: Number(d.srcMtime), distMtime: Number(d.distMtime) });
        } else if (Number(d.srcMtime) > Number(d.distMtime)) {
            out.push({ package: d.package, reason: 'stale', srcMtime: Number(d.srcMtime), distMtime: Number(d.distMtime) });
        }
    }
    return out;
}

/**
 * Compose all three checks over a single facts bundle.
 *
 * @param {{entities?: EntityFact[], manifest?: ManifestResult, dist?: DistFact[]}} facts
 * @returns {{ok: boolean, failures: Array<{check: string, detail: object}>}}
 */
export function runDoctor(facts) {
    const f = facts && typeof facts === 'object' ? facts : {};
    const failures = [];

    for (const detail of checkSprocParamVsColumns(f.entities || [])) {
        failures.push({ check: 'sproc-param-vs-columns', detail });
    }
    for (const detail of checkManifestLoads(f.manifest || { loaded: false, error: 'no manifest facts provided' })) {
        failures.push({ check: 'manifest-loads', detail });
    }
    for (const detail of checkDistBuilt(f.dist || [])) {
        failures.push({ check: 'dist-built', detail });
    }

    return { ok: failures.length === 0, failures };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test). The POINT is the pure logic above;
// this is a wrapper that loads a facts JSON and prints the verdict.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isMain = (() => {
    try {
        return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const positional = args.filter((a) => !a.startsWith('--'));

    if (positional.length === 0) {
        process.stderr.write('usage: node env-doctor.mjs <facts.json> [--json]\n  facts.json = { "entities": [...], "manifest": {...}, "dist": [...] }\n');
        process.exit(2);
    }

    let facts;
    try {
        facts = JSON.parse(readFileSync(resolve(positional[0]), 'utf8'));
    } catch (e) {
        process.stderr.write(`env-doctor: unreadable/invalid facts JSON: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }

    const verdict = runDoctor(facts);

    if (json) {
        // Machine output for the floor-check consumer. Exit reflects ok so callers can also gate on the code.
        process.stdout.write(JSON.stringify({ ...verdict, factsFile: resolve(positional[0]) }));
        process.exit(verdict.ok ? 0 : 1);
    }

    if (verdict.ok) {
        process.stdout.write('✓ env-doctor: environment sane — sproc/column counts match, manifest loads, dist is built & current\n');
        process.exit(0);
    }

    process.stdout.write(`✗ env-doctor: ${verdict.failures.length} env-sanity failure(s) — the environment is corrupted (NOT a framework bug). Fix the env before diagnosing the connector:\n`);
    for (const fail of verdict.failures) {
        process.stdout.write(`    - [${fail.check}] ${JSON.stringify(fail.detail)}\n`);
    }
    process.exit(1);
}
