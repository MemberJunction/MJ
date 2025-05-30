import { AIPromptEntity, AIPromptModelEntity, AIModelEntityExtended, AIPromptRunEntity } from "@memberjunction/core-entities";
import { UserInfo, ValidationResult } from "@memberjunction/core";
import { ChatResult, ChatMessage } from "@memberjunction/ai";

/**
 * Represents a single execution task in a parallel processing scenario.
 * Contains all information needed to execute a prompt with a specific model configuration.
 */
export interface ExecutionTask {
    /** Unique identifier for this execution task */
    taskId: string;
    
    /** The AI prompt being executed */
    prompt: AIPromptEntity;
    
    /** The specific model to use for this execution */
    model: AIModelEntityExtended;
    
    /** Optional prompt-model configuration with execution parameters */
    promptModel?: AIPromptModelEntity;
    
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
    modelParameters?: Record<string, any>;
    
    /** Optional conversation messages for multi-turn conversations */
    conversationMessages?: ChatMessage[];
    
    /** How to use the rendered template in conversation messages */
    templateMessageRole?: 'system' | 'user' | 'none';
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
    parsedResult?: any;
    
    /** Error message if execution failed */
    errorMessage?: string;
    
    /** The AIPromptRun entity created for tracking */
    promptRun?: AIPromptRunEntity;
    
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
}

/**
 * Strategy for determining the number of parallel executions.
 * Maps to the ParallelizationMode field in AIPromptEntity.
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
    selectionParameters?: Record<string, any>;
}