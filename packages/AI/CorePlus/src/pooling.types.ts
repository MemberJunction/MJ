import { AIPromptParams, AIPromptRunResult } from './prompt.types';
import { ChatMessage } from '@memberjunction/ai';

/**
 * @fileoverview
 * Type definitions for AI model pooling and load balancing system.
 *
 * This file contains all type definitions related to the pooling system, including:
 * - Execution tasks and results
 * - Pool configurations
 * - Load balancing strategies
 * - Queue management
 * - Vendor and API key selection
 *
 * @module @memberjunction/ai-core-plus/pooling
 */

/**
 * A single execution task submitted to the pool
 *
 * Represents one AI prompt execution request that will be queued
 * and executed through the pooling system.
 */
export interface PooledExecutionTask {
    /**
     * Unique identifier for this task
     */
    taskId: string;

    /**
     * Model ID to execute with
     */
    modelId: string;

    /**
     * Original prompt parameters
     */
    params: AIPromptParams;

    /**
     * Rendered prompt text (after template processing)
     */
    renderedPrompt: string;

    /**
     * Estimated token count for rate limiting
     */
    estimatedTokens: number;

    /**
     * Priority level (lower = higher priority)
     */
    priority: number;

    /**
     * Maximum time to wait in queue (milliseconds)
     */
    timeout: number;

    /**
     * Cancellation signal
     */
    cancellationToken?: AbortSignal;

    /**
     * Progress callback
     */
    onProgress?: (progress: PoolExecutionProgress) => void;

    /**
     * Streaming content callback
     */
    onStreaming?: (chunk: string) => void;

    /**
     * Additional context for debugging
     */
    context?: Record<string, unknown>;
}

/**
 * Result from executing a pooled task
 */
export interface PooledExecutionResult {
    /**
     * Original task that was executed
     */
    task: PooledExecutionTask;

    /**
     * Whether execution succeeded
     */
    success: boolean;

    /**
     * Raw text result from model
     */
    rawResult?: string;

    /**
     * Parsed/validated result
     */
    parsedResult?: unknown;

    /**
     * Error message if failed
     */
    errorMessage?: string;

    /**
     * Execution time in milliseconds
     */
    executionTimeMS: number;

    /**
     * Tokens consumed
     */
    tokensUsed?: number;

    /**
     * Vendor that was used
     */
    vendorId: string;

    /**
     * API key that was used
     */
    apiKeyId: string;

    /**
     * Start timestamp
     */
    startTime: Date;

    /**
     * End timestamp
     */
    endTime: Date;

    /**
     * Whether task was cancelled
     */
    cancelled?: boolean;

    /**
     * Cancellation reason
     */
    cancellationReason?: 'user_requested' | 'timeout' | 'error' | 'capacity';

    /**
     * Time spent in queue before execution
     */
    queueWaitTimeMS?: number;
}

/**
 * Pool configuration loaded from database
 */
export interface PoolConfig {
    /**
     * Pool identifier
     */
    poolId: string;

    /**
     * Model this pool serves
     */
    modelId: string;

    /**
     * Pool display name
     */
    name: string;

    /**
     * Maximum time a request waits in queue
     */
    maxWaitTimeMS: number;

    /**
     * Maximum parallel requests (null = unlimited)
     */
    maxParallelRequests: number | null;

    /**
     * Load balancing strategy
     */
    loadBalancingStrategy: LoadBalancingStrategy;

    /**
     * Whether pool is active
     */
    isActive: boolean;

    /**
     * Vendors participating in this pool
     */
    members: PoolMemberConfig[];
}

/**
 * Pool member configuration
 */
export interface PoolMemberConfig {
    /**
     * Vendor ID
     */
    vendorId: string;

    /**
     * Priority within pool (lower = higher priority)
     */
    priority: number;

    /**
     * Weight for weighted load balancing (1-100)
     */
    weight?: number;

    /**
     * Maximum parallel requests for this vendor
     */
    maxParallelRequests?: number;

    /**
     * Whether member is active
     */
    isActive: boolean;
}

/**
 * Load balancing strategy
 */
export type LoadBalancingStrategy =
    | 'Priority'      // Always prefer lowest priority number
    | 'RoundRobin'    // Rotate through vendors evenly
    | 'LeastBusy'     // Send to vendor with fewest active requests
    | 'Weighted'      // Distribute based on configured weights
    | 'Random';       // Random selection

/**
 * Vendor and API key selection
 */
export interface VendorKeySelection {
    /**
     * Selected vendor ID
     */
    vendorId: string;

