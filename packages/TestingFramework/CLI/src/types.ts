/**
 * @fileoverview CLI-specific types and interfaces
 * @module @memberjunction/testing-cli
 */

/**
 * Output format options for CLI commands
 */
export type OutputFormat = 'console' | 'json' | 'markdown';

/**
 * CLI configuration loaded from mj.config.cjs
 */
export interface CLIConfig {
    defaultEnvironment?: string;
    defaultFormat?: OutputFormat;
    failFast?: boolean;
    parallel?: boolean;
    maxParallelTests?: number;
    timeout?: number;
    database?: {
        host?: string;
        name?: string;
        port?: number;
        username?: string;
        password?: string;
        schema?: string;
    };
}

/**
 * Common flags shared across commands
 */
export interface CommonFlags {
    format?: OutputFormat;
    output?: string;
    verbose?: boolean;
    /**
     * Path to a CommonJS or ESM module that exports custom `IOracle` classes
     * or instances. Each exported oracle is registered on the engine before
     * the test/suite runs — used by non-MJ adopters (Mode C) to plug their
     * own oracle types without modifying TestingFramework.
     */
    oraclesModule?: string;
    /** Ad-hoc integration-check module to preload (config `testing.checkModules` is the durable form). */
    checksModule?: string;
}

/**
 * Flags for run command
 */
export interface RunFlags extends CommonFlags {
    name?: string;
    suite?: string;
    tag?: string;
    category?: string;
    difficulty?: string;
    all?: boolean;
    dryRun?: boolean;
    environment?: string;
    /**
     * Variable values to pass to the test (format: name=value)
     * Can be specified multiple times for multiple variables
     */
    var?: string[];
}

/**
 * Flags for suite command
 */
export interface SuiteFlags extends CommonFlags {
    name?: string;
    parallel?: boolean;
    failFast?: boolean;
    sequence?: string;
    /**
     * Variable values to pass to all tests in the suite (format: name=value)
     * Can be specified multiple times for multiple variables
     */
    var?: string[];
    /**
     * Maximum number of parallel workers (default 4).
     */
    maxParallel?: number;
    /**
     * Delay in milliseconds between test executions.
     * Useful for avoiding rate limits (e.g., Auth0 brute-force protection).
     */
    delay?: number;
    /**
     * Run each test N times to detect flakiness via score variance.
     * Tests with score variance > 0.3 across iterations are flagged [FLAKY].
     * Recommended: 3 (statistical minimum), 5 (more reliable detection).
     */
    flakyCheck?: number;
    /**
     * Retry a FAILED test up to N extra times before accepting the failure
     * (pass-if-any-attempt-passes). 0 (default) disables retries. A test that
     * fails then passes is reported as flaky. Useful for non-deterministic
     * (LLM-driven) suites where transient failures should not fail the run.
     */
    maxRetries?: number;
    /**
     * Restrict the run to specific tests by NAME (comma-separated). Resolved to
     * IDs against the engine and applied as selectedTestIds — used by
     * `rerun-failures` and ad-hoc selection. Unresolved names warn (non-fatal).
     */
    tests?: string;
    /**
     * Suite wall-clock budget in SECONDS. Once elapsed, dispatch of new
     * tests stops and the run finalizes gracefully with partial results. Overrides
     * TestSuite.MaxExecutionTimeMS; unset ⇒ that column (or unbounded).
     */
    maxSuiteDuration?: number;
    /**
     * Enable the circuit breaker: abort a doomed run early on a window of
     * environment-class failures or a total failure cap. Default off.
     */
    circuitBreaker?: boolean;
    /**
     * Total-failure cap for the circuit breaker (any category). Default
     * max(10, 25% of the suite). Only meaningful with --circuit-breaker.
     */
    maxFailures?: number;
}

/**
 * Flags for list command
 */
export interface ListFlags extends CommonFlags {
    type?: string;
    suites?: boolean;
    types?: boolean;
    tag?: string;
    status?: string;
    /**
     * Show available variables for the test/test type
     */
    showVariables?: boolean;
}

/**
 * Flags for validate command
 */
export interface ValidateFlags extends CommonFlags {
    all?: boolean;
    type?: string;
    saveReport?: boolean;
}

/**
 * Flags for report command. Produces a per-run aggregate + cross-run trend.
 */
export interface ReportFlags extends CommonFlags {
    /** Restrict to the named test suite (matched against the suite-run's denormalized Suite name). */
    suite?: string;
    /** Report on this specific suite-run ID instead of the latest run. */
    baseline?: string;
}

/**
 * Flags for history command. Produces per-test duration/flake history.
 */
export interface HistoryFlags extends CommonFlags {
    /** Restrict to a single test by name. */
    test?: string;
    /** Restrict to runs belonging to the named suite. */
    suite?: string;
    /** Max recent test-run records to analyze (newest-first). Default 50. */
    limit?: number;
}

/**
 * Flags for compare command
 */
export interface CompareFlags extends CommonFlags {
    version?: string[];
    commit?: string[];
    diffOnly?: boolean;
    /** Compare the two most recent completed suite runs */
    latest?: boolean;
    /** Compare two results.json files directly (no DB needed). Takes two file paths. */
    fromJson?: string[];
    /**
     * Filter suite runs by a single tag. Matches against `MJTestSuiteRunEntity.Tags`,
     * which is a JSON array string (e.g., `["staging-nightly","sonnet-4.6"]`).
     * Used to isolate runs from a specific source environment when an archive MJ
     * holds multiple sources side-by-side. DB mode only — `--from-json` ignores it
     * because `results.json` does not currently emit the Tags field.
     */
    tag?: string;
}
