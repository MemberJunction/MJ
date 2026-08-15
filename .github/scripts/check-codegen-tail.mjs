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
 * Two independent checks, both ALWAYS full-repo:
 *
 *   1. ARTIFACT PARITY. CodeGen emits the same entity set into three generated files.
 *      They must agree exactly. A mismatch means a PARTIAL tail — the most common
 *      real-world shape, because it survives a build and a test run.
 *
 *   2. MIGRATION → SUBCLASS. Every core-schema table the migration history creates and
 *      does not later drop must appear as a `Base Table:` in the generated subclasses.
 *      This catches the tail being skipped ENTIRELY, which check 1 cannot see (a
 *      wholly-absent entity is absent consistently, so all three artifacts agree).
 *
 * ## Why there is no "just my PR's migrations" mode
 *
 * There was one, and it was strictly weaker in the case that matters most. Dev B branches,
 * regenerates against a database that does not yet have Dev A's just-merged table, merges
 * `next`, and resolves the conflict by keeping their own artifacts. A's entity then vanishes
 * from all three files *consistently* — invisible to check 1 — and A's migration is not in
 * B's diff, so a scoped check 2 never reads it. The full sweep is the only thing that sees
 * it, costs ~2s over 660+ migrations, and makes the documented local command identical to
 * the one CI runs. A guard whose local invocation is weaker than its CI invocation teaches
 * developers that green means something it does not.
 *
 * Because the sweep reads the working tree rather than git history, this script needs no
 * git at all — no fetch depth, no base ref, no shallow-clone fallback.
 *
 * ## Scope — what green does NOT mean
 *
 * Check 2 keys on `CREATE TABLE`, so it covers exactly one shape: a **new core-schema
 * table** shipped without its generated entity. A migration that adds a column, widens a
 * type, renames an entity, re-points a relationship, or changes only metadata leaves no
 * `CREATE TABLE` and usually no roster change, and is **invisible here**. Check 1 still
 * covers the artifacts such a migration touches, but green is not "the CodeGen tail is
 * committed" — it is "no new table is missing its entity, and the three rosters agree".
 *
 * The definitive check is DB-bearing: migrate a real database, run CodeGen, and require
 * `git diff --exit-code`. `.github/workflows/migrations.yml` already stands up SQL Server
 * and runs `mj migrate` on push to `next`; extending it with `mj codegen && git diff
 * --exit-code` is what would close the remaining gap. This guard is the fast PR-time first
 * line, deliberately not a replacement for that.
 *
 * ## Known gap
 *
 * The tail is five artifacts, and this guard covers three. The four generated
 * `mj-class-registrations.ts` manifests (Angular Bootstrap, BootstrapLite, ServerBootstrap,
 * ServerBootstrapLite) carry the same roster and were verified by hand while investigating
 * #3737, but are not encoded here. They are tree-shaking-prevention manifests, so a missing
 * entry is a runtime-only failure — exactly the silent class this guard exists to catch.
 * Adding them is a follow-up, tracked as a named gap rather than left implicit.
 */

