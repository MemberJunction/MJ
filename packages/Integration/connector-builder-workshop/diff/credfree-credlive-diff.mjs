/**
 * cred-free ↔ cred-live diff protocol.
 *
 * Turns "the live (credentialed) run confirms the credential-free run" from a CLAIM into a MEASURED
 * number: of the verification cells that BOTH runs produced, how many did the cred-free run get right
 * (i.e. agree with the cred-live ground truth)? The output `summary` is that fraction — e.g.
 * "cred-free matched cred-live on 7/8 comparable cells".
 *
 * Each input is an array of CELLS. A cell is:
 *     { cellId: string, pass: boolean, rowcounts?: { [key: string]: number } }
 *   - `cellId`  — the stable identifier of a verification cell (a matrix cell / ladder rung / phase).
 *   - `pass`    — the cell's boolean verdict in that run.
 *   - `rowcounts` (optional) — per-stream/per-object counts the cell observed (e.g. {contacts: 42}).
 *
 * Comparison rules (deliberately strict + symmetric):
 *   - A cell is COMPARABLE iff its `cellId` appears in BOTH inputs. Cells present on only one side are
 *     NOT comparable (they prove nothing about cred-free↔cred-live agreement) and are reported
 *     separately in `credFreeOnly` / `credLiveOnly`.
 *   - A comparable cell MATCHES iff the two `pass` values are equal AND — when BOTH sides carry a
 *     `rowcounts` object — every key present in BOTH rowcount objects has the same number. Keys present
 *     on only one rowcount side are ignored (a side may have observed more/fewer streams; we only
 *     contradict on a SHARED key). If either side omits `rowcounts`, rowcounts are not compared.
 *
 * Pure: arrays in → a plain result object out. No I/O. The CLI at the bottom is the standalone gate
 * (two JSON-file paths in argv; exit 1 on any mismatch), mirroring floor/fk-lookup-qualifier.mjs.
 */

/**
 * Build a `cellId → cell` map, last-wins on duplicate ids. Skips non-object / id-less entries so a
 * malformed cell can't crash the diff (it simply doesn't participate).
 *
 * @param {Array<{cellId: string, pass: boolean, rowcounts?: Record<string, number>}>} cells
 * @returns {Map<string, {cellId: string, pass: boolean, rowcounts?: Record<string, number>}>}
 */
function indexByCellId(cells) {
    const map = new Map();
    if (!Array.isArray(cells)) return map;
    for (const cell of cells) {
        if (!cell || typeof cell !== 'object') continue;
        const id = cell.cellId;
        if (typeof id !== 'string' || id.length === 0) continue;
        map.set(id, cell);
    }
    return map;
}

/**
 * Compare two cells' rowcounts on their SHARED keys only. Returns the first disagreeing key (with both
 * values) or null if every shared key agrees / either side has no rowcounts.
 *
 * @param {Record<string, number>|undefined} a
 * @param {Record<string, number>|undefined} b
 * @returns {{ key: string, credFree: number, credLive: number }|null}
 */
function firstRowcountDisagreement(a, b) {
    if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return null;
    for (const key of Object.keys(a)) {
        if (!Object.prototype.hasOwnProperty.call(b, key)) continue; // only contradict on a shared key
        if (a[key] !== b[key]) return { key, credFree: a[key], credLive: b[key] };
    }
    return null;
}

/**
 * Snapshot a cell's verdict + rowcounts for the mismatch report (never leak the whole cell object).
 *
 * @param {{pass: boolean, rowcounts?: Record<string, number>}} cell
 */
function snapshot(cell) {
    return { pass: cell.pass, rowcounts: cell.rowcounts };
}

