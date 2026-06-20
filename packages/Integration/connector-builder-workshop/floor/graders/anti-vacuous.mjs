/**
 * Deterministic gate: a count-based test cell must prove it actually MOVED DATA — never pass vacuously.
 *
 * Why this is a hard gate (the recurring testing defect this catches):
 *   A live/mocked sync cell that reports `Status='Success'` but `Processed:0` proved NOTHING — the sync ran,
 *   touched zero rows, and "passed". The connector-test conventions are explicit: counts, not adjectives; a
 *   green stage with `processed:0` is a RED FLAG, not a pass. This grader enforces that mechanically: a
 *   count-based cell (forward sync, delta/CRUD, idempotency, capture, pagination) FAILS unless it carries
 *   real, non-zero rowcounts AND every assertion it claims to have measured actually has a value.
 *
 *   The two failure modes it catches:
 *     1. VACUOUS COUNT — a count-based cell that expects data but has missing/empty rowcounts, or any
 *        rowcount that is 0. (A cell that legitimately expects no rows must say so via `expectsData:false`.)
 *     2. UNMEASURED ASSERTION — a value in `cell.asserted` that is null/undefined, i.e. the cell claims an
 *        assertion but never actually captured the measurement behind it.
 *
 * A `cell` = { cellId, kind, expectsData?:boolean, countBased?:boolean, rowcounts?:{...}, asserted?:{...} }.
 *
 * Pure: a cell (or array of cells) in → a verdict out. No I/O. The CLI at the bottom reads a JSON file of
 * cells and prints the verdict (exit 1 on fail), mirroring fk-lookup-qualifier.mjs / bijection.mjs.
 */

/** Cell kinds whose whole point is moving rows — these are count-based by definition. */
const COUNT_BASED_KINDS = new Set(['forward', 'delta', 'idempotent', 'capture', 'pagination']);

/**
 * Is this cell count-based? True when its `kind` is one of the row-moving kinds, OR it is explicitly flagged
 * `countBased:true`.
 *
 * @param {{kind?: string, countBased?: boolean}} cell
 * @returns {boolean}
 */
export function isCountBased(cell) {
    if (!cell || typeof cell !== 'object') return false;
    if (cell.countBased === true) return true;
    return typeof cell.kind === 'string' && COUNT_BASED_KINDS.has(cell.kind);
}

function isEmptyObject(obj) {
    if (obj === null || obj === undefined) return true;
    if (typeof obj !== 'object') return true;
    return Object.keys(obj).length === 0;
}

/**
 * Grade ONE cell. Returns `{pass, reasons}` — `pass:false` with one reason string per distinct failure.
 *
 * Fails when:
 *   - the cell is count-based AND `expectsData !== false` AND (rowcounts is missing/empty OR any rowcount is 0)
 *   - any value in `cell.asserted` is null/undefined (an unmeasured assertion)
 *
 * @param {{cellId?: string, kind?: string, expectsData?: boolean, countBased?: boolean, rowcounts?: Record<string, unknown>, asserted?: Record<string, unknown>}} cell
 * @returns {{pass: boolean, reasons: string[]}}
 */
export function gradeCell(cell) {
    const reasons = [];
    const id = (cell && cell.cellId) || '?';

    if (!cell || typeof cell !== 'object') {
        return { pass: false, reasons: [`cell ${id}: not an object`] };
    }

    // (1) Vacuous-count check — only when count-based AND the cell expects data.
    if (isCountBased(cell) && cell.expectsData !== false) {
        if (isEmptyObject(cell.rowcounts)) {
            reasons.push(`cell ${id}: count-based (kind='${cell.kind ?? 'countBased'}') but rowcounts is missing/empty — no proof data moved`);
        } else {
            const zeros = Object.entries(cell.rowcounts).filter(([, v]) => v === 0);
            for (const [name] of zeros) {
                reasons.push(`cell ${id}: rowcount '${name}' is 0 — count-based cell proved nothing (vacuous pass)`);
            }
        }
    }

    // (2) Unmeasured-assertion check — any asserted value that is null/undefined.
    if (cell.asserted && typeof cell.asserted === 'object') {
        for (const [name, value] of Object.entries(cell.asserted)) {
            if (value === null || value === undefined) {
                reasons.push(`cell ${id}: assertion '${name}' is ${value === null ? 'null' : 'undefined'} — unmeasured assertion`);
            }
        }
    }

    return { pass: reasons.length === 0, reasons };
}

/**
 * Grade MANY cells. Returns `{pass, failing:[{cellId, reasons}]}` — `pass` is true only when every cell passes.
 *
 * @param {Array<object>} cells
 * @returns {{pass: boolean, failing: Array<{cellId: string, reasons: string[]}>}}
 */
export function gradeCells(cells) {
    const list = Array.isArray(cells) ? cells : [];
    const failing = [];
    for (const cell of list) {
        const { pass, reasons } = gradeCell(cell);
        if (!pass) {
            failing.push({ cellId: (cell && cell.cellId) || '?', reasons });
        }
    }
    return { pass: failing.length === 0, failing };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

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
        process.stderr.write('usage: node anti-vacuous.mjs <cells.json> [--json]\n  (cells.json = a single cell object or an array of cells)\n');
        process.exit(2);
    }

    const file = resolve(positional[0]);
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
        process.stderr.write(`✗ anti-vacuous: unreadable/invalid JSON ${file}: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }

    const cells = Array.isArray(parsed) ? parsed : [parsed];
    const verdict = gradeCells(cells);

    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify({
            file,
            graded: cells.length,
            pass: verdict.pass,
            failing: verdict.failing,
        }));
        process.exit(0);
    }

    // Human / CI output. Exit 1 on any failing cell so CI fails loudly.
    if (verdict.pass) {
        process.stdout.write(`✓ anti-vacuous: ${cells.length} cell(s) clean — every count-based cell moved data and every assertion was measured\n`);
        process.exit(0);
    }
    process.stdout.write(`✗ anti-vacuous: ${verdict.failing.length} of ${cells.length} cell(s) failed (vacuous pass / unmeasured assertion):\n`);
    for (const f of verdict.failing) {
        for (const r of f.reasons) process.stdout.write(`    - ${r}\n`);
    }
    process.exit(1);
}