    /**
     * Selected API key ID
     */
    apiKeyId: string;

    /**
     * Vendor name (for logging)
     */
    vendorName: string;

    /**
     * API key value
     */
    apiKeyValue: string;

    /**
     * API key name (for logging)
     */
    apiKeyName: string;
}

/**
 * API key information
 */
export interface APIKeyInfo {
    /**
     * API key ID
     */
    id: string;

    /**
     * API key value (encrypted or decrypted based on context)
     */
    value: string;

    /**
     * Vendor this key belongs to
     */
    vendorId: string;

    /**
     * Key display name
     */
    name: string;

    /**
     * Priority (lower = higher priority)
     */
    priority: number;

    /**
     * Rate limit in tokens per minute
     */
    rateLimitTPM: number | null;

    /**
     * Rate limit in requests per minute
     */
    rateLimitRPM: number | null;

    /**
     * Rate limit scope
     */
    rateLimitScope: 'ModelSpecific' | 'AllModels';

    /**
     * Whether key is active
     */
    isActive: boolean;
}

/**
 * Pool execution progress
 */
export interface PoolExecutionProgress {
    /**
     * Task ID
     */
    taskId: string;

    /**
     * Current phase
     */
    phase: 'queued' | 'selecting_vendor' | 'executing' | 'completed' | 'failed';

    /**
     * Progress message
     */
    message: string;

    /**
     * Queue position (if queued)
     */
    queuePosition?: number;

    /**
     * Estimated wait time in milliseconds (if queued)
     */
    estimatedWaitMS?: number;

    /**
     * Selected vendor (if known)
     */
    vendorId?: string;

    /**
     * Execution time so far (if executing)
     */
    elapsedMS?: number;
}

/**
 * Pool statistics for monitoring
 */
export interface PoolStatistics {
    /**
     * Model ID
     */
    modelId: string;

    /**
     * Pool ID
     */
    poolId: string;

    /**
     * Pool name
     */
    poolName: string;

    /**
     * Current queue length
     */
    queueLength: number;

    /**
     * Active requests being executed
     */
    activeRequests: number;

    /**
     * Maximum parallel requests allowed
     */
    maxParallelRequests: number | null;

    /**
     * Total requests processed (lifetime)
     */
    totalProcessed: number;

    /**
     * Successful requests (lifetime)
     */
    totalSucceeded: number;

    /**
     * Failed requests (lifetime)
     */
    totalFailed: number;

    /**
     * Cancelled requests (lifetime)
     */
    totalCancelled: number;

    /**
     * Average queue wait time (milliseconds)
     */
    averageQueueWaitMS: number;

    /**
     * Average execution time (milliseconds)
     */
    averageExecutionMS: number;

    /**
     * Pool uptime (milliseconds)
     */
    uptimeMS: number;

    /**
     * Per-vendor statistics
     */
    vendorStats: VendorStatistics[];
}

/**
 * Vendor-specific statistics
 */
export interface VendorStatistics {
    /**
     * Vendor ID
     */
    vendorId: string;

    /**
     * Vendor name
     */
    vendorName: string;

    /**
     * Active requests for this vendor
     */
    activeRequests: number;

    /**
     * Total requests sent to this vendor
     */
    totalRequests: number;

    /**
     * Successful requests
     */
    successfulRequests: number;

    /**
     * Failed requests
     */
    failedRequests: number;

    /**
     * Average execution time
     */
    averageExecutionMS: number;

    /**
     * Current health status
     */
    healthStatus: string;

    /**
     * Number of active API keys
     */
    activeKeyCount: number;

    /**
     * Available capacity percentage (0-100)
     */
    availableCapacityPercent: number;
}

/**
 * Queued task wrapper (internal use)
 */
export interface QueuedTask extends PooledExecutionTask {
    /**
     * Timestamp when task was queued
     */
    queuedAt: number;

    /**
     * Timeout handle
     */
    timeoutHandle: NodeJS.Timeout;

    /**
     * Resolve promise with result
     */
    resolve: (result: PooledExecutionResult) => void;

    /**
     * Reject promise with error
     */
    reject: (error: Error) => void;
}

/**
 * Extended AIPromptParams with pooling options
 */
export interface AIPromptParamsWithPooling extends AIPromptParams {
    /**
     * Optional pool timeout override (milliseconds)
     */
    poolTimeout?: number;

    /**
     * Optional priority override (lower = higher priority)
     */
    priority?: number;

    /**
     * Force use of pooling even if not configured
     */
    forcePooling?: boolean;

    /**
     * Disable pooling even if configured
     */
    disablePooling?: boolean;
}
