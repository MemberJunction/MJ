#!/usr/bin/env node
/**
 * check-migration-validator-seeds.mjs
 *
 * Two migrations must not seed the same CodeGen validator row with different text.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * A CHECK constraint's generated validator lives in `GeneratedCode`, one row per field, keyed by
 * `LinkedEntityID` + `LinkedRecordPrimaryKey` (the EntityField ID). Every seed of that row is
 * guarded by an existence check, so when two migrations seed the same key, the first one Flyway
 * runs wins and the second is skipped. If their `Description` or `Code` differ, the message users
 * see is decided by filename order alone, and the second file's text never applies anywhere.
 * CodeGen produces such a pair whenever a developer's database holds a different LLM wording for
 * a validator that a hand-written migration also seeds. See MJ#4673.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────
 * Across the versioned migrations after the newest baseline (`migrations/v<N>/V<12 digits>__*.sql`), each
 * `INSERT INTO …[GeneratedCode]` with a `LinkedEntityID` and `LinkedRecordPrimaryKey` is read. When
 * two seeds share a key (compared case-insensitively) and the CHECK text they were generated from
 * (`Source`, whitespace-insensitive), and differ in `Description` or `Code`, the
 * gate fails, unless the pair is listed in the baseline file beside this script with the reason it
 * is accepted. Released migrations cannot be edited, so the baseline is how an existing pair is
 * recorded; a new pair is fixed in the new migration (use the wording the earlier file seeded).
 *
 * Usage (from any directory inside the repository):
 *   node check-migration-validator-seeds.mjs            # scan, exit 1 on an unlisted pair
 *   node check-migration-validator-seeds.mjs --list     # print every pair found, baselined or not
 */
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Offset-preserving masker: blanks comments and string literals, keeps newlines and bracketed
// identifiers, so positions in the masked text equal positions in the source.
import { stripSqlComments } from './check-codegen-tail.mjs';

const RED = '\x1b[0;31m', GREEN = '\x1b[0;32m', DIM = '\x1b[2m', NC = '\x1b[0m';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const BASELINE_FILE = join(SCRIPT_DIR, 'migration-validator-seeds-baseline.json');

