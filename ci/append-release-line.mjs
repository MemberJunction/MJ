#!/usr/bin/env node
/**
 * Appends a published release to release-lines.json's MECHANICAL fields.
 *
 * WHY THIS EXISTS
 * ---------------
 * plans/lts-process.md §4.1 states that publish workflows append `newest` and the
 * per-release `releases` ledger via direct push. That machinery was never built, so
 * the file drifted from the registry the moment anything shipped:
 *
 *   - `edge.newest` was still `null` after 6.1.0-edge.0 through edge.3 published.
 *   - 5.51.1 published 2026-08-19 and was recorded by hand a week later.
 *
 * Nothing reads the file yet, so nothing was visibly broken — but it is the declared
 * input for the CLI channel work (§15 item 7), and building that against a file no
 * one maintains ships a CLI that is wrong on day one.
 *
 * WHAT IT TOUCHES
 * ---------------
 * ONLY `edge.newest` / `edge.releases` and `lines.<X.Y>.newest` /
 * `lines.<X.Y>.releases`. Never `status`, `certifiedBuild`, or any date — those are
 * certification decisions, CODEOWNERS-gated to the certification owner, and moving
 * them is §8's whole point. assertOnlyMechanicalChange() enforces that here, and
 * ci/validate-release-lines.mjs --mode push enforces it again in CI.
 *
 * dbImpact
 * --------
 * Pass --db-impact to state it. Otherwise it is classified from the migrations in the
 * release range, by the regex tripwire §5.2 rule 4 describes:
 *
 *   no migration files changed          -> none
 *   migrations changed, no DDL keyword  -> metadata
 *   any DDL keyword                     -> schema
 *
 * The tripwire is not the gate, and it deliberately never emits `repair`. A
 * generated-object repair (§12) is DDL by regex and schema-neutral in substance;
 * only a human reading the diff can tell those apart, so this reports `schema` and
 * says so, leaving the operator to correct it. Dynamic SQL (EXEC, sp_rename,
 * string-built DDL) evades any regex — same caveat the process doc already carries.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Every value the schema's dbImpact enum accepts. */
export const DB_IMPACTS = ['none', 'metadata', 'repair', 'schema'];

/** Runaway guards. A release touching more than this many migrations is not a release. */
export const MAX_MIGRATION_FILES = 500;
export const MAX_MIGRATION_BYTES = 8 * 1024 * 1024;

const RX_EDGE = /^(\d+)\.(\d+)\.(\d+)-edge\.(\d+)$/;
const RX_LINE = /^(\d+)\.(\d+)\.(\d+)$/;
const RX_DDL = /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i;

/**
 * Which channel a version string belongs to, and for a line release, which line.
 * @param {string} version
 * @returns {{kind: 'edge'|'line', lineKey?: string}}
 */
export function classifyChannel(version) {
    if (typeof version !== 'string' || version.length === 0) throw new Error('version is required');
    if (RX_EDGE.test(version)) return { kind: 'edge' };
    const line = RX_LINE.exec(version);
    if (line) return { kind: 'line', lineKey: `${line[1]}.${line[2]}` };
    throw new Error(`version "${version}" is neither X.Y.Z nor X.Y.Z-edge.N`);
}

/**
 * Strip SQL comments so a keyword inside `-- drop this later` cannot trip the scan.
 * @param {string} sql
 */
