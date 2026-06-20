/**
 * Deterministic gate: the behavioral e2e must cover EVERY shipped object — each one either lands a
 * forward-sync row OR carries an explicit, logged skipReason. No SILENT subset.
 *
 * Why this is a hard gate (the defect this catches):
 *   The static graders (dag-completeness, bijection) check the WHOLE object set. The behavioral proof had
 *   no equivalent: an e2e that synced 5 of 32 objects (and 0 write paths) failed nothing, so "verified" got
 *   asserted on a convenient subset and the gap was rationalized as the "Goldilocks" rule — which bounds
 *   ROW VOLUME per stream, NOT the number of objects exercised. This gate makes "all objects, or a logged
 *   reason" the floor instead of something an operator has to demand round after round.
 *
 * Token/accuracy contract (why this is safe to add):
 *   - Pure JS, zero LLM tokens (a node grader the floor runs, like dag-completeness/bijection).
 *   - It FAILS only on a SILENT subset — an Active object that neither synced a row NOR has a logged skip.
 *     The cheap way to satisfy it is a one-line skipReason, so it forces HONESTY, not an expensive full run.
 *   - When the e2e exposes NO coverage data (covered === null/undefined), it returns
 *     `status:'no-coverage-data'` with ZERO violations — informational, never a false-fail. So in the worst
 *     case it is a no-op (cannot regress tokens or accuracy); in the best case it kills the silent-subset duck.
 *
 * Pure: ({ metadata, covered, skips }) -> { status, activeCount, coveredCount, skippedCount, violations }.
 * Blocking violations = `uncovered-silent` (an Active object covered by neither a synced row nor a skip).
 */

function iosOf(rec) {
    const re = (rec && rec.relatedEntities) || {};
    return re['MJ: Integration Objects'] || re['Integration Objects'] || [];
}

/** An object ships (is in-scope for coverage) unless it is explicitly Disabled/Deprecated. Metadata files
 *  often omit Status (mj-sync sets it Active on push), so absent Status counts as in-scope. */
function isActive(ioFields) {
    const s = ioFields && ioFields.Status;
    if (s == null || s === '') return true;
    const low = String(s).toLowerCase();
    return low !== 'disabled' && low !== 'deprecated' && low !== 'inactive';
}

function nameSet(list) {
    const s = new Set();
    for (const n of (Array.isArray(list) ? list : [])) {
        if (typeof n === 'string' && n.trim()) s.add(n.trim().toLowerCase());
    }
    return s;
}

/**
 * @param {{metadata: object, covered: string[]|null|undefined, skips?: string[]}} input
 *   - covered: object NAMES that landed >=1 forward-sync row (or were genuinely exercised). null/undefined
 *     means "the e2e exposed no coverage data" -> informational, non-blocking.
 *   - skips: object NAMES carrying an explicit logged skipReason (legitimately not exercisable, e.g. a
 *     non-enumerable by-id object). Accounted-for, not silent.
 */
export function findCoverageGaps({ metadata, covered, skips }) {
    const ios = iosOf(metadata).map((io) => (io && io.fields) || {}).filter((f) => f && f.Name);
    const active = ios.filter(isActive);
    const activeCount = active.length;

    if (covered == null) {
        return { status: 'no-coverage-data', activeCount, coveredCount: 0, skippedCount: 0, violations: [] };
    }
    const coveredSet = nameSet(covered);
    const skipSet = nameSet(skips);
    const violations = [];
    for (const f of active) {
        const key = String(f.Name).trim().toLowerCase();
        if (!coveredSet.has(key) && !skipSet.has(key)) {
            violations.push({ type: 'uncovered-silent', object: f.Name });
        }
    }
    return {
        status: violations.length === 0 ? 'complete' : 'gaps',
        activeCount,
        coveredCount: active.filter((f) => coveredSet.has(String(f.Name).trim().toLowerCase())).length,
        skippedCount: active.filter((f) => skipSet.has(String(f.Name).trim().toLowerCase())).length,
        violations,
    };
}

/** Blocking = a SILENT uncovered object. (no-coverage-data and a fully-accounted set are non-blocking.) */
export function blockingCoverageViolations(result) {
    return (result && Array.isArray(result.violations) ? result.violations : []).filter((v) => v.type === 'uncovered-silent');
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isMain = (() => {
    try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();

/** Parse a list arg: either inline `a,b,c` or `@<file>` (JSON array of names, or a JSON object whose keys are names). */
function parseList(val) {
    if (!val) return null;
    if (val.startsWith('@')) {
        try {
            const parsed = JSON.parse(readFileSync(resolve(val.slice(1)), 'utf8'));
            if (Array.isArray(parsed)) return parsed.map(String);
            if (parsed && typeof parsed === 'object') return Object.keys(parsed);
            return null;
        } catch { return null; }
    }
    return val.split(',').map((s) => s.trim()).filter(Boolean);
}

function argVal(args, flag) {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const positional = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--covered' && args[args.indexOf(a) - 1] !== '--skips');
    const metaFile = positional[0];
    if (!metaFile) {
        process.stderr.write('usage: node behavioral-coverage.mjs <metadata-file> [--covered a,b,c|@file.json] [--skips a,b|@file.json] [--json]\n');
        process.exit(2);
    }
    let metadata;
    try {
        const raw = JSON.parse(readFileSync(resolve(metaFile), 'utf8'));
        metadata = Array.isArray(raw) ? raw[0] : raw;
    } catch (e) {
        if (json) process.stdout.write(JSON.stringify({ error: `unreadable/invalid JSON: ${String(e && e.message ? e.message : e)}`, status: 'error', violations: [] }) + '\n');
        else process.stderr.write(`error: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(json ? 0 : 1);
    }
    const covered = parseList(argVal(args, '--covered'));
    const skips = parseList(argVal(args, '--skips'));
    const result = findCoverageGaps({ metadata, covered, skips });
    const blocking = blockingCoverageViolations(result);
    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify({ ...result, blockingCount: blocking.length, blocking }) + '\n');
    } else {
        process.stdout.write(`behavioral-coverage: ${result.status} — active=${result.activeCount} covered=${result.coveredCount} skipped=${result.skippedCount} silent-gaps=${blocking.length}\n`);
        for (const v of blocking.slice(0, 20)) process.stdout.write(`  SILENT-UNCOVERED: ${v.object}\n`);
        if (blocking.length > 20) process.stdout.write(`  … +${blocking.length - 20} more\n`);
    }
    process.exit(0);
}