const VERSIONED_MIGRATION_RE = /^V\d{12}__.*\.sql$/i;
const BASELINE_MIGRATION_RE = /^B(\d{12})__.*\.sql$/i;
const VERSION_DIR_RE = /^v\d+$/;
const GENERATED_CODE_INSERT_RE = /INSERT\s+INTO\s+(?:[^\s(]*?[.\]"])?(?:\[GeneratedCode\]|"GeneratedCode"|GeneratedCode)\s*\(/gi;

/** The compared columns. Anything else (ID, GeneratedAt, model) may differ without changing behaviour. */
const COMPARED_COLUMNS = ['Description', 'Code'];

/** Whitespace-insensitive form of the CHECK text a validator was generated from. */
function normalizeSource(value) {
    return value === null ? '' : value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Split the parenthesised list that opens at `masked[open]` into item spans.
 * Works on masked text (no comments, literals blanked) so commas inside literals never split;
 * the spans index the original source too, since the masker preserves positions.
 * @returns {{ spans: Array<[number, number]>, end: number } | null}
 */
export function splitParenList(masked, open) {
    if (masked[open] !== '(') return null;
    const spans = [];
    let depth = 0;
    let start = open + 1;
    for (let i = open; i < masked.length; i++) {
        const ch = masked[i];
        if (ch === '[') {
            const close = masked.indexOf(']', i + 1);
            if (close === -1) return null;
            i = close;
            continue;
        }
        if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) {
                spans.push([start, i]);
                return { spans, end: i + 1 };
            }
        } else if (ch === ',' && depth === 1) {
            spans.push([start, i]);
            start = i + 1;
        }
    }
    return null;
}

/** `[LinkedEntityID]` / `"LinkedEntityID"` / `LinkedEntityID` → `linkedentityid`. */
function bareIdentifier(text) {
    return text.replace(/^[\s[\]"]+|[\s[\]"]+$/g, '').toLowerCase();
}

/** The value of a SQL string literal (`N'…'` or `'…'`, `''` unescaped), or null for anything else. */
export function literalValue(text) {
    const m = /^N?'([\s\S]*)'$/i.exec(text.trim());
    return m ? m[1].replace(/''/g, "'") : null;
}

/** Text compared between seeds: line endings normalized so a CRLF checkout never differs from LF. */
function normalizeText(value) {
    return value === null ? null : value.replace(/\r\n/g, '\n');
}

/**
 * Every GeneratedCode seed in one migration's SQL.
 * `key` is the validator's row key (`<LinkedEntityID>|<LinkedRecordPrimaryKey>`, lower-cased); `check`
 * is the CHECK text it was generated from. A table-level constraint links to the entity itself, so
 * one key can carry several validators: two seeds are the same validator only when both match.
 * @returns {Array<{ key: string, check: string, line: number, values: Record<string, string | null> }>}
 */
export function findSeeds(source) {
    const masked = stripSqlComments(source);
    const seeds = [];
    GENERATED_CODE_INSERT_RE.lastIndex = 0;
    let match;
    while ((match = GENERATED_CODE_INSERT_RE.exec(masked)) !== null) {
        const columns = splitParenList(masked, match.index + match[0].length - 1);
        if (!columns) continue;
        const names = columns.spans.map(([s, e]) => bareIdentifier(source.slice(s, e)));
        const valuesAt = /\s*VALUES\s*/iy;
        valuesAt.lastIndex = columns.end;
        if (!valuesAt.exec(masked)) continue; // INSERT … SELECT: no literal tuple to compare
        const tuple = splitParenList(masked, valuesAt.lastIndex);
        if (!tuple || tuple.spans.length !== names.length) continue;
        const cell = (column) => {
            const idx = names.indexOf(column.toLowerCase());
            return idx === -1 ? undefined : source.slice(tuple.spans[idx][0], tuple.spans[idx][1]);
        };
        const entity = cell('LinkedEntityID');
        const record = cell('LinkedRecordPrimaryKey');
        const entityValue = entity === undefined ? null : literalValue(entity);
        const recordValue = record === undefined ? null : literalValue(record);
        if (!entityValue || !recordValue) continue;
        const source_ = cell('Source');
        const checkText = normalizeSource(source_ === undefined ? null : literalValue(source_));
        const values = {};
        for (const column of COMPARED_COLUMNS) {
            const raw = cell(column);
            values[column] = raw === undefined ? null : normalizeText(literalValue(raw));
        }
        seeds.push({
            key: `${entityValue.trim().toLowerCase()}|${recordValue.trim().toLowerCase()}`,
            check: checkText,
            line: source.slice(0, match.index).split('\n').length,
            values,
        });
    }
    return seeds;
}

/**
 * The versioned migrations under `<repoRoot>/migrations/v<N>/` that run after the newest baseline,
 * in Flyway (filename) order.
 *
 * A fresh install applies the newest `B…__Baseline.sql` and only the versioned files after it, and
 * an existing database already ran everything before it, so a pair of seeds that both precede the
 * newest baseline can no longer decide anything: the baseline's own row is what installs get.
 */
export function listMigrations(repoRoot) {
    const root = join(repoRoot, 'migrations');
    if (!existsSync(root)) return [];
    const files = [];
    let newestBaseline = '';
    for (const dir of readdirSync(root, { withFileTypes: true })) {
        if (!dir.isDirectory() || !VERSION_DIR_RE.test(dir.name)) continue;
        for (const f of readdirSync(join(root, dir.name))) {
            if (VERSIONED_MIGRATION_RE.test(f)) files.push(join(root, dir.name, f));
            const baseline = BASELINE_MIGRATION_RE.exec(f);
            if (baseline && baseline[1] > newestBaseline) newestBaseline = baseline[1];
        }
    }
    const name = (p) => p.slice(p.lastIndexOf('/') + 1);
    return files.filter((f) => name(f).slice(1, 13) > newestBaseline).sort((a, b) => name(a).localeCompare(name(b)));
}

/**
 * Pairs of seeds that share a key but differ in a compared column. Each later seed is compared with
 * the first seed of its key, which is the one Flyway applies.
 * @param {Array<{ file: string, source: string }>} migrations in Flyway order
 */
export function findConflicts(migrations) {
    const first = new Map();
    const conflicts = [];
    for (const { file, source } of migrations) {
        for (const seed of findSeeds(source)) {
            const validator = `${seed.key}|${seed.check}`;
            const winner = first.get(validator);
            if (!winner) {
                first.set(validator, { file, ...seed });
                continue;
            }
            const differing = COMPARED_COLUMNS.filter((c) => winner.values[c] !== seed.values[c]);
            if (differing.length === 0) continue;
            conflicts.push({
                key: seed.key,
                applied: { file: winner.file, line: winner.line },
                skipped: { file, line: seed.line },
                differing,
            });
        }
    }
    return conflicts;
}

/** Baseline entries: `{ Key, AppliedFile, SkippedFile, Reason }`, files by base name. */
export function loadBaseline(path = BASELINE_FILE) {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed.Pairs) ? parsed.Pairs : [];
}

