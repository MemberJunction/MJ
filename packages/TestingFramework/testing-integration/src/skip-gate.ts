/**
 * skip-gate.ts — decides whether a suite run's skips are acceptable.
 *
 * A skipped check verified nothing. The driver records every skip with `details.Skipped`, and
 * stamps whether that skip is on the allowlist: a check gated on the mutation tier, or on
 * credentials the runner does not have. Everything else is an unexpected skip, and an unexpected
 * skip fails the run, as does a bundle whose checks all skipped without an allowance and a
 * registered check that produced no result at all.
 *
 * Pure functions over the engine's result shape, so the CLI can apply the rule after a suite run
 * and unit tests can pin it without a database.
 */
import type { OracleResult, TestRunResult } from '@memberjunction/testing-engine';
import { IntegrationCheckRegistry } from './check-registry';
import type { IntegrationTestConfig } from './types';

/** The `targetType` the IntegrationTestDriver stamps on every result; the gate judges only these. */
export const INTEGRATION_TARGET_TYPE = 'Integration Check Bundle';

/**
 * Why a skip is acceptable. `mutation`: the check writes to the database and runs only when the
 * mutation tier is armed. `credentials`: the check needs model or service credentials the runner
 * does not have. `fixture`: the check needs data CI deliberately does not seed.
 */
export type AllowedSkipGate = 'mutation' | 'credentials' | 'fixture';

/** One allowlist entry: a check that may skip, the gate it waits on, and why. */
export interface AllowedSkip {
    /** Registered check Id, e.g. `prompt-eval-harness.PE7`. */
    CheckId: string;
    Gate: AllowedSkipGate;
    /** Why the skip is expected — printed next to the skip in the run's output. */
    Reason: string;
}

/** The `details` the driver writes on a skipped check's oracle result. */
export interface SkippedCheckDetails {
    DurationMs: number;
    Skipped: true;
    /** True when the skip is on the allowlist (or comes from a declared tier gate). */
    SkipAllowed: boolean;
    SkipGate?: AllowedSkipGate;
    SkipAllowReason?: string;
}

/** One skipped check as the gate reports it. */
export interface SkipGateEntry {
    TestName: string;
    CheckId: string;
    /** The skip message the check or driver recorded. */
    Message: string;
    Gate?: AllowedSkipGate;
    AllowReason?: string;
}

/** A bundle in one test whose every check skipped. */
export interface SkippedBundle {
    TestName: string;
    Bundle: string;
    Checks: number;
    Allowed: boolean;
}

/** A registered check of a selected bundle that produced no result. */
export interface MissingCheck {
    TestName: string;
    CheckId: string;
}

export interface SkipGateReport {
    Allowed: SkipGateEntry[];
    Unexpected: SkipGateEntry[];
    SkippedBundles: SkippedBundle[];
    Missing: MissingCheck[];
    /** False when any skip is unexpected, any bundle skipped entirely without allowance, or any check is missing. */
    Passed: boolean;
}

/** The registered check Ids each test was expected to produce a result for, keyed by test ID. */
export type ExpectedChecksByTest = ReadonlyMap<string, readonly string[]>;

/**
 * The registered check Ids an integration Test should produce a result for: every check of every
 * bundle its Configuration selects, in registry order. Empty when the Configuration is missing or
 * not JSON (the driver reports that as an error on its own).
 *
 * @param configuration the Test's `Configuration` JSON
 */
export function ExpectedCheckIds(configuration: string | null | undefined): string[] {
    if (!configuration) {
        return [];
    }
    let parsed: Partial<IntegrationTestConfig>;
    try {
        parsed = JSON.parse(configuration) as Partial<IntegrationTestConfig>;
    } catch {
        return [];
    }
    const bundles = Array.isArray(parsed.checks) ? parsed.checks.map(c => c.type) : [];
    return [...new Set(bundles)].flatMap(b => IntegrationCheckRegistry.Instance.GetBundle(b).map(c => c.Id));
}

/** Whether an oracle result is a skip the driver recorded. */
export function IsSkippedOracle(result: OracleResult): boolean {
    return readDetails(result)?.Skipped === true;
}

/**
 * Apply the skip rule to a suite run's test results.
 *
 * @param results the suite's per-test results; only integration results ({@link INTEGRATION_TARGET_TYPE}) are judged
 * @param expected registered check Ids per test ID; tests absent from the map are not compared
 */
export function EvaluateSkipGate(results: readonly TestRunResult[], expected: ExpectedChecksByTest = new Map()): SkipGateReport {
    const allowed: SkipGateEntry[] = [];
    const unexpected: SkipGateEntry[] = [];
    const skippedBundles: SkippedBundle[] = [];
    const missing: MissingCheck[] = [];

    for (const result of results.filter(r => r.targetType === INTEGRATION_TARGET_TYPE)) {
        collectSkips(result, allowed, unexpected);
        skippedBundles.push(...findSkippedBundles(result));
        missing.push(...findMissingChecks(result, expected.get(result.testId)));
    }

    const passed = unexpected.length === 0 && missing.length === 0 && skippedBundles.every(b => b.Allowed);
    return { Allowed: allowed, Unexpected: unexpected, SkippedBundles: skippedBundles, Missing: missing, Passed: passed };
}

