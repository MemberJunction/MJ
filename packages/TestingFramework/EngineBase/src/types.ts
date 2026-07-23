/**
 * Core type definitions for the Testing Framework
 * These types are UI-safe and do not depend on execution logic
 */

/**
 * Log message from test execution
 */
export interface TestLogMessage {
  /**
   * Timestamp when the message was logged
   */
  timestamp: Date;

  /**
   * Log level
   */
  level: 'info' | 'warn' | 'error' | 'debug';

  /**
   * Log message content
   */
  message: string;

  /**
   * Optional metadata for additional context
   */
  metadata?: Record<string, unknown>;
}

/**
 * Progress callback for test execution
 */
export interface TestProgress {
  /**
   * Current execution step
   */
  step: string;

  /**
   * Progress percentage (0-100)
   */
  percentage: number;

  /**
   * Human-readable message
   */
  message: string;

  /**
   * Additional metadata
   */
  metadata?: {
    testName?: string;
    testRun?: unknown;
    driverType?: string;
    oracleType?: string;
    [key: string]: unknown;
  };
}

/**
 * Variables to pass to a test/suite run
 */
export interface TestRunVariables {
    [variableName: string]: string | number | boolean | Date;
}

/**
 * Options for running a single test
 */
export interface TestRunOptions {
  /**
   * Verbose logging
   */
  verbose?: boolean;

  /**
   * Validate configuration without executing
   */
  dryRun?: boolean;

  /**
   * Environment context (dev, staging, prod)
   */
  environment?: string;

  /**
   * Git commit SHA for versioning
   */
  gitCommit?: string;

  /**
   * Agent/system version being tested
   */
  agentVersion?: string;

  /**
   * Override test configuration
   */
  configOverride?: Record<string, unknown>;

  /**
   * Progress callback for real-time updates
   */
  progressCallback?: (progress: TestProgress) => void;

  /**
   * Log callback for streaming execution details to the test run log
   */
  logCallback?: (message: TestLogMessage) => void;

  /**
   * Tags to apply to the test run (JSON string array)
   */
  tags?: string;

  /**
   * Variable values to use for this run.
   * These values take highest priority in the resolution order:
   * run > suite > test > type
   */
  variables?: TestRunVariables;

  /**
   * Override the test's RepeatCount field at runtime.
   * Useful for flaky-test detection: forces every test in the run to execute
   * N times so the suite runner can compute score variance.
   * If undefined, the test's own RepeatCount is used.
   */
  repeatCountOverride?: number;

  /**
   * Number of extra attempts to retry a FAILED test before accepting the failure
   * (pass-if-any-attempt-passes). 0 (default) disables retries.
   *
   * For non-deterministic targets (e.g. LLM-driven Computer Use tests) a test can
   * fail transiently — a timeout, a navigation loop, or the agent giving up — yet
   * pass cleanly on a re-run. Retrying absorbs that variance so the suite result
   * reflects genuine failures, not one-off flakes. A test that fails then passes is
   * marked `flaky` (see {@link TestRunResult.flaky}) so flakiness stays visible and
   * is never silently masked.
   *
   * Only applies to single-execution tests; RepeatCount tests are not retried.
   */
  maxRetries?: number;
}

/**
 * Dispatch ordering for the parallel work queue (DR-D1).
 * - `suite` — original suite sequence (historical behavior; default).
 * - `longest-first` — LPT scheduling: dispatch highest mean-duration tests first
 *   so the long pole starts at t=0 and short tests backfill the tail. Requires
 *   duration history (DR-G6); without it, degrades to `suite`.
 */
export type SeedOrder = 'suite' | 'longest-first';

/**
 * Options for running a test suite
 */
export interface SuiteRunOptions extends TestRunOptions {
  /**
   * Run tests in parallel
   */
  parallel?: boolean;

  /**
   * Order tests come off the shared parallel work queue (DR-D1). Does not
   * change each test's reporting `sequence` (always its suite position) — only
   * dispatch order. Default `suite`.
   */
  seedOrder?: SeedOrder;

  /**
   * Path to the DR-G4 supervisor's `health-state.json` (DR-D3). When set, the
   * parallel work queue consults it before each dispatch: sheds workers when the
   * host is `degraded`, pauses when `critical`. Absent (or file missing) ⇒ no
   * admission control — the run proceeds at full concurrency. Typically derived
   * from the `--output` run directory by the CLI.
   */
  healthStatePath?: string;

  /**
   * Stop on first failure
   */
  failFast?: boolean;

  /**
   * Maximum parallel tests (if parallel=true)
   */
  maxParallel?: number;

  /**
   * Run only specific sequence numbers (e.g., [1, 3, 5] runs tests at those positions)
   */
  sequence?: number[];

  /**
   * Run only specific tests by their IDs.
   * If provided, only tests with matching IDs will be executed.
   */
  selectedTestIds?: string[];

  /**
   * Start execution from this sequence number (inclusive).
   * Tests with sequence numbers less than this value will be skipped.
   */
  sequenceStart?: number;

  /**
   * Stop execution at this sequence number (inclusive).
   * Tests with sequence numbers greater than this value will be skipped.
   */
  sequenceEnd?: number;

  /**
   * Delay in milliseconds between test executions.
   * Useful for avoiding rate limits (e.g., Auth0 brute-force protection)
   * when tests perform repeated logins from the same IP.
   */
  delayBetweenTests?: number;

  /**
   * Fired the moment each test resolves its final result (after any retries),
   * in whichever worker ran it (DR-D5). The suite runner uses this to persist
   * results incrementally — one JSONL line per attempt + an atomic partial
   * snapshot — so a crashed or OOM-killed run preserves every completed test
   * instead of losing everything (results.json is otherwise written once at the
   * very end). Must be cheap and non-throwing; the engine invokes it inline in
   * the worker loop and swallows any error it throws.
   */
  onTestComplete?: (result: TestRunResult) => void;

  /**
   * Fired when a worker DISPATCHES a test — before execution, once per test
   * (not per retry) (DR-D4 heartbeat). Lets the sink record in-flight tests so
   * `status` can show what each worker is running and surface a test that never
   * completes (a wedged worker) instead of it being invisible. Cheap + non-throwing.
   */
  onTestStart?: (info: TestStartInfo) => void;

  /**
   * Suite wall-clock budget in ms (DR-D4, `--max-suite-duration`). Once elapsed,
   * the runner stops dispatching NEW tests and finalizes gracefully with partial
   * results; the in-flight test still finishes. Falls back to
   * `TestSuite.MaxExecutionTimeMS` when unset; no budget ⇒ unbounded (historical).
   */
  maxSuiteDurationMs?: number;

  /**
   * Suite circuit breaker (DR-D7). Aborts a doomed run early instead of burning
   * hours: a sliding window of environment-class failures (degrading host) or a
   * plain failure cap (broken deploy). Opt-in — omitted/`enabled:false` ⇒ off
   * (default). Recommended on for CI.
   */
  circuitBreaker?: CircuitBreakerOptions;
}

/** Circuit-breaker configuration passed through {@link SuiteRunOptions} (DR-D7). */
export interface CircuitBreakerOptions {
  /** Master switch. Default false (off). */
  enabled?: boolean;
  /** Sliding-window size for the environment tier. Default 10. */
  windowSize?: number;
  /** Fraction of the window that must be env-class failures to trip. Default 0.6. */
  envFailureThreshold?: number;
  /** Total failures (any category) that trip the run. Default max(10, ceil(0.25 × suiteSize)). */
  maxFailures?: number;
}

