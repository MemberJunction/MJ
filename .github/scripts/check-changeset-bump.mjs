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
 * A certified LTS line (`lts/6.1`, `origin/lts/6.1`), where the rule INVERTS.
 *
 * `plans/lts-process.md` §12: on a line, everything is a patch — metadata migrations, CodeGen
 * repairs, and even schema migrations under a security exception. The migration-⇒-minor rule is
 * Edge-tuple grammar (§3.1) and applies to the `next` stream only.
 *
 * A `minor` on a line is not merely unnecessary, it is HARMFUL: lines are patch-only forever
 * (`6.1.0 → 6.1.1 → 6.1.2`), so a minor there consumes the tuple the next certification is
 * targeting. Applying the Edge rule here demanded exactly that, on security-driven cert fixes.
 */
const LINE_BRANCH = /(?:^|\/)lts\/[^/]+$/;
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

/** Whether `ancestor` is reachable from `descendant` (false rather than throwing on a miss). */
function isAncestor(ancestor, descendant) {
    try {
        execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Every certified-line ref this clone knows about, local or remote-tracking.
 *
 * Both patterns end in `**` deliberately. `git for-each-ref` treats a pattern CONTAINING a glob
 * character as a full match rather than a prefix, so `refs/remotes/*​/lts/` matches nothing —
 * while the glob-free `refs/heads/lts/` does prefix-match. A fixture carrying both a local and a
 * remote ref hides that completely: the local one answers, and the lookup looks fine while being
 * dead in a real clone, which has only `origin/lts/*`.
 */
function knownLineRefs() {
    const out = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/lts/**', 'refs/remotes/*/lts/**']);
    return out.length > 0 ? out.split('\n').filter(Boolean) : [];
}

/**
 * The certified line this working tree is built on, or `null` for the `next` stream.
 *
 * Determined by ANCESTRY, never by branch name. Real line backports are not called `lts/*` — the
 * repo's only one to date is `fix/codegen-isa-postgres-lts5` (base `lts/5`), and the backport bot
 * emits `backport-<n>-to-<target>`. A name-based check therefore misses exactly the branches the
 * line rule exists for, while a line tip being an ancestor of HEAD is decisive: lines are terminal
 * (fixes land on `next` first and are cherry-picked over), so a line tip is never an ancestor of a
 * `next` topic branch. It also works from a detached HEAD, which CI checkouts usually are.
 *
 * @returns The most specific matching line ref, or `null`.
 */
function detectLine() {
    const head = git(['rev-parse', 'HEAD']);
    const candidates = knownLineRefs().filter(
        // STRICT ancestor: a ref sitting on HEAD is not something this branch is built ON, it is
        // this branch. Without this, a topic branch that happens to be named `lts/…` resolves to
        // itself and gets diffed against itself — every change invisible.
        (ref) => isAncestor(ref, 'HEAD') && git(['rev-parse', ref]) !== head
    );
    if (candidates.length === 0) {
        return null;
    }
    // With several (a line cut from another line), the most specific is the one every other match
    // can reach — i.e. the newest tip.
    return candidates.reduce((best, ref) => (isAncestor(best, ref) ? ref : best));
}

/**
 * Resolves the base ref and, from it, WHICH rule applies.
 *
 * The rule follows where the change will LAND, so the base ref is the authority — a PR targeting
 * `lts/6.1` is a line change whatever the topic branch is called, and a topic branch name can never
 * be trusted to say so.
 *
 * When no base is given the default is `origin/next`, EXCEPT in line context, where guessing is
 * refused outright. Silently defaulting a line branch to `origin/next` is what made
 * `npm run check:changeset` unusable there: wrong base and wrong rule at once, reported
 * confidently. There is no honest default — which line a backport targets is not derivable — so the
 * script asks rather than answers.
 */
function parseArgs(argv) {
    const equals = argv.find((a) => a.startsWith('--base='));
    const flagIndex = argv.indexOf('--base');
    let explicitBase = equals ? equals.slice('--base='.length) : null;
    if (!equals && flagIndex !== -1) {
        explicitBase = argv[flagIndex + 1];
        // Without this the missing value became `undefined`, and `?? DEFAULT_BASE` swallowed it —
        // silently applying the Edge rule against origin/next instead of failing.
        if (!explicitBase || explicitBase.startsWith('--')) {
            console.error('❌ --base requires a value, e.g. --base origin/next or --base lts/5.');
            process.exit(2);
        }
    }
    if (explicitBase) {
        // An explicit base is authoritative: the rule follows where the change LANDS. A ref name is
        // enough on its own; a raw SHA is matched by asking which line, if any, contains it.
        const onLine = LINE_BRANCH.test(explicitBase) ||
            knownLineRefs().some((ref) => isAncestor(explicitBase, ref) && !isAncestor(explicitBase, DEFAULT_BASE));
        return { base: explicitBase, onLine };
    }
    const line = detectLine();
    return line ? { base: line, onLine: true } : { base: DEFAULT_BASE, onLine: false };
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

const { base, onLine } = parseArgs(process.argv.slice(2));
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
        } else if (onLine && level === 'minor') {
            // Inverted on a line: patch is not merely sufficient, it is the ONLY correct level, and
            // a minor here would consume the next certification's tuple.
            violations.push({
                path,
                reason: `"${pkg}": minor on a certified line — lines are patch-only (lts-process §12), even for migrations`,
            });
        } else if (!onLine && level === 'minor' && triggers.length === 0) {
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
// Skipped entirely on a line: there, a DB change ships as a patch BY DESIGN, so demanding a minor
// is exactly the false rejection this guard used to produce on cert-fix backports.
if (!onLine && triggers.length > 0 && violations.length === 0) {
    const declaresMinor = parsed.some(({ entries }) => entries.some((e) => e.level === 'minor'));
    if (!declaresMinor) {
        violations.push({
            path: changesets.join(', '),
            reason: `this branch changes ${triggers.join(' + ')}, but no entry declares minor`,
        });
    }
}

if (onLine) {
    console.log(
        `Base '${base}' is a certified line — every entry must be patch` +
        (triggers.length > 0 ? `, including the ${triggers.join(' + ')} this branch carries.` : '.')
    );
} else {
    console.log(
        triggers.length > 0
            ? `Branch touches ${triggers.join(' + ')} — minor is required.`
            : 'Branch touches no migration and no metadata — every entry must be patch.'
    );
}

if (violations.length > 0) {
    console.error(`\n❌ Changeset bump levels (${violations.length} problem(s)):`);
    for (const v of violations) {
        console.error(`   ${v.path} — ${v.reason}`);
    }
    console.error('');
    if (onLine) {
        console.error('patch  ⇐ EVERYTHING on a certified line, migrations included — lines are patch-only');
        console.error('         forever (lts-process §12). The migration-⇒-minor rule is Edge-tuple grammar');
        console.error('         and does not apply here; a minor would consume the next certification\'s tuple.');
        console.error('         The DB signal for a line release is `dbImpact`, not the version digits.');
    } else {
        console.error('minor  ⇐ the branch adds a migration (migrations/v*/*.sql or migrations/R__*.sql)');
        console.error('         or changes metadata/** (metadata becomes a migration at release, via the');
        console.error('         build engineer\'s mj sync push)');
        console.error('patch  ⇐ everything else: TypeScript, tests, docs, guides, CI');
    }
    console.error('major  ⇐ never without explicit approval');
    console.error('');
    console.error('Every MJ package shares one `fixed` group in .changeset/config.json, so the highest');
    console.error('bump in a release sets the version for all of them. See .claude/rules/changesets.md.');
    process.exit(1);
}

console.log(`✅ ${changesets.length} changeset(s) added in this branch — bump levels are correct.`);