/**
 * Diff a credential-free verdict set against a credential-live verdict set.
 *
 * @param {Array<{cellId: string, pass: boolean, rowcounts?: Record<string, number>}>} credFreeCells
 * @param {Array<{cellId: string, pass: boolean, rowcounts?: Record<string, number>}>} credLiveCells
 * @returns {{
 *   comparable: number,
 *   matched: number,
 *   mismatches: Array<{ cellId: string, credFree: {pass: boolean, rowcounts?: Record<string, number>}, credLive: {pass: boolean, rowcounts?: Record<string, number>}, why: string }>,
 *   credFreeOnly: string[],
 *   credLiveOnly: string[],
 *   summary: string
 * }}
 */
export function diffVerdicts(credFreeCells, credLiveCells) {
    const freeMap = indexByCellId(credFreeCells);
    const liveMap = indexByCellId(credLiveCells);

    let comparable = 0;
    let matched = 0;
    const mismatches = [];
    const credFreeOnly = [];
    const credLiveOnly = [];

    // Cells on the cred-free side: comparable iff also on the cred-live side.
    for (const [cellId, freeCell] of freeMap) {
        const liveCell = liveMap.get(cellId);
        if (!liveCell) {
            credFreeOnly.push(cellId);
            continue;
        }
        comparable++;

        if (freeCell.pass !== liveCell.pass) {
            mismatches.push({
                cellId,
                credFree: snapshot(freeCell),
                credLive: snapshot(liveCell),
                why: `pass differs (cred-free=${freeCell.pass}, cred-live=${liveCell.pass})`,
            });
            continue;
        }

        const rowDiff = firstRowcountDisagreement(freeCell.rowcounts, liveCell.rowcounts);
        if (rowDiff) {
            mismatches.push({
                cellId,
                credFree: snapshot(freeCell),
                credLive: snapshot(liveCell),
                why: `rowcount differs on key ${rowDiff.key} (cred-free=${rowDiff.credFree}, cred-live=${rowDiff.credLive})`,
            });
            continue;
        }

        matched++;
    }

    // Cells only on the cred-live side.
    for (const cellId of liveMap.keys()) {
        if (!freeMap.has(cellId)) credLiveOnly.push(cellId);
    }

    return {
        comparable,
        matched,
        mismatches,
        credFreeOnly,
        credLiveOnly,
        summary: `cred-free matched cred-live on ${matched}/${comparable} comparable cells`,
    };
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

function loadCells(file) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.cells) ? parsed.cells : parsed);
}

if (isMain) {
    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (positional.length < 2) {
        process.stderr.write('usage: node credfree-credlive-diff.mjs <cred-free-verdicts.json> <cred-live-verdicts.json>\n');
        process.exit(2);
    }

    let credFree;
    let credLive;
    try {
        credFree = loadCells(resolve(positional[0]));
        credLive = loadCells(resolve(positional[1]));
    } catch (e) {
        process.stderr.write(`error: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }

    const result = diffVerdicts(credFree, credLive);

    if (result.mismatches.length === 0) {
        process.stdout.write(`✓ ${result.summary}\n`);
        if (result.credFreeOnly.length > 0) {
            process.stdout.write(`  cred-free-only cells (not comparable): ${result.credFreeOnly.join(', ')}\n`);
        }
        if (result.credLiveOnly.length > 0) {
            process.stdout.write(`  cred-live-only cells (not comparable): ${result.credLiveOnly.join(', ')}\n`);
        }
        process.exit(0);
    }

    process.stdout.write(`✗ ${result.summary} — ${result.mismatches.length} mismatch(es):\n`);
    for (const m of result.mismatches) {
        process.stdout.write(`    - ${m.cellId}: ${m.why}\n`);
    }
    if (result.credFreeOnly.length > 0) {
        process.stdout.write(`  cred-free-only cells (not comparable): ${result.credFreeOnly.join(', ')}\n`);
    }
    if (result.credLiveOnly.length > 0) {
        process.stdout.write(`  cred-live-only cells (not comparable): ${result.credLiveOnly.join(', ')}\n`);
    }
    process.exit(1);
}
