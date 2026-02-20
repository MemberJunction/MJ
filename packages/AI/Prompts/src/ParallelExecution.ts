import { MJAIPromptModelEntity } from "@memberjunction/core-entities";
import { MJAIPromptEntityExtended, MJAIModelEntityExtended, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import { UserInfo } from '@memberjunction/core';
import { ValidationResult } from '@memberjunction/global';
import { ChatResult, ChatMessage, StreamingChatCallbacks } from '@memberjunction/ai';

/**
 * Represents a single execution task in a parallel processing scenario.
 * Contains all information needed to execute a prompt with a specific model configuration.
 */
export interface ExecutionTask {
  /** Unique identifier for this execution task */
  taskId: string;

  /** The AI prompt being executed */
  prompt: MJAIPromptEntityExtended;

  /** The specific model to use for this execution */
  model: MJAIModelEntityExtended;

  /** Optional prompt-model configuration with execution parameters */
  promptModel?: MJAIPromptModelEntity;

  /** Execution group number for coordinated parallel processing */
  executionGroup: number;

  /** Priority within the execution group (higher = execute first) */
  priority: number;

  /** Rendered prompt text ready for model execution */
  renderedPrompt: string;

  /** User context for authentication and permissions */
  contextUser?: UserInfo;

  /** Configuration ID for environment-specific behavior */
  configurationId?: string;

  /** Model-specific parameters (temperature, max tokens, etc.) */
  modelParameters?: Record<string, unknown>;

  /** Optional conversation messages for multi-turn conversations */
  conversationMessages?: ChatMessage[];

  /** How to use the rendered template in conversation messages */
  templateMessageRole?: 'system' | 'user' | 'none';

  /** Optional cancellation token to abort the task execution */
  cancellationToken?: AbortSignal;

  /** Optional callback for task-specific progress updates */
  onProgress?: (progress: { taskId: string; step: 'initializing' | 'executing' | 'validating' | 'completed'; percentage: number; message: string }) => void;

  /** Optional callback for task-specific streaming updates */
  onStreaming?: (chunk: { taskId: string; content: string; isComplete: boolean }) => void;

  /** Optional streaming configuration for this task */
  streamingConfig?: AIPromptStreamingConfig;

  /** Vendor-specific driver class to use (overrides model.DriverClass) */
  vendorDriverClass?: string;

  /** Vendor-specific API name to use (overrides model.APIName) */
  vendorApiName?: string;

  /** Selected vendor ID for this execution */
  vendorId?: string;
}

/**
 * Result of executing a single task in parallel processing.
 * Contains execution metrics, results, and error information.
 */
export interface ExecutionTaskResult {
  /** Reference to the original task */
  task: ExecutionTask;

  /** Whether the execution was successful */
  success: boolean;

  /** Raw result from the AI model */
  rawResult?: string;

  /** Parsed/validated result based on OutputType */
  parsedResult?: unknown;

  /** Error message if execution failed */
  errorMessage?: string;

  /** The AIPromptRun entity created for tracking */
  promptRun?: MJAIPromptRunEntityExtended;

  /** Execution time for this specific task in milliseconds */
  executionTimeMS: number;

  /** Tokens used in this execution */
  tokensUsed?: number;

  /** Validation result if output validation was performed */
  validationResult?: ValidationResult;

  /** Model result with full API response details */
  modelResult?: ChatResult;

  /** Start time of execution */
  startTime: Date;

  /** End time of execution */
  endTime: Date;

  /** Ranking assigned by judge (1 = best, 2 = second best, etc.) */
  ranking?: number;

  /** Judge's rationale for this ranking */
  judgeRationale?: string;

  /** Judge metadata (execution time, tokens used) */
  judgeMetadata?: {
    judgePromptId: string;
    judgeExecutionTimeMS: number;
    judgeTokensUsed?: number;
  };

  /** Whether this task was cancelled */
  cancelled?: boolean;

  /** Reason for cancellation if applicable */
  cancellationReason?: 'user_requested' | 'timeout' | 'parent_cancelled' | 'error';

  /** Whether this task used streaming */
  wasStreamed?: boolean;
}

/**
 * Groups execution tasks by their execution group number.
 * Tasks within the same group are executed in parallel,
 * while different groups are executed sequentially.
 */
export interface ExecutionGroup {
  /** Group number (0-based, executed in ascending order) */
  groupNumber: number;

  /** All tasks assigned to this execution group */
  tasks: ExecutionTask[];

  /** Maximum parallel executions for this group */
  maxParallelExecutions?: number;
}

/**
 * Callback function type for parallel execution progress updates
 */
export type ParallelExecutionProgressCallback = (progress: {
  /** Current phase of parallel execution */
  phase: 'planning' | 'executing_group' | 'selecting_result' | 'completed';
  /** Current execution group number (0-based) */
  currentGroup?: number;
  /** Total number of execution groups */
  totalGroups?: number;
  /** Number of completed tasks */
  completedTasks: number;
  /** Total number of tasks */
  totalTasks: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Human-readable status message */
  message: string;
}) => void;

/**
 * Configuration for parallel execution behavior.
 * Controls how many tasks run simultaneously and resource limits.
 */
export interface ParallelExecutionConfig {
  /** Maximum number of concurrent executions across all groups */
  maxConcurrentExecutions: number;

  /** Timeout for individual task execution in milliseconds */
  taskTimeoutMS: number;

  /** Whether to stop all execution if any task fails */
  failFast: boolean;

  /** Whether to collect all results even if some tasks fail */
  collectPartialResults: boolean;

  /** Maximum number of retries for failed tasks */
  maxRetries: number;

  /** Base delay between retries in milliseconds */
  retryDelayMS: number;

  /** Optional callback for parallel execution progress updates */
  onProgress?: ParallelExecutionProgressCallback;

  /** Whether to enable streaming for compatible models */
  enableStreaming?: boolean;
}

/**
 * Aggregated result from parallel execution of multiple tasks.
 * Contains all individual results plus summary metrics.
 */
export interface ParallelExecutionResult {
  /** Whether the overall parallel execution was successful */
  success: boolean;

  /** All individual task results */
  taskResults: ExecutionTaskResult[];

  /** Results grouped by execution group */
  groupResults: Map<number, ExecutionTaskResult[]>;

  /** Total execution time for all parallel processing in milliseconds */
  totalExecutionTimeMS: number;

  /** Number of successful task executions */
  successCount: number;

  /** Number of failed task executions */
  failureCount: number;

  /** Number of cancelled task executions */
  cancelledCount: number;

  /** Total tokens used across all executions */
  totalTokensUsed: number;

  /** Error messages from failed executions */
  errors: string[];

  /** Start time of parallel execution */
  startTime: Date;

  /** End time of parallel execution */
  endTime: Date;

  /** Selected best result if result selection was performed */
  selectedResult?: ExecutionTaskResult;

  /** Whether the overall execution was cancelled */
  cancelled?: boolean;

  /** Reason for cancellation if applicable */
  cancellationReason?: 'user_requested' | 'timeout' | 'error' | 'resource_limit';

  /** Metadata about the execution process */
  executionMetadata?: {
    /** Number of execution groups processed */
    groupsProcessed: number;
    /** Average execution time per task */
    averageTaskTimeMS: number;
    /** Peak concurrent executions achieved */
    peakConcurrentExecutions: number;
    /** Whether result selection was performed */
    resultSelectionPerformed: boolean;
  };
}

/**
 * Strategy for determining the number of parallel executions.
 * Maps to the ParallelizationMode field in MJAIPromptEntityExtended.
 */
export type ParallelizationStrategy = 'None' | 'StaticCount' | 'ConfigParam' | 'ModelSpecific';

/**
 * Method for selecting the best result from multiple parallel executions.
 * Determines how the final result is chosen when multiple results are available.
 */
export type ResultSelectionMethod = 'First' | 'Random' | 'PromptSelector' | 'Consensus';

/**
 * Configuration for how to select the best result from parallel executions.
 * Used when multiple models produce different outputs.
 */
export interface ResultSelectionConfig {
  /** Method to use for selecting the best result */
  method: ResultSelectionMethod;

  /** Prompt ID to use for AI-based result selection */
  selectorPromptId?: string;

  /** Additional parameters for the selection method */
  selectionParameters?: Record<string, unknown>;
}

/**
 * Execution phase for progress tracking
 */
export type ExecutionPhase =
  | 'initializing'
  | 'template_rendering'
  | 'model_selection'
  | 'model_execution'
  | 'result_validation'
  | 'result_selection'
  | 'completing';

/**
 * Token usage information for progress updates
 */
export interface TokenUsageUpdate {
  /** Prompt tokens used */
  promptTokens?: number;

  /** Completion tokens generated */
  completionTokens?: number;

  /** Total tokens (prompt + completion) */
  totalTokens?: number;

  /** Cached tokens if applicable */
  cachedTokens?: number;
}

/**
 * Status update for execution phases
 */
export interface ExecutionStatusUpdate {
  /** Current execution phase */
  phase: ExecutionPhase;

  /** Human-readable description of current status */
  message: string;

  /** Timestamp of this status update */
  timestamp: Date;

  /** Progress percentage (0-100) if applicable */
  progressPercent?: number;

  /** Current task ID (for parallel execution) */
  taskId?: string;

  /** Execution metrics if available */
  metrics?: {
    /** Elapsed time in milliseconds */
    elapsedTimeMS: number;

    /** Token usage if available */
    tokenUsage?: TokenUsageUpdate;

    /** Model being used */
    modelName?: string;

    /** Vendor being used */
    vendorName?: string;
  };
}

/**
 * Progress update for parallel execution
 */
export interface ParallelExecutionProgress {
  /** Number of tasks completed */
  completedTasks: number;

  /** Total number of tasks */
  totalTasks: number;

  /** Number of successful tasks */
  successfulTasks: number;

  /** Number of failed tasks */
  failedTasks: number;

  /** Number of cancelled tasks */
  cancelledTasks: number;

  /** Current execution group */
  currentGroup: number;

  /** Total execution groups */
  totalGroups: number;

  /** Aggregated token usage across all completed tasks */
  totalTokenUsage: TokenUsageUpdate;

  /** Total elapsed time in milliseconds */
  totalElapsedTimeMS: number;

  /** Currently executing task IDs */
  activeTasks: string[];
}

/**
 * Enhanced streaming callbacks that extend BaseLLM StreamingChatCallbacks
 * with AI Prompt Runner specific features
 */
export interface AIPromptStreamingCallbacks extends StreamingChatCallbacks {
  /**
   * Called when execution status changes (template rendering, model selection, etc.)
   * @param update The status update information
   */
  OnStatusUpdate?: (update: ExecutionStatusUpdate) => void;

  /**
   * Called with parallel execution progress updates
   * @param progress Current parallel execution progress
   */
  OnParallelProgress?: (progress: ParallelExecutionProgress) => void;

  /**
   * Called when a specific task in parallel execution completes
   * @param taskResult The completed task result
   * @param progress Current parallel execution progress
   */
  OnTaskComplete?: (taskResult: ExecutionTaskResult, progress: ParallelExecutionProgress) => void;

  /**
   * Called when token usage is updated during execution
   * @param usage Current token usage information
   * @param taskId Optional task ID for parallel execution
   */
  OnTokenUsage?: (usage: TokenUsageUpdate, taskId?: string) => void;
}

/**
 * Streaming configuration for AI Prompt execution
 */
export interface AIPromptStreamingConfig {
  /** Whether to enable streaming responses */
  enabled: boolean;

  /** Streaming callbacks for progress and content updates */
  callbacks?: AIPromptStreamingCallbacks;

  /** Whether to aggregate streaming updates in parallel execution */
  aggregateParallelUpdates?: boolean;

  /** Minimum interval between progress updates in milliseconds */
  progressUpdateIntervalMS?: number;
}
