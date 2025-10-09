import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { TaskEntity, TaskDependencyEntity, TaskTypeEntity, AIAgentEntityExtended, ConversationDetailEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessageRole } from '@memberjunction/ai';
import { PubSubEngine } from 'type-graphql';
import { UserPayload } from '../types.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

/**
 * Task definition from LLM response
 */
export interface TaskDefinition {
    tempId: string; // LLM-generated ID for reference
    name: string;
    description: string;
    agentName: string;
    dependsOn: string[]; // Array of tempIds this task depends on
    inputPayload?: any;
}

/**
 * Task graph response from Conversation Manager
 */
export interface TaskGraphResponse {
    workflowName: string; // Name for the parent/workflow task
    tasks: TaskDefinition[];
    reasoning?: string;
}

/**
 * Task execution result
 */
export interface TaskExecutionResult {
    taskId: string;
    success: boolean;
    output?: any;
    error?: string;
}

/**
 * TaskOrchestrator handles multi-step task execution with dependencies
 */
export class TaskOrchestrator {
    private taskTypeId: string | null = null;

    constructor(
        private contextUser: UserInfo,
        private pubSub?: PubSubEngine,
        private sessionId?: string,
        private userPayload?: UserPayload
    ) {}

    /**
     * Initialize the orchestrator by finding/creating the AI Agent Task type
     */
    private async ensureTaskType(): Promise<string> {
        if (this.taskTypeId) {
            return this.taskTypeId;
        }

        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ: Task Types',
            ExtraFilter: `Name='AI Agent Execution'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            this.taskTypeId = result.Results[0].ID;
            return this.taskTypeId;
        }

        // Create the task type if it doesn't exist
        const md = new Metadata();
        const taskType = await md.GetEntityObject<TaskTypeEntity>('MJ: Task Types', this.contextUser);
        taskType.Name = 'AI Agent Execution';
        taskType.Description = 'Task executed by an AI agent as part of conversation workflow';

        const saved = await taskType.Save();
        if (!saved) {
            throw new Error('Failed to create AI Agent Execution task type');
        }

        this.taskTypeId = taskType.ID;
        return this.taskTypeId;
    }

    /**
     * Create tasks from LLM task graph response
     * @param taskGraph Task graph from Conversation Manager
     * @param conversationDetailId ID of the conversation detail that triggered this
     * @param environmentId Environment ID
     * @returns Object with parentTaskId and map of tempId -> actual TaskEntity ID
     */
    async createTasksFromGraph(
        taskGraph: TaskGraphResponse,
        conversationDetailId: string,
        environmentId: string
    ): Promise<{ parentTaskId: string; taskIdMap: Map<string, string> }> {
        const taskTypeId = await this.ensureTaskType();
        const md = new Metadata();
        const tempIdToRealId = new Map<string, string>();

        // Create parent workflow task
        const parentTask = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.contextUser);
        parentTask.Name = taskGraph.workflowName;
        parentTask.Description = taskGraph.reasoning || 'AI-orchestrated workflow';
        parentTask.TypeID = taskTypeId;
        parentTask.EnvironmentID = environmentId;
        parentTask.ConversationDetailID = conversationDetailId; // Parent links to conversation
        parentTask.Status = 'In Progress'; // Workflow is in progress
        parentTask.PercentComplete = 0;

        const parentSaved = await parentTask.Save();
        if (!parentSaved) {
            throw new Error('Failed to create parent workflow task');
        }

        LogStatus(`Created parent workflow task: ${parentTask.Name} (${parentTask.ID})`);

        // Create all child tasks
        for (const taskDef of taskGraph.tasks) {
            const task = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.contextUser);

            // Find agent by name
            const agent = await this.findAgentByName(taskDef.agentName);
            if (!agent) {
                LogError(`Agent not found: ${taskDef.agentName}`);
                continue;
            }

            task.Name = taskDef.name;
            task.Description = taskDef.description;
            task.TypeID = taskTypeId;
            task.EnvironmentID = environmentId;
            task.ParentID = parentTask.ID; // Link to parent task
            // NOTE: Sub-tasks do NOT link to ConversationDetailID - only parent does
            task.AgentID = agent.ID;
            task.Status = 'Pending';
            task.PercentComplete = 0;

            // Store input payload if provided
            if (taskDef.inputPayload) {
                const metadata = {
                    inputPayload: taskDef.inputPayload,
                    tempId: taskDef.tempId
                };
                // Store in a well-known format at the end of description
                task.Description = `${taskDef.description}\n\n__TASK_METADATA__\n${JSON.stringify(metadata)}`;
            }

            const saved = await task.Save();
            if (saved) {
                tempIdToRealId.set(taskDef.tempId, task.ID);
                LogStatus(`Created child task: ${task.Name} (${task.ID}) under parent ${parentTask.ID}`);
            }
        }

        // Create dependencies between child tasks
        for (const taskDef of taskGraph.tasks) {
            const taskId = tempIdToRealId.get(taskDef.tempId);
            if (!taskId) continue;

            for (const dependsOnTempId of taskDef.dependsOn) {
                const dependsOnId = tempIdToRealId.get(dependsOnTempId);
                if (!dependsOnId) {
                    LogError(`Dependency not found: ${dependsOnTempId}`);
                    continue;
                }

                const dependency = await md.GetEntityObject<TaskDependencyEntity>('MJ: Task Dependencies', this.contextUser);
                dependency.TaskID = taskId;
                dependency.DependsOnTaskID = dependsOnId;
                dependency.DependencyType = 'Prerequisite';

                await dependency.Save();
                LogStatus(`Created dependency: Task ${taskId} depends on ${dependsOnId}`);
            }
        }

        return {
            parentTaskId: parentTask.ID,
            taskIdMap: tempIdToRealId
        };
    }

    /**
     * Publish task progress update via PubSub
     */
    private publishTaskProgress(taskName: string, message: string, percentComplete: number): void {
        if (!this.pubSub || !this.sessionId || !this.userPayload) return;

        this.pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'TaskOrchestrator',
                type: 'TaskProgress',
                status: 'ok',
                data: {
                    taskName,
                    message,
                    percentComplete,
                    timestamp: new Date()
                }
            }),
            sessionId: this.userPayload.sessionId
        });

        LogStatus(`[Task: ${taskName}] ${message} (${percentComplete}%)`);
    }

    /**
     * Publish agent progress update (nested within task)
     */
    private publishAgentProgress(taskName: string, agentStep: string, agentMessage: string): void {
        if (!this.pubSub || !this.sessionId || !this.userPayload) return;

        this.pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'TaskOrchestrator',
                type: 'AgentProgress',
                status: 'ok',
                data: {
                    taskName,
                    agentStep,
                    agentMessage,
                    timestamp: new Date()
                }
            }),
            sessionId: this.userPayload.sessionId
        });

        LogStatus(`[Task: ${taskName}] → ${agentStep}: ${agentMessage}`);
    }

    /**
     * Find agent by name
     */
    private async findAgentByName(agentName: string): Promise<AIAgentEntityExtended | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentEntityExtended>({
            EntityName: 'AI Agents',
            ExtraFilter: `Name='${agentName.replace(/'/g, "''")}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0];
        }

        return null;
    }

    /**
     * Execute all pending tasks for a parent task, respecting dependencies
     * @param parentTaskId Parent task ID
     * @returns Array of execution results
     */
    async executeTasksForParent(parentTaskId: string): Promise<TaskExecutionResult[]> {
        const results: TaskExecutionResult[] = [];
        let hasMore = true;

        // Get parent task for progress updates
        const md = new Metadata();
        const parentTask = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.contextUser);
        await parentTask.Load(parentTaskId);

        // Publish workflow start
        this.publishTaskProgress(parentTask.Name, 'Starting workflow execution', 0);

        while (hasMore) {
            // Find tasks that are pending and have no incomplete dependencies
            const eligibleTasks = await this.findEligibleTasks(parentTaskId);

            if (eligibleTasks.length === 0) {
                hasMore = false;
                break;
            }

            // Execute eligible tasks (could be parallelized in the future)
            for (const task of eligibleTasks) {
                // Publish task start
                this.publishTaskProgress(task.Name, 'Starting task', 0);

                const result = await this.executeTask(task);
                results.push(result);

                // Publish task complete
                if (result.success) {
                    this.publishTaskProgress(task.Name, 'Task completed successfully', 100);
                } else {
                    this.publishTaskProgress(task.Name, `Task failed: ${result.error}`, 100);
                }

                // Update parent task progress after each child completes
                await this.updateParentTaskProgress(parentTaskId);
            }
        }

        // Mark parent task as complete
        await this.completeParentTask(parentTaskId);

        // Publish workflow complete
        this.publishTaskProgress(parentTask.Name, 'Workflow completed', 100);

        return results;
    }

    /**
     * Find tasks that are ready to execute (pending with no incomplete dependencies)
     */
    private async findEligibleTasks(parentTaskId: string): Promise<TaskEntity[]> {
        const rv = new RunView();

        // Get all pending tasks for this parent
        const tasksResult = await rv.RunView<TaskEntity>({
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ParentID='${parentTaskId}' AND Status='Pending'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!tasksResult.Success || !tasksResult.Results) {
            return [];
        }

        const eligibleTasks: TaskEntity[] = [];

        // Check each task for incomplete dependencies
        for (const task of tasksResult.Results) {
            const hasIncompleteDeps = await this.hasIncompleteDependencies(task.ID);
            if (!hasIncompleteDeps) {
                eligibleTasks.push(task);
            }
        }

        return eligibleTasks;
    }

    /**
     * Update parent task progress based on child task completion
     */
    private async updateParentTaskProgress(parentTaskId: string): Promise<void> {
        const md = new Metadata();
        const parentTask = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.contextUser);
        const loaded = await parentTask.Load(parentTaskId);
        if (!loaded) return;

        const rv = new RunView();

        // Get all child tasks
        const childrenResult = await rv.RunView<TaskEntity>({
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ParentID='${parentTaskId}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!childrenResult.Success || !childrenResult.Results || childrenResult.Results.length === 0) {
            return;
        }

        const children = childrenResult.Results;
        const completedCount = children.filter(t => t.Status === 'Complete').length;
        const totalCount = children.length;

        // Update percent complete
        parentTask.PercentComplete = Math.round((completedCount / totalCount) * 100);
        await parentTask.Save();

        LogStatus(`Parent task ${parentTask.Name} is ${parentTask.PercentComplete}% complete (${completedCount}/${totalCount} tasks)`);
    }

    /**
     * Mark parent task as complete when all children are done
     */
    private async completeParentTask(parentTaskId: string): Promise<void> {
        const md = new Metadata();
        const parentTask = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.contextUser);
        const loaded = await parentTask.Load(parentTaskId);
        if (!loaded) return;

        parentTask.Status = 'Complete';
        parentTask.PercentComplete = 100;
        parentTask.CompletedAt = new Date();
        await parentTask.Save();

        LogStatus(`Parent workflow task completed: ${parentTask.Name}`);
    }

    /**
     * Check if a task has incomplete dependencies
     */
    private async hasIncompleteDependencies(taskId: string): Promise<boolean> {
        const rv = new RunView();

        // Get dependencies
        const depsResult = await rv.RunView<TaskDependencyEntity>({
            EntityName: 'MJ: Task Dependencies',
            ExtraFilter: `TaskID='${taskId}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!depsResult.Success || !depsResult.Results || depsResult.Results.length === 0) {
            return false; // No dependencies
        }

        // Check if any dependency is not complete
        for (const dep of depsResult.Results) {
            const dependsOnTask = await this.loadTask(dep.DependsOnTaskID);
            if (dependsOnTask && dependsOnTask.Status !== 'Complete') {
                return true; // Has incomplete dependency
            }
        }

        return false;
    }

    /**
     * Load a task by ID
     */
    private async loadTask(taskId: string): Promise<TaskEntity | null> {
        const md = new Metadata();
        const task = await md.GetEntityObject<TaskEntity>('MJ: Tasks', this.contextUser);
        const loaded = await task.Load(taskId);
        return loaded ? task : null;
    }

    /**
     * Execute a single task
     */
    private async executeTask(task: TaskEntity): Promise<TaskExecutionResult> {
        try {
            LogStatus(`Executing task: ${task.Name} (${task.ID})`);

            // Update status to In Progress
            task.Status = 'In Progress';
            task.StartedAt = new Date();
            await task.Save();

            // Load the agent entity
            const md = new Metadata();
            const agentEntity = await md.GetEntityObject<AIAgentEntityExtended>('AI Agents', this.contextUser);
            const loaded = await agentEntity.Load(task.AgentID!);
            if (!loaded) {
                throw new Error(`Agent with ID ${task.AgentID} not found`);
            }

            // Extract input payload from metadata
            const inputPayload = this.extractInputPayload(task);

            // Get dependent task outputs
            const dependentOutputs = await this.getDependentTaskOutputs(task.ID);

            // Merge dependent outputs into input payload
            const finalPayload = this.mergePayloads(inputPayload, dependentOutputs);

            // Run the agent with progress callback
            const agentRunner = new AgentRunner();
            const messages = [
                {
                    role: 'user' as ChatMessageRole,
                    content: finalPayload ? JSON.stringify(finalPayload) : task.Description || task.Name
                }
            ];

            // Create progress callback to publish agent progress nested under task
            const onProgress = (progress: any) => {
                this.publishAgentProgress(
                    task.Name,
                    progress.step || 'processing',
                    progress.message || ''
                );
            };

            const agentResult = await agentRunner.RunAgent({
                agent: agentEntity,
                conversationMessages: messages,
                contextUser: this.contextUser,
                payload: finalPayload,
                conversationDetailId: task.ConversationDetailID || undefined,
                onProgress: onProgress
            });

            if (agentResult.success) {
                // Store output in task metadata
                const outputMetadata = {
                    output: agentResult.payload,
                    agentRunId: agentResult.agentRun?.ID
                };

                // Update task with success
                task.Status = 'Complete';
                task.CompletedAt = new Date();
                task.PercentComplete = 100;
                // Store output in description (would be better as a separate column)
                task.Description = `${task.Description}\n\n__TASK_OUTPUT__\n${JSON.stringify(outputMetadata)}`;
                await task.Save();

                LogStatus(`Task completed: ${task.Name}`);

                return {
                    taskId: task.ID,
                    success: true,
                    output: agentResult.payload
                };
            } else {
                // Update task with failure
                task.Status = 'Failed';
                task.CompletedAt = new Date();
                await task.Save();

                const errorMsg = agentResult.agentRun?.ErrorMessage || 'Agent execution failed';
                LogError(`Task failed: ${task.Name} - ${errorMsg}`);

                return {
                    taskId: task.ID,
                    success: false,
                    error: errorMsg
                };
            }
        } catch (error) {
            LogError(error);

            // Update task with failure
            task.Status = 'Failed';
            task.CompletedAt = new Date();
            await task.Save();

            return {
                taskId: task.ID,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Extract input payload from task metadata
     */
    private extractInputPayload(task: TaskEntity): any | null {
        if (!task.Description) return null;

        const metadataMatch = task.Description.match(/__TASK_METADATA__\n(.+?)(?:\n\n|$)/s);
        if (!metadataMatch) return null;

        try {
            const metadata = JSON.parse(metadataMatch[1]);
            return metadata.inputPayload || null;
        } catch {
            return null;
        }
    }

    /**
     * Get outputs from tasks that this task depends on
     */
    private async getDependentTaskOutputs(taskId: string): Promise<Map<string, any>> {
        const outputs = new Map<string, any>();
        const rv = new RunView();

        // Get dependencies
        const depsResult = await rv.RunView<TaskDependencyEntity>({
            EntityName: 'MJ: Task Dependencies',
            ExtraFilter: `TaskID='${taskId}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!depsResult.Success || !depsResult.Results) {
            return outputs;
        }

        // Get output from each dependency
        for (const dep of depsResult.Results) {
            const dependsOnTask = await this.loadTask(dep.DependsOnTaskID);
            if (!dependsOnTask || !dependsOnTask.Description) continue;

            const outputMatch = dependsOnTask.Description.match(/__TASK_OUTPUT__\n(.+?)$/s);
            if (outputMatch) {
                try {
                    const outputMetadata = JSON.parse(outputMatch[1]);
                    outputs.set(dep.DependsOnTaskID, outputMetadata.output);
                } catch (e) {
                    LogError(`Failed to parse output for task ${dep.DependsOnTaskID}: ${e}`);
                }
            }
        }

        return outputs;
    }

    /**
     * Merge input payload with dependent outputs
     * Handles @taskX.output references
     */
    private mergePayloads(inputPayload: any, dependentOutputs: Map<string, any>): any {
        if (!inputPayload) {
            // If no input payload, just return first dependent output
            if (dependentOutputs.size > 0) {
                return Array.from(dependentOutputs.values())[0];
            }
            return null;
        }

        // Create a copy to avoid mutating original
        const merged = JSON.parse(JSON.stringify(inputPayload));

        // Replace @taskX.output references
        const replaceReferences = (obj: any): any => {
            if (typeof obj === 'string') {
                // Check for @taskX.output pattern
                const match = obj.match(/@task(\d+)\.output/);
                if (match) {
                    // For now, just replace with the first dependent output
                    // In a more sophisticated version, we'd track tempId -> taskId mapping
                    if (dependentOutputs.size > 0) {
                        return Array.from(dependentOutputs.values())[0];
                    }
                }
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj.map(replaceReferences);
            }

            if (obj && typeof obj === 'object') {
                const result: any = {};
                for (const key in obj) {
                    result[key] = replaceReferences(obj[key]);
                }
                return result;
            }

            return obj;
        };

        return replaceReferences(merged);
    }
}
