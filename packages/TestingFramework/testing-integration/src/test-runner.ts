/**
 * test-runner.ts — the minimal sequential TestRunner and the result-shape
 * assertion helpers, lifted verbatim from the original live harness. The
 * additive pieces (the `LastOutcomes` getter and the `EmitOutcomes` /
 * `writeOutcomesFile` helpers) exist so per-test outcomes can be dumped for the
 * golden-equivalence diff; the `Run()` return value (failure count) and ordering
 * semantics are unchanged.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Canonicalize } from '@memberjunction/global';

interface TestCase {
    Name: string;
    Fn: () => Promise<void>;
}

export interface TestOutcome {
    Name: string;
    Passed: boolean;
    DurationMs: number;
    Error?: string;
    /** True when the check did not run: gated off (mutation/live-model tier) or skipped at run time ({@link SkipCheck}). */
    Skipped?: boolean;
}

/** The serialized per-check shape both execution paths emit for the golden diff. */
export interface EmittedOutcome {
    name: string;
    passed: boolean;
    durationMs: number;
    error?: string;
}

/**
 * Minimal sequential test runner. Tests run in registration order (several tests
 * intentionally depend on cache state built up by earlier ones — order matters and
 * is part of what's being tested). Returns the number of failures from Run().
 */
export class TestRunner {
    private tests: TestCase[] = [];
    private lastOutcomes: TestOutcome[] = [];

    constructor(public readonly SuiteName: string) {}

    public Test(name: string, fn: () => Promise<void>): void {
        this.tests.push({ Name: name, Fn: fn });
    }

    public async Run(): Promise<number> {
        console.log(`\n══════ ${this.SuiteName} — ${this.tests.length} tests ══════\n`);
        const outcomes: TestOutcome[] = [];
        for (const test of this.tests) {
            const start = Date.now();
            try {
                await test.Fn();
                outcomes.push({ Name: test.Name, Passed: true, DurationMs: Date.now() - start });
                console.log(`  ✓ ${test.Name} (${Date.now() - start}ms)`);
            } catch (error) {
                if (IsCheckSkip(error)) {
                    outcomes.push({ Name: test.Name, Passed: true, DurationMs: Date.now() - start, Skipped: true });
                    console.log(`  − ${test.Name} SKIPPED — ${error.message}`);
                    continue;
                }
                const message = error instanceof Error ? error.message : String(error);
                outcomes.push({ Name: test.Name, Passed: false, DurationMs: Date.now() - start, Error: message });
                console.log(`  ✗ ${test.Name} (${Date.now() - start}ms)`);
                console.log(`      ${message}`);
            }
        }
        this.lastOutcomes = outcomes;
        const failed = outcomes.filter(o => !o.Passed);
        console.log(`\n────── ${this.SuiteName}: ${outcomes.length - failed.length}/${outcomes.length} passed ──────`);
        if (failed.length > 0) {
            console.log('\nFailures:');
            for (const f of failed) {
                console.log(`  ✗ ${f.Name}\n      ${f.Error}`);
            }
        }
        return failed.length;
    }

    /** Per-test results from the most recent Run(); empty until Run() completes. */
    public get LastOutcomes(): readonly TestOutcome[] {
        return this.lastOutcomes;
    }
}

/**
 * Write per-check outcomes to a JSON file as `{name, passed, durationMs, error?}[]`
 * — the shape the golden-equivalence diff (scripts/integration-golden-diff.mjs)
 * compares. Both the tsx scripts (via EmitOutcomes) and the IntegrationTestDriver
 * call this so the two execution paths produce identical files.
 */
export async function WriteOutcomesFile(path: string, outcomes: readonly TestOutcome[]): Promise<void> {
    const serialized: EmittedOutcome[] = outcomes.map(o => ({
        name: o.Name,
        passed: o.Passed,
        durationMs: o.DurationMs,
        ...(o.Error ? { error: o.Error } : {})
    }));
    // Create the parent directory if needed so an EMIT_OUTCOMES path like /tmp/golden/x.json
    // "just works" without a prior mkdir (writeFile alone throws ENOENT on a missing dir).
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(serialized, null, 2));
}

