/**
 * Changeset bump-level guard.
 *
 * A `minor` is reserved for branches that change the DATABASE: a migration under a
 * `migrations/vN` folder, or metadata under `metadata` — which is the same thing on a delay,
 * since the build engineer's release-time `mj sync push` turns accumulated metadata edits into a
 * migration. Everything else — TypeScript, tests, docs, CI, guides — is a `patch`.
 *
 * Why this is worth a gate rather than prose. `.changeset/config.json` puts every MJ package in
 * one `fixed` group, so the HIGHEST bump in a release decides the version of all ~294 of them.
 * One stray `minor` on a package nobody touched moves the whole workspace, and nothing in the
 * changesets CLI questions it. The failure is also invisible at authoring time: the surrounding
 * `.changeset/*.md` files are a mix of both levels, so an author (or an agent) matching the
 * neighbours has no way to infer the rule.
 *
 * Scope: only changesets ADDED IN THIS BRANCH are judged. Pending changesets from other branches
 * carry no evidence of what their own branch touched, so re-judging them here would fail PRs for
 * decisions made elsewhere.
 *
 * Usage: node .github/scripts/check-changeset-bump.mjs [--base origin/next]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DEFAULT_BASE = 'origin/next';
/**
 * Paths whose presence in the branch earns a `minor`.
 *
 * REPEATABLE migrations (`migrations/R__*.sql`) sit directly under `migrations/` rather than in a
 * version folder, and Flyway re-runs them on every deploy — so editing one changes the database as
 * surely as adding a versioned migration does.
 *
 * Matched on ANY git status, not just added files. The rule this replaces spoke of migrations
 * "ADDED IN THIS BRANCH"; a MODIFIED migration is just as much a database change, and a repeatable
 * script is only ever modified — it is never added twice.
 */
const DB_TRIGGERS = [
    { label: 'migration', pattern: /^migrations\/v[0-9]+\/.+\.sql$/ },
    { label: 'repeatable migration', pattern: /^migrations\/R__.+\.sql$/ },
    { label: 'metadata', pattern: /^metadata\/.+/ },
];
const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;
/** Bump levels a changeset entry may declare, worst first. */
const LEVELS = ['major', 'minor', 'patch'];