/** Heartbeat payload emitted when a worker picks up a test (DR-D4). */
export interface TestStartInfo {
  testId: string;
  testName: string;
  /** Zero-based worker index (undefined for sequential runs). */
  workerIndex?: number;
  /** ISO timestamp the worker began this test. */
  startedAt: string;
}

/**
 * Oracle evaluation result
 */
export interface OracleResult {
  /**
   * Oracle type that produced this result
   */
  oracleType: string;

  /**
   * Whether the oracle check passed
   */
  passed: boolean;

  /**
   * Numeric score (0.0 to 1.0)
   */
  score: number;

  /**
   * Human-readable message
   */
  message: string;

  /**
   * Additional details (oracle-specific)
   */
  details?: unknown;

  /**
   * When true, this oracle is *advisory*: its result is reported and scored for
   * diagnostics but does NOT gate the test's Passed/Failed status (CU-D3). Used
   * for efficiency/quality signals (e.g. step-count) that shouldn't fail an
   * otherwise-successful run. Drivers set this from the oracle's config; absent
   * or false means the oracle gates as normal.
   */
  advisory?: boolean;
}

/**
 * Result from running a single test
 */
/**
 * Lightweight record of a single retry attempt that was superseded by a later
 * one (CU-F3). Carries just enough to diagnose *why* an earlier attempt failed
 * — flakiness is the suite's #1 signal — while deliberately omitting heavy
 * payloads (screenshots, oracle results) so retaining attempt history does not
 * reintroduce a per-run memory ramp.
 */
export interface PriorAttemptSummary {
  /** 1-based attempt number. */
  attempt: number;
  /** Terminal status of this superseded attempt. */
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Timeout';
  /** Score this attempt achieved. */
  score: number;
  /** How long this attempt ran, in ms. */
  durationMs: number;
  /** Error/diagnostic message from this attempt, if any. */
  errorMessage?: string;
  /**
   * Normalized failure category of this superseded attempt (RI-D2), when it was
   * classified. Lets the next attempt and reporting see *what kind* of failure
   * preceded it without retaining the full result.
   */
  failureCategory?: FailureCategory;
  /**
   * The driver's non-blind retry memo for this attempt (RI-D2) — a short,
   * payload-free "here's what went wrong last time" the driver can feed to the
   * next attempt (as `PreviousAttemptSummary`) so attempt 2+ isn't a blind
   * re-roll. Present only when the driver produced one.
   */
  failureMemo?: string;
}

/**
 * Normalized failure taxonomy the retry scheduler keys policy on (DR-D2).
 * Drivers may emit their own free-form `failureClass`; the engine normalizes it
 * (or regex-classifies the judge/error message as a stopgap) into one of these:
 * - `timeout`     — the run exceeded its time budget.
 * - `nav-loop`    — the agent looped / repeated the same action or page.
 * - `blank-page`  — a blank/empty/non-rendering page (a.k.a. stuck-page).
 * - `app-error`   — deterministic app fault: 500, uncaught exception, missing
 *                   bundle/key, empty dataset. Retrying is pure waste → 0 retries.
 * - `auth-detour` — an unexpected login/auth redirect (usually transient).
 * - `assertion`   — an oracle/assertion said the output was wrong.
 * - `impossible`  — the target judged the task infeasible / gave up → 0 retries.
 * - `infra`       — network/connection/browser-crash below the app.
 * - `unknown`     — could not be classified.
 */
export type FailureCategory =
  | 'timeout'
  | 'nav-loop'
  | 'blank-page'
  | 'app-error'
  | 'auth-detour'
  | 'assertion'
  | 'impossible'
  | 'infra'
  | 'unknown';

export interface TestRunResult {
  /**
   * Test Run ID
   */
  testRunId: string;

  /**
   * Test ID
   */
  testId: string;

  /**
   * Test name (from lookup field)
   */
  testName: string;

  /**
   * Test execution status
   */
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Timeout';

  /**
   * Overall score (0.0000 to 1.0000)
   */
  score: number;