import { readFileSync, existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
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

/**
 * Blank out SQL comments and string literals, leaving only executable text.
 *
 * ## Why this is a single left-to-right pass and not three regexes
 *
 * The obvious implementation — strip literals, then `/* *​/` blocks, then `--` lines — is
 * WRONG, and wrong in the dangerous direction. It was written that way first and silently
 * deleted three real tables (`Theme`, `ContentItemChunk`, `AIAgentCredential`) from the
 * scan. The cause is an apostrophe inside a comment:
 *
 *     /* ... light/dark is the user's mode layered under it ... *​/     <- line 8
 *     CREATE TABLE ${flyway:defaultSchema}.Theme (                     <- line 39
 *
 * A literal-first pass reads `'s mode ... '` as a string literal and consumes everything up
 * to the next apostrophe — including the `CREATE TABLE` 30 lines later. The guard still went
 * green, because those three tables happen to have generated subclasses, so the hole was
 * invisible: exactly the "matches zero and passes everything" failure mode this guard's own
 * header warns about.
 *
 * Comments and strings are mutually exclusive contexts, so the only correct reading is one
 * scanner that knows which one it is in: an apostrophe inside a comment cannot open a
 * string, and a `--` inside a string cannot open a comment. Also handled:
 *   - `''` as the T-SQL escape for a quote inside a literal
 *   - NESTED block comments, which T-SQL supports and a non-greedy regex gets wrong
 *   - `[bracketed identifiers]`, which may legally contain `'` and `--`
 *
 * Newlines are preserved so positions stay roughly aligned and `--` terminates correctly;
 * everything else in a comment or literal becomes a space.
 *
 * ## Why it advances in spans rather than per character
 *
 * `migrations/` is ~566 MB of SQL — the five v5 baselines are 36-52 MB each — and the
 * overwhelming majority of it is ordinary executable text with nothing to mask. A scanner
 * that walked one character at a time, appending each to an accumulator, spent ~15s of the
 * guard's ~25s here. Only four characters can change state (`-`, `/`, `'`, `[`), so the
 * loop jumps to the next one and copies the whole intervening span in a single slice; the
 * masked regions likewise advance by `indexOf` rather than character by character. Output
 * is collected as chunks and joined once at the end. Measured over the real tree:
 * 14.6s -> 1.5s, which is what returns the guard to the ~2s its placement assumes.
 *
 * This is a pure speed change, and was verified as one: the masked output is byte-identical
 * to the per-character scanner's across all 665 committed migrations. Character positions
 * therefore still line up with the original source — which `scanMigrations` depends on,
 * since it orders CREATE/DROP within a file by match index.
 */
export function stripSqlComments(source) {
    const chunks = [];
    let i = 0;
    const n = source.length;
    // Local rather than module-level: `lastIndex` is mutated on every step, and shared
    // mutable scanner state is not worth the one allocation per file it would save.
    const stateOpeners = /[-/'[]/g;

    /** Blank a span, preserving newlines so `--` still terminates and positions hold. */
    const mask = (start, end) => {
        const nl = source.indexOf('\n', start);
        if (nl === -1 || nl >= end) return ' '.repeat(end - start);
        return source.slice(start, end).replace(/[^\n]/g, ' ');
    };

    while (i < n) {
        // Jump to the next character that could open a comment, a literal, or a bracketed
        // identifier. Everything before it is ordinary text, copied in one slice.
        stateOpeners.lastIndex = i;
        const opener = stateOpeners.exec(source);
        if (opener === null) {
            chunks.push(source.slice(i));
            break;
        }
        if (opener.index > i) chunks.push(source.slice(i, opener.index));
        i = opener.index;

        const two = source.slice(i, i + 2);

        if (two === '--') {
            const end = source.indexOf('\n', i);
            const stop = end === -1 ? n : end;
            chunks.push(mask(i, stop));
            i = stop;
            continue;
        }

        if (two === '/*') {
            let depth = 1;
            let j = i + 2;
            while (j < n && depth > 0) {
                const open = source.indexOf('/*', j);
                const close = source.indexOf('*/', j);
                if (close === -1) {
                    j = n; // unterminated block comment — masks to end of file
                    break;
                }
                if (open !== -1 && open < close) {
                    depth++;
                    j = open + 2;
                } else {
                    depth--;
                    j = close + 2;
                }
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }

        if (source[i] === "'") {
            let j = i + 1;
            for (;;) {
                const quote = source.indexOf("'", j);
                if (quote === -1) {
                    j = n; // unterminated literal — masks to end of file
                    break;
                }
                if (source[quote + 1] === "'") {
                    j = quote + 2; // escaped quote, still inside the literal
                    continue;
                }
                j = quote + 1;
                break;
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }

        if (source[i] === '[') {
            // Bracketed identifiers are executable text and must survive verbatim — they
            // carry the schema and table names this guard matches on. Copied wholesale so a
            // `'` or `--` inside one cannot flip the scanner into another state.
            let j = i + 1;
            for (;;) {
                const bracket = source.indexOf(']', j);
                if (bracket === -1) {
                    j = n;
                    break;
                }
                if (source[bracket + 1] === ']') {
                    j = bracket + 2;
                    continue;
                }
                j = bracket + 1;
                break;
            }
            chunks.push(source.slice(i, j));
            i = j;
            continue;
        }

        // A lone `-` or `/` that opens nothing: ordinary text, keep it and move on.
        chunks.push(source[i]);
        i++;
    }
    return chunks.join('');
}

/** `export class MJFooEntity extends BaseEntity` — the generated subclass roster. */
export function extractSubclassEntities(source) {
    return new Set([...source.matchAll(/^export class (\w+Entity) extends BaseEntity/gm)].map((m) => m[1]));
}

/**
 * The entity classes MJServer's generated resolvers import from `@memberjunction/core-entities`.
 * CodeGen emits this as a single import statement listing every entity it generated a
 * resolver for, so the import list IS the roster. Either quote style is accepted so a
 * Prettier or lint rewrap cannot turn this into an exit-2 "output shape changed".
 */
export function extractServerEntities(source) {
    const match = source.match(/import \{([^}]+)\} from ['"]@memberjunction\/core-entities['"];/);
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
 * Flyway's execution order for a migration filename, as a sortable key.
 *
 * `V202608092321__v6.1.x__Foo.sql` and `B202607091514__v5.0__Baseline.sql` both carry a
 * 12-digit version; a baseline (`B`) is applied in the same position as the version it
 * names. `R__RefreshMetadata.sql` is repeatable and runs AFTER every versioned migration,
 * so it sorts last. Anything unrecognised also sorts last, ahead of nothing — an unparseable
 * name must not silently jump the queue and decide a table's fate.
 */
export function migrationOrderKey(file) {
    const m = /^[VB](\d{12})__/.exec(basename(file));
    return m ? m[1] : '999999999999';
}

/**
 * Collect the core-schema tables the migration history leaves in existence.
 *
 * **Last operation wins, in Flyway order.** Not a global create-set minus a global
 * drop-set: that made any `DROP TABLE` anywhere in history exempt a table *forever*,
 * including one a later migration re-creates, and including the ordinary
 * `DROP TABLE IF EXISTS` guard sitting directly above a `CREATE TABLE` in the same file.
 * Either shape punched a permanent, silent hole in check 2. Operations are therefore
 * applied in file order, and *within* a file in source position order, so the idempotent
 * drop-then-create pattern resolves to "created" as it does in the database.
 *
 * Returns the surviving tables mapped to the migration that last created them, which is
 * what makes the failure message point at a file worth opening.
 */
export function scanMigrations(files, readFile) {
    const lastOp = new Map();
    const ordered = [...files].sort((a, b) => {
        const ka = migrationOrderKey(a);
        const kb = migrationOrderKey(b);
        return ka === kb ? a.localeCompare(b) : ka.localeCompare(kb);
    });

    for (const file of ordered) {
        const source = stripSqlComments(readFile(file));
        const ops = [];
        for (const m of source.matchAll(CREATE_TABLE_RE)) ops.push({ at: m.index, table: m[1].toLowerCase(), op: 'create' });
        for (const m of source.matchAll(DROP_TABLE_RE)) ops.push({ at: m.index, table: m[1].toLowerCase(), op: 'drop' });
        ops.sort((a, b) => a.at - b.at);
        for (const { table, op } of ops) lastOp.set(table, { op, file });
    }

    const created = new Map();
    for (const [table, { op, file }] of lastOp) {
        if (op === 'create') created.set(table, file);
    }
    return { created };
}

/** Surviving tables that are not allowlisted and have no generated subclass. */
export function findMissingSubclasses({ created }, baseTables) {
    const missing = [];
    for (const [table, file] of created) {
        if (NON_ENTITY_TABLES.has(table) || baseTables.has(table)) continue;
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

/** Sorted set difference, for readable failure output. */
function diff(a, b) {
    return [...a].filter((x) => !b.has(x)).sort();
}

/**
 * Run both checks against a repo root and return the findings.
 *
 * Exported so a caller can evaluate two trees — the PR and its merge base — and fail only
 * on the delta. Throws `MisconfiguredError` for the exit-2 conditions so a missing or
 * reshaped artifact can never be mistaken for "no drift".
 */
export class MisconfiguredError extends Error {}

export function evaluate(rootDir) {
    const read = (rel) => readFileSync(resolve(rootDir, rel), 'utf8');

    for (const [name, rel] of Object.entries(ARTIFACTS)) {
        if (!existsSync(resolve(rootDir, rel))) {
            throw new MisconfiguredError(
                `cannot find the ${name} artifact at ${rel} — run from the repo root.`
            );
        }
    }

    const subclassSource = read(ARTIFACTS.subclasses);
    const entities = extractSubclassEntities(subclassSource);
    const serverEntities = extractServerEntities(read(ARTIFACTS.server));
    const formEntities = extractFormEntities(read(ARTIFACTS.forms));

    if (serverEntities === null) {
        throw new MisconfiguredError(
            `could not find the core-entities import in ${ARTIFACTS.server} — CodeGen's output shape changed and this guard needs updating.`
        );
    }

    const failures = [];
    for (const [label, other] of [
        ['MJServer resolvers', serverEntities],
        ['Explorer forms', formEntities],
    ]) {
        for (const e of diff(entities, other)) failures.push(`${e}: has a generated subclass, but no ${label} entry`);
        for (const e of diff(other, entities)) failures.push(`${e}: has a ${label} entry, but no generated subclass`);
    }

    const migrationFiles = collectSqlFiles(join(rootDir, 'migrations')).map((f) => f.slice(rootDir.length + 1));
    const surviving = scanMigrations(migrationFiles, read);
    for (const { table, file } of findMissingSubclasses(surviving, extractGeneratedBaseTables(subclassSource))) {
        failures.push(`${table}: created by ${file}, but no generated entity subclass ships for it`);
    }

    return { entityCount: entities.size, migrationCount: migrationFiles.length, failures };
}

const FIX_HINT =
    'The fix is to run CodeGen and commit its output alongside the migration:\n' +
    '  mj sync push --dir=metadata --ci && mj codegen\n' +
    'See issue #3737 and .claude/skills/bootstrap-clean-db for the full ordering.';

/**
 * Split this tree's findings into what the branch INTRODUCED and what it inherited.
 *
 * Both checks are whole-repo, so there is no scoping to fall back on: without this, one bad
 * merge onto `next` reds every subsequent PR until someone fixes it — and since this check is
 * a required context, "reds" means "cannot merge". Pre-existing drift is still reported, loudly,
 * it just is not attributed to whoever pushed next.
 *
 * A base tree that cannot be evaluated (the PR adds an artifact that does not exist at base,
 * say) degrades to STRICT — every finding counts as introduced. That is the safe direction: the
 * alternative is treating an unreadable base as "everything was already broken".
 */
export function partitionFailures(current, base) {
    const inherited = new Set(base ?? []);
    return {
        introduced: current.filter((f) => !inherited.has(f)),
        preExisting: current.filter((f) => inherited.has(f)),
    };
}

/** GitHub annotation when running in Actions, plain text otherwise. */
function warn(message) {
    console.error(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `warning: ${message}`);
}

async function main() {
    const argv = process.argv.slice(2);
    const asJson = argv.includes('--json');
    const compareArg = argv.find((a) => a.startsWith('--compare-to='));
    const compareTo = compareArg ? compareArg.slice('--compare-to='.length) : null;
    const rootDir = resolve(argv.find((a) => !a.startsWith('--')) ?? '.');

    let result;
    try {
        result = evaluate(rootDir);
    } catch (err) {
        if (!(err instanceof MisconfiguredError)) throw err;
        // Exit 2 even in --json mode: a caller comparing two trees must not read a
        // misconfigured run as an empty failure list and conclude the delta is clean.
        console.error(`codegen-tail: ${err.message}`);
        process.exit(2);
    }

    if (asJson) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }

    console.log(
        `codegen-tail: ${result.entityCount} entities across ${Object.keys(ARTIFACTS).length} generated artifacts; ` +
            `scanned all ${result.migrationCount} migration(s)`
    );

    // Evaluating the base tree only earns its keep when there is something to attribute.
    // A clean head tree has nothing to partition — `introduced` and `preExisting` are both
    // empty whatever the base says — so the second full sweep is skipped outright. That is
    // the overwhelmingly common case, and it halves the cost of every green PR.
    let baseFailures = null;
    if (compareTo && result.failures.length > 0) {
        try {
            baseFailures = evaluate(resolve(compareTo)).failures;
            console.log(`codegen-tail: comparing against the base tree at ${compareTo} (${baseFailures.length} pre-existing)`);
        } catch (err) {
            if (!(err instanceof MisconfiguredError)) throw err;
            warn(
                `codegen-tail: could not evaluate the base tree (${err.message}) — every finding will be treated as ` +
                    `introduced by this branch.`
            );
        }
    }

    const { introduced, preExisting } = partitionFailures(result.failures, baseFailures);

    for (const f of preExisting) {
        warn(`codegen-tail: pre-existing drift on the base branch, not introduced here — ${f}`);
    }

    if (introduced.length > 0) {
        console.error(
            `\ncodegen-tail: FAIL — ${introduced.length} drift(s) between committed migrations and committed generated code`
        );
        for (const f of introduced) console.error(`  ✖ ${f}`);
        console.error(`\n${FIX_HINT}`);
        process.exit(1);
    }

    if (preExisting.length > 0) {
        console.log(
            `codegen-tail: OK for this branch — ${preExisting.length} pre-existing drift(s) reported above need ` +
                `fixing on the base branch, but are not this PR's doing`
        );
        return;
    }
    console.log('codegen-tail: OK — committed generated code matches committed migrations');
}

// Run the sweep only when invoked directly as a CLI (not when imported by tests).
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    await main();
}
