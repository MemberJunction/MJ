/**
 * Shared "best available results" loader for the report generators (DR-D5).
 *
 * A run that dies mid-flight — the node runner OOM'ing is the case that
 * prompted this — never writes `results.json`, so every downstream generator
 * threw ENOENT and the run produced no report at all, even though
 * `results.partial.json` held 68 completed tests on disk. `generate-summary`
 * already had a private fallback (it was the only artifact that survived);
 * this module lifts that logic out so md/junit/html use the same rule.
 *
 * The two files have different shapes, so the loader normalizes them:
 *   - `results.json`         → `{ testResults: [...] }`, full per-test detail
 *     (oracleResults, testRunId, sequence, tier, replay, …)
 *   - `results.partial.json` → `{ tests: [...] }`, thin rows
 *     (testId, testName, status, score, durationMs, workerIndex, attempts, flaky)
 *
 * Consumers MUST treat the rich fields as optional and degrade when
 * `source === 'partial'`. Screenshot extraction is the one thing the partial
 * genuinely cannot drive — it has no `testRunId`.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} runDir
 * @returns {{source:'final'|'partial', suiteName?:string, status?:string,
 *            durationMs?:number, tests:object[], partial:boolean} | null}
 *          null when neither file is readable.
 */
function loadRunResults(runDir) {
    const finalPath = path.join(runDir, 'results.json');
    if (fs.existsSync(finalPath)) {
        try {
            const r = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
            return {
                source: 'final',
                partial: false,
                suiteName: r.suiteName,
                status: r.status,
                durationMs: r.durationMs,
                tests: r.testResults || [],
            };
        } catch { /* corrupt final — fall through to the partial */ }
    }
    const partialPath = path.join(runDir, 'results.partial.json');
    if (fs.existsSync(partialPath)) {
        try {
            const p = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
            return {
                source: 'partial',
                partial: true,
                suiteName: p.suiteName,
                status: p.status,
                durationMs: undefined,
                tests: p.tests || [],
            };
        } catch { /* fall through */ }
    }
    return null;
}

/** One-line banner for reports rendered from a crashed run's partial data. */
function partialNotice(loaded) {
    return loaded.partial
        ? 'Rendered from `results.partial.json` — the run did not finish, so this covers only completed tests and omits per-oracle detail.'
        : null;
}

module.exports = { loadRunResults, partialNotice };
