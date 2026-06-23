/**
 * test-runner.ts — the minimal sequential TestRunner and the result-shape
 * assertion helpers, lifted verbatim from the original live harness. The ONLY
 * change is the additive `LastOutcomes` getter (so per-test outcomes can be
 * inspected for the golden-equivalence diff in later phases); the `Run()` return
 * value (failure count) and ordering semantics are unchanged.
 */

interface TestCase {
    Name: string;
    Fn: () => Promise<void>;
}

export interface TestOutcome {
    Name: string;
    Passed: boolean;
    DurationMs: number;
    Error?: string;
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

// ────────────────────────────────────────────────────────────────────────────
// Assertions
// ────────────────────────────────────────────────────────────────────────────

export function Assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

export function AssertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
