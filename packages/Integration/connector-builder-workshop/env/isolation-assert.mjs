/**
 * Deterministic isolation gate: a connector build runs in an ISOLATED worktree so it cannot clobber a
 * sibling checkout. Every `node_modules/@memberjunction/*` symlink inside the worktree MUST resolve to a
 * target UNDER that same worktree root — never back into the main repo.
 *
 * Why this is a hard gate (the recurring corruption this catches):
 *   When a worktree's `@memberjunction` symlinks point back at the MAIN repo's packages, a `npm run build`
 *   inside the worktree writes `dist/` into the main repo's tree — silently corrupting whatever sibling
 *   session is running there (the exact clobber risk called out in the worktree-isolation memories:
 *   "build new worktree from committed tip … rsync untracked tooling in", and the OpenWater branch defect
 *   where a sibling checkout was corrupted). An escaped target is invisible at a glance because a symlink
 *   path looks local; only resolving it against the worktree root reveals the escape.
 *
 * Pure: a worktree root + a list of {path, target} symlink facts in → list of escaping links out. No fs,
 * no I/O — `target` is the ALREADY-RESOLVED symlink target the caller read with `fs.realpathSync` (or
 * `readlinkSync` + join). We re-normalize it with `node:path` so `../` traversals that escape the worktree
 * are caught AFTER normalization, not by naive prefix string matching.
 */

import { isAbsolute, resolve, sep } from 'node:path';

/**
 * @typedef {Object} SymlinkFact
 * @property {string} path     the symlink's own path (informational; reported back on a violation)
 * @property {string} target   the symlink's resolved target (an absolute path, or a path resolvable
 *                             relative to the symlink — we normalize either way)
 */

/**
 * Normalize a path to an absolute, `..`-collapsed form so containment is decided on the REAL location,
 * not the literal string. A relative target is resolved against `base` (the symlink's directory analog —
 * here the worktree root, which is sufficient because we only care whether it escapes the worktree).
 *
 * @param {string} p
 * @param {string} base
 * @returns {string}
 */
function normalizeTarget(p, base) {
    return isAbsolute(p) ? resolve(p) : resolve(base, p);
}

/**
 * Is `target` contained within `root`? True when the normalized target equals root or sits below it.
 * Appends a separator to the root before prefix-checking so `/a/worktree-sibling` is NOT treated as
 * inside `/a/worktree` (a bare `startsWith` would wrongly accept that sibling).
 *
 * @param {string} target  normalized absolute target
 * @param {string} root    normalized absolute worktree root
 * @returns {boolean}
 */
function isInside(target, root) {
    if (target === root) return true;
    const rootWithSep = root.endsWith(sep) ? root : root + sep;
    return target.startsWith(rootWithSep);
}

/**
 * Collect every symlink whose resolved target does NOT live under `worktreeRoot` (i.e. it points back
 * into the main repo / outside the isolated worktree — the clobber risk).
 *
 * @param {string} worktreeRoot
 * @param {SymlinkFact[]} links
 * @returns {Array<{path: string, target: string}>}  the original (un-normalized) path+target of each escaper
 */
export function assertSymlinksRepoint(worktreeRoot, links) {
    if (!Array.isArray(links)) return [];
    const root = resolve(String(worktreeRoot));
    const violations = [];
    for (const link of links) {
        if (!link || typeof link !== 'object' || typeof link.target !== 'string') continue;
        const normalized = normalizeTarget(link.target, root);
        if (!isInside(normalized, root)) {
            violations.push({ path: link.path, target: link.target });
        }
    }
    return violations;
}

/**
 * Convenience wrapper returning a verdict object (mirrors runDoctor in env-doctor.mjs).
 *
 * @param {string} worktreeRoot
 * @param {SymlinkFact[]} links
 * @returns {{ok: boolean, violations: Array<{path: string, target: string}>}}
 */
export function runIsolationAssert(worktreeRoot, links) {
    const violations = assertSymlinksRepoint(worktreeRoot, links);
    return { ok: violations.length === 0, violations };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test). Loads a facts JSON:
//   { "worktreeRoot": "/abs/path", "links": [{ "path": "...", "target": "..." }] }
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
        process.stderr.write('usage: node isolation-assert.mjs <facts.json> [--json]\n  facts.json = { "worktreeRoot": "/abs/path", "links": [{ "path": "...", "target": "..." }] }\n');
        process.exit(2);
    }

    let facts;
    try {
        facts = JSON.parse(readFileSync(resolve(positional[0]), 'utf8'));
    } catch (e) {
        process.stderr.write(`isolation-assert: unreadable/invalid facts JSON: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }

    const verdict = runIsolationAssert(facts.worktreeRoot, facts.links || []);

    if (json) {
        process.stdout.write(JSON.stringify({ ...verdict, worktreeRoot: resolve(String(facts.worktreeRoot)) }));
        process.exit(verdict.ok ? 0 : 1);
    }

    if (verdict.ok) {
        process.stdout.write(`✓ isolation-assert: all ${(facts.links || []).length} @memberjunction symlink(s) resolve inside the worktree — no sibling-checkout clobber risk\n`);
        process.exit(0);
    }

    process.stdout.write(`✗ isolation-assert: ${verdict.violations.length} symlink(s) escape the worktree (point back into the main repo) — a build here would CLOBBER the sibling checkout. Re-create the worktree with self-contained @memberjunction links:\n`);
    for (const v of verdict.violations) {
        process.stdout.write(`    - ${v.path}\n        → ${v.target}\n`);
    }
    process.exit(1);
}