  /**
   * Number of checks that passed
   */
  passedChecks: number;

  /**
   * Number of checks that failed
   */
  failedChecks: number;

  /**
   * Total number of checks
   */
  totalChecks: number;

  /**
   * Oracle evaluation results
   */
  oracleResults: OracleResult[];

  /**
   * Optional sub-category or variant label for the test target.
   * Use for ad-hoc labeling or to distinguish test scenarios within the same entity type.
   * Examples: "Summarization", "Classification", "Code Review", "Multi-turn Chat"
   */
  targetType: string;

  /**
   * Entity ID identifying the type of target being tested.
   * References Entity.ID (e.g., Entity ID for "MJ: AI Agent Runs").
   */
  targetLogEntityId?: string;

  /**
   * Target entity ID (e.g., AIAgentRun.ID)
   */
  targetLogId: string;

  /**
   * Execution duration in milliseconds
   */
  durationMs: number;

  /**
   * Cost in USD
   */
  totalCost: number;

  /**
   * When execution started
   */
  startedAt: Date;

  /**
   * When execution completed
   */
  completedAt: Date;

  /**
   * Error message if status is Error
   */
  errorMessage?: string;

  /**
   * Iteration number for repeated tests (when RepeatCount > 1)
   */
  sequence?: number;

  /**
   * Total number of attempts made for this test, including the first.
   * 1 when no retry occurred; >1 when retried (see {@link TestRunOptions.maxRetries}).
   */
  attempts?: number;

  /**
   * True when the test FAILED at least once but ultimately PASSED on a retry.
   * The final `status` is `Passed`, but `flaky` flags that it was non-deterministic
   * — so reports can surface it and genuine app flakiness is never silently masked.
   */
  flaky?: boolean;

  /**
   * Resolved variables that were used for this test run
   */
  resolvedVariables?: ResolvedTestVariables;

  /**
   * Lightweight summaries of each FAILED attempt that preceded the final
   * result, oldest first (CU-F3). Present only when the test was retried.
   * Preserves *why* earlier attempts failed so flakiness is diagnosable — the
   * final `result` object no longer silently discards attempt 1's failure.
   */
  priorAttempts?: PriorAttemptSummary[];

  /**
   * Zero-based index of the parallel worker that ran this test (DR-D5).
   * Undefined for sequential runs. Enables per-worker swimlane timelines and
   * "poisoned worker" analysis in reporting (DR-G2).
   */
  workerIndex?: number;

  /**
   * Normalized failure classification (DR-D2), present only for non-passing
   * results. Sourced from the driver's `failureClass` when it sets one, else
   * regex-classified from the judge/error message. The retry scheduler keys
   * policy on it (`impossible`/`app-error` → 0 retries); reporting and `compare`
   * tally by it. See {@link FailureCategory}.
   */
  failureCategory?: FailureCategory;

  /**
   * The driver's non-blind retry memo for a non-passing result (RI-D2), surfaced
   * from the engine (e.g. Computer Use's `ComputerUseResult.FailureMemo`). Copied
   * into each {@link PriorAttemptSummary} so `runWithRetries` can feed it forward
   * to the next attempt. Absent on success or when the driver produced none.
   */
  failureMemo?: string;

  /**
   * Execution-tier label a tiered driver reports (RI-C1) — e.g. Computer Use's
   * `'replay'` / `'replay-with-heal'` / `'llm'`. The tier that PRODUCED this
   * result: a replay that diverged and fell back reports `'llm'`. Reporting
   * segments tier mix / replay share by it. Absent for single-tier drivers.
   */
  tier?: string;

  /**
   * Replay telemetry (RI-C1/RI-D4), present whenever a replay was ATTEMPTED —
   * so the drift signal (`diverged` > 0) survives even a green LLM-fallback
   * result. Absent on pure-LLM runs. See {@link ReplayTelemetry}.
   */
  replay?: ReplayTelemetry;
}

