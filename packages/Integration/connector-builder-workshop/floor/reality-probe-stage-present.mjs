/**
 * Deterministic gate: a v2 connector plan MUST contain the RealityProbe stage in its SOURCE — not merely
 * report a probe result in its journal.
 *
 * Why this is a hard gate (the GrowthZone plan-omission hole; AGENT_ARCHITECTURE_AND_THOROUGHNESS.md §4.2/§6.1):
 *   The RealityProbe (S7) is the arc's designed HOW-checker — read-only verdicts on declared claims that catch
 *   the wrong-path / dead-pagination / null-PK / write-under-reach classes (GZ_GATE_AUDIT §1). floor-check
 *   already has `reality-probe-missing`, BUT it only fires when the plan WRITES `journal.realityProbe`. A plan
 *   that simply never calls `phase('RealityProbe')` produces no journal entry, so the journal-keyed rule has
 *   nothing to test — and stays silent. That is exactly what happened on the only real build: `grep -c
 *   realityProbe plans/growthzone.workflow.js` = 0, the stage was absent, and the run finished `PartialPass`
 *   with the probe never run. The journal-keyed gate is necessary but not sufficient; it can be starved by
 *   omission.
 *
 * The fix: a complementary STATIC check over the plan source text. A v2 plan that does not declare the
 * RealityProbe phase (and its ProbeAmend follow-up) is rejected before the journal is even consulted. The two
 * gates compose: `reality-probe-stage-present` proves the stage is in the plan; `reality-probe-missing` proves
 * it actually RAN and produced verdicts; `reality-probe-verdicts-unresolved` proves no falsified claim shipped.
 * A plan cannot pass by omitting the stage (this gate) nor by stubbing it (the journal gates).
 *
 * PROVABLE-ONLY: pure text inspection of the plan source the caller already fetched (floor-check reads
 * `planContent`). No execution, no I/O in the pure function. It looks for the canonical `phase('RealityProbe')`
 * call (single or double quotes, optional whitespace) — the same `phase()` convention every stage uses in
 * `_TEMPLATE.workflow.js`. A NEW-mode or REDO-mode plan must include it; see INTEGRATION_MODES.md for why an
 * ADDITIVE no-op re-prove plan is exempt (it runs a scoped delta test, not a full probe) — the caller passes
 * `{ mode }` so an additive plan is not falsely failed.
 */

/** Match `phase('RealityProbe')` / `phase("RealityProbe")` with tolerant whitespace. */
const PROBE_PHASE_RE = /\bphase\(\s*['"]RealityProbe['"]\s*\)/;
/** ProbeAmend is the mandatory one-round follow-up; its absence is a softer signal (warn, not fail). */
const PROBE_AMEND_RE = /\bphase\(\s*['"]ProbeAmend['"]\s*\)/;

/**
 * Decide whether a plan source includes the RealityProbe stage.
 * @param {string} planSource the planner-emitted `<vendor>.workflow.js` text (floor-check's `planContent`).
 * @param {{ mode?: 'new'|'redo'|'additive' }} [opts] build mode; an `additive` re-prove plan is exempt.
 * @returns {{ pass: boolean, hasProbe: boolean, hasProbeAmend: boolean, mode: string,
 *             failures: Array<{ rule: string, detail: string }>,
 *             warnings: Array<{ rule: string, detail: string }> }}
 */
export function decideRealityProbeStagePresent(planSource, opts = {}) {
    const mode = opts.mode ?? 'new';
    const src = typeof planSource === 'string' ? planSource : '';
    const hasProbe = PROBE_PHASE_RE.test(src);
    const hasProbeAmend = PROBE_AMEND_RE.test(src);
    const failures = [];
    const warnings = [];

    // ADDITIVE re-prove plans run a scoped delta test, not a full RealityProbe — exempt (mode is machine-decided
    // upstream; see INTEGRATION_MODES.md). NEW + REDO are full builds and MUST probe reality before code-build.
    if (mode === 'additive') {
        return { pass: true, hasProbe, hasProbeAmend, mode, failures, warnings };
    }

    if (!src.trim()) {
        failures.push({
            rule: 'reality-probe-stage-absent',
            detail: 'plan source is empty/unreadable — cannot confirm the RealityProbe (S7) stage is present.',
        });
        return { pass: false, hasProbe, hasProbeAmend, mode, failures, warnings };
    }

    if (!hasProbe) {
        failures.push({
            rule: 'reality-probe-stage-absent',
            detail:
                `the ${mode} plan does not declare phase('RealityProbe'). The journal-keyed gates ` +
                `(reality-probe-missing / -verdicts-unresolved) cannot fire on a stage that was never in the ` +
                `plan — this is the GZ plan-omission hole. A full build (new|redo) MUST run the read-only ` +
                `RealityProbe before CodeBuild.`,
        });
    } else if (!hasProbeAmend) {
        // probe present but no ProbeAmend — the one mandatory correction round is missing. Soft (the probe may
        // emit zero falsified verdicts), but worth surfacing: a falsified claim would have nowhere to be fixed.
        warnings.push({
            rule: 'reality-probe-amend-absent',
            detail:
                "phase('RealityProbe') is present but phase('ProbeAmend') is not. The one mandatory amend round " +
                'is where a falsified claim is corrected from the docs; without it a probe verdict cannot be resolved.',
        });
    }

    return { pass: failures.length === 0, hasProbe, hasProbeAmend, mode, failures, warnings };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Usage: node reality-probe-stage-present.mjs <plan.workflow.js> [--mode new|redo|additive] [--json]
if (import.meta.url === `file://${process.argv[1]}`) {
    const { readFileSync } = await import('node:fs');
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const modeIdx = args.indexOf('--mode');
    const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'new';
    const planFile = args.find((a) => !a.startsWith('--') && a !== mode);
    if (!planFile) {
        process.stderr.write('usage: reality-probe-stage-present.mjs <plan.workflow.js> [--mode new|redo|additive] [--json]\n');
        process.exit(2);
    }
    let src = '';
    try {
        src = readFileSync(planFile, 'utf8');
    } catch (e) {
        process.stderr.write(`✗ reality-probe-stage-present: unreadable plan: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }
    const verdict = decideRealityProbeStagePresent(src, { mode });
    if (json) {
        process.stdout.write(JSON.stringify(verdict));
        process.exit(verdict.pass ? 0 : 1);
    }
    if (verdict.pass) {
        const note = verdict.mode === 'additive' ? ' (additive re-prove — RealityProbe not required)' : '';
        process.stdout.write(`✓ reality-probe-stage-present: ${verdict.mode} plan includes the RealityProbe stage${note}\n`);
        for (const w of verdict.warnings) process.stdout.write(`    ⚠ ${w.rule}: ${w.detail}\n`);
        process.exit(0);
    }
    process.stdout.write(`✗ reality-probe-stage-present: ${verdict.failures.length} failure(s):\n`);
    for (const f of verdict.failures) process.stdout.write(`    - ${f.rule}: ${f.detail}\n`);
    process.exit(1);
}
