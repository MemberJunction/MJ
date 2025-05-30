import { LogError, LogStatus, UserInfo, ValidationResult } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import { BaseLLM, ChatParams, ChatResult, ChatMessageRole, ChatMessage, GetAIAPIKey } from "@memberjunction/ai";
import { AIPromptEntity, AIPromptRunEntity, AIModelEntityExtended } from "@memberjunction/core-entities";
import { 
    ExecutionTask, 
    ExecutionTaskResult, 
    ExecutionGroup, 
    ParallelExecutionConfig, 
    ParallelExecutionResult,
    ParallelizationStrategy,
    ResultSelectionConfig,
    ResultSelectionMethod
} from "./ParallelExecution";
import { AIEngine } from "@memberjunction/aiengine";

/**
 * Coordinates parallel execution of AI prompt tasks across multiple models and execution groups.
 * 
 * This class manages the complex orchestration of:
 * - Grouping tasks by execution group
 * - Sequential execution of groups with parallel execution within groups
 * - Result aggregation and selection
 * - Error handling and partial result collection
 * - Performance monitoring and metrics collection
 */
export class ParallelExecutionCoordinator {
    private readonly _defaultConfig: ParallelExecutionConfig;

    /**
     * Creates a new parallel execution coordinator with default configuration.
     */
    constructor() {
        this._defaultConfig = {
            maxConcurrentExecutions: 5,
            taskTimeoutMS: 30000, // 30 seconds
            failFast: false,
            collectPartialResults: true,
            maxRetries: 3,
            retryDelayMS: 1000
        };
    }

    /**
     * Executes multiple tasks in parallel according to their execution groups.
     * 
     * Tasks are grouped by their executionGroup property and executed sequentially by group.
     * Within each group, tasks are executed in parallel up to the concurrency limit.
     * 
     * @param tasks - Array of execution tasks to process
     * @param config - Optional configuration to override defaults
     * @returns Promise<ParallelExecutionResult> - Aggregated results from all executions
     */
    public async executeTasksInParallel(
        tasks: ExecutionTask[], 
        config?: Partial<ParallelExecutionConfig>
    ): Promise<ParallelExecutionResult> {
        const startTime = new Date();
        const executionConfig = { ...this._defaultConfig, ...config };
        
        LogStatus(`Starting parallel execution of ${tasks.length} tasks with config: ${JSON.stringify(executionConfig)}`);

        try {
            // Group tasks by execution group
            const executionGroups = this.groupTasksByExecutionGroup(tasks);
            
            // Execute groups sequentially, tasks within groups in parallel
            const allResults = await this.executeGroupsSequentially(executionGroups, executionConfig);
            
            // Aggregate results and calculate metrics
            const result = this.aggregateResults(allResults, startTime, new Date());
            
            LogStatus(`Parallel execution completed: ${result.successCount}/${tasks.length} tasks successful`);
            return result;

        } catch (error) {
            LogError(`Parallel execution failed: ${error.message}`);
            
            return {
                success: false,
                taskResults: [],
                groupResults: new Map(),
                totalExecutionTimeMS: new Date().getTime() - startTime.getTime(),
                successCount: 0,
                failureCount: tasks.length,
                totalTokensUsed: 0,
                errors: [error.message],
                startTime,
                endTime: new Date()
            };
        }
    }

    /**
     * Selects the best result from multiple parallel execution results.
     * 
     * Uses various strategies to determine which result should be considered
     * the "best" output from the parallel executions.
     * 
     * @param results - Array of successful execution results to choose from
     * @param config - Configuration for result selection method
     * @returns Promise<ExecutionTaskResult | null> - The selected best result, or null if none suitable
     */
    public async selectBestResult(
        results: ExecutionTaskResult[], 
        config: ResultSelectionConfig
    ): Promise<ExecutionTaskResult | null> {
        if (results.length === 0) {
            return null;
        }

        if (results.length === 1) {
            return results[0];
        }

        LogStatus(`Selecting best result from ${results.length} candidates using method: ${config.method}`);

        switch (config.method) {
            case 'First':
                return this.selectFirstResult(results);
                
            case 'Random':
                return this.selectRandomResult(results);
                
            case 'PromptSelector':
                return await this.selectResultWithPrompt(results, config.selectorPromptId!);
                
            case 'Consensus':
                return this.selectConsensusResult(results);
                
            default:
                LogError(`Unknown result selection method: ${config.method}`);
                return results[0];
        }
    }

