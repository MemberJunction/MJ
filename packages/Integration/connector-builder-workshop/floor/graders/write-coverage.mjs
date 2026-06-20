/**
 * Deterministic gate: every WRITABLE object must have its write path actually EXERCISED by the behavioral
 * e2e (a create/update/delete round-trip) OR carry an explicit logged skipReason. No declared-but-unproven
 * write capability.
 *
 * Why this is a hard gate (the defect this catches):
 *   bijection.mjs proves a writable IO has the per-operation COLUMNS it claims (capability <-> CreateAPIPath
 *   etc. are in lockstep). It does NOT prove the write path WORKS. A connector can declare 40 writable objects
 *   and the e2e exercise 1 write round-trip — bijection is green, the other 39 writes are unproven. This gate
 *   closes that: a declared write capability that is never exercised (and not skipped) is a blocking gap.
 *
 * Writable detection (robust to the column-drop quirk):
 *   SupportsCreate/Update/Delete are not always real DB columns (mj-sync drops unknown fields), so the truth
 *   is the per-operation PATH columns. An IO is writable if ANY of CreateAPIPath / UpdateAPIPath /
 *   DeleteAPIPath is set, OR any SupportsCreate/Update/Delete flag is true.
 *
 * Token/accuracy contract (identical to behavioral-coverage):
 *   - Pure JS, zero LLM tokens.
 *   - Blocks ONLY on a writable object whose write is neither exercised nor skipped. The cheap escape is a
 *     logged skipReason — forces honesty, not an expensive write fleet.
 *   - exercised === null/undefined -> `status:'no-coverage-data'`, zero violations: informational, never a
 *     false-fail. Worst case a no-op; best case it kills declared-but-unproven write capability.
 */

function iosOf(rec) {
    const re = (rec && rec.relatedEntities) || {};
    return re['MJ: Integration Objects'] || re['Integration Objects'] || [];
}

function truthy(v) {
    if (v === true) return true;
    if (typeof v === 'string') { const l = v.toLowerCase(); return l === 'true' || l === '1' || l === 'yes'; }
    if (typeof v === 'number') return v === 1;
    return false;
}

function nonEmpty(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

/** Returns the write capabilities an IO declares, or null if it is read-only. */
export function writeCapsOf(ioFields) {
    const f = ioFields || {};
    const create = truthy(f.SupportsCreate) || nonEmpty(f.CreateAPIPath);
    const update = truthy(f.SupportsUpdate) || nonEmpty(f.UpdateAPIPath);
    const del = truthy(f.SupportsDelete) || nonEmpty(f.DeleteAPIPath);
    if (!create && !update && !del) return null;
    return { create, update, del };
}

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
 * @param {{metadata: object, exercised: string[]|null|undefined, skips?: string[]}} input
 *   - exercised: NAMES of objects whose write path was actually round-tripped in the e2e. null/undefined ->
 *     informational, non-blocking.
 *   - skips: NAMES of writable objects with a logged skipReason (legitimately not exercisable in the harness).
 */
export function findWriteCoverageGaps({ metadata, exercised, skips }) {
    const ios = iosOf(metadata).map((io) => (io && io.fields) || {}).filter((f) => f && f.Name);
    const writable = ios.filter((f) => isActive(f) && writeCapsOf(f) !== null);
    const writableCount = writable.length;

    if (exercised == null) {
        return { status: 'no-coverage-data', writableCount, exercisedCount: 0, skippedCount: 0, violations: [] };
    }
    const exSet = nameSet(exercised);
    const skipSet = nameSet(skips);
    const violations = [];
    for (const f of writable) {
        const key = String(f.Name).trim().toLowerCase();
        if (!exSet.has(key) && !skipSet.has(key)) {
            violations.push({ type: 'unproven-write', object: f.Name, caps: writeCapsOf(f) });
        }
    }
    return {
        status: violations.length === 0 ? 'complete' : 'gaps',
        writableCount,
        exercisedCount: writable.filter((f) => exSet.has(String(f.Name).trim().toLowerCase())).length,
        skippedCount: writable.filter((f) => skipSet.has(String(f.Name).trim().toLowerCase())).length,
        violations,
    };
}

/** Blocking = a writable object whose write was neither exercised nor skipped. */
export function blockingWriteViolations(result) {
    return (result && Array.isArray(result.violations) ? result.violations : []).filter((v) => v.type === 'unproven-write');
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isMain = (() => {
    try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();

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
    const positional = args.filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--exercised' && args[args.indexOf(a) - 1] !== '--skips');
    const metaFile = positional[0];
    if (!metaFile) {
        process.stderr.write('usage: node write-coverage.mjs <metadata-file> [--exercised a,b|@file.json] [--skips a,b|@file.json] [--json]\n');
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
    const exercised = parseList(argVal(args, '--exercised'));
    const skips = parseList(argVal(args, '--skips'));
    const result = findWriteCoverageGaps({ metadata, exercised, skips });
    const blocking = blockingWriteViolations(result);
    if (json) {
        process.stdout.write(JSON.stringify({ ...result, blockingCount: blocking.length, blocking }) + '\n');
    } else {
        process.stdout.write(`write-coverage: ${result.status} — writable=${result.writableCount} exercised=${result.exercisedCount} skipped=${result.skippedCount} unproven=${blocking.length}\n`);
        for (const v of blocking.slice(0, 20)) process.stdout.write(`  UNPROVEN-WRITE: ${v.object}\n`);
        if (blocking.length > 20) process.stdout.write(`  … +${blocking.length - 20} more\n`);
    }
    process.exit(0);
}
