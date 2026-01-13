/**
 * Core type definitions for the Testing Engine
 *
 * Note: UI-safe types are defined in @memberjunction/testing-engine-base
 * This file contains execution-specific types that depend on engine internals
 */

import { UserInfo } from '@memberjunction/core';
import {
  TestEntity,
  TestRunEntity,
  AIAgentRunEntity
} from '@memberjunction/core-entities';
import { IOracle } from './oracles/IOracle';

// Re-export all types from EngineBase for convenience
export {
  TestLogMessage,
  TestProgress,
  TestRunOptions,
  SuiteRunOptions,
  OracleResult,
  TestRunResult,
  TestSuiteRunResult,
  ScoringWeights,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  RunContextDetails,
  OracleConfig,
  // Variable system types
  TestVariableDataType,
  TestVariableValueSource,
  TestVariablePossibleValue,
  TestVariableDefinition,
  TestTypeVariablesSchema,
  TestVariableOverride,
  TestVariablesConfig,
  TestSuiteVariablesConfig,
  ResolvedTestVariables,
  TestVariableValue
} from '@memberjunction/testing-engine-base';

// Import types we need for local interfaces
import {
  TestRunOptions,
  OracleResult,
  ResolvedTestVariables
} from '@memberjunction/testing-engine-base';

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

  /**
   * Resolved variable values for this execution.
   * Variables have been resolved through the hierarchy and validated.
   * May be undefined if no variables are defined for this test type.
   */
  resolvedVariables?: ResolvedTestVariables;
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
   * Optional sub-category or variant label for the test target.
   * Use for ad-hoc labeling or to distinguish test scenarios within the same entity type.
   * Examples: "Summarization", "Classification", "Code Review", "Multi-turn Chat"
   */
  targetType: string;

  /**
   * Entity ID identifying the type of target being tested.
   * References Entity.ID (e.g., Entity ID for "MJ: AI Agent Runs").
   * This is the proper FK reference for entity linkage.
   */
  targetLogEntityId?: string;

  /**
   * Target entity ID (final AgentRun ID for single/multi-turn)
   */
  targetLogId: string;

  /**
   * Execution status
   */
  status: 'Passed' | 'Failed' | 'Error' | 'Timeout';

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
