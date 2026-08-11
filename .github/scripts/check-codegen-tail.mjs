/**
 * CodeGen-tail drift guard (issue #3737).
 *
 * A migration that introduces a core-schema table has a *tail*: CodeGen writes the
 * matching artifacts into several packages at once — the entity subclass, the GraphQL
 * resolver set, the Explorer form component. Committing the migration without the tail
 * (or committing only part of it) leaves the repo in a state where committed generated
 * code no longer matches committed migrations. Nothing breaks loudly: the runtime falls
 * back to `BaseEntity`. What it does instead is turn every downstream clean-environment
 * CodeGen run into a diff, so real drift becomes indistinguishable from noise — which is
 * exactly how #3737 was reported (a provisioning tripwire, days after the fact).
 *
 * This guard is DB-free by design. It compares files the repo already ships, so it runs
 * in seconds on a PR instead of requiring a SQL Server, a migrate, and a CodeGen pass.
 *
 * Two independent checks:
 *
 *   1. ARTIFACT PARITY (always full-repo). CodeGen emits the same entity set into three
 *      generated files. They must agree exactly. A mismatch means a PARTIAL tail — the
 *      most common real-world shape, because it survives a build and a test run.
 *
 *   2. MIGRATION → SUBCLASS (changed migrations by default, `--all` to sweep history).
 *      Every core-schema table a migration creates and does not drop must appear as a
 *      `Base Table:` in the generated subclasses. This catches the tail being skipped
 *      ENTIRELY, which check 1 cannot see (a wholly-absent entity is absent consistently).
 *
 * SCOPE (by design): check 2 keys on `CREATE TABLE`, not on `__mj.Entity` metadata rows,
 * because CodeGen — not the migration — is what writes those rows for a new table. That
 * means a migration which only *renames* or *re-points* an existing entity is out of
 * scope here; the parity check still covers the artifacts it touches.
 */

import { readFileSync, existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Generated artifacts CodeGen keeps in lockstep, relative to the repo root. */
export const ARTIFACTS = {
    subclasses: 'packages/MJCoreEntities/src/generated/entity_subclasses.ts',
    server: 'packages/MJServer/src/generated/generated.ts',
    forms: 'packages/Angular/Explorer/core-entity-forms/src/lib/generated/generated-forms.module.ts',
};

/**
 * Core-schema tables that exist without a generated entity, and always will.
 *
 * `SystemEvent` (v2.0) predates the entity system and was never registered in
 * `__mj.Entity`; CodeGen has therefore never generated a subclass for it. It is the only
 * such table in the entire migration history (386 CREATEs at the time of writing), so an
 * allowlist is cheaper and more honest than weakening the check. Adding an entry here is
 * a deliberate statement that the table is not, and will not become, an entity.
 */
export const NON_ENTITY_TABLES = new Set(['systemevent']);

/** `export class MJFooEntity extends BaseEntity` — the generated subclass roster. */
export function extractSubclassEntities(source) {
    return new Set([...source.matchAll(/^export class (\w+Entity) extends BaseEntity/gm)].map((m) => m[1]));
}

/**
 * The entity classes MJServer's generated resolvers import from `@memberjunction/core-entities`.
 * CodeGen emits this as a single import statement listing every entity it generated a
 * resolver for, so the import list IS the roster.
 */
export function extractServerEntities(source) {
    const match = source.match(/import \{([^}]+)\} from '@memberjunction\/core-entities';/);
    if (!match) return null;
    return new Set(
        match[1]
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.endsWith('Entity'))
    );
}

/**
 * The Explorer form components, mapped back to their entity class names.
 * `MJAIModelPriceUnitTypeFormComponent` -> `MJAIModelPriceUnitTypeEntity`. Only imports
 * from `./Entities/` count — those are the per-entity generated forms, as opposed to the
 * section/detail components that live elsewhere in the same module.
 */
