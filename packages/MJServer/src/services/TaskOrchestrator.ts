import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity, MJTaskTypeEntity, MJConversationDetailEntity, MJArtifactEntity, MJArtifactVersionEntity, MJConversationDetailArtifactEntity, MJUserNotificationEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessageRole } from '@memberjunction/ai';
import { PubSubEngine } from 'type-graphql';
import { UserPayload } from '../types.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';

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
    // Default artifact type ID for JSON (when agent doesn't specify DefaultArtifactTypeID)
    private readonly JSON_ARTIFACT_TYPE_ID = 'ae674c7e-ea0d-49ea-89e4-0649f5eb20d4';

    private taskTypeId: string | null = null;

    constructor(
        private contextUser: UserInfo,
        private pubSub?: PubSubEngine,
        private sessionId?: string,
        private userPayload?: UserPayload,
        private createNotifications: boolean = false,
        private conversationDetailId?: string
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
        const taskType = await md.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', this.contextUser);
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
     * @returns Object with parentTaskId and map of tempId -> actual MJTaskEntity ID
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
        const parentTask = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
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

        // Deduplicate tasks by tempId (LLM sometimes returns duplicates)
        const seenTempIds = new Set<string>();
        const uniqueTasks = taskGraph.tasks.filter(task => {
            if (seenTempIds.has(task.tempId)) {
                LogError(`Duplicate tempId detected and ignored: ${task.tempId} (${task.name})`);
                return false;
            }
            seenTempIds.add(task.tempId);
            return true;
        });

        LogStatus(`Creating ${uniqueTasks.length} unique child tasks (${taskGraph.tasks.length - uniqueTasks.length} duplicates filtered)`);

        // Create all child tasks
        for (const taskDef of uniqueTasks) {
            const task = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);

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
            task.ConversationDetailID = conversationDetailId; // Link to conversation so agent runs can be tracked
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
        for (const taskDef of uniqueTasks) {
            const taskId = tempIdToRealId.get(taskDef.tempId);
            if (!taskId) continue;

            for (const dependsOnTempId of taskDef.dependsOn) {
                const dependsOnId = tempIdToRealId.get(dependsOnTempId);
                if (!dependsOnId) {
                    LogError(`Dependency not found: ${dependsOnTempId}`);
                    continue;
                }

                const dependency = await md.GetEntityObject<MJTaskDependencyEntity>('MJ: Task Dependencies', this.contextUser);
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
        if (!this.pubSub || !this.sessionId || !this.userPayload) {
            LogStatus(`⚠️ PubSub not available for progress updates (pubSub: ${!!this.pubSub}, sessionId: ${!!this.sessionId}, userPayload: ${!!this.userPayload})`);
            return;
        }

        const payload = {
            message: JSON.stringify({
                resolver: 'TaskOrchestrator',
                type: 'TaskProgress',
                status: 'ok',
                data: {
                    taskName,
                    message,
                    percentComplete,
                    timestamp: new Date(),
                    conversationDetailId: this.conversationDetailId
                }
            }),
            sessionId: this.userPayload.sessionId
        };

        LogStatus(`📡 Publishing task progress: ${taskName} - ${message} (${percentComplete}%) to session ${this.userPayload.sessionId}`);
        this.pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, payload);

        LogStatus(`[Task: ${taskName}] ${message} (${percentComplete}%)`);
    }

    /**
     * Publish agent progress update (nested within task)
     */
    private publishAgentProgress(taskName: string, agentStep: string, agentMessage: string): void {
        if (!this.pubSub || !this.sessionId || !this.userPayload) {
            LogStatus(`⚠️ PubSub not available for agent progress (pubSub: ${!!this.pubSub}, sessionId: ${!!this.sessionId}, userPayload: ${!!this.userPayload})`);
            return;
        }

        const payload = {
            message: JSON.stringify({
                resolver: 'TaskOrchestrator',
                type: 'AgentProgress',
                status: 'ok',
                data: {
                    taskName,
                    agentStep,
                    agentMessage,
                    timestamp: new Date(),
                    conversationDetailId: this.conversationDetailId
                }
            }),
            sessionId: this.userPayload.sessionId
        };

        LogStatus(`📡 Publishing agent progress: ${taskName} → ${agentStep} to session ${this.userPayload.sessionId}`);
        this.pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, payload);

        LogStatus(`[Task: ${taskName}] → ${agentStep}: ${agentMessage}`);
    }

    /**
     * Find agent by name
     */
    private async findAgentByName(agentName: string): Promise<AIAgentEntityExtended | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIAgentEntityExtended>({
            EntityName: 'MJ: AI Agents',
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
        const parentTask = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
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
    private async findEligibleTasks(parentTaskId: string): Promise<MJTaskEntity[]> {
        const rv = new RunView();

        // Get all pending tasks for this parent
        const tasksResult = await rv.RunView<MJTaskEntity>({
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ParentID='${parentTaskId}' AND Status='Pending'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        if (!tasksResult.Success || !tasksResult.Results) {
            return [];
        }

        const eligibleTasks: MJTaskEntity[] = [];

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
        const parentTask = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        const loaded = await parentTask.Load(parentTaskId);
        if (!loaded) return;

        const rv = new RunView();

        // Get all child tasks
        const childrenResult = await rv.RunView<MJTaskEntity>({
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
        const parentTask = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        const loaded = await parentTask.Load(parentTaskId);
        if (!loaded) return;

        parentTask.Status = 'Complete';
        parentTask.PercentComplete = 100;
        parentTask.CompletedAt = new Date();
        const saved = await parentTask.Save();

        LogStatus(`Parent workflow task completed: ${parentTask.Name}`);

        // If notifications enabled, create user notification
        if (this.createNotifications && saved) {
            await this.createTaskGraphCompletionNotification(parentTask);
        }
    }

    /**
     * Check if a task has incomplete dependencies
     */
    private async hasIncompleteDependencies(taskId: string): Promise<boolean> {
        const rv = new RunView();

        // Get dependencies
        const depsResult = await rv.RunView<MJTaskDependencyEntity>({
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
    private async loadTask(taskId: string): Promise<MJTaskEntity | null> {
        const md = new Metadata();
        const task = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        const loaded = await task.Load(taskId);
        return loaded ? task : null;
    }

    /**
     * Execute a single task
     */
    private async executeTask(task: MJTaskEntity): Promise<TaskExecutionResult> {
        try {
            LogStatus(`Executing task: ${task.Name} (${task.ID})`);

            // Update status to In Progress
            task.Status = 'In Progress';
            task.StartedAt = new Date();
            await task.Save();

            // Load the agent entity
            const md = new Metadata();
            const agentEntity = await md.GetEntityObject<AIAgentEntityExtended>('MJ: AI Agents', this.contextUser);
            const loaded = await agentEntity.Load(task.AgentID!);
            if (!loaded) {
                throw new Error(`Agent with ID ${task.AgentID} not found`);
            }

            // Build conversation messages with task input and dependent outputs as markdown
            const messages = await this.buildConversationMessages(task);

            // Create progress callback to publish agent progress nested under task
            const onProgress = (progress: any) => {
                this.publishAgentProgress(
                    task.Name,
                    progress.step || 'processing',
                    progress.message || ''
                );
            };

            // Run the agent - use only conversationMessages, no payload parameter
            // Payload should only be used when passing an agent its own prior output for modification
            const agentRunner = new AgentRunner();
            const agentResult = await agentRunner.RunAgent({
                agent: agentEntity,
                conversationMessages: messages,
                contextUser: this.contextUser,
                conversationDetailId: task.ConversationDetailID || undefined,
                onProgress: onProgress
            });

            if (agentResult.success) {
                // Extract output - check both message and payload
                const output = this.extractAgentOutput(agentResult);

                // Store output in task metadata
                const outputMetadata = {
                    outputType: output.type,
                    output: output.content,
                    agentRunId: agentResult.agentRun?.ID
                };

                // Update task with success
                task.Status = 'Complete';
                task.CompletedAt = new Date();
                task.PercentComplete = 100;
                // Store output in description (would be better as a separate column)
                task.Description = `${task.Description}\n\n__TASK_OUTPUT__\n${JSON.stringify(outputMetadata)}`;
                await task.Save();

                LogStatus(`Task completed: ${task.Name} (output type: ${output.type})`);

                // Always create artifact for task output (both message and payload results)
                let conversationDetailId = task.ConversationDetailID;
                if (!conversationDetailId && task.ParentID) {
                    const parentTask = await this.loadTask(task.ParentID);
                    conversationDetailId = parentTask?.ConversationDetailID || null;
                }

                if (conversationDetailId && output.content) {
                    await this.createArtifactFromOutput(
                        output,
                        conversationDetailId,
                        agentEntity,
                        task.Name
                    );
                } else if (!conversationDetailId) {
                    LogError(`Cannot create artifact: No conversation detail ID found for task ${task.ID}`);
                }

                return {
                    taskId: task.ID,
                    success: true,
                    output: output.content
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
    private extractInputPayload(task: MJTaskEntity): any | null {
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
        const depsResult = await rv.RunView<MJTaskDependencyEntity>({
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
     * Build conversation messages with task input and dependent outputs formatted as markdown
     */
    private async buildConversationMessages(task: MJTaskEntity): Promise<any[]> {
        const messages: any[] = [];

        // Start with task description/name as base content
        let userContent = task.Description || task.Name;

        // Extract input payload from task metadata if it exists
        const inputPayload = this.extractInputPayload(task);

        // Get dependent task outputs
        const dependentOutputs = await this.getDependentTaskOutputs(task.ID);

        // If there are dependent outputs, format them as markdown blocks
        if (dependentOutputs.size > 0) {
            userContent += '\n\n## Results from Dependent Tasks:\n\n';
            for (const [taskId, outputData] of dependentOutputs.entries()) {
                const depTask = await this.loadTask(taskId);
                const taskName = depTask?.Name || taskId;
                userContent += `### ${taskName}\n\`\`\`json\n${JSON.stringify(outputData, null, 2)}\n\`\`\`\n\n`;
            }
        }

        // If input payload exists, add it as a separate section
        if (inputPayload) {
            userContent += '\n\n## Task Input:\n\`\`\`json\n' + JSON.stringify(inputPayload, null, 2) + '\n\`\`\`';
        }

        messages.push({
            role: 'user' as ChatMessageRole,
            content: userContent
        });

        return messages;
    }

    /**
     * Extract agent output - check both message and payload
     */
    private extractAgentOutput(agentResult: any): { type: 'message' | 'payload', content: any } {
        // Check if agent returned a message (text response)
        if (agentResult.agentRun?.Message) {
            return { type: 'message', content: agentResult.agentRun.Message };
        }

        // Check if agent returned a payload (structured data)
        if (agentResult.payload && Object.keys(agentResult.payload).length > 0) {
            return { type: 'payload', content: agentResult.payload };
        }

        // No output
        return { type: 'message', content: '' };
    }

    /**
     * Create artifact from task output (handles both message and payload types)
     */
    private async createArtifactFromOutput(
        output: { type: 'message' | 'payload', content: any },
        conversationDetailId: string,
        agent: AIAgentEntityExtended,
        taskName: string
    ): Promise<void> {
        try {
            const md = new Metadata();

            // Create Artifact header
            const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.contextUser);
            artifact.Name = `${agent.Name} - ${taskName} - ${new Date().toLocaleString()}`;
            artifact.Description = `Artifact generated by ${agent.Name} for task: ${taskName} (${output.type})`;

            // Use agent's DefaultArtifactTypeID if available, otherwise fall back to JSON
            const defaultArtifactTypeId = (agent as any).DefaultArtifactTypeID;
            artifact.TypeID = defaultArtifactTypeId || this.JSON_ARTIFACT_TYPE_ID;

            artifact.UserID = this.contextUser.ID;
            artifact.EnvironmentID = (this.contextUser as any).EnvironmentID || 'F51358F3-9447-4176-B313-BF8025FD8D09';

            // Set visibility based on agent's ArtifactCreationMode
            // Will compile after CodeGen adds the new fields
            const creationMode = agent.ArtifactCreationMode;
            if (creationMode === 'System Only') {
                artifact.Visibility = 'System Only';
                LogStatus(`Task artifact marked as "System Only" per agent configuration`);
            } else {
                artifact.Visibility = 'Always';
            }

            const artifactSaved = await artifact.Save();
            if (!artifactSaved) {
                LogError('Failed to save artifact');
                return;
            }

            LogStatus(`Created artifact: ${artifact.Name} (${artifact.ID})`);

            // Create Artifact Version with content
            const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.contextUser);
            version.ArtifactID = artifact.ID;
            version.VersionNumber = 1;

            // Store content based on output type
            if (output.type === 'message') {
                version.Content = output.content;
            } else {
                version.Content = JSON.stringify(output.content, null, 2);
            }

            version.UserID = this.contextUser.ID;

            const versionSaved = await version.Save();
            if (!versionSaved) {
                LogError('Failed to save artifact version');
                return;
            }

            LogStatus(`Created artifact version: ${version.ID}`);

            // Check for extracted Name attribute and update artifact with better name
            const nameAttr = (version as any).Attributes?.find((attr: any) =>
                attr.StandardProperty === 'name' || attr.Name?.toLowerCase() === 'name'
            );

            // Check for valid name value (not null, not empty, not string "null")
            let extractedName = nameAttr?.Value?.trim();
            if (extractedName && extractedName.toLowerCase() !== 'null') {
                // Strip surrounding quotes (double or single) from start and end
                extractedName = extractedName.replace(/^["']|["']$/g, '');

                artifact.Name = extractedName;
                if (await artifact.Save()) {
                    LogStatus(`✨ Updated artifact name to: ${artifact.Name}`);
                }
            }

            // Create M2M relationship linking artifact to conversation detail
            const junction = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
                'MJ: Conversation Detail Artifacts',
                this.contextUser
            );
            junction.ConversationDetailID = conversationDetailId;
            junction.ArtifactVersionID = version.ID;
            junction.Direction = 'Output'; // Artifact produced as output from task

            const junctionSaved = await junction.Save();
            if (!junctionSaved) {
                LogError('Failed to create artifact-conversation association');
                return;
            }

            LogStatus(`Linked artifact ${artifact.ID} to conversation detail ${conversationDetailId}`);
        } catch (error) {
            LogError(`Error creating artifact from output: ${error}`);
        }
    }

    /**
     * Create user notification for task graph completion
     * Notifies user that their multi-step workflow has completed
     */
    private async createTaskGraphCompletionNotification(parentTask: MJTaskEntity): Promise<void> {
        try {
            if (!parentTask.ConversationDetailID) {
                LogStatus('Skipping notification - no conversation detail linked');
                return;
            }

            const md = new Metadata();

            // Load conversation detail to get conversation ID
            const detail = await md.GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                this.contextUser
            );
            if (!(await detail.Load(parentTask.ConversationDetailID))) {
                throw new Error(`Failed to load conversation detail ${parentTask.ConversationDetailID}`);
            }

            // Count child tasks and success rate
            const rv = new RunView();
            const tasksResult = await rv.RunView<MJTaskEntity>({
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID='${parentTask.ID}'`,
                ResultType: 'entity_object'
            }, this.contextUser);

            const childTasks = tasksResult.Success ? (tasksResult.Results || []) : [];
            const successCount = childTasks.filter(t => t.Status === 'Complete').length;
            const totalCount = childTasks.length;

            // Create notification
            const notification = await md.GetEntityObject<MJUserNotificationEntity>(
                'MJ: User Notifications',
                this.contextUser
            );

            notification.UserID = this.contextUser.ID;
            notification.Title = `Workflow "${parentTask.Name}" completed`;
            notification.Message = `Your ${totalCount}-step workflow has finished. ${successCount} of ${totalCount} tasks completed successfully.`;

            // Navigation configuration
            notification.ResourceConfiguration = JSON.stringify({
                type: 'conversation',
                conversationId: detail.ConversationID,
                messageId: parentTask.ConversationDetailID,
                taskId: parentTask.ID
            });

            notification.Unread = true;

            if (!(await notification.Save())) {
                throw new Error('Failed to save notification');
            }

            LogStatus(`📬 Created task graph notification ${notification.ID} for user ${this.contextUser.ID}`);

            // Publish real-time event if pubSub available
            if (this.pubSub && this.userPayload) {
                this.pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
                    userPayload: JSON.stringify(this.userPayload),
                    message: JSON.stringify({
                        type: 'notification',
                        notificationId: notification.ID,
                        action: 'create',
                        title: notification.Title,
                        message: notification.Message
                    })
                });

                LogStatus(`📡 Published task graph notification event to client`);
            }

        } catch (error) {
            LogError(`Failed to create task graph notification: ${(error as Error).message}`);
            // Don't throw - notification failure shouldn't fail the task
        }
    }
}