/** Human-readable summary of a gate report for the CLI output. Empty when nothing skipped or went missing. */
export function FormatSkipGateReport(report: SkipGateReport): string {
    const lines: string[] = [];
    if (report.Allowed.length > 0) {
        lines.push(`Allowed skips (${report.Allowed.length}) — on the allowlist, not counted as coverage:`);
        for (const e of report.Allowed) {
            lines.push(`  − ${e.CheckId} [${e.Gate ?? 'gate'}] ${e.AllowReason ?? ''}`.trimEnd());
            lines.push(`      ${e.TestName}: ${e.Message}`);
        }
    }
    if (report.Unexpected.length > 0) {
        lines.push(`Unexpected skips (${report.Unexpected.length}) — not on the allowlist, the run FAILS:`);
        for (const e of report.Unexpected) {
            lines.push(`  ✗ ${e.CheckId} (${e.TestName}): ${e.Message}`);
        }
    }
    const blocked = report.SkippedBundles.filter(b => !b.Allowed);
    if (blocked.length > 0) {
        lines.push(`Bundles that ran nothing (${blocked.length}) — every check skipped, the run FAILS:`);
        for (const b of blocked) {
            lines.push(`  ✗ ${b.Bundle} (${b.TestName}): all ${b.Checks} check(s) skipped`);
        }
    }
    if (report.Missing.length > 0) {
        lines.push(`Registered checks with no result (${report.Missing.length}) — the run FAILS:`);
        for (const m of report.Missing) {
            lines.push(`  ✗ ${m.CheckId} (${m.TestName})`);
        }
    }
    if (lines.length > 0) {
        lines.unshift('', '  Skip gate', '  ─────────────────────────────────────────');
        lines.push(report.Passed ? 'Skip gate: PASSED' : 'Skip gate: FAILED');
    }
    return lines.join('\n');
}

function collectSkips(result: TestRunResult, allowed: SkipGateEntry[], unexpected: SkipGateEntry[]): void {
    for (const oracle of result.oracleResults ?? []) {
        const details = readDetails(oracle);
        if (details?.Skipped !== true) {
            continue;
        }
        const entry: SkipGateEntry = {
            TestName: result.testName,
            CheckId: oracle.oracleType,
            Message: oracle.message,
            Gate: details.SkipGate,
            AllowReason: details.SkipAllowReason
        };
        (details.SkipAllowed === true ? allowed : unexpected).push(entry);
    }
}

function findSkippedBundles(result: TestRunResult): SkippedBundle[] {
    const byBundle = new Map<string, { total: number; skipped: number; allowed: number }>();
    for (const oracle of result.oracleResults ?? []) {
        const bundle = bundleOf(oracle.oracleType);
        if (!bundle) {
            continue;
        }
        const counts = byBundle.get(bundle) ?? { total: 0, skipped: 0, allowed: 0 };
        counts.total++;
        const details = readDetails(oracle);
        if (details?.Skipped === true) {
            counts.skipped++;
            if (details.SkipAllowed === true) {
                counts.allowed++;
            }
        }
        byBundle.set(bundle, counts);
    }
    const out: SkippedBundle[] = [];
    for (const [bundle, counts] of byBundle) {
        if (counts.total > 0 && counts.skipped === counts.total) {
            out.push({ TestName: result.testName, Bundle: bundle, Checks: counts.total, Allowed: counts.allowed === counts.total });
        }
    }
    return out;
}

function findMissingChecks(result: TestRunResult, expected: readonly string[] | undefined): MissingCheck[] {
    if (!expected || expected.length === 0) {
        return [];
    }
    // A whole-test skip (tier gate, unreachable MJAPI) or a bootstrap error reports one 'gate' /
    // 'error' entry and no checks; the skip itself is judged above and an error already fails.
    if (result.status === 'Skipped' || result.status === 'Error') {
        return [];
    }
    const seen = new Set((result.oracleResults ?? []).map(o => o.oracleType));
    return expected.filter(id => !seen.has(id)).map(id => ({ TestName: result.testName, CheckId: id }));
}

/** `<bundle>.<check>` → `<bundle>`; undefined for driver-level entries ('gate', 'error'). */
function bundleOf(oracleType: string): string | undefined {
    const dot = oracleType.indexOf('.');
    return dot > 0 ? oracleType.slice(0, dot) : undefined;
}

function readDetails(result: OracleResult): Partial<SkippedCheckDetails> | undefined {
    const details = result.details;
    return details !== null && typeof details === 'object' ? details as Partial<SkippedCheckDetails> : undefined;
}
