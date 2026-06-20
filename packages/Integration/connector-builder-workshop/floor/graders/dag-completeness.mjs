/**
 * Deterministic gate: the object dependency DAG must be COMPLETE over ALL objects, with every FK edge
 * resolving to a real emitted object and no deploy-blocking (hard-`@lookup`) cycle.
 *
 * Why this is a hard gate (the defect this catches):
 *   A DAG "validated" on a subset — 4 of 21 objects — proves NOTHING about the 17 it skipped. The real sync
 *   runs EVERY object, in dependency order. If one object points an FK at an object that was never emitted
 *   (a dangling edge), or a set of objects form a hard-`@lookup` cycle (which rolls the `mj sync push` back),
 *   that object — and everything downstream of it — fails or syncs out of order. So the graph must be checked
 *   WHOLE, over all objects, not on a Goldilocks subset. This is orthogonal to pagination: bound the DATA per
 *   stream, but the GRAPH must be complete. Computed deterministically (Kahn topological sort) straight from
 *   the metadata, so the guarantee holds with zero credential and regardless of how many objects a fixture
 *   run happens to exercise.
 *
 * Hard vs soft cycles: a cycle of hard `@lookup` FKs deadlocks the single-transaction push (the Salesforce
 * class — which is why Salesforce uses soft `ReferencedType` instead). A cycle of soft `ReferencedType` FKs is
 * resolved app-side at runtime and is TOLERABLE, so it is reported but NOT failed. Self-references (an object
 * FK'ing itself) are not cross-object ordering constraints and are ignored.
 *
 * Pure: parsed metadata in -> { objectCount, orderedCount, ordered, violations } out. No I/O.
 * Blocking violations = `dangling-fk` + `hard-cycle`; `soft-cycle` is informational.
 */

function iosOf(rec) {
    const re = (rec && rec.relatedEntities) || {};
    return re['MJ: Integration Objects'] || re['Integration Objects'] || [];
}

function iofsOf(io) {
    const re = (io && io.relatedEntities) || {};
    return re['MJ: Integration Object Fields'] || re['Integration Object Fields'] || [];
}

/**
 * Extract the FK edge an IOF declares: the target object NAME + whether it is a HARD edge (a push-time
 * `@lookup` on RelatedIntegrationObjectID) or a SOFT edge (a `Configuration.ReferencedType` name). Returns
 * `{target, hard}` or `null` when the IOF declares no FK.
 *
 * @param {Record<string, unknown>|undefined} iofFields
 * @returns {{target: string, hard: boolean} | null}
 */
export function fkEdgeOf(iofFields) {
    if (!iofFields || typeof iofFields !== 'object') return null;
    const rel = iofFields.RelatedIntegrationObjectID;
    if (typeof rel === 'string' && rel.includes('@lookup')) {
        const m = rel.match(/Name=([^&]+)/); // the sibling-object name in the @lookup, up to the first qualifier
        if (m && m[1].trim()) return { target: m[1].trim(), hard: true };
    }
    let ref = null;
    const cfg = iofFields.Configuration;
    if (typeof cfg === 'string' && cfg.trim()) {
        try { const j = JSON.parse(cfg); if (j && typeof j === 'object') ref = j.ReferencedType; } catch { /* non-JSON */ }
    } else if (cfg && typeof cfg === 'object') {
        ref = cfg.ReferencedType;
    }
    if (typeof ref === 'string' && ref.trim()) return { target: ref.trim(), hard: false };
    return null;
}

/**
 * Build the dependency DAG over EVERY object in the metadata and validate it whole. Returns the topological
 * order plus violations: `dangling-fk` (FK target is not an emitted object), `hard-cycle` (a cycle containing
 * a hard `@lookup` edge — deploy-blocking), `soft-cycle` (a runtime-resolved cycle — informational).
 *
 * @param {unknown} metadata  parsed `.integration.json` content (array of records or a single record)
 * @returns {{objectCount: number, orderedCount: number, ordered: string[], violations: Array<object>}}
 */