/** @deprecated Use {@link WriteOutcomesFile}. */
export async function writeOutcomesFile(path: string, outcomes: readonly TestOutcome[]): Promise<void> {
    return WriteOutcomesFile(path, outcomes);
}

/** Dump a finished TestRunner's outcomes for the golden diff (no-op semantics on Run() preserved). */
export async function EmitOutcomes(runner: TestRunner, path: string): Promise<void> {
    await WriteOutcomesFile(path, runner.LastOutcomes);
}

// ────────────────────────────────────────────────────────────────────────────
// Assertions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Thrown by {@link SkipCheck}: the check found a precondition it cannot meet (a fixture not seeded,
 * a transport switched off) and did not run. Both runners record it as a skip — never a pass, never
 * a failure.
 */
export class IntegrationCheckSkip extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = 'IntegrationCheckSkip';
    }
}

/**
 * Ends the running check as SKIPPED. Use it instead of returning early when a precondition is
 * missing: an early return is scored as a pass, which reports coverage the run did not have.
 *
 * @param reason why the check could not run, shown in the run's results
 */
export function SkipCheck(reason: string): never {
    throw new IntegrationCheckSkip(reason);
}

/**
 * Whether `error` is a {@link SkipCheck} skip. Matched by name as well as by class, so a skip
 * thrown from a second loaded copy of this module is still recognised.
 */
export function IsCheckSkip(error: unknown): error is IntegrationCheckSkip {
    return error instanceof IntegrationCheckSkip || (error instanceof Error && error.name === 'IntegrationCheckSkip');
}

export function Assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

/**
 * Sleep for `ms` — lets fire-and-forget run/step/detail saves (BaseEntitySaveQueue) land before a
 * check reads them back. Lifted from the tsx harness so graduated bundles read it from the package.
 */
export const Settle = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** @deprecated Use {@link Settle}. */
export const settle = Settle;

export function AssertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

/** Structural equality for objects and arrays: the two values' canonical JSON must match (object keys in any order). */
export function AssertDeepEqual<T>(actual: T, expected: T, message: string): void {
    const a = Canonicalize(actual);
    const e = Canonicalize(expected);
    if (a !== e) {
        throw new Error(`${message} — expected ${e}, got ${a}`);
    }
}

/** Sorted, lowercased key list of a result row — the canonical "shape" of a row. */
export function RowKeys(row: Record<string, unknown>): string[] {
    return Object.keys(row).map(k => k.toLowerCase()).sort();
}

/**
 * Asserts a row has EXACTLY the expected keys (case-insensitive, order-insensitive).
 * This is the core assertion of the cache suites: cache hit and cache miss must
 * produce identical shapes for identical requests.
 */
export function AssertRowShape(row: Record<string, unknown>, expectedKeys: string[], message: string): void {
    const actual = RowKeys(row);
    const expected = [...expectedKeys.map(k => k.toLowerCase())].sort();
    if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
        throw new Error(`${message} — expected keys [${expected.join(', ')}], got [${actual.join(', ')}]`);
    }
}

export function AssertKeysInclude(row: Record<string, unknown>, keys: string[], message: string): void {
    const actual = new Set(RowKeys(row));
    const missing = keys.filter(k => !actual.has(k.toLowerCase()));
    if (missing.length > 0) {
        throw new Error(`${message} — missing keys [${missing.join(', ')}]; present: [${[...actual].join(', ')}]`);
    }
}

export function AssertKeysExclude(row: Record<string, unknown>, keys: string[], message: string): void {
    const actual = new Set(RowKeys(row));
    const present = keys.filter(k => actual.has(k.toLowerCase()));
    if (present.length > 0) {
        throw new Error(`${message} — keys [${present.join(', ')}] should NOT be present`);
    }
}