const baseName = (p) => p.slice(p.replace(/\\/g, '/').lastIndexOf('/') + 1);

/** Is this conflict recorded in the baseline? Matched on the key and both file names. */
export function isBaselined(conflict, baseline) {
    return baseline.some(
        (b) =>
            String(b.Key).toLowerCase() === conflict.key &&
            b.AppliedFile === baseName(conflict.applied.file) &&
            b.SkippedFile === baseName(conflict.skipped.file)
    );
}

/** Scan a repository. Returns the unlisted conflicts and every conflict found. */
export function scanRepo(repoRoot, baseline = loadBaseline()) {
    const migrations = listMigrations(repoRoot).map((file) => ({ file: relative(repoRoot, file), source: readFileSync(file, 'utf8') }));
    const all = findConflicts(migrations);
    return { all, unlisted: all.filter((c) => !isBaselined(c, baseline)), migrationCount: migrations.length };
}

function main() {
    const repoRoot = join(SCRIPT_DIR, '..', '..');
    const { all, unlisted, migrationCount } = scanRepo(repoRoot);
    if (process.argv.includes('--list')) {
        for (const c of all) {
            const tag = unlisted.includes(c) ? 'UNLISTED' : 'baselined';
            console.log(`${tag}  ${c.key}  ${c.applied.file}:${c.applied.line} vs ${c.skipped.file}:${c.skipped.line}  (${c.differing.join(', ')})`);
        }
        return 0;
    }
    if (unlisted.length === 0) {
        console.log(`${GREEN}✓ No competing GeneratedCode validator seeds${NC} ${DIM}(${migrationCount} migrations, ${all.length} baselined pair(s))${NC}`);
        return 0;
    }
    console.error(`${RED}✗ ${unlisted.length} competing GeneratedCode validator seed(s)${NC}`);
    for (const c of unlisted) {
        console.error(
            `  ${c.skipped.file}:${c.skipped.line} seeds validator ${c.key} with a different ${c.differing.join(' and ')} ` +
                `than ${c.applied.file}:${c.applied.line}. The earlier seed wins and this one is skipped.`
        );
    }
    console.error(
        `\nUse the earlier file's ${COMPARED_COLUMNS.join(' and ')} in the new migration (when CodeGen wrote it, your database holds a ` +
            `different wording: take the committed one). See .github/scripts/check-migration-validator-seeds.mjs.`
    );
    return 1;
}

const isMain = (() => {
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
})();
if (isMain) process.exit(main());
