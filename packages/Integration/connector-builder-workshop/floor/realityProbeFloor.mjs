/**
 * Canonical pure decision for the floor-check `reality-probe-*` rules — the GZ-class regression guard.
 *
 * GrowthZone shipped GREEN with 17 wrong API paths, dead pagination (`skip` vs `$skip` + uncapped pages),
 * PKs declared on always-null fields, and pull-only metadata for a write-capable vendor — because docs-derived
 * claims were NEVER checked against the live system before code was built. The v2 fix is the RealityProbe (S7):
 * it runs read-only on EVERY build BEFORE code-build, emits VERDICTS on the declared claims (paths, pagination,
 * PK populated/null, watermark accepted, write-surface existence), feeds a ProbeAmend round, and floor-check
 * BLOCKS the build if any falsified claim is left unresolved.
 *
 * This module is the canonical, testable statement of that floor decision. NOTE: floor-check.workflow.js keeps
 * its OWN inline copy (workflow scripts run sandboxed and cannot import local modules); the companion test
 * (`realityProbeFloor.test.mjs`) includes a DRIFT GUARD that fails if floor-check's inline enforcement stops
 * implementing these rules — so the GZ guard cannot be silently weakened.
 *
 * Pure: probe object in → `{rule, detail}[]` out. No I/O, no globals.
 *
 * @param {null | { verdicts?: Array<{ claim?: string, verdict?: string, resolved?: boolean }>, metadataDelta?: boolean }} probe
 *        The RealityProbe (S7) journal entry. `null` = the stage did not run.
 * @returns {Array<{ rule: string, detail: string }>} floor-check failures (empty = passes the probe gate).
 */
export function decideRealityProbeFloor(probe) {
    const failures = [];

    // S7 is MANDATORY on every v2 build (degraded unauthenticated status-probe when no credential).
    if (!probe) {
        failures.push({
            rule: 'reality-probe-missing',
            detail: 'RealityProbe (S7) did not run. Required on every v2 build — with a credential it emits read-only verdicts on declared claims (paths/pagination/PKs/watermark/write-surface); without one it degrades to the unauthenticated per-claim status probe.',
        });
        return failures;
    }

    // Any declared claim the probe FALSIFIED and that was NOT resolved by ProbeAmend blocks the build —
    // reality outranks the frozen contract. This is the gate that would have caught every GZ defect.
    const falsified = Array.isArray(probe.verdicts)
        ? probe.verdicts.filter(v => v && (v.verdict === 'wrong' || v.verdict === 'falsified') && v.resolved !== true)
        : [];
    if (falsified.length > 0) {
        failures.push({
            rule: 'reality-probe-verdicts-unresolved',
            detail: `${falsified.length} probe-falsified claim(s) unresolved at floor time (first: ${JSON.stringify(falsified[0]).slice(0, 200)}). Verdicts feed ProbeAmend; reality outranks the frozen contract.`,
        });
    }

    // Anti-baking firewall: the probe emits VERDICTS only — it must never AUTHOR metadata from live data.
    if (probe.metadataDelta === true) {
        failures.push({
            rule: 'reality-probe-authored-metadata',
            detail: 'the RealityProbe stage originated a metadata delta — the probe emits VERDICTS only; authorship from live data is forbidden (the anti-baking firewall).',
        });
    }

    return failures;
}

/**
 * The concrete GZ failures, each expressed as the probe verdict that catches it. Drives the regression test:
 * every one of these MUST produce a `reality-probe-verdicts-unresolved` floor failure (i.e. block the build).
 * This is the auditable GZ-failure → guard mapping.
 */
export const GZ_REGRESSION_CASES = [
    { gz: 'GZ §B — 17 wrong API paths', verdict: { claim: 'path:/api/v1/contacts', verdict: 'wrong', detail: 'declared path returned 404' } },
    { gz: 'GZ #1/#2/#3 — dead pagination (skip vs $skip, uncapped pages)', verdict: { claim: 'pagination:contacts', verdict: 'falsified', detail: 'declared page param did not advance the result set' } },
    { gz: 'GZ #5 — PK declared on an always-null field', verdict: { claim: 'pk:contacts.OrganizationId', verdict: 'falsified', detail: 'declared PK null across the entire probe page' } },
    { gz: 'GZ #30 — pull-only metadata but write endpoints exist', verdict: { claim: 'write-surface:contacts', verdict: 'wrong', detail: 'OPTIONS/405 evidence shows a writable surface the metadata denied' } },
];