/**
 * Compact per-attempt replay outcome a tiered driver may surface (RI-C1/RI-D4).
 * Mirrors the engine's replay counts so the report's replay-health panel and the
 * "is replay lying to us?" check can be computed without the full step list.
 */
export interface ReplayTelemetry {
  /** The replay sub-tier the run dispatched into. */
  tier: 'replay' | 'replay-with-heal';
  /** Number of trace steps replayed. */
  steps: number;
  /** Steps that self-healed (recorded target drifted, re-resolved). */
  healed: number;
  /** Steps that diverged (replay+heal failed) — the UI-drift signal. */
  diverged: number;
  /** Whether every step hit or healed (no unrecovered divergence). */
  allStepsSucceeded: boolean;
  /** Whether a divergence forced an in-attempt fall back to the LLM tier. */
  fellBackToLlm: boolean;
}

/**
 * Result from running a test suite
 */
export interface TestSuiteRunResult {
  /**
   * Suite Run ID
   */
  suiteRunId: string;

  /**
   * Suite ID
   */
  suiteId: string;

  /**
   * Suite name (from lookup field)
   */
  suiteName: string;

  /**
   * Suite execution status
   */
  status: 'Completed' | 'Failed' | 'Cancelled' | 'Pending' | 'Running';

  /**
   * Tests that passed
   */
  passedTests: number;

  /**
   * Tests that failed
   */
  failedTests: number;

  /**
   * Tests that passed only after a retry (failed at least once first).
   * A subset of `passedTests` — surfaces flakiness without masking it.
   */
  flakyTests?: number;

  /**
   * Total tests
   */
  totalTests: number;

  /**
   * Average score across all tests
   */
  averageScore: number;

  /**
   * Individual test results
   */
  testResults: TestRunResult[];

  /**
   * Total duration in milliseconds
   */
  durationMs: number;

  /**
   * Total cost in USD
   */
  totalCost: number;

  /**
   * When execution started
   */
  startedAt: Date;

  /**
   * When execution completed
   */
  completedAt: Date;

  /**
   * Resolved variables that were provided at suite run level
   */
  resolvedVariables?: ResolvedTestVariables;

  /**
   * True when the run was cut short by the circuit breaker (DR-D7) rather than
   * dispatching every test. `status` is `Cancelled`; `abortReason` explains why.
   * Lets the CLI exit with a distinct code (DR-F2) and reports say so.
   */
  aborted?: boolean;

  /** Human-readable reason for an aborted run (DR-D7). */
  abortReason?: string;
}

/**
 * Scoring weights for different evaluation dimensions
 */
export interface ScoringWeights {
  /**
   * Weight for each oracle type
   * Keys are oracle types, values are weights (should sum to 1.0)
   */
  [oracleType: string]: number;
}

/**
 * Validation result for test configuration
 */
export interface ValidationResult {
  /**
   * Whether validation passed
   */
  valid: boolean;

  /**
   * Validation errors (blocking issues)
   */
  errors: ValidationError[];

  /**
   * Validation warnings (non-blocking issues)
   */
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  /**
   * Error category
   */
  category: 'configuration' | 'input' | 'expected-outcome';

  /**
   * Error message
   */
  message: string;

  /**
   * Field path (if applicable)
   */
  field?: string;

  /**
   * Suggested fix
   */
  suggestion?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /**
   * Warning category
   */
  category: 'best-practice' | 'performance' | 'cost';

  /**
   * Warning message
   */
  message: string;

  /**
   * Recommendation
   */
  recommendation?: string;
}

/**
 * Execution context details for test runs.
 * Stored as JSON in the RunContextDetails field of TestRun and TestSuiteRun entities.
 * Enables cross-server aggregation and detailed environment tracking.
 */
export interface RunContextDetails {
  /**
   * Operating system type (e.g., "darwin", "linux", "win32")
   */
  osType?: string;

