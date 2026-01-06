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
}

/**
 * Options for running a test suite
 */
export interface SuiteRunOptions extends TestRunOptions {
  /**
   * Run tests in parallel
   */
  parallel?: boolean;

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
}

/**
 * Result from running a single test
 */
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
