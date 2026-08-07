import { DatabaseProviderBase, IMetadataProvider, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity, MJTaskTypeEntity, MJConversationDetailEntity, MJArtifactEntity, MJArtifactVersionEntity, MJConversationDetailArtifactEntity, MJUserNotificationEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessageRole } from '@memberjunction/ai';
import { PubSubEngine } from 'type-graphql';
import { UserPayload } from '../types.js';
import { publishStatusUpdate } from '../generic/PushStatusResolver.js';
import {
    MJAIAgentEntityExtended,
    ComputeEligibleTasks,
    ComputeParentRollup,
    ComputeTasksToBlock,
    DetectCycle,
    IsGraphStalled,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TaskGraphNodeStatus,
} from '@memberjunction/ai-core-plus';

/**
 * Maximum number of eligible tasks executed concurrently within one wave.
 * Mirrors BaseAgent's bounded sub-agent fan-out; carries into the Phase 2 dispatcher.
 */
const TASK_EXECUTION_CONCURRENCY = 5;

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
/** One graph's children + edges, in both algorithm shape and mutable-entity shape. */
type GraphState = {
    nodes: TaskGraphNode[];
    edges: TaskGraphEdge[];
    entityById: Map<string, MJTaskEntity>;
};

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
        private conversationDetailId?: string,
        private provider?: IMetadataProvider
    ) {}

    private getMetadata(): IMetadataProvider {
        return this.provider ?? (new Metadata() as unknown as IMetadataProvider);
    }

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
        const md = this.getMetadata();
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
        const md = this.getMetadata();
        const tempIdToRealId = new Map<string, string>();

        // Build the parent task, deduplicate the incoming task defs, and resolve agents
        // BEFORE opening the transaction so all preparatory work (cache lookups, agent
        // resolution RunViews) happens outside the critical section.
        const parentTask = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        parentTask.Name = taskGraph.workflowName;
        parentTask.Description = taskGraph.reasoning || 'AI-orchestrated workflow';
        parentTask.TypeID = taskTypeId;
        parentTask.EnvironmentID = environmentId;
        parentTask.ConversationDetailID = conversationDetailId;
        parentTask.Status = 'In Progress';
        parentTask.PercentComplete = 0;

        const seenTempIds = new Set<string>();
        const uniqueTasks = taskGraph.tasks.filter(task => {
            if (seenTempIds.has(task.tempId)) {
                LogError(`Duplicate tempId detected and ignored: ${task.tempId} (${task.name})`);
                return false;
            }
            seenTempIds.add(task.tempId);
            return true;
        });

        LogStatus(`Preparing parent + ${uniqueTasks.length} unique child tasks (${taskGraph.tasks.length - uniqueTasks.length} duplicates filtered)`);

        const resolvedTasks: Array<{ def: TaskDefinition; agentId: string }> = [];
        const unresolvedAgents: string[] = [];
        for (const taskDef of uniqueTasks) {
            const agent = await this.findAgentByName(taskDef.agentName);
            if (!agent) {
                // Previously this logged and skipped, so the graph executed with holes —
                // silently dropping work the caller asked for. Collect them all so the
                // error names every bad reference rather than only the first.
                unresolvedAgents.push(taskDef.agentName);
                continue;
            }
            resolvedTasks.push({ def: taskDef, agentId: agent.ID });
        }
        if (unresolvedAgents.length > 0) {
            throw new Error(
                `Cannot create task graph "${taskGraph.workflowName}": ` +
                `${unresolvedAgents.length} task(s) reference unknown agent(s): ${unresolvedAgents.join(', ')}. ` +
                `Executing a graph with unresolvable agents would silently drop those tasks.`
            );
        }

        // Reject cycles before anything is persisted. A cyclic graph deadlocks at runtime:
        // nothing ever becomes eligible, so the loop exits and the parent used to be marked
        // Complete despite no work having run.
        const cycleNodes: TaskGraphNode[] = resolvedTasks.map(rt => ({ id: rt.def.tempId, status: 'Pending' }));
        const cycleEdges: TaskGraphEdge[] = resolvedTasks.flatMap(rt =>
            (rt.def.dependsOn ?? []).map(dep => ({ taskId: rt.def.tempId, dependsOnTaskId: dep }))
        );
        const cycleCheck = DetectCycle(cycleNodes, cycleEdges);
        if (cycleCheck.hasCycle) {
            throw new Error(
                `Cannot create task graph "${taskGraph.workflowName}": dependency cycle detected ` +
                `(${cycleCheck.path.join(' -> ')}). A cyclic graph can never execute.`
            );
        }

        // Persist parent + children + dependency graph in one transaction
        const provider = (this.provider ?? Metadata.Provider) as DatabaseProviderBase;
        await provider.BeginTransaction();
        try {
            if (!await parentTask.Save()) {
                throw new Error(`Failed to create parent workflow task: ${parentTask.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            LogStatus(`Created parent workflow task: ${parentTask.Name} (${parentTask.ID})`);

            for (const { def, agentId } of resolvedTasks) {
                const task = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
                task.Name = def.name;
                task.Description = def.description;
                task.TypeID = taskTypeId;
                task.EnvironmentID = environmentId;
                task.ParentID = parentTask.ID;
                task.ConversationDetailID = conversationDetailId;
                task.AgentID = agentId;
                task.Status = 'Pending';
                task.PercentComplete = 0;

                if (def.inputPayload) {
                    const metadata = {
                        inputPayload: def.inputPayload,
                        tempId: def.tempId
                    };
                    task.Description = def.description;
                    task.InputPayload = def.inputPayload ? JSON.stringify(def.inputPayload) : null;
                }

                if (!await task.Save()) {
                    throw new Error(`Failed to create child task '${def.name}': ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
                tempIdToRealId.set(def.tempId, task.ID);
                LogStatus(`Created child task: ${task.Name} (${task.ID}) under parent ${parentTask.ID}`);
            }

            for (const { def } of resolvedTasks) {
                const taskId = tempIdToRealId.get(def.tempId);
                if (!taskId) continue;

                for (const dependsOnTempId of def.dependsOn) {
                    const dependsOnId = tempIdToRealId.get(dependsOnTempId);
                    if (!dependsOnId) {
                        LogError(`Dependency not found: ${dependsOnTempId}`);
                        continue;
                    }

                    const dependency = await md.GetEntityObject<MJTaskDependencyEntity>('MJ: Task Dependencies', this.contextUser);
                    dependency.TaskID = taskId;
                    dependency.DependsOnTaskID = dependsOnId;
                    dependency.DependencyType = 'Prerequisite';

                    if (!await dependency.Save()) {
                        throw new Error(`Failed to create task dependency (${taskId} -> ${dependsOnId}): ${dependency.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                    LogStatus(`Created dependency: Task ${taskId} depends on ${dependsOnId}`);
                }
            }

            await provider.CommitTransaction();
        } catch (txErr) {
            await provider.RollbackTransaction();
            throw txErr;
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

        LogStatus(`📡 Publishing task progress: ${taskName} - ${message} (${percentComplete}%) to session ${this.userPayload.sessionId}`);
        publishStatusUpdate(this.pubSub, {
            sessionId: this.userPayload.sessionId,
            ownerUserId: this.userPayload.userRecord.ID,
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
            })
        });

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

        LogStatus(`📡 Publishing agent progress: ${taskName} → ${agentStep} to session ${this.userPayload.sessionId}`);
        publishStatusUpdate(this.pubSub, {
            sessionId: this.userPayload.sessionId,
            ownerUserId: this.userPayload.userRecord.ID,
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
            })
        });

        LogStatus(`[Task: ${taskName}] → ${agentStep}: ${agentMessage}`);
    }

    /**
     * Find agent by name
     */
    private async findAgentByName(agentName: string): Promise<MJAIAgentEntityExtended | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJAIAgentEntityExtended>({
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

        const md = this.getMetadata();
        const parentTask = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        await parentTask.Load(parentTaskId);

        this.publishTaskProgress(parentTask.Name, 'Starting workflow execution', 0);

        // Each pass loads the whole graph once and decides from that snapshot, rather than
        // issuing a dependency query per candidate task. The decision itself is delegated to
        // the pure algorithms so the Phase 2 dispatcher reuses identical semantics.
        for (;;) {
            const graph = await this.loadGraphState(parentTaskId);

            // Settle any task whose dependencies can no longer be satisfied BEFORE picking
            // work, so a failure earlier in this pass stops its branch immediately.
            const blocked = await this.applyFailurePropagation(graph);
            if (blocked > 0) continue; // re-read; statuses changed

            const eligible = ComputeEligibleTasks(graph.nodes, graph.edges);
            if (eligible.length === 0) {
                if (IsGraphStalled(graph.nodes, graph.edges)) {
                    // Pending work with nothing runnable and nothing in flight. Previously this
                    // exited quietly and the parent was reported Complete.
                    LogError(`Task graph ${parentTaskId} is stalled: pending tasks with no satisfiable path.`);
                }
                break;
            }

            // Execute the whole wave with bounded concurrency. Sibling branches are independent
            // by construction — that is what the dependency edges encode — so running them
            // sequentially was pure latency.
            const wave = eligible
                .map(n => graph.entityById.get(n.id))
                .filter((t): t is MJTaskEntity => t != null);

            const waveResults = await this.executeWithConcurrency(wave, TASK_EXECUTION_CONCURRENCY);
            results.push(...waveResults);

            await this.updateParentTaskProgress(parentTaskId);
        }

        await this.completeParentTask(parentTaskId);

        const finalGraph = await this.loadGraphState(parentTaskId);
        const rollup = ComputeParentRollup(finalGraph.nodes);
        this.publishTaskProgress(
            parentTask.Name,
            rollup.status === 'Complete' ? 'Workflow completed' : `Workflow finished with status: ${rollup.status}`,
            rollup.percentComplete
        );

        return results;
    }

    /**
     * Runs a wave of tasks with a bounded number in flight at once.
     *
     * A rejected promise would abandon the rest of the wave, so every task is wrapped —
     * executeTask already converts failures into a result object, and this guards the
     * unexpected-throw path so one bad task cannot strand its siblings.
     */
    private async executeWithConcurrency(tasks: MJTaskEntity[], limit: number): Promise<TaskExecutionResult[]> {
        const results: TaskExecutionResult[] = new Array(tasks.length);
        let cursor = 0;

        const worker = async (): Promise<void> => {
            for (;;) {
                const index = cursor++;
                if (index >= tasks.length) return;
                const task = tasks[index];

                this.publishTaskProgress(task.Name, 'Starting task', 0);
                try {
                    const result = await this.executeTask(task);
                    results[index] = result;
                    this.publishTaskProgress(
                        task.Name,
                        result.success ? 'Task completed successfully' : `Task failed: ${result.error}`,
                        100
                    );
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    LogError(`Unexpected error executing task ${task.ID}: ${message}`);
                    results[index] = { taskId: task.ID, success: false, error: message };
                }
            }
        };

        await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
        return results;
    }

    /**
     * Marks every task whose dependencies can never be satisfied as Blocked.
     *
     * Without this a Failed dependency leaves its dependents Pending forever: they are never
     * eligible, so the graph appears to finish while work silently never ran.
     *
     * @returns how many tasks were transitioned
     */
    private async applyFailurePropagation(graph: GraphState): Promise<number> {
        const toBlock = ComputeTasksToBlock(graph.nodes, graph.edges);
        if (toBlock.length === 0) return 0;

        let blocked = 0;
        for (const taskId of toBlock) {
            const task = graph.entityById.get(taskId);
            if (!task) continue;
            task.Status = 'Blocked';
            const saved = await task.Save();
            if (saved) {
                blocked++;
                LogStatus(`Task blocked (unsatisfiable dependency): ${task.Name} (${task.ID})`);
            } else {
                LogError(`Failed to mark task ${task.ID} as Blocked: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
        return blocked;
    }

    /**
     * Loads a graph's children and dependency edges in one shot, in both the plain shape the
     * pure algorithms consume and an id->entity map for mutation.
     */
    private async loadGraphState(parentTaskId: string): Promise<GraphState> {
        const rv = new RunView();

        const childrenResult = await rv.RunView<MJTaskEntity>({
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ParentID='${parentTaskId}'`,
            ResultType: 'entity_object'
        }, this.contextUser);

        const children = (childrenResult.Success ? childrenResult.Results : []) ?? [];
        if (children.length === 0) {
            return { nodes: [], edges: [], entityById: new Map() };
        }

        // Scope dependency loading to this graph's tasks. Quoting is safe: these are UUIDs
        // that came from the database, not user input.
        const idList = children.map(c => `'${c.ID}'`).join(',');
        const depsResult = await rv.RunView<MJTaskDependencyEntity>({
            EntityName: 'MJ: Task Dependencies',
            ExtraFilter: `TaskID IN (${idList})`,
            ResultType: 'entity_object'
        }, this.contextUser);

        const deps = (depsResult.Success ? depsResult.Results : []) ?? [];

        return {
            nodes: children.map(c => ({ id: c.ID, status: c.Status as TaskGraphNodeStatus })),
            edges: deps.map(d => ({
                taskId: d.TaskID,
                dependsOnTaskId: d.DependsOnTaskID,
                dependencyType: d.DependencyType as TaskGraphEdge['dependencyType']
            })),
            entityById: new Map(children.map(c => [c.ID, c]))
        };
    }

    /**
     * Update parent task progress based on child task completion
     */
    private async updateParentTaskProgress(parentTaskId: string): Promise<void> {
        const md = this.getMetadata();
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
        const md = this.getMetadata();
        const parentTask = await md.GetEntityObject<MJTaskEntity>('MJ: Tasks', this.contextUser);
        const loaded = await parentTask.Load(parentTaskId);
        if (!loaded) return;

        // Roll the children up honestly. Previously the parent was set Complete/100%
        // unconditionally, so a graph whose children failed still reported success.
        const graph = await this.loadGraphState(parentTaskId);
        const rollup = ComputeParentRollup(graph.nodes);

        parentTask.Status = rollup.status;
        parentTask.PercentComplete = rollup.percentComplete;
        if (rollup.isTerminal) {
            parentTask.CompletedAt = new Date();
        }

        const failedChildren = graph.nodes.filter(n => n.status === 'Failed').length;
        const blockedChildren = graph.nodes.filter(n => n.status === 'Blocked').length;
        if (failedChildren > 0 || blockedChildren > 0) {
            parentTask.ErrorMessage =
                `${failedChildren} task(s) failed and ${blockedChildren} task(s) were blocked by unsatisfiable dependencies.`;
        }

        const saved = await parentTask.Save();
        if (!saved) {
            LogError(`Failed to finalize parent task ${parentTaskId}: ${parentTask.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return;
        }

        LogStatus(`Parent workflow task finalized: ${parentTask.Name} -> ${rollup.status} (${rollup.percentComplete}%)`);

        // Only notify on a genuinely successful workflow; a failed graph should not
        // announce completion.
        if (this.createNotifications && rollup.status === 'Complete') {
            await this.createTaskGraphCompletionNotification(parentTask);
        }
    }

    /**
     * Load a task by ID
     */
    private async loadTask(taskId: string): Promise<MJTaskEntity | null> {
        const md = this.getMetadata();
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
            const md = this.getMetadata();
            const agentEntity = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', this.contextUser);
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

                // Update task with success. Output rides in its own column now — it used to be
                // appended to Description behind a __TASK_OUTPUT__ marker, which leaked
                // orchestration plumbing into search results and the task detail panel.
                task.Status = 'Complete';
                task.CompletedAt = new Date();
                task.PercentComplete = 100;
                task.OutputPayload = output.content != null ? JSON.stringify(output.content) : null;
                // Link the specific run that produced this task, so the Gantt stops mapping
                // every sibling to the same conversation-level run.
                task.AgentRunID = agentResult.agentRun?.ID ?? null;
                const taskSaved = await task.Save();
                if (!taskSaved) {
                    LogError(`Failed to save completed task ${task.ID}: ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }

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
                // Update task with failure. ErrorMessage is a column now, so the reason a task
                // failed survives on the row for the UI and for the dispatcher's forensics.
                const errorMsg = agentResult.agentRun?.ErrorMessage || 'Agent execution failed';
                task.Status = 'Failed';
                task.CompletedAt = new Date();
                task.ErrorMessage = errorMsg;
                task.AgentRunID = agentResult.agentRun?.ID ?? null;
                await task.Save();

                LogError(`Task failed: ${task.Name} - ${errorMsg}`);

                return {
                    taskId: task.ID,
                    success: false,
                    error: errorMsg
                };
            }
        } catch (error) {
            LogError(error);

            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            task.Status = 'Failed';
            task.CompletedAt = new Date();
            task.ErrorMessage = errorMsg;
            await task.Save();

            return {
                taskId: task.ID,
                success: false,
                error: errorMsg
            };
        }
    }

    /**
     * Extract input payload from task metadata
     */
    private extractInputPayload(task: MJTaskEntity): any | null {
        // Reads the column directly. The legacy __TASK_METADATA__ marker was converted by the
        // Phase 1 migration's one-time backfill, so there is deliberately no fallback parse —
        // a fallback with no backfill never dies.
        if (!task.InputPayload) return null;
        try {
            return JSON.parse(task.InputPayload);
        } catch (e) {
            LogError(`Task ${task.ID} has malformed InputPayload JSON: ${e}`);
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
            if (!dependsOnTask?.OutputPayload) continue;

            try {
                outputs.set(dep.DependsOnTaskID, JSON.parse(dependsOnTask.OutputPayload));
            } catch (e) {
                LogError(`Task ${dep.DependsOnTaskID} has malformed OutputPayload JSON: ${e}`);
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
        agent: MJAIAgentEntityExtended,
        taskName: string
    ): Promise<void> {
        const md = this.getMetadata();
        const provider = (this.provider ?? Metadata.Provider) as DatabaseProviderBase;

        await provider.BeginTransaction();
        try {
            // Create Artifact header
            const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', this.contextUser);
            artifact.Name = `${agent.Name} - ${taskName} - ${new Date().toLocaleString()}`;
            artifact.Description = `Artifact generated by ${agent.Name} for task: ${taskName} (${output.type})`;

            const defaultArtifactTypeId = (agent as any).DefaultArtifactTypeID;
            artifact.TypeID = defaultArtifactTypeId || this.JSON_ARTIFACT_TYPE_ID;

            artifact.UserID = this.contextUser.ID;
            artifact.EnvironmentID = (this.contextUser as any).EnvironmentID || 'F51358F3-9447-4176-B313-BF8025FD8D09';

            const creationMode = agent.ArtifactCreationMode;
            if (creationMode === 'System Only') {
                artifact.Visibility = 'System Only';
                LogStatus(`Task artifact marked as "System Only" per agent configuration`);
            } else {
                artifact.Visibility = 'Always';
            }

            if (!await artifact.Save()) {
                throw new Error(`Failed to save artifact: ${artifact.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            LogStatus(`Created artifact: ${artifact.Name} (${artifact.ID})`);

            // Create Artifact Version with content
            const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', this.contextUser);
            version.ArtifactID = artifact.ID;
            version.VersionNumber = 1;
            version.Content = output.type === 'message' ? output.content : JSON.stringify(output.content, null, 2);
            version.UserID = this.contextUser.ID;

            if (!await version.Save()) {
                throw new Error(`Failed to save artifact version: ${version.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            LogStatus(`Created artifact version: ${version.ID}`);

            // If extraction produced a better name, update the artifact in the same transaction
            const nameAttr = (version as any).Attributes?.find((attr: any) =>
                attr.StandardProperty === 'name' || attr.Name?.toLowerCase() === 'name'
            );

            let extractedName = nameAttr?.Value?.trim();
            if (extractedName && extractedName.toLowerCase() !== 'null') {
                extractedName = extractedName.replace(/^["']|["']$/g, '');
                artifact.Name = extractedName;
                if (!await artifact.Save()) {
                    throw new Error(`Failed to update artifact name: ${artifact.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
                LogStatus(`✨ Updated artifact name to: ${artifact.Name}`);
            }

            // Create M2M relationship linking artifact to conversation detail
            const junction = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
                'MJ: Conversation Detail Artifacts',
                this.contextUser
            );
            junction.ConversationDetailID = conversationDetailId;
            junction.ArtifactVersionID = version.ID;
            junction.Direction = 'Output';

            if (!await junction.Save()) {
                throw new Error(`Failed to create artifact-conversation association: ${junction.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            LogStatus(`Linked artifact ${artifact.ID} to conversation detail ${conversationDetailId}`);

            await provider.CommitTransaction();
        } catch (error) {
            await provider.RollbackTransaction();
            LogError(`Error creating artifact from output — all changes rolled back: ${error}`);
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

            const md = this.getMetadata();

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
                // NOTE (B49): normalized from a malformed no-sessionId payload
                publishStatusUpdate(this.pubSub, {
                    sessionId: this.userPayload.sessionId,
                    ownerUserId: this.userPayload.userRecord.ID,
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