  /**
   * Operating system version/release
   */
  osVersion?: string;

  /**
   * Node.js version used to run the tests
   */
  nodeVersion?: string;

  /**
   * Timezone identifier (e.g., "America/New_York", "UTC")
   */
  timezone?: string;

  /**
   * System locale (e.g., "en-US", "fr-FR")
   */
  locale?: string;

  /**
   * IP address of the machine running tests (useful for network debugging)
   */
  ipAddress?: string;

  /**
   * CI/CD provider name (e.g., "GitHub Actions", "Azure DevOps", "Jenkins")
   */
  ciProvider?: string;

  /**
   * CI/CD pipeline or workflow ID
   */
  pipelineId?: string;

  /**
   * Build number or run number from CI/CD
   */
  buildNumber?: string;

  /**
   * Git branch name
   */
  branch?: string;

  /**
   * Pull request number (if applicable)
   */
  prNumber?: string;

  /**
   * Additional custom properties for extensibility
   */
  [key: string]: unknown;
}

/**
 * Oracle configuration (can have any additional properties)
 */
export interface OracleConfig {
  /**
   * Oracle-specific configuration properties
   */
  [key: string]: unknown;
}

// ============================================================================
// TEST VARIABLES SYSTEM
// ============================================================================

/**
 * Data types supported for test variables
 */
export type TestVariableDataType = 'string' | 'number' | 'boolean' | 'date';

/**
 * How the valid values for a variable are determined
 */
export type TestVariableValueSource =
  | 'static'    // Hardcoded list in possibleValues
  | 'freeform'; // Any value of the given dataType
  // Future: | 'entity'   // Pull from MJ entity (e.g., AI Configurations)

/**
 * A possible value for a static variable
 */
export interface TestVariablePossibleValue {
  /**
   * The actual value
   */
  value: string | number | boolean;

  /**
   * Display label (defaults to value.toString() if not provided)
   */
  label?: string;

  /**
   * Optional description of what this value means
   */
  description?: string;
}

/**
 * Definition of a single test variable.
 * Stored in TestType.VariablesSchema.variables array.
 */
export interface TestVariableDefinition {
  /**
   * Unique name for the variable (e.g., "AIConfiguration", "Temperature")
   */
  name: string;

  /**
   * Human-readable display name
   */
  displayName: string;

  /**
   * Description of what this variable controls
   */
  description?: string;

  /**
   * Data type of the variable value
   */
  dataType: TestVariableDataType;

  /**
   * How valid values are determined
   */
  valueSource: TestVariableValueSource;

  /**
   * For static valueSource: list of valid values
   * Each entry has a value and optional display label
   */
  possibleValues?: TestVariablePossibleValue[];

  /**
   * Default value (must match dataType)
   */
  defaultValue?: string | number | boolean | Date;

  /**
   * Whether this variable must have a value to run the test
   */
  required: boolean;
}

/**
 * Variables schema for a TestType.
 * Stored in TestType.VariablesSchema JSON column.
 */
export interface TestTypeVariablesSchema {
  /**
   * Version of the schema format (for future migrations)
   */
  schemaVersion: '1.0';

  /**
   * Variables available for tests of this type
   */
  variables: TestVariableDefinition[];
}

/**
 * Override settings for a variable at the test level
 */
export interface TestVariableOverride {
  /**
   * Whether this variable is exposed for this test.
   * If false, the variable is not available for override.
   */
  exposed: boolean;

  /**
   * Override the default value for this test
   */
  defaultValue?: string | number | boolean | Date;

  /**
   * If true, this variable cannot be overridden at suite/run level
   */
  locked?: boolean;

  /**
   * Restrict possible values to a subset of the type's values
   */
  restrictedValues?: (string | number | boolean)[];
}

/**
 * Variable configuration for a specific Test.
 * Stored in Test.Variables JSON column.
 */
