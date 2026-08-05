#!/usr/bin/env node
/**
 * PG Migration Parity Check
 *
 * Verifies that every T-SQL V-migration in migrations/v5/ has a committed PG
 * counterpart in migrations-pg/v5/ (either .pg.sql or .pg-only.sql).
 *
 * Previously lived in packages/SQLConverter/src/__tests__/pg-migration-regression.test.ts
 * as the `'should have a PG counterpart for every T-SQL V-migration'` test.
 * Moved out of the unit test suite because turbo runs tests in dependency order
 * and stops on first failure — a parity gap (which happens any time a T-SQL
 * migration is added before pg-migrate runs) was masking every downstream
 * package's test failures.
 *
 * Intended usage:
 *   - The `pg-migrate` skill should run this at the end of Phase 1 and again
 *     after Phase 5 to confirm parity before declaring the run complete.
 *   - `.github/workflows/pg-migrations.yml` runs this as a gate.
 *   - Local developers can run it manually before opening a migration PR.
 *
 * This script existed and was correct for months while four 6.x-era migrations
 * shipped without counterparts, because nothing ever RAN it — pg-migrations.yml
 * asserted in a comment that "the actual coverage gate is the parity test"
 * while running only the content check, which by construction cannot see a
 * counterpart that is absent. It is now wired in, with the four known gaps on
 * the PENDING_CONVERSION ratchet below (issue #3471).
 *
 * Exit codes:
 *   0  parity holds (possibly with known-pending warnings)
 *   1  an UNTRACKED T-SQL file lacks a PG counterpart, or a PENDING_CONVERSION
 *      entry is stale (its counterpart now exists, or its migration is gone)
 *   2  required directories missing
 */
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
// Version folders under active parity enforcement. v2-v4 predate the PG port
// entirely (no counterparts exist by design), so enforcement starts at v5 and
// covers every later major automatically as its folder appears.
const ENFORCED_VERSION_DIRS = ['v5', 'v6'];

/**
 * Intentionally-removed pre-baseline files. These T-SQL migrations exist
 * upstream for SQL Server but have no PG counterpart by design — they were
 * pre-baseline upgrades that the v5.0 PG baseline already incorporates, so
 * shipping a PG version would re-apply the same DDL on top of the baseline.
 */
const INTENTIONALLY_NO_PG_COUNTERPART = new Set([
    'V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix',
    'V202602141421__v5.0.x__Add_AllowMultipleSubtypes_to_Entity',
]);

/**
 * Known gaps awaiting conversion — a RATCHET, not an amnesty.
 *
 * Distinct from INTENTIONALLY_NO_PG_COUNTERPART above, which is permanent and
 * by design. Everything here is DEBT: a migration that genuinely needs a PG
 * counterpart and does not have one yet. PostgreSQL deployments are missing it
 * until someone runs the conversion.
 *
 * The list may only ever SHRINK. Adding an entry is a deliberate act, visible
 * in a PR diff, and needs a tracking issue — it is never the way to make this
 * check pass. Generate the counterpart instead.
 *
 * Entries are self-cleaning: once a counterpart exists, the entry becomes stale
 * and this script FAILS until it is removed, so the list cannot silently rot
 * into a permanent exemption.
 */
const PENDING_CONVERSION = new Map([
    ['V202608041347__v6.1.x__CodeGen_Introspection_View_Perf', '#3471'],
    ['V202608042200__v6.1.x__EntityAction_Workflow_Extensions', '#3471'],
    ['V202608050100__v6.1.x__Add_Entity_GeneratedBaseViewName', '#3471'],
    ['V202608050105__v6.1.x__Layered_Base_Views_Pilot', '#3471'],
]);

function readDirOrExit(path, label) {
    try {
        return readdirSync(path);
    } catch (err) {
        console.error(`ERROR: cannot read ${label} (${path}): ${err.message}`);
        process.exit(2);
    }
}

