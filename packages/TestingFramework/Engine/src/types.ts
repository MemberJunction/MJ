/**
 * Core type definitions for the Testing Engine
 */

import { UserInfo } from '@memberjunction/core';
import {
  TestEntity,
  TestRunEntity,
  TestSuiteEntity,
  TestSuiteRunEntity,
  TestSuiteTestEntity,
  AIAgentRunEntity
} from '@memberjunction/core-entities';
import { IOracle } from './oracles/IOracle';

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
    testRun?: any;
    driverType?: string;
    oracleType?: string;
    [key: string]: any;
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
   * Run only specific sequence numbers
   */
  sequence?: number[];
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
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error';

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
   * Target entity type (e.g., "AI Agent")
   */
  targetType: string;

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
 * Context for test driver execution
 */
export interface DriverExecutionContext {
  /**
   * Test definition
   */
  test: TestEntity;

  /**
   * Test run entity (for bidirectional linking)
   */
  testRun: TestRunEntity;

  /**
   * User context for data access
   */
  contextUser: UserInfo;

  /**
   * Runtime options
   */
  options: TestRunOptions;

  /**
   * Oracle registry for evaluations
   */
  oracleRegistry: Map<string, IOracle>;
}

/**
 * Result from a single turn in multi-turn test
 */
export interface TurnResult {
  /**
   * Turn number (1-indexed)
   */
  turnNumber: number;

  /**
   * Agent run for this turn
   */
  agentRun: AIAgentRunEntity;

  /**
   * Input payload for this turn
   */
  inputPayload?: Record<string, unknown>;

  /**
   * Output payload from this turn
   */
  outputPayload: Record<string, unknown>;

  /**
   * Oracle results for this turn (if per-turn evaluation)
   */
  oracleResults?: OracleResult[];

  /**
   * Duration in milliseconds
   */
  durationMs?: number;

  /**
   * Cost in USD
   */
  cost?: number;
}

/**
 * Result from driver execution
 */
export interface DriverExecutionResult {
  /**
   * Target entity type (e.g., "AI Agent")
   */
  targetType: string;

  /**
   * Target entity ID (final AgentRun ID for single/multi-turn)
   */
  targetLogId: string;

  /**
   * Execution status
   */
  status: 'Passed' | 'Failed' | 'Error';

  /**
   * Overall score
   */
  score: number;

  /**
   * Oracle results
   */
  oracleResults: OracleResult[];

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
   * Input data used
   */
  inputData?: unknown;

  /**
   * Expected output data
   */
  expectedOutput?: unknown;

  /**
   * Actual output data
   */
  actualOutput?: unknown;

  /**
   * Cost in USD
   */
  totalCost?: number;

  /**
   * Duration in milliseconds
   */
  durationMs?: number;

  /**
   * Error message if status is Error
   */
  errorMessage?: string;

  /**
   * Multi-turn specific: Total number of turns
   */
  totalTurns?: number;

  /**
   * Multi-turn specific: Results for each turn
   */
  turnResults?: TurnResult[];

  /**
   * Multi-turn specific: All AgentRun IDs
   */
  allAgentRunIds?: string[];
}

/**
 * Oracle evaluation input
 */
export interface OracleInput {
  /**
   * The test being evaluated
   */
  test: TestEntity;

  /**
   * Expected output from test definition
   */
  expectedOutput?: unknown;

  /**
   * Actual output from execution
   */
  actualOutput?: unknown;

  /**
   * Target entity (e.g., AgentRun)
   */
  targetEntity?: unknown;

  /**
   * User context
   */
  contextUser: UserInfo;
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
