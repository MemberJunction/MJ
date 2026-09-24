import { MJAIPromptModelEntity } from "@memberjunction/core-entities";
import { MJAIPromptEntityExtended, MJAIModelEntityExtended, MJAIPromptRunEntityExtended, AIPromptParams } from '@memberjunction/ai-core-plus';
import { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { ValidationResult } from '@memberjunction/global';
import { ChatResult, ChatMessage, StreamingChatCallbacks } from '@memberjunction/ai';

/**
 * Represents a single execution task in a parallel processing scenario.
 * Contains all information needed to execute a prompt with a specific model configuration.
 */
export interface ExecutionTask {
  /** Unique identifier for this execution task */
  taskId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** The AI prompt being executed */
  prompt: MJAIPromptEntityExtended;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** The specific model to use for this execution */
  model: MJAIModelEntityExtended;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Optional prompt-model configuration with execution parameters */
  promptModel?: MJAIPromptModelEntity;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Execution group number for coordinated parallel processing */
  executionGroup: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Priority within the execution group (higher = execute first) */
  priority: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Rendered prompt text ready for model execution */
  renderedPrompt: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** User context for authentication and permissions */
  contextUser?: UserInfo;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Configuration ID for environment-specific behavior */
  configurationId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Model-specific parameters (temperature, max tokens, etc.) */
  modelParameters?: Record<string, unknown>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Optional conversation messages for multi-turn conversations */
  conversationMessages?: ChatMessage[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** How to use the rendered template in conversation messages */
  templateMessageRole?: 'system' | 'user' | 'none';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Optional cancellation token to abort the task execution */
  cancellationToken?: AbortSignal;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Optional callback for task-specific progress updates */
  onProgress?: (progress: { taskId: string; step: 'initializing' | 'executing' | 'validating' | 'completed'; percentage: number; message: string }) => void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Optional callback for task-specific streaming updates */
  onStreaming?: (chunk: { taskId: string; content: string; isComplete: boolean }) => void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Optional streaming configuration for this task */
  streamingConfig?: AIPromptStreamingConfig;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Vendor-specific driver class to use (overrides model.DriverClass) */
  vendorDriverClass?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Vendor-specific API name to use (overrides model.APIName) */
  vendorApiName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Selected vendor ID for this execution */
  vendorId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** ID of the agent this prompt was run as part of */
  agentId?: string;

  /** ID of the agent run this prompt was run as part of */
  agentRunId?: string;

  /** User ID on whose behalf this prompt was executed */
  userId?: string;
}

/**
 * Result of executing a single task in parallel processing.
 * Contains execution metrics, results, and error information.
 */
export interface ExecutionTaskResult {
  /** Reference to the original task */
  task: ExecutionTask;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Whether the execution was successful */
  success: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Raw result from the AI model */
  rawResult?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Parsed/validated result based on OutputType */
  parsedResult?: unknown;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Error message if execution failed */
  errorMessage?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** The AIPromptRun entity created for tracking */
  promptRun?: MJAIPromptRunEntityExtended;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Execution time for this specific task in milliseconds */
  executionTimeMS: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Tokens used in this execution */
  tokensUsed?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Validation result if output validation was performed */
  validationResult?: ValidationResult;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Model result with full API response details */
  modelResult?: ChatResult;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Start time of execution */
  startTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** End time of execution */
  endTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Ranking assigned by judge (1 = best, 2 = second best, etc.) */
  ranking?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Judge's rationale for this ranking */
  judgeRationale?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Judge metadata (execution time, tokens used) */
  judgeMetadata?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    judgePromptId: string;
    judgeExecutionTimeMS: number;
    judgeTokensUsed?: number;
  };

  /** Whether this task was cancelled */
  cancelled?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Reason for cancellation if applicable */
  cancellationReason?: 'user_requested' | 'timeout' | 'parent_cancelled' | 'error';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Whether this task used streaming */
  wasStreamed?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Represents a candidate ranking produced by an AI judge.
 */
export interface JudgeRanking {
  /** Identifier of the candidate task that was evaluated */
  candidateId: string;
  /** Numerical rank (1 = best) */
  rank: number;
  /** Rationale explaining the rank */
  rationale: string;
  /** Optional numerical score assigned by the judge */
  score?: number;
}

/**
 * Groups execution tasks by their execution group number.
 * Tasks within the same group are executed in parallel,
 * while different groups are executed sequentially.
 */
export interface ExecutionGroup {
  /** Group number (0-based, executed in ascending order) */
  GroupNumber: number;

  /** All tasks assigned to this execution group */
  Tasks: ExecutionTask[];

  /** Maximum parallel executions for this group */
  MaxParallelExecutions?: number;
}

/**
 * Callback function type for parallel execution progress updates
 */
export type ParallelExecutionProgressCallback = (progress: {
  /** Current phase of parallel execution */
  phase: 'planning' | 'executing_group' | 'selecting_result' | 'completed';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Current execution group number (0-based) */
  currentGroup?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Total number of execution groups */
  totalGroups?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Number of completed tasks */
  completedTasks: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Total number of tasks */
  totalTasks: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Progress percentage (0-100) */
  percentage: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Human-readable status message */
  message: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}) => void;

/**
 * Configuration for parallel execution behavior.
 * Controls how many tasks run simultaneously and resource limits.
 */
export interface ParallelExecutionConfig {
  /** Maximum number of concurrent executions across all groups */
  maxConcurrentExecutions: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Timeout for individual task execution in milliseconds */
  taskTimeoutMS: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Whether to stop all execution if any task fails */
  failFast: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Whether to collect all results even if some tasks fail */
  collectPartialResults: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Maximum number of retries for failed tasks */
  maxRetries: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Base delay between retries in milliseconds */
  retryDelayMS: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Optional callback for parallel execution progress updates */
  onProgress?: ParallelExecutionProgressCallback;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Whether to enable streaming for compatible models */
  enableStreaming?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Aggregated result from parallel execution of multiple tasks.
 * Contains all individual results plus summary metrics.
 */
export interface ParallelExecutionResult {
  /** Whether the overall parallel execution was successful */
  success: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** All individual task results */
  taskResults: ExecutionTaskResult[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Results grouped by execution group */
  groupResults: Map<number, ExecutionTaskResult[]>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Total execution time for all parallel processing in milliseconds */
  totalExecutionTimeMS: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Number of successful task executions */
  successCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Number of failed task executions */
  failureCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Number of cancelled task executions */
  cancelledCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Total tokens used across all executions */
  totalTokensUsed: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Error messages from failed executions */
  errors: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Start time of parallel execution */
  startTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** End time of parallel execution */
  endTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Selected best result if result selection was performed */
  selectedResult?: ExecutionTaskResult;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Whether the overall execution was cancelled */
  cancelled?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Reason for cancellation if applicable */
  cancellationReason?: 'user_requested' | 'timeout' | 'error' | 'resource_limit';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Metadata about the execution process */
  executionMetadata?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  method: ResultSelectionMethod;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Prompt ID to use for AI-based result selection */
  selectorPromptId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Additional parameters for the selection method */
  selectionParameters?: Record<string, unknown>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  promptTokens?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Completion tokens generated */
  completionTokens?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Total tokens (prompt + completion) */
  totalTokens?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Cached tokens if applicable */
  cachedTokens?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Status update for execution phases
 */
export interface ExecutionStatusUpdate {
  /** Current execution phase */
  phase: ExecutionPhase;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Human-readable description of current status */
  message: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Timestamp of this status update */
  timestamp: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Progress percentage (0-100) if applicable */
  progressPercent?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Current task ID (for parallel execution) */
  taskId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Execution metrics if available */
  metrics?: {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  completedTasks: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Total number of tasks */
  totalTasks: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Number of successful tasks */
  successfulTasks: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Number of failed tasks */
  failedTasks: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Number of cancelled tasks */
  cancelledTasks: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Current execution group */
  currentGroup: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Total execution groups */
  totalGroups: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Aggregated token usage across all completed tasks */
  totalTokenUsage: TokenUsageUpdate;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Total elapsed time in milliseconds */
  totalElapsedTimeMS: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Currently executing task IDs */
  activeTasks: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
  enabled: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Streaming callbacks for progress and content updates */
  callbacks?: AIPromptStreamingCallbacks;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Whether to aggregate streaming updates in parallel execution */
  aggregateParallelUpdates?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Minimum interval between progress updates in milliseconds */
  progressUpdateIntervalMS?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Progress-callback contract consumed by the parallel coordinator. Lives here (a
 * dependency-free types module) so both the coordinator and any caller can reference
 * it without importing the coordinator class.
 */
export interface ProgressCallbacksInterface {
  getStreamingConfig?: () => {  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    enabled?: boolean;
    callbacks?: {
      OnTaskComplete?: (taskResult: ExecutionTaskResult, progress: ParallelExecutionProgress) => void;
      OnParallelProgress?: (progress: ParallelExecutionProgress) => void;
    };
  };
}

/**
 * The slice of `ParallelExecutionCoordinator` that `AIPromptRunner` (the base class) calls.
 *
 * The coordinator is a SUBCLASS of `AIPromptRunner` (so it inherits the battle-tested
 * `executeModel` + credential/driver/ChatParams/streaming resolution), which makes a normal
 * value import of the coordinator from the base a hard circular dependency. To keep static type
 * checking on BOTH sides without that cycle, the base depends only on this interface
 * (`import type`, fully erased at runtime) and obtains a concrete instance lazily via
 * `MJGlobal.Instance.ClassFactory.CreateInstance(AIPromptRunner, 'ParallelExecutionCoordinator')`.
 * The coordinator registers itself with that key via `@RegisterClass`.
 */
export interface IParallelExecutionCoordinator {
  /** Provider override propagated from the owning runner so multi-provider contexts stay consistent. */
  Provider: IMetadataProvider;

  executeTasksInParallel(  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    params: AIPromptParams,
    tasks: ExecutionTask[],
    config?: Partial<ParallelExecutionConfig>,
    parentPromptRunId?: string,
    cancellationToken?: AbortSignal,
    progressCallbacks?: ProgressCallbacksInterface,
  ): Promise<ParallelExecutionResult>;

  selectBestResult(  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    results: ExecutionTaskResult[],
    config: ResultSelectionConfig,
    parentPromptRunId?: string,
    cancellationToken?: AbortSignal,
    contextUser?: UserInfo,
  ): Promise<ExecutionTaskResult | null>;
}