export function extractFormEntities(source) {
    return new Set(
        [...source.matchAll(/import \{\s*(\w+)FormComponent\s*\} from ["']\.\/Entities\//g)].map((m) => `${m[1]}Entity`)
    );
}

/** `* * Base Table: AIModelPriceUnitType` from each subclass docblock, lowercased for matching. */
export function extractGeneratedBaseTables(source) {
    return new Set([...source.matchAll(/^\s*\*\s*\*\s*Base Table:\s*(\w+)\s*$/gm)].map((m) => m[1].toLowerCase()));
}

const CREATE_TABLE_RE = /CREATE\s+TABLE\s+\[?(?:\$\{flyway:defaultSchema\}|__mj)\]?\.\[?(\w+)\]?/gi;
const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?\[?(?:\$\{flyway:defaultSchema\}|__mj)\]?\.\[?(\w+)\]?/gi;

/**
 * Collect the core-schema tables a set of migration sources creates and drops.
 * Drops are tracked globally: a table created in v5 and retired in v6 (the legacy
 * Workflow/Report/ScheduledAction cluster) must not be reported as missing a subclass.
 */
export function scanMigrations(files, readFile) {
    const created = new Map();
    const dropped = new Set();
    for (const file of files) {
        const source = readFile(file);
        for (const m of source.matchAll(CREATE_TABLE_RE)) {
            const table = m[1].toLowerCase();
            if (!created.has(table)) created.set(table, file);
        }
        for (const m of source.matchAll(DROP_TABLE_RE)) dropped.add(m[1].toLowerCase());
    }
    return { created, dropped };
}

/** Tables that were created, never dropped, are not allowlisted, and have no generated subclass. */
export function findMissingSubclasses({ created, dropped }, baseTables) {
    const missing = [];
    for (const [table, file] of created) {
        if (dropped.has(table) || NON_ENTITY_TABLES.has(table) || baseTables.has(table)) continue;
        missing.push({ table, file });
    }
    return missing;
}

/** Every `.sql` under a directory tree, sorted for stable output. */
function collectSqlFiles(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...collectSqlFiles(full));
        else if (name.endsWith('.sql')) out.push(full);
    }
    return out.sort();
}

/**
 * Migration files changed relative to `baseRef`. Returns null when the base ref is not
 * resolvable (shallow clone, detached CI checkout) so the caller can fall back to a full
 * sweep rather than silently checking nothing.
 */
function changedMigrations(baseRef, rootDir) {
    try {
        const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`], {
            cwd: rootDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return out
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.startsWith('migrations/') && l.endsWith('.sql'))
            .filter((l) => existsSync(join(rootDir, l)));
    } catch {
        return null;
    }
}

/** Sorted set difference, for readable failure output. */
function diff(a, b) {
    return [...a].filter((x) => !b.has(x)).sort();
}

async function main() {
    const argv = process.argv.slice(2);
    const all = argv.includes('--all');
    const baseArg = argv.find((a) => a.startsWith('--base='));
    const baseRef = baseArg ? baseArg.slice('--base='.length) : 'origin/next';
    const rootDir = resolve(argv.find((a) => !a.startsWith('--')) ?? '.');

    const read = (rel) => readFileSync(resolve(rootDir, rel), 'utf8');

    for (const [name, rel] of Object.entries(ARTIFACTS)) {
        if (!existsSync(resolve(rootDir, rel))) {
            console.error(`codegen-tail: cannot find the ${name} artifact at ${rel} — run from the repo root.`);
            process.exit(2);
        }
    }

    const subclassSource = read(ARTIFACTS.subclasses);
    const entities = extractSubclassEntities(subclassSource);
    const serverEntities = extractServerEntities(read(ARTIFACTS.server));
    const formEntities = extractFormEntities(read(ARTIFACTS.forms));

    if (serverEntities === null) {
        console.error(
            `codegen-tail: could not find the core-entities import in ${ARTIFACTS.server} — CodeGen's output shape changed and this guard needs updating.`
        );
        process.exit(2);
    }

    const failures = [];

    const parityPairs = [
        ['MJServer resolvers', serverEntities],
        ['Explorer forms', formEntities],
    ];
    for (const [label, other] of parityPairs) {
        const missingThere = diff(entities, other);
        const missingHere = diff(other, entities);
        for (const e of missingThere) failures.push(`${e}: has a generated subclass, but no ${label} entry`);
        for (const e of missingHere) failures.push(`${e}: has a ${label} entry, but no generated subclass`);
    }

    // Check 2 — migrations. Default to the PR's own migrations; --all sweeps history.
    let migrationFiles;
    let scanLabel;
    if (all) {
        migrationFiles = collectSqlFiles(join(rootDir, 'migrations')).map((f) => f.slice(rootDir.length + 1));
        scanLabel = `all ${migrationFiles.length} migration(s)`;
    } else {
        const changed = changedMigrations(baseRef, rootDir);
        if (changed === null) {
            migrationFiles = collectSqlFiles(join(rootDir, 'migrations')).map((f) => f.slice(rootDir.length + 1));
            scanLabel = `all ${migrationFiles.length} migration(s) (base ref "${baseRef}" unresolvable — fell back to a full sweep)`;
        } else {
            migrationFiles = changed;
            scanLabel = `${changed.length} migration(s) changed vs ${baseRef}`;
        }
    }

    // A drop can live in a migration the PR did not touch, so drops always come from the
    // full history. Only the CREATEs are scoped to the files under review.
    const scoped = scanMigrations(migrationFiles, read);
    const history = scanMigrations(
        collectSqlFiles(join(rootDir, 'migrations')).map((f) => f.slice(rootDir.length + 1)),
        read
    );
    const missing = findMissingSubclasses({ created: scoped.created, dropped: history.dropped }, extractGeneratedBaseTables(subclassSource));
    for (const { table, file } of missing) {
        failures.push(`${table}: created by ${file}, but no generated entity subclass ships for it`);
    }

    console.log(`codegen-tail: ${entities.size} entities across ${Object.keys(ARTIFACTS).length} generated artifacts; scanned ${scanLabel}`);

    if (failures.length > 0) {
        console.error(`\ncodegen-tail: FAIL — ${failures.length} drift(s) between committed migrations and committed generated code`);
        for (const f of failures) console.error(`  ✖ ${f}`);
        console.error(
            '\nThe fix is to run CodeGen and commit its output alongside the migration:\n' +
                '  mj sync push --dir=metadata --ci && mj codegen\n' +
                'See issue #3737 and .claude/skills/bootstrap-clean-db for the full ordering.'
        );
        process.exit(1);
    }
    console.log('codegen-tail: OK — committed generated code matches committed migrations');
}

// Run the sweep only when invoked directly as a CLI (not when imported by tests).
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    await main();
}