    /**
     * Groups execution tasks by their execution group number.
     * Tasks with the same group number will be executed in parallel.
     * 
     * @param tasks - Array of tasks to group
     * @returns ExecutionGroup[] - Sorted array of execution groups
     */
    private groupTasksByExecutionGroup(tasks: ExecutionTask[]): ExecutionGroup[] {
        const groupMap = new Map<number, ExecutionTask[]>();

        // Group tasks by execution group number
        for (const task of tasks) {
            const groupNumber = task.executionGroup;
            if (!groupMap.has(groupNumber)) {
                groupMap.set(groupNumber, []);
            }
            groupMap.get(groupNumber)!.push(task);
        }

        // Convert to ExecutionGroup array and sort by group number
        const groups: ExecutionGroup[] = [];
        for (const [groupNumber, groupTasks] of groupMap) {
            // Sort tasks within group by priority (higher priority first)
            groupTasks.sort((a, b) => b.priority - a.priority);
            
            groups.push({
                groupNumber,
                tasks: groupTasks
            });
        }

        // Sort groups by group number (execute in ascending order)
        groups.sort((a, b) => a.groupNumber - b.groupNumber);
        
        LogStatus(`Grouped ${tasks.length} tasks into ${groups.length} execution groups`);
        return groups;
    }

    /**
     * Executes execution groups sequentially, with parallel execution within each group.
     * 
     * @param groups - Array of execution groups to process
     * @param config - Execution configuration
     * @returns Promise<ExecutionTaskResult[]> - All task results from all groups
     */
    private async executeGroupsSequentially(
        groups: ExecutionGroup[], 
        config: ParallelExecutionConfig
    ): Promise<ExecutionTaskResult[]> {
        const allResults: ExecutionTaskResult[] = [];

        for (const group of groups) {
            LogStatus(`Executing group ${group.groupNumber} with ${group.tasks.length} tasks`);
            
            const groupResults = await this.executeGroupInParallel(group, config);
            allResults.push(...groupResults);

            // Check if we should fail fast
            if (config.failFast && groupResults.some(r => !r.success)) {
                const failedTasks = groupResults.filter(r => !r.success);
                LogError(`Failing fast due to ${failedTasks.length} failed tasks in group ${group.groupNumber}`);
                break;
            }
        }

        return allResults;
    }

    /**
     * Executes all tasks within a single execution group in parallel.
     * 
     * @param group - The execution group to process
     * @param config - Execution configuration
     * @returns Promise<ExecutionTaskResult[]> - Results from all tasks in the group
     */
    private async executeGroupInParallel(
        group: ExecutionGroup, 
        config: ParallelExecutionConfig
    ): Promise<ExecutionTaskResult[]> {
        const maxConcurrent = Math.min(config.maxConcurrentExecutions, group.tasks.length);
        const results: ExecutionTaskResult[] = [];
        const executing: Promise<ExecutionTaskResult>[] = [];

        let taskIndex = 0;

        // Process tasks with concurrency limit
        while (taskIndex < group.tasks.length || executing.length > 0) {
            // Start new tasks up to concurrency limit
            while (executing.length < maxConcurrent && taskIndex < group.tasks.length) {
                const task = group.tasks[taskIndex++];
                const execution = this.executeTask(task, config);
                executing.push(execution);
            }

            // Wait for at least one task to complete
            if (executing.length > 0) {
                const result = await Promise.race(executing);
                results.push(result);

                // Remove completed task from executing array
                const completedIndex = executing.findIndex(p => p === Promise.resolve(result));
                if (completedIndex !== -1) {
                    executing.splice(completedIndex, 1);
                }
            }
        }

        LogStatus(`Group ${group.groupNumber} completed: ${results.filter(r => r.success).length}/${results.length} successful`);
        return results;
    }

    /**
     * Executes a single task with retry logic and timeout handling.
     * 
     * @param task - The execution task to process
     * @param config - Execution configuration
     * @returns Promise<ExecutionTaskResult> - Result of the task execution
     */
    private async executeTask(
        task: ExecutionTask, 
        config: ParallelExecutionConfig
    ): Promise<ExecutionTaskResult> {
        const startTime = new Date();
        let lastError: Error | null = null;

        // Attempt execution with retries
        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Apply retry delay
                    await this.delay(config.retryDelayMS * attempt);
                    LogStatus(`Retrying task ${task.taskId}, attempt ${attempt + 1}/${config.maxRetries + 1}`);
                }

                const result = await this.executeSingleTask(task, config.taskTimeoutMS);
                result.startTime = startTime;
                result.endTime = new Date();
                
                return result;

            } catch (error) {
                lastError = error;
                LogError(`Task ${task.taskId} attempt ${attempt + 1} failed: ${error.message}`);
                
                // Don't retry if this was the last attempt
                if (attempt === config.maxRetries) {
                    break;
                }
            }
        }

        // All attempts failed
        const endTime = new Date();
        return {
            task,
            success: false,
            errorMessage: lastError?.message || 'Unknown error',
            executionTimeMS: endTime.getTime() - startTime.getTime(),
            startTime,
            endTime
        };
    }

    /**
     * Executes a single task without retry logic.
     * 
     * @param task - The execution task to process
     * @param timeoutMS - Timeout for the execution in milliseconds
     * @returns Promise<ExecutionTaskResult> - Result of the task execution
     */
    private async executeSingleTask(task: ExecutionTask, timeoutMS: number): Promise<ExecutionTaskResult> {
        // TODO: This will need to integrate with AIPromptRunner's execution logic
        // For now, implementing a simplified version
        
        const startTime = new Date();

        try {
            // Create LLM instance
            const apiKey = GetAIAPIKey(task.model.DriverClass);
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, task.model.DriverClass, apiKey);

            // Prepare chat parameters
            const params = new ChatParams();
            params.model = task.model.APIName;
            
            // Build message array with rendered prompt and conversation messages
            params.messages = this.buildMessageArray(
                task.renderedPrompt, 
                task.conversationMessages, 
                task.templateMessageRole || 'system'
            );

            // Apply model-specific parameters if available
            if (task.modelParameters) {
                Object.assign(params, task.modelParameters);
            }

            // Execute with timeout
            const modelResult = await Promise.race([
                llm.ChatCompletion(params),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Task execution timeout')), timeoutMS)
                )
            ]);

            const endTime = new Date();
            const executionTimeMS = endTime.getTime() - startTime.getTime();

            return {
                task,
                success: modelResult.success,
                rawResult: modelResult.data?.choices?.[0]?.message?.content,
                executionTimeMS,
                tokensUsed: modelResult.data?.usage?.totalTokens,
                modelResult,
                startTime,
                endTime
            };

        } catch (error) {
            const endTime = new Date();
            throw new Error(`Task execution failed: ${error.message}`);
        }
    }

    /**
     * Aggregates individual task results into a comprehensive parallel execution result.
     * 
     * @param taskResults - Array of all task execution results
     * @param startTime - Start time of the parallel execution
     * @param endTime - End time of the parallel execution
     * @returns ParallelExecutionResult - Aggregated results with metrics
     */
    private aggregateResults(
        taskResults: ExecutionTaskResult[], 
        startTime: Date, 
        endTime: Date
    ): ParallelExecutionResult {
        const groupResults = new Map<number, ExecutionTaskResult[]>();
        const errors: string[] = [];
        let totalTokensUsed = 0;
        let successCount = 0;

        // Group results and calculate metrics
        for (const result of taskResults) {
            const groupNumber = result.task.executionGroup;
            if (!groupResults.has(groupNumber)) {
                groupResults.set(groupNumber, []);
            }
            groupResults.get(groupNumber)!.push(result);

            if (result.success) {
                successCount++;
                totalTokensUsed += result.tokensUsed || 0;
            } else {
                if (result.errorMessage) {
                    errors.push(result.errorMessage);
                }
            }
        }

        return {
            success: successCount > 0,
            taskResults,
            groupResults,
            totalExecutionTimeMS: endTime.getTime() - startTime.getTime(),
            successCount,
            failureCount: taskResults.length - successCount,
            totalTokensUsed,
            errors,
            startTime,
            endTime
        };
    }

    /**
     * Selects the first successful result from the array.
     * 
     * @param results - Array of successful results to choose from
     * @returns ExecutionTaskResult - The first result in the array
     */
    private selectFirstResult(results: ExecutionTaskResult[]): ExecutionTaskResult {
        return results[0];
    }

    /**
     * Selects a random result from the array.
     * 
     * @param results - Array of successful results to choose from
     * @returns ExecutionTaskResult - A randomly selected result
     */
    private selectRandomResult(results: ExecutionTaskResult[]): ExecutionTaskResult {
        const randomIndex = Math.floor(Math.random() * results.length);
        return results[randomIndex];
    }

    /**
     * Uses an AI prompt to select the best result from multiple options.
     * 
     * @param results - Array of successful results to choose from
     * @param selectorPromptId - ID of the prompt to use for selection
     * @returns Promise<ExecutionTaskResult> - The AI-selected best result with all results ranked
     */
    private async selectResultWithPrompt(
        results: ExecutionTaskResult[], 
        selectorPromptId: string
    ): Promise<ExecutionTaskResult> {
        try {
            // Import AIPromptRunner here to avoid circular dependency
            const { AIPromptRunner } = await import('./AIPromptRunner');
            
            // Load the judge prompt from AIEngine
            await AIEngine.Instance.Config(false);
            const judgePrompt = AIEngine.Instance.Prompts.find(p => p.ID === selectorPromptId);
            
            if (!judgePrompt) {
                LogError(`Judge prompt with ID ${selectorPromptId} not found`);
                return results[0]; // Fallback to first result
            }
            
            // Prepare the data for the judge prompt
            const judgeData = this.formatResultsForJudge(results);
            
            // Create conversation messages for the judge
            const conversationMessages: ChatMessage[] = [
                {
                    role: ChatMessageRole.system,
                    content: "You are an expert AI judge tasked with ranking multiple AI responses to determine the best one. Analyze each response for quality, accuracy, completeness, and relevance to the original prompt."
                },
                {
                    role: ChatMessageRole.user,
                    content: JSON.stringify(judgeData, null, 2)
                }
            ];
            
            // Execute the judge prompt
            const judgeRunner = new AIPromptRunner();
            const judgeStartTime = Date.now();
            
            const judgeResult = await judgeRunner.ExecutePrompt({
                prompt: judgePrompt,
                data: judgeData,
                conversationMessages: conversationMessages
            });
            
            const judgeEndTime = Date.now();
            const judgeExecutionTimeMS = judgeEndTime - judgeStartTime;
            
            if (!judgeResult.success || !judgeResult.rawResult) {
                LogError(`Judge prompt execution failed: ${judgeResult.errorMessage}`);
                return results[0]; // Fallback to first result
            }
            
            // Parse the judge's decision
            const rankings = this.parseJudgeResult(judgeResult.rawResult);
            
            if (!rankings || rankings.length === 0) {
                LogError('Failed to parse judge rankings');
                return results[0]; // Fallback to first result
            }
            
            // Apply rankings to results
            this.applyRankingsToResults(results, rankings);
            
            // Store judge metadata for later use
            const bestCandidateId = rankings.find(r => r.rank === 1)?.candidateId;
            const bestResultIndex = results.findIndex(r => r.task.taskId === bestCandidateId);
            const bestResult = bestResultIndex >= 0 ? results[bestResultIndex] : results[0];
            
            // Add judge metadata to the best result
            bestResult.judgeMetadata = {
                judgePromptId: selectorPromptId,
                judgeExecutionTimeMS,
                judgeTokensUsed: judgeResult.tokensUsed
            };
            
            LogStatus(`Judge selected candidate ${bestCandidateId} as the best result`);
            return bestResult;
            
        } catch (error) {
            LogError(`Error in AI judge selection: ${error.message}`);
            return results[0]; // Fallback to first result
        }
    }

    /**
     * Formats execution results for the judge prompt.
     * 
     * @param results - Array of execution results to format
     * @returns Structured data for judge evaluation
     */
    private formatResultsForJudge(results: ExecutionTaskResult[]): any {
        return {
            originalPrompt: results[0]?.task.renderedPrompt || "Original prompt not available",
            candidates: results.map((result, index) => ({
                candidateId: result.task.taskId,
                modelName: result.task.model.Name,
                vendorName: result.task.model.Vendor || "Unknown",
                response: result.rawResult || "",
                executionTimeMS: result.executionTimeMS,
                tokensUsed: result.tokensUsed || 0
            })),
            instructions: {
                task: "Rank these AI responses from best to worst (1 = best)",
                format: "Return valid JSON with 'rankings' array containing objects with 'candidateId', 'rank', and 'rationale' fields",
                criteria: ["Quality", "Accuracy", "Completeness", "Relevance", "Clarity"]
            }
        };
    }

    /**
     * Parses the judge's result to extract rankings.
     * 
     * @param judgeResult - Raw result from the judge prompt
     * @returns Array of ranking objects or null if parsing fails
     */
    private parseJudgeResult(judgeResult: string): Array<{candidateId: string, rank: number, rationale: string}> | null {
        try {
            // Try to extract JSON from the result (in case there's extra text)
            const jsonMatch = judgeResult.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : judgeResult;
            
            const parsed = JSON.parse(jsonString);
            
            if (parsed.rankings && Array.isArray(parsed.rankings)) {
                return parsed.rankings.map((ranking: any) => ({
                    candidateId: ranking.candidateId,
                    rank: ranking.rank,
                    rationale: ranking.rationale || "No rationale provided"
                }));
            }
            
            LogError('Judge result does not contain valid rankings array');
            return null;
            
        } catch (error) {
            LogError(`Failed to parse judge result: ${error.message}`);
            return null;
        }
    }

    /**
     * Applies rankings to execution task results.
     * 
     * @param results - Array of execution results to rank
     * @param rankings - Rankings from the judge
     */
    private applyRankingsToResults(
        results: ExecutionTaskResult[], 
        rankings: Array<{candidateId: string, rank: number, rationale: string}>
    ): void {
        for (const result of results) {
            const ranking = rankings.find(r => r.candidateId === result.task.taskId);
            if (ranking) {
                result.ranking = ranking.rank;
                result.judgeRationale = ranking.rationale;
            }
        }
    }

    /**
     * Selects the result that appears most frequently (consensus).
     * 
     * @param results - Array of successful results to choose from
     * @returns ExecutionTaskResult - The most common result
     */
    private selectConsensusResult(results: ExecutionTaskResult[]): ExecutionTaskResult {
        // Group results by their content
        const resultGroups = new Map<string, ExecutionTaskResult[]>();
        
        for (const result of results) {
            const key = result.rawResult || '';
            if (!resultGroups.has(key)) {
                resultGroups.set(key, []);
            }
            resultGroups.get(key)!.push(result);
        }

        // Find the group with the most results
        let largestGroup: ExecutionTaskResult[] = [];
        for (const group of resultGroups.values()) {
            if (group.length > largestGroup.length) {
                largestGroup = group;
            }
        }

        // Return the first result from the largest group
        return largestGroup[0];
    }

    /**
     * Builds the message array combining rendered prompt with conversation messages
     */
    private buildMessageArray(
        renderedPrompt: string, 
        conversationMessages?: ChatMessage[], 
        templateMessageRole: 'system' | 'user' | 'none' = 'system'
    ): ChatMessage[] {
        const messages: ChatMessage[] = [];
        
        // Add rendered template as system or user message if not 'none'
        if (renderedPrompt && templateMessageRole !== 'none') {
            messages.push({
                role: templateMessageRole === 'system' ? ChatMessageRole.system : ChatMessageRole.user,
                content: renderedPrompt
            });
        }
        
        // Add conversation messages if provided
        if (conversationMessages && conversationMessages.length > 0) {
            messages.push(...conversationMessages);
        }
        
        // If no conversation messages and no rendered prompt as user message, 
        // add a default user message to ensure we have at least one user message
        if ((!conversationMessages || conversationMessages.length === 0) && 
            templateMessageRole !== 'user' && renderedPrompt) {
            // If we only have a system message, we need a user message too
            if (templateMessageRole === 'system') {
                messages.push({
                    role: ChatMessageRole.user,
                    content: "Please proceed with the above instructions."
                });
            }
        } else if ((!conversationMessages || conversationMessages.length === 0) && !renderedPrompt) {
            // Fallback: if no conversation and no rendered prompt, add a basic user message
            messages.push({
                role: ChatMessageRole.user,
                content: "Hello"
            });
        }
        
        return messages;
    }

    /**
     * Creates a delay for the specified number of milliseconds.
     * 
     * @param ms - Number of milliseconds to delay
     * @returns Promise<void> - Promise that resolves after the delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}