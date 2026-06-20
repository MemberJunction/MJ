/**
 * The flat, layer-tagged, anti-vacuous-by-construction TEST-CELL schema for connector verification.
 *
 * Every behavioral assertion a connector test makes is a *cell*. A cell is FLAT (no nesting), carries the
 * LAYER it exercises (`owner`), and — critically — is anti-vacuous BY CONSTRUCTION: it must carry both an
 * `asserted` flag (was a real assertion run?) and a non-empty `reason` (what was proven, in words). A green
 * `{pass:true}` that never `asserted` anything is the silent-fail trap (`processed:0` masquerading as a
 * pass) the connector-test conventions forbid; making `asserted` + `reason` REQUIRED fields is what stops a
 * cell from claiming victory it didn't earn.
 *
 * The `owner` tag is the other half of the design. It pins each cell to the layer that OWNS the behavior:
 *   - `connector`  — the connector class itself (auth header, pagination loop, CRUD body shape, transform).
 *   - `engine`     — the framework (IntegrationEngine / BaseRESTIntegrationConnector / schema sync). A RED
 *                    engine-owned cell is a FRAMEWORK ticket, NOT a connector failure — see `isFrameworkGap`.
 *   - `metadata`   — the per-vendor `.integration.json` (IO/IOF rows, paths, flags, FK lookups).
 *
 * Why the owner tag matters (the rule it enforces): a connector test must never be able to *bait core
 * surgery*. If a behavioral cell fails because the FRAMEWORK is wrong, the correct outcome is to file an
 * engine ticket and leave the connector — and `@memberjunction/*` core — untouched, NOT to patch the engine
 * inside a connector PR. `isFrameworkGap` is the deterministic classifier that routes a red engine-owned
 * cell away from "fix the connector" and toward "framework gap", protecting the stock-framework invariant.
 *
 * Pure: a cell (or array of cells) in → a validation verdict out. No I/O. Mirrors fk-lookup-qualifier.mjs.
 */

/** The only three layers a cell may be owned by. Anything else is a malformed cell. */
export const CELL_OWNERS = ['connector', 'engine', 'metadata'];

/**
 * Validate a single cell against the flat, anti-vacuous schema.
 *
 * A valid cell is exactly:
 *   {
 *     cellId:        string (non-empty),
 *     owner:         'connector' | 'engine' | 'metadata',
 *     asserted:      boolean,
 *     pass:          boolean,
 *     reason:        string (non-empty),
 *     rowcounts?:    { [k:string]: number },   // optional ground-truth counts that back the assertion
 *     requestIssued?: string                    // optional record of the actual request the cell issued
 *   }
 *
 * @param {unknown} cell
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCell(cell) {
    const errors = [];

    if (!cell || typeof cell !== 'object' || Array.isArray(cell)) {
        return { valid: false, errors: ['cell must be a non-null object'] };
    }

    // cellId — non-empty string
    if (typeof cell.cellId !== 'string' || cell.cellId.trim() === '') {
        errors.push('cellId must be a non-empty string');
    }

    // owner — required + one of the three allowed values
    if (cell.owner === undefined || cell.owner === null) {
        errors.push('owner is required and must be one of: ' + CELL_OWNERS.join(', '));
    } else if (typeof cell.owner !== 'string' || !CELL_OWNERS.includes(cell.owner)) {
        errors.push(`owner must be one of: ${CELL_OWNERS.join(', ')} (got ${JSON.stringify(cell.owner)})`);
    }

    // asserted — must be a real boolean (anti-vacuous: a cell must declare whether it actually asserted)
    if (typeof cell.asserted !== 'boolean') {
        errors.push('asserted must be a boolean');
    }

    // pass — must be a real boolean
    if (typeof cell.pass !== 'boolean') {
        errors.push('pass must be a boolean');
    }

    // reason — non-empty string (anti-vacuous: a cell must say in words what it proved)
    if (typeof cell.reason !== 'string' || cell.reason.trim() === '') {
        errors.push('reason must be a non-empty string');
    }

    // rowcounts — optional, but when present must be a flat map of finite numbers
    if (cell.rowcounts !== undefined) {
        if (!cell.rowcounts || typeof cell.rowcounts !== 'object' || Array.isArray(cell.rowcounts)) {
            errors.push('rowcounts, when present, must be an object map of numbers');
        } else {
            for (const [k, v] of Object.entries(cell.rowcounts)) {
                if (typeof v !== 'number' || !Number.isFinite(v)) {
                    errors.push(`rowcounts.${k} must be a finite number`);
                }
            }
        }
    }

    // requestIssued — optional, but when present must be a string
    if (cell.requestIssued !== undefined && typeof cell.requestIssued !== 'string') {
        errors.push('requestIssued, when present, must be a string');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Is this cell a FRAMEWORK gap rather than a connector failure?
 *
 * A red (`pass:false`) cell whose `owner` is `engine` is a defect in the framework — the connector did its
 * job; the IntegrationEngine / base class / schema sync is what's wrong. Such a cell becomes a FRAMEWORK
 * ticket and MUST NOT trigger surgery on the connector or on `@memberjunction/*` core inside a connector PR.
 * This is the rule that stops a connector test from baiting core changes.
 *
 * Defined on `owner` alone (not on `pass`) so callers can ask "who owns this cell?" independent of outcome:
 * a *passing* engine-owned cell is still framework-owned; it just isn't a gap that needs a ticket. Callers
 * that want "is this a framework cell that's currently failing" combine `isFrameworkGap(cell) && !cell.pass`.
 *
 * @param {unknown} cell
 * @returns {boolean} true when the cell is owned by the engine layer
 */
export function isFrameworkGap(cell) {
    return !!cell && typeof cell === 'object' && cell.owner === 'engine';
}

/**
 * Validate a batch of cells. Returns the overall verdict plus a per-cell breakdown of the invalid ones.
 *
 * @param {unknown} cells  array of cell objects
 * @returns {{valid: boolean, invalid: Array<{cellId: unknown, errors: string[]}>}}
 */
export function validateCells(cells) {
    if (!Array.isArray(cells)) {
        return { valid: false, invalid: [{ cellId: undefined, errors: ['cells must be an array'] }] };
    }
    const invalid = [];
    for (const cell of cells) {
        const { valid, errors } = validateCell(cell);
        if (!valid) {
            const cellId = cell && typeof cell === 'object' ? cell.cellId : undefined;
            invalid.push({ cellId, errors });
        }
    }
    return { valid: invalid.length === 0, invalid };
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
        process.stderr.write('usage: node cell-record.mjs <cells.json> [--json]\n       (file is a single cell object or an array of cells)\n');
        process.exit(2);
    }

    let parsed;
    try {
        parsed = JSON.parse(readFileSync(resolve(positional[0]), 'utf8'));
    } catch (e) {
        process.stderr.write(`unreadable/invalid JSON: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }

    const result = Array.isArray(parsed) ? validateCells(parsed) : (() => {
        const { valid, errors } = validateCell(parsed);
        return { valid, invalid: valid ? [] : [{ cellId: parsed && typeof parsed === 'object' ? parsed.cellId : undefined, errors }] };
    })();

    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify(result));
        process.exit(0);
    }

    if (result.valid) {
        process.stdout.write('✓ cell-record: all cell(s) valid (flat, layer-tagged, anti-vacuous)\n');
        process.exit(0);
    }
    process.stdout.write(`✗ cell-record: ${result.invalid.length} invalid cell(s):\n`);
    for (const bad of result.invalid) {
        process.stdout.write(`    - ${bad.cellId === undefined ? '(no cellId)' : bad.cellId}\n`);
        for (const err of bad.errors) process.stdout.write(`        ${err}\n`);
    }
    process.exit(1);
}