export function findDagViolations(metadata) {
    const records = Array.isArray(metadata) ? metadata : [metadata];
    const violations = [];
    let objectCount = 0;
    let orderedCount = 0;
    const orderedAll = [];

    for (const rec of records) {
        if (!rec || typeof rec !== 'object') continue;
        const ios = iosOf(rec);

        const names = new Set();
        for (const io of ios) {
            const n = io && io.fields && io.fields.Name;
            if (n) names.add(n);
        }

        // owner -> Map(target -> hard?). An object depends on each FK target (target must sync first).
        const deps = new Map();
        for (const n of names) deps.set(n, new Map());

        for (const io of ios) {
            const owner = io && io.fields && io.fields.Name;
            if (!owner) continue;
            for (const iof of iofsOf(io)) {
                const edge = fkEdgeOf(iof && iof.fields);
                if (!edge) continue;
                if (edge.target === owner) continue; // self-reference: not a cross-object ordering constraint
                if (!names.has(edge.target)) {
                    violations.push({ type: 'dangling-fk', io: owner, target: edge.target, hard: edge.hard });
                    continue;
                }
                const m = deps.get(owner);
                m.set(edge.target, (m.get(edge.target) || false) || edge.hard); // hard if ANY edge owner->target is hard
            }
        }

        // Kahn topological sort (deterministic: queue kept sorted).
        const indeg = new Map();
        for (const [owner, targets] of deps) indeg.set(owner, targets.size);
        const dependents = new Map();
        for (const n of names) dependents.set(n, []);
        for (const [owner, targets] of deps) for (const t of targets.keys()) dependents.get(t).push(owner);

        const queue = [...names].filter((n) => indeg.get(n) === 0).sort();
        const order = [];
        while (queue.length) {
            const n = queue.shift();
            order.push(n);
            for (const dep of dependents.get(n)) {
                indeg.set(dep, indeg.get(dep) - 1);
                if (indeg.get(dep) === 0) { queue.push(dep); queue.sort(); }
            }
        }

        objectCount += names.size;
        orderedCount += order.length;
        orderedAll.push(...order);

        if (order.length < names.size) {
            const orderSet = new Set(order);
            const cyclic = [...names].filter((n) => !orderSet.has(n)).sort();
            const cyclicSet = new Set(cyclic);
            const hardEdges = [];
            for (const o of cyclic) {
                for (const [tgt, hard] of deps.get(o)) {
                    if (cyclicSet.has(tgt) && hard) hardEdges.push(`${o}->${tgt}`);
                }
            }
            const hard = hardEdges.length > 0;
            violations.push({
                type: hard ? 'hard-cycle' : 'soft-cycle',
                objects: cyclic,
                hardEdges: hardEdges.sort(),
                detail: `${cyclic.length} object(s) form an FK cycle ${hard
                    ? 'with HARD @lookup edges — the single-transaction mj sync push will ROLL BACK'
                    : 'via soft ReferencedType edges — resolved app-side at runtime (tolerable)'}: ${cyclic.join(', ')}`,
            });
        }
    }

    return { objectCount, orderedCount, ordered: orderedAll, violations };
}

/** The blocking subset of violations (dangling FK + hard cycle). Soft cycles are informational only. */
export function blockingDagViolations(result) {
    const v = (result && result.violations) || [];
    return v.filter((x) => x.type === 'dangling-fk' || x.type === 'hard-cycle');
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const isMain = (() => {
    try {
        return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();

function walkIntegrationFiles(root) {
    const out = [];
    let entries;
    try { entries = readdirSync(root); } catch { return out; }
    for (const name of entries) {
        if (name === '.backups' || name === 'node_modules') continue;
        const full = join(root, name);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) out.push(...walkIntegrationFiles(full));
        else if (name.endsWith('.integration.json') && !name.endsWith('.bak')) out.push(full);
    }
    return out;
}

function scanFile(file) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { return { file, error: `unreadable/invalid JSON: ${String(e && e.message ? e.message : e)}`, result: null }; }
    return { file, result: findDagViolations(parsed) };
}

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const all = args.includes('--all');
    const positional = args.filter((a) => !a.startsWith('--'));

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(__dirname, '..', '..', '..', '..', '..'); // graders -> floor -> workshop -> Integration -> packages -> repo

    let files;
    if (all) {
        const root = positional[0] ? resolve(positional[0]) : join(repoRoot, 'metadata', 'integrations');
        files = walkIntegrationFiles(root);
    } else if (positional.length > 0) {
        files = positional.map((p) => resolve(p));
    } else {
        process.stderr.write('usage: node dag-completeness.mjs <metadata-file...> [--json]\n       node dag-completeness.mjs --all [<metadata/integrations root>] [--json]\n');
        process.exit(2);
    }

    const scans = files.map(scanFile);
    // Aggregate across files: each file has its own object graph.
    const perFile = scans.map((s) => ({
        file: s.file,
        error: s.error,
        objectCount: s.result ? s.result.objectCount : 0,
        orderedCount: s.result ? s.result.orderedCount : 0,
        violations: s.result ? s.result.violations.map((v) => ({ ...v, file: s.file })) : [],
    }));
    const allViolations = perFile.flatMap((f) => f.violations);
    const blocking = allViolations.filter((v) => v.type === 'dangling-fk' || v.type === 'hard-cycle');
    const softCycles = allViolations.filter((v) => v.type === 'soft-cycle');

    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify({
            scanned: files,
            perFile: perFile.map((f) => ({ file: f.file, objectCount: f.objectCount, orderedCount: f.orderedCount })),
            violations: allViolations,
            blocking,
            blockingCount: blocking.length,
            softCycleCount: softCycles.length,
            clean: blocking.length === 0,
        }));
        process.exit(0);
    }

    // Human / CI output. Exit 1 on any BLOCKING violation; soft cycles are noted but don't fail.
    if (blocking.length === 0) {
        const totObj = perFile.reduce((a, f) => a + f.objectCount, 0);
        const totOrd = perFile.reduce((a, f) => a + f.orderedCount, 0);
        process.stdout.write(`✓ dag-completeness: ${files.length} file(s), ${totObj} object(s) — DAG complete over ALL objects (ordered ${totOrd}/${totObj}), every FK edge resolves, no hard-@lookup cycle\n`);
        for (const s of softCycles) process.stdout.write(`  note (tolerable soft cycle): ${s.detail} (${s.file})\n`);
        process.exit(0);
    }
    process.stdout.write(`✗ dag-completeness: ${blocking.length} blocking violation(s) — the dependency graph is not whole/syncable over all objects:\n`);
    for (const v of blocking) {
        if (v.type === 'dangling-fk') process.stdout.write(`    - dangling FK: ${v.io} references '${v.target}', which is not an emitted object (${v.hard ? 'hard @lookup' : 'soft'})  (${v.file})\n`);
        else process.stdout.write(`    - hard cycle: ${v.detail}  [${(v.hardEdges || []).join(', ')}]  (${v.file})\n`);
    }
    process.exit(1);
}
