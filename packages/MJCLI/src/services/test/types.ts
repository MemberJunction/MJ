/**
 * Type definitions for the MemberJunction Testing Framework
 */

// ============================================================================
// Eval Types
// ============================================================================

export type EvalCategory = 'simple_aggregation' | 'trend' | 'cross_domain' | 'drill_down' | 'complex';
export type EvalDifficulty = 'easy' | 'medium' | 'hard' | 'very_hard';
export type OutputFormat = 'console' | 'json' | 'markdown';

export interface DataAssertion {
  metric: string;
  expected_range?: [number, number];
  expected_value?: any;
  sql_validation?: string;
  description: string;
}

export interface VisualizationExpectation {
  type: string;
  alternatives?: string[];
  should_not_be?: string[];
  reasoning: string;
}

export interface InteractivityExpectation {
  action: string;
  expected_result: string;
}

export interface ExpectedOutcome {
  data_assertions: DataAssertion[];
  visualization: VisualizationExpectation;
  required_features: string[];
  optional_features?: string[];
  interactivity?: InteractivityExpectation[];
}

export interface ValidationCriteria {
  data_correctness: number;
  visualization_choice: number;
  interactivity: number;
  performance: number;
}

export interface EvalDefinition {
  eval_id: string;
  category: EvalCategory;
  difficulty: EvalDifficulty;
  tags: string[];
  business_context: string;
  prompt: string;
  expected_outcome: ExpectedOutcome;
  validation_criteria: ValidationCriteria;
  sample_sql?: string;
  human_eval_guidance: string;
  common_pitfalls: string;
}

// ============================================================================
// Eval Execution Types
// ============================================================================

export interface DataAssertionResult {
  metric: string;
  expected_range?: [number, number];
  expected_value?: any;
  actual_value?: any;
  status: 'pass' | 'fail' | 'skipped';
  message?: string;
}

export interface EvalExecutionResult {
  eval_id: string;
  status: 'pass' | 'fail' | 'skipped' | 'error';
  execution_time_ms: number;
  automated_score: number;
  requires_human_validation: boolean;
  data_assertion_results: DataAssertionResult[];
  validation_checklist: string[];
  error_message?: string;
  timestamp: string;
}

// ============================================================================
// Eval Discovery Types
// ============================================================================

export interface EvalFileInfo {
  eval_id: string;
  category: EvalCategory;
  difficulty: EvalDifficulty;
  tags: string[];
  file_path: string;
  business_context: string;
  prompt: string;
}

export interface EvalListOptions {
  category?: EvalCategory;
  difficulty?: EvalDifficulty;
  tags?: string[];
  verbose?: boolean;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface EvalValidationError {
  eval_id: string;
  file_path: string;
  error_type: 'schema' | 'sql' | 'reference' | 'business_logic';
  field?: string;
  message: string;
  suggestion?: string;
}

export interface EvalValidationResult {
  is_valid: boolean;
  total_evals: number;
  valid_evals: number;
  errors: EvalValidationError[];
  warnings: EvalValidationError[];
}

// ============================================================================
// Reporting Types
// ============================================================================

export interface EvalRunSummary {
  total_evals: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  total_execution_time_ms: number;
  average_score: number;
  timestamp: string;
}

export interface EvalReport {
  summary: EvalRunSummary;
  results: EvalExecutionResult[];
  by_category: Record<EvalCategory, EvalRunSummary>;
  by_difficulty: Record<EvalDifficulty, EvalRunSummary>;
}

// ============================================================================
// Service Options Types
// ============================================================================

export interface EvalRunOptions {
  eval_ids?: string[];
  category?: EvalCategory;
  difficulty?: EvalDifficulty;
  tags?: string[];
  all?: boolean;
  dry_run?: boolean;
  database_url?: string;
  verbose?: boolean;
  output_format?: OutputFormat;
}

export interface EvalValidationOptions {
  directory: string;
  verbose?: boolean;
  check_sql?: boolean;
}

export interface EvalReportOptions {
  input_file?: string;
  output_file?: string;
  format?: OutputFormat;
}
