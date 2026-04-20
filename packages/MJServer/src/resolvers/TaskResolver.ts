import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { TaskOrchestrator, TaskGraphResponse, TaskExecutionResult } from '../services/TaskOrchestrator.js';

@ObjectType()
export class TaskExecutionResultType {
    @Field()
    taskId: string;

    @Field()
    success: boolean;

    @Field({ nullable: true })
    output?: string;

    @Field({ nullable: true })
    error?: string;
}

@ObjectType()
export class ExecuteTaskGraphResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    errorMessage?: string;

    @Field(() => [TaskExecutionResultType])
    results: TaskExecutionResultType[];
}

/**
 * TaskOrchestrationResolver handles multi-step task orchestration.
 * This resolver is called when the Conversation Manager returns a task graph
 * for complex workflows that require multiple agents working in sequence or parallel.
 */
@Resolver()
export class TaskOrchestrationResolver extends ResolverBase {
    /**
     * Execute a task graph from the Conversation Manager.
     * This creates tasks in the database, manages dependencies, and executes them in proper order.
     *
     * @param taskGraphJson - JSON string containing the task graph from Conversation Manager
     * @param conversationDetailId - ID of the conversation detail that triggered this workflow
     * @param environmentId - Environment ID for the tasks
     */
    @Mutation(() => ExecuteTaskGraphResult)
    async ExecuteTaskGraph(
        @Arg('taskGraphJson') taskGraphJson: string,
        @Arg('conversationDetailId') conversationDetailId: string,
        @Arg('environmentId') environmentId: string,
        @Arg('sessionId') sessionId: string,
        @PubSub() pubSub: PubSubEngine,
        @Ctx() { userPayload }: AppContext,
        @Arg('createNotifications', { nullable: true }) createNotifications?: boolean
    ): Promise<ExecuteTaskGraphResult> {
        // Check API key scope authorization for task execution
        await this.CheckAPIKeyScopeAuthorization('task:execute', '*', userPayload);

        try {
            LogStatus(`=== EXECUTING TASK GRAPH FOR CONVERSATION: ${conversationDetailId} ===`);

            // Parse task graph
            const taskGraph: TaskGraphResponse = JSON.parse(taskGraphJson);

            // Validate task graph
            if (!taskGraph.workflowName || !taskGraph.tasks || taskGraph.tasks.length === 0) {
                throw new Error('Invalid task graph: must have workflowName and at least one task');
            }

            // Get current user
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                throw new Error('Unable to determine current user');
            }

            LogStatus(`Workflow: ${taskGraph.workflowName} (${taskGraph.tasks.length} tasks)`);
            if (taskGraph.reasoning) {
                LogStatus(`Reasoning: ${taskGraph.reasoning}`);
            }

            // Create task orchestrator with PubSub for progress updates
            const orchestrator = new TaskOrchestrator(currentUser, pubSub, sessionId, userPayload, createNotifications || false, conversationDetailId);

            // Create parent task and child tasks with dependencies
            const { parentTaskId, taskIdMap } = await orchestrator.createTasksFromGraph(
                taskGraph,
                conversationDetailId,
                environmentId
            );

            LogStatus(`Created parent task ${parentTaskId} with ${taskIdMap.size} child tasks`);

            // Execute tasks in proper order
            const results = await orchestrator.executeTasksForParent(
                parentTaskId
            );

            // Log results
            const successCount = results.filter(r => r.success).length;
            LogStatus(`Completed ${successCount} of ${results.length} tasks successfully`);

            for (const result of results) {
                if (result.success) {
                    LogStatus(`✅ Task ${result.taskId} completed successfully`);
                } else {
                    LogError(`❌ Task ${result.taskId} failed: ${result.error}`);
                }
            }

            // Convert results to GraphQL types
            const graphqlResults: TaskExecutionResultType[] = results.map(r => ({
                taskId: r.taskId,
                success: r.success,
                output: r.output ? JSON.stringify(r.output) : undefined,
                error: r.error
            }));

            LogStatus(`=== TASK GRAPH EXECUTION COMPLETE ===`);

            const result = {
                success: true,
                results: graphqlResults
            };

            LogStatus(`Returning ExecuteTaskGraph result: ${JSON.stringify({
                success: result.success,
                resultsCount: result.results.length,
                firstResult: result.results[0]
            })}`);

            return result;

        } catch (error) {
            LogError(`Task graph execution failed:`, undefined, error);

            return {
                success: false,
                errorMessage: (error as Error).message || 'Unknown error occurred',
                results: []
            };
        }
    }
}