export interface TestVariablesConfig {
  /**
   * Variables exposed by this test (subset of type's variables).
   * Key is the variable name from TestType.
   */
  variables: {
    [variableName: string]: TestVariableOverride;
  };
}

/**
 * Variable values for a TestSuite.
 * Stored in TestSuite.Variables JSON column.
 */
export interface TestSuiteVariablesConfig {
  /**
   * Variable values to apply to all tests in this suite.
   * Key is the variable name.
   */
  variables: {
    [variableName: string]: string | number | boolean | Date;
  };
}

/**
 * Resolved variables with metadata.
 * Used during test execution and stored in TestRun.ResolvedVariables.
 */
export interface ResolvedTestVariables {
  /**
   * The resolved values
   */
  values: {
    [variableName: string]: string | number | boolean | Date;
  };

  /**
   * Source of each resolved value (for debugging/auditing)
   */
  sources: {
    [variableName: string]: 'run' | 'suite' | 'test' | 'type';
  };
}

/**
 * Variable value type union
 */
export type TestVariableValue = string | number | boolean | Date;

// ============================================================================
// TEST RUN OUTPUT SYSTEM
// ============================================================================

/**
 * An individual output item emitted by a test driver during execution.
 * The engine persists each item as a TestRunOutput entity record.
 * Supports any media type — images, video, audio, text, JSON, HTML, etc.
 */
export interface TestRunOutputItem {
  /**
   * Name matching TestRunOutputType.Name (e.g., "Screenshot", "Log", "Video")
   */
  outputTypeName: string;

  /**
   * Chronological ordering for storyboarding outputs across steps
   */
  sequence: number;

  /**
   * Which step produced this output (for step-based tests like Computer Use)
   */
  stepNumber?: number;

  /**
   * Human-readable label (e.g., "Step 3 Screenshot")
   */
  name?: string;

  /**
   * Additional context about this output
   */
  description?: string;

  /**
   * MIME type of the output data (e.g., "image/png", "text/plain", "video/mp4")
   */
  mimeType?: string;

  /**
   * Base64-encoded binary data (images, audio, video) or text content (logs, JSON, HTML)
   */
  inlineData?: string;

  /**
   * Size of the output data in bytes
   */
  fileSizeBytes?: number;

  /**
   * Width in pixels for image or video outputs
   */
  width?: number;

  /**
   * Height in pixels for image or video outputs
   */
  height?: number;

  /**
   * Duration in seconds for audio or video outputs
   */
  durationSeconds?: number;

  /**
   * Additional metadata as JSON (e.g., URL at time of capture, tool calls, error info)
   */
  metadata?: Record<string, unknown>;
}

/**
 * Per-suite-run fixture state established by a driver's `SetupSuite` and torn down
 * (guaranteed, via a `finally` in `TestEngine.RunSuite`) by `TeardownSuite`. Threaded
 * into every `Execute` call of that suite run via `DriverExecutionContext.fixtures`.
 *
 * Keyed by `SuiteRunID` so the per-`TypeID` cached driver instance cannot leak one
 * suite run's fixtures into another. Driver-specific payload lives under `Data`;
 * rows the driver created and must delete are recorded in `CreatedRecords` so a
 * best-effort teardown can sweep them.
 *
 * Suite hooks only fire for `mj test suite` (a suite run exists); they do NOT fire
 * for the standalone `mj test run` path, which has no suite — so fixture-dependent
 * tests must be run via a suite.
 */
export interface SuiteFixtureContext {
  /** The MJTestSuiteRunEntity.ID this fixture set belongs to. */
  SuiteRunID: string;

  /** Driver-specific fixture payload (discovered users, created query/category IDs, …). */
  Data: Record<string, unknown>;

  /** Rows the driver created and must delete; teardown sweeps these best-effort. */
  CreatedRecords: { EntityName: string; PrimaryKeyID: string }[];
}