/**
 * Scan the enforced version folders.
 *
 * Returns the era folder each T-SQL migration lives in (`ssDirByBase`), because
 * counterparts are paired PER FOLDER and the filename alone does not tell you
 * which — a migration named `v6.1.x` can legitimately sit in `migrations/v5/`.
 * Guessing the folder is how the old error message told people to commit v6
 * counterparts into `migrations-pg/v5/`.
 */
function collectMigrations() {
    const ssDirByBase = new Map();
    const pgBases = new Set();

    for (const v of ENFORCED_VERSION_DIRS) {
        const ssDir = join(REPO_ROOT, 'migrations', v);
        const pgDir = join(REPO_ROOT, 'migrations-pg', v);
        // A version folder that doesn't exist yet on either side is simply not open;
        // a folder open on the SS side MUST exist on the PG side (readDirOrExit exits 2).
        let ssEntries;
        try {
            ssEntries = readdirSync(ssDir);
        } catch {
            continue; // version not opened yet
        }
        for (const f of ssEntries.filter(f => f.startsWith('V') && f.endsWith('.sql'))) {
            ssDirByBase.set(f.replace(/\.sql$/, ''), v);
        }
        for (const f of readDirOrExit(pgDir, `PG migrations dir (${v})`).filter(f => f.startsWith('V'))) {
            pgBases.add(f.replace(/\.pg\.sql$/, '').replace(/\.pg-only\.sql$/, ''));
        }
    }

    return { ssDirByBase, pgBases };
}

/** PENDING_CONVERSION entries that no longer describe a real gap. */
function findStalePendingEntries(ssDirByBase, pgBases) {
    const stale = [];
    for (const base of PENDING_CONVERSION.keys()) {
        if (pgBases.has(base)) {
            stale.push(`${base} — counterpart now exists; remove it from PENDING_CONVERSION`);
            continue;
        }
        if (!ssDirByBase.has(base)) {
            stale.push(`${base} — no such T-SQL migration; remove it from PENDING_CONVERSION`);
        }
    }
    return stale;
}

const { ssDirByBase, pgBases } = collectMigrations();
const allBases = [...ssDirByBase.keys()].sort();

const missing = allBases
    .filter(base => !pgBases.has(base))
    .filter(base => !INTENTIONALLY_NO_PG_COUNTERPART.has(base));

const untracked = missing.filter(base => !PENDING_CONVERSION.has(base));
const pending = missing.filter(base => PENDING_CONVERSION.has(base));
const stale = findStalePendingEntries(ssDirByBase, pgBases);

// Known debt is reported on every run, pass or fail — a gap nobody sees is a
// gap nobody fixes.
for (const base of pending) {
    console.warn(`KNOWN GAP  ${base} (${PENDING_CONVERSION.get(base)}) — PG deployments are missing this migration`);
}

if (stale.length > 0) {
    console.error(`\nPG parity FAILED — ${stale.length} stale PENDING_CONVERSION entr${stale.length === 1 ? 'y' : 'ies'}:`);
    for (const s of stale) console.error(`  ${s}`);
    console.error('\nThe ratchet only turns one way: once a gap is closed, its entry must go.');
    process.exit(1);
}

if (untracked.length > 0) {
    console.error(`\nPG parity FAILED — ${untracked.length} T-SQL migration${untracked.length === 1 ? '' : 's'} without a PG counterpart:`);
    for (const base of untracked) {
        console.error(`  ${base}\n      → needs migrations-pg/${ssDirByBase.get(base)}/${base}.pg.sql`);
    }
    console.error('\nRun the `/pg-migrate-v2` skill to generate the missing counterpart(s) and commit them.');
    console.error('Do NOT add them to PENDING_CONVERSION to make this pass — that list is for tracked debt, not new gaps.');
    process.exit(1);
}

const covered = allBases.length - missing.length;
console.log(`PG parity OK — ${covered}/${allBases.length} T-SQL V-migrations have PG counterparts (or are documented exclusions).`);
if (pending.length > 0) {
    console.log(`${pending.length} known gap(s) still outstanding — see above.`);
}
process.exit(0);