export function stripSqlComments(sql) {
    return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * The §5.2 rule 4 tripwire. Pure: the caller supplies the file list and a reader.
 * @param {string[]} files migration paths changed in the release range
 * @param {(path: string) => string} readFile
 * @returns {{dbImpact: 'none'|'metadata'|'schema', evidence: string[]}}
 */
export function classifyDbImpact(files, readFile) {
    if (files.length === 0) return { dbImpact: 'none', evidence: [] };
    if (files.length > MAX_MIGRATION_FILES) {
        throw new Error(`${files.length} migration files in range, over the ${MAX_MIGRATION_FILES} cap — classify by hand with --db-impact`);
    }
    const evidence = [];
    for (const f of files) {
        const sql = readFile(f);
        if (sql.length > MAX_MIGRATION_BYTES) {
            throw new Error(`${f} is ${sql.length} bytes, over the ${MAX_MIGRATION_BYTES} cap — classify by hand with --db-impact`);
        }
        const hit = RX_DDL.exec(stripSqlComments(sql));
        if (hit) evidence.push(`${f}: ${hit[1].toUpperCase()}`);
    }
    if (evidence.length > 0) return { dbImpact: 'schema', evidence };
    return { dbImpact: 'metadata', evidence: files.map((f) => `${f}: no DDL keyword`) };
}

/**
 * Append the release to the mechanical fields. Pure — returns a new document.
 * @param {object} doc parsed release-lines.json
 * @param {string} version
 * @param {'none'|'metadata'|'repair'|'schema'} dbImpact
 */
export function appendRelease(doc, version, dbImpact) {
    if (!DB_IMPACTS.includes(dbImpact)) throw new Error(`dbImpact "${dbImpact}" not one of ${DB_IMPACTS.join('|')}`);
    const next = structuredClone(doc);
    const channel = classifyChannel(version);

    const target = channel.kind === 'edge' ? next.edge : next.lines?.[channel.lineKey];
    if (!target) {
        throw new Error(
            `line ${channel.lineKey} is not in release-lines.json. A line release for an unknown ` +
            `line means the line branch was cut without its entry — add the entry in a reviewed PR first.`,
        );
    }
    target.newest = version;
    target.releases = { ...(target.releases ?? {}), [version]: { dbImpact } };
    return next;
}

/**
 * Refuse to write if anything outside the mechanical fields moved.
 * @param {object} before
 * @param {object} after
 */
export function assertOnlyMechanicalChange(before, after) {
    const strip = (doc) => {
        const c = structuredClone(doc);
        for (const holder of [c.edge, ...Object.values(c.lines ?? {})]) {
            if (!holder) continue;
            delete holder.newest;
            delete holder.releases;
        }
        return JSON.stringify(c);
    };
    if (strip(before) !== strip(after)) {
        throw new Error('refusing to write: a non-mechanical field changed (status/certifiedBuild/dates are §8 territory)');
    }
}

/**
 * An operator's explicit --db-impact overrides the tripwire, with one exception: claiming
 * `none` while migrations actually shipped is not an override, it is a false ledger entry.
 * The reverse directions are legitimate — `repair` for a generated-object DROP/CREATE the
 * regex reads as `schema`, or a deliberately stricter value.
 * @param {string} explicit
 * @param {string} classified
 */
export function reconcileDbImpact(explicit, classified) {
    if (explicit === 'none' && classified !== 'none') {
        throw new Error(
            `--db-impact none contradicts the release contents (classified "${classified}"): ` +
            `migrations shipped in this range. Record the real impact, or fix the range.`,
        );
    }
    return explicit;
}

/** @param {string[]} argv */
export function parseCliArgs(argv) {
    const args = { version: null, dbImpact: null, file: 'release-lines.json', since: null, until: 'HEAD', dryRun: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--version') args.version = argv[++i];
        else if (a === '--db-impact') args.dbImpact = argv[++i];
        else if (a === '--file') args.file = argv[++i];
        else if (a === '--since') args.since = argv[++i];
        else if (a === '--until') args.until = argv[++i];
        else if (a === '--dry-run') args.dryRun = true;
        else throw new Error(`unknown argument "${a}"`);
    }
    if (!args.version) throw new Error('--version is required');
    return args;
}

/** Migration files changed in a git range. Side-effectful: shells out to git. */
function changedMigrationFiles(since, until) {
    const out = execFileSync('git', ['diff', '--name-only', `${since}..${until}`, '--', 'migrations/'], {
        encoding: 'utf8',
        maxBuffer: MAX_MIGRATION_BYTES,
    });
    return out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.sql'));
}

/**
 * Read one migration at a git ref.
 *
 * `maxBuffer` is not optional here. MJ's metadata-sync migrations run past a megabyte
 * routinely (v5.45's was 12,041 lines), and execFileSync's default buffer is smaller than
 * that, so the default kills the process with a raw ENOBUFS before MAX_MIGRATION_BYTES is
 * ever consulted — i.e. the cap has to live on the reader, not only in the classifier.
 * Left unset this would have failed the first Edge publish that shipped a metadata sync,
 * which is nearly all of them.
 *
 * @param {string} ref
 * @param {string} path
 * @param {(file: string, args: string[], opts: object) => string} [exec] injectable for tests
 */
export function readMigrationAtRef(ref, path, exec = execFileSync) {
    try {
        return exec('git', ['show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: MAX_MIGRATION_BYTES });
    } catch (e) {
        if (e && e.code === 'ENOBUFS') {
            throw new Error(`${path} at ${ref} exceeds the ${MAX_MIGRATION_BYTES}-byte read cap — classify by hand with --db-impact`);
        }
        throw e;
    }
}

function main(argv) {
    const args = parseCliArgs(argv);
    const before = JSON.parse(readFileSync(args.file, 'utf8'));

    let dbImpact = args.dbImpact;
    if (dbImpact !== null && args.since !== null) {
        const files = changedMigrationFiles(args.since, args.until);
        const verdict = classifyDbImpact(files, (f) => readMigrationAtRef(args.until, f));
        reconcileDbImpact(dbImpact, verdict.dbImpact);
        if (dbImpact !== verdict.dbImpact) {
            console.log(`using stated dbImpact=${dbImpact} over classified ${verdict.dbImpact} (${files.length} migration file(s))`);
        }
    }
    if (dbImpact === null) {
        if (!args.since) throw new Error('pass --db-impact, or --since <ref> so the impact can be classified');
        const files = changedMigrationFiles(args.since, args.until);
        const verdict = classifyDbImpact(files, (f) => readMigrationAtRef(args.until, f));
        dbImpact = verdict.dbImpact;
        console.log(`classified dbImpact=${dbImpact} from ${files.length} migration file(s) in ${args.since}..${args.until}`);
        for (const e of verdict.evidence) console.log(`  ${e}`);
        if (dbImpact === 'schema') {
            console.log('NOTE: a generated-object repair (§12) also matches this tripwire. If that is what');
            console.log('      this release is, correct the entry to "repair" in a follow-up PR.');
        }
    }

    const after = appendRelease(before, args.version, dbImpact);
    assertOnlyMechanicalChange(before, after);
    const json = JSON.stringify(after, null, 2) + '\n';
    if (args.dryRun) {
        console.log(json);
        return;
    }
    writeFileSync(args.file, json);
    console.log(`recorded ${args.version} (dbImpact: ${dbImpact}) in ${args.file}`);
}

// process.argv[1] is undefined when this module is imported without a script path
// (`node -e`, a test runner harness); pathToFileURL throws on undefined, so check first.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error(`::error::append-release-line: ${e.message}`);
        process.exit(1);
    }
}