function git(args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function parseArgs(argv) {
    const baseIndex = argv.indexOf('--base');
    return { base: baseIndex === -1 ? DEFAULT_BASE : argv[baseIndex + 1] };
}

/**
 * Files this branch changed relative to `base`, via the merge-base — so commits landing on the
 * base after the branch started are never mistaken for the branch's own work.
 */
function changedFiles(base) {
    return git(['diff', `${base}...HEAD`, '--name-only']).split('\n').filter(Boolean);
}

/** Changeset files this branch ADDED (not merely touched — a whitespace edit is not authorship). */
function addedChangesets(base) {
    return git(['diff', `${base}...HEAD`, '--name-only', '--diff-filter=A'])
        .split('\n')
        .filter((f) => CHANGESET_FILE.test(f));
}

/** Which DB triggers this branch carries, if any. */
function dbTriggers(files) {
    return DB_TRIGGERS.filter((t) => files.some((f) => t.pattern.test(f))).map((t) => t.label);
}

/**
 * The `"pkg": level` entries in a changeset's YAML front matter.
 *
 * Deliberately a line scan rather than a YAML parse: the front matter is a flat map of quoted
 * package names by design, and this script must not acquire a dependency to run in CI.
 */
function bumpEntries(path) {
    const lines = readFileSync(path, 'utf8').split('\n');
    const start = lines.indexOf('---');
    if (start === -1) {
        return { entries: [], malformed: 'no front matter' };
    }
    const end = lines.indexOf('---', start + 1);
    if (end === -1) {
        return { entries: [], malformed: 'front matter is never closed' };
    }
    const entries = [];
    for (const line of lines.slice(start + 1, end)) {
        const match = /^\s*["']?([^"':]+)["']?\s*:\s*(\w+)\s*$/.exec(line);
        if (match) {
            entries.push({ pkg: match[1], level: match[2] });
        }
    }
    return { entries, malformed: entries.length === 0 ? 'no package entries' : null };
}

const { base } = parseArgs(process.argv.slice(2));
try {
    git(['rev-parse', '--verify', base]);
} catch {
    console.error(`❌ Base ref '${base}' does not resolve. Fetch it first, or pass --base <ref>.`);
    process.exit(2);
}

const files = changedFiles(base);
const triggers = dbTriggers(files);
const changesets = addedChangesets(base);

if (changesets.length === 0) {
    // NOTE: this exits 0 even on a branch that changes the database. That is a deliberate scope
    // line, not an oversight — this guard judges the LEVEL of the changesets a branch declares, and
    // a branch declaring none gives it nothing to judge. "A DB branch must declare a changeset at
    // all" is a different rule (presence, not level) and belongs wherever changesets are made
    // mandatory. Pinned by the `db-no-changeset` test so the gap stays visible.
    console.log(`✅ No changesets added in this branch (vs ${base}) — nothing to check.`);
    process.exit(0);
}

// Parsed once and reused: the mirror check below needs the same entries, and re-reading each file
// would let the two halves disagree if a parse ever became non-deterministic.
const parsed = changesets.map((path) => ({ path, ...bumpEntries(path) }));

const violations = [];
for (const { path, entries, malformed } of parsed) {
    if (malformed) {
        violations.push({ path, reason: `could not read bump entries: ${malformed}` });
        continue;
    }
    for (const { pkg, level } of entries) {
        if (!LEVELS.includes(level)) {
            violations.push({ path, reason: `"${pkg}": ${level} is not one of ${LEVELS.join(' / ')}` });
        } else if (level === 'major') {
            violations.push({ path, reason: `"${pkg}": major — never use without explicit approval` });
        } else if (level === 'minor' && triggers.length === 0) {
            violations.push({
                path,
                reason: `"${pkg}": minor, but this branch changes no migration and no metadata`,
            });
        }
    }
}

// The MIRROR of the per-entry check above, and the direction that actually costs a release: a DB
// branch declaring only `patch` ships a schema change under-versioned. It stays invisible whenever
// some other changeset in the same release happens to carry a `minor`, so it fails rarely and
// unpredictably rather than immediately. One `minor` anywhere in the branch's changesets is enough
// — the `fixed` group moves every package to the highest bump regardless.
if (triggers.length > 0 && violations.length === 0) {
    const declaresMinor = parsed.some(({ entries }) => entries.some((e) => e.level === 'minor'));
    if (!declaresMinor) {
        violations.push({
            path: changesets.join(', '),
            reason: `this branch changes ${triggers.join(' + ')}, but no entry declares minor`,
        });
    }
}

console.log(
    triggers.length > 0
        ? `Branch touches ${triggers.join(' + ')} — minor is required.`
        : 'Branch touches no migration and no metadata — every entry must be patch.'
);

if (violations.length > 0) {
    console.error(`\n❌ Changeset bump levels (${violations.length} problem(s)):`);
    for (const v of violations) {
        console.error(`   ${v.path} — ${v.reason}`);
    }
    console.error('');
    console.error('minor  ⇐ the branch adds a migration (migrations/v*/*.sql) or changes metadata/**');
    console.error('         (metadata becomes a migration at release, via the build engineer\'s mj sync push)');
    console.error('patch  ⇐ everything else: TypeScript, tests, docs, guides, CI');
    console.error('major  ⇐ never without explicit approval');
    console.error('');
    console.error('Every MJ package shares one `fixed` group in .changeset/config.json, so the highest');
    console.error('bump in a release sets the version for all of them. See .claude/rules/changesets.md.');
    process.exit(1);
}

console.log(`✅ ${changesets.length} changeset(s) added in this branch — bump levels are correct.`);
