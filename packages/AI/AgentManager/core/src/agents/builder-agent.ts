import { BaseAgent } from '@memberjunction/ai-agents';
import { ExecuteAgentParams, AgentConfiguration, BaseAgentNextStep, AgentSpec, SubAgentSpec } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { AIAgentRunStepEntityExtended } from '@memberjunction/core-entities';
import { AgentSpecSync } from '../agent-spec-sync';

/**
 * Structure for tracking Builder agent execution details
 */
interface BuilderExecutionLog {
    // Primary outcome
    createdAgentId: string;
    agentName: string;
    agentType: 'Loop' | 'Flow';

    // Detailed creation breakdown
    entities: {
        agents: Array<{
            id: string;
            name: string;
            type: 'parent' | 'subagent';
            level: number;
        }>;
        prompts: Array<{
            id: string;              // PromptID (populated by AgentSpecSync)
            name: string;            // Prompt name
            associatedWith: string;  // AgentID
        }>;
        actions: Array<{
            id: string;              // AgentActionID (junction record ID)
            actionId: string;        // ActionID (reference to actual action)
        }>;
        steps: Array<{
            id: string;
            name: string;
            agentId: string;
            stepType: string;
        }>;
        paths: Array<{
            id: string;
            sourceStepId: string;
            destStepId: string;
            agentId: string;
        }>;
    };

    // Summary statistics
    summary: {
        totalAgents: number;
        totalSubAgents: number;
        totalPrompts: number;
        totalActions: number;
        totalSteps: number;
        totalPaths: number;
    };

    // Errors and warnings
    errors: Array<{
        phase: 'agent' | 'subagent' | 'prompt' | 'action' | 'step' | 'path' | 'metadata-refresh';
        entity: string;
        message: string;
    }>;

    warnings: Array<{
        type: string;
        message: string;
    }>;

    // Timing breakdown
    timing: {
        agentSaveMs: number;
        metadataRefreshMs: number;
        totalMs: number;
    };

    // Metadata
    timestamp: string;
    success: boolean;
}

/**
 * Builder Agent - Persists validated AgentSpec to database via AgentSpecSync
 *
 * This is a code-based agent that overrides executeAgentInternal to bypass
 * the normal chat loop and directly execute persistence logic. It receives
 * a validated AgentSpec from the Architect Agent and saves it to the database
 * using AgentSpecSync.
 *
 * Key responsibilities:
 * - Receive validated AgentSpec from payload
 * - Create AgentSpecSync instance
 * - Persist to database
 * - Return success with created agent ID, or failure with error details
 *
 * This agent does NOT iterate - it runs once and returns Success or Failed.
 */
@RegisterClass(BaseAgent, 'AgentBuilderAgent')
export class AgentBuilderAgent extends BaseAgent {

    /**
     * Override executeAgentInternal to run code instead of chat loop
     * This follows the Skip Code Generator pattern
     */
    protected override async executeAgentInternal<P = any>(
        params: ExecuteAgentParams<P>,
        _config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {

        console.log('🔨 Builder Agent: Starting agent persistence...');

        // Initialize execution log
        const executionLog: BuilderExecutionLog = {
            createdAgentId: '',
            agentName: '',
            agentType: 'Loop',
            entities: {
                agents: [],
                prompts: [],
                actions: [],
                steps: [],
                paths: []
            },
            summary: {
                totalAgents: 0,
                totalSubAgents: 0,
                totalPrompts: 0,
                totalActions: 0,
                totalSteps: 0,
                totalPaths: 0
            },
            errors: [],
            warnings: [],
            timing: {
                agentSaveMs: 0,
                metadataRefreshMs: 0,
                totalMs: 0
            },
            timestamp: new Date().toISOString(),
            success: false
        };

        const startTime = performance.now();

        // Create step entity for tracking (requires agentRunId from parent)
        const agentRunId = params.parentRun?.ID || 'unknown';
        const trackingStep = await this.createDecisionStep(params, agentRunId);

        try {
            // The payload IS the AgentSpec
            const agentSpec = params.payload as AgentSpec;

            if (!agentSpec) {
                throw new Error('No AgentSpec found in payload - ensure Architect Agent provided valid AgentSpec');
            }

            if (!agentSpec.Name) {
                throw new Error('AgentSpec is missing required Name field');
            }

            console.log(`🔨 Builder Agent: Creating agent "${agentSpec.Name}"...`);

            // Populate log with input details
            executionLog.agentName = agentSpec.Name;
            // AgentSpec has TypeID, not Type string - default to Loop for now
            executionLog.agentType = 'Loop';

            // Create AgentSpecSync instance
            const specSync = new AgentSpecSync(agentSpec, params.contextUser);

            // Mark as dirty to ensure it saves
            specSync.markDirty();

            // Save to database with timing
            const saveStartTime = performance.now();
            const agentId = await specSync.SaveToDatabase();
            executionLog.timing.agentSaveMs = performance.now() - saveStartTime;

            executionLog.createdAgentId = agentId;

            // Extract created entity details from AgentSpecSync
            await this.extractCreatedEntities(specSync, executionLog);

            // Refresh metadata cache with timing
            console.log('🔄 Builder Agent: Refreshing metadata cache...');
            const refreshStartTime = performance.now();
            const md = new Metadata();
            await md.Refresh();
            executionLog.timing.metadataRefreshMs = performance.now() - refreshStartTime;
            console.log('✅ Builder Agent: Metadata cache refreshed');

            console.log(`✅ Builder Agent: Successfully created agent with ID: ${agentId}`);

            // Mark success
            executionLog.success = true;
            executionLog.timing.totalMs = performance.now() - startTime;

            // Calculate summary statistics
            this.calculateSummary(executionLog);

            // Finalize tracking step with success
            await this.finalizeDecisionStep(trackingStep, true, executionLog);

            // Return success with the created agent ID
            const updatedSpec = { ...agentSpec, ID: agentId };

            return {
                finalStep: {
                    terminate: true,
                    step: 'Success',
                    reasoning: `Successfully created agent "${agentSpec.Name}" with ID: ${agentId}`,
                    newPayload: updatedSpec as P
                },
                stepCount: 2  // Validation step + Decision step
            };

        } catch (error: any) {
            console.error('❌ Builder Agent: Failed to create agent:', error);

            // Record error
            executionLog.errors.push({
                phase: 'agent',
                entity: executionLog.agentName || 'unknown',
                message: error?.message || String(error)
            });
            executionLog.success = false;
            executionLog.timing.totalMs = performance.now() - startTime;

            // Finalize tracking step with failure
            await this.finalizeDecisionStep(trackingStep, false, executionLog, error?.message);

            // Return failure with error details
            return {
                finalStep: {
                    terminate: true,
                    step: 'Failed',
                    reasoning: `Failed to create agent: ${error?.message || String(error)}`
                },
                stepCount: 2  // Validation step + Decision step
            };
        }
    }

    /**
     * Creates a Decision-type step for tracking Builder execution
     */
    private async createDecisionStep(
        params: ExecuteAgentParams,
        agentRunId: string
    ): Promise<AIAgentRunStepEntityExtended> {
        const md = new Metadata();
        const stepEntity = await md.GetEntityObject<AIAgentRunStepEntityExtended>(
            'MJ: AI Agent Run Steps',
            params.contextUser
        );

        stepEntity.AgentRunID = agentRunId;
        stepEntity.StepNumber = 2; // First step is Validation, this is second
        stepEntity.StepType = 'Decision';
        stepEntity.StepName = 'Builder Agent: Persist Agent to Database';
        stepEntity.Status = 'Running';
        stepEntity.StartedAt = new Date();

        // Set InputData to entire payload
        stepEntity.InputData = JSON.stringify({
            agentSpec: params.payload,
            timestamp: new Date().toISOString()
        });

        // Set PayloadAtStart
        stepEntity.PayloadAtStart = JSON.stringify(params.payload);

        await stepEntity.Save();

        return stepEntity;
    }

    /**
     * Finalizes the Decision step with execution results
     */
    private async finalizeDecisionStep(
        stepEntity: AIAgentRunStepEntityExtended,
        success: boolean,
        executionLog: BuilderExecutionLog,
        errorMessage?: string
    ): Promise<void> {
        stepEntity.Status = success ? 'Completed' : 'Failed';
        stepEntity.CompletedAt = new Date();
        stepEntity.Success = success;
        stepEntity.ErrorMessage = errorMessage || null;

        // Set OutputData to structured execution log
        stepEntity.OutputData = JSON.stringify(executionLog, null, 2);

        // Set PayloadAtEnd (same as start for Builder since it doesn't modify payload)
        stepEntity.PayloadAtEnd = stepEntity.PayloadAtStart;

        await stepEntity.Save();
    }

    /**
     * Extracts details of created entities from AgentSpecSync
     */
    private async extractCreatedEntities(
        specSync: AgentSpecSync,
        log: BuilderExecutionLog
    ): Promise<void> {
        const spec = specSync.toJSON();

        // Track main agent
        log.entities.agents.push({
            id: spec.ID,
            name: spec.Name,
            type: 'parent',
            level: 0
        });

        // Track prompts - PromptID is populated by AgentSpecSync after save
        if (spec.Prompts && spec.Prompts.length > 0) {
            for (const prompt of spec.Prompts) {
                log.entities.prompts.push({
                    id: (prompt as any).PromptID || 'unknown',
                    name: prompt.PromptName || `Prompt for ${spec.Name}`,
                    associatedWith: spec.ID
                });
            }
        }

        // Track actions - AgentActionID is populated by AgentSpecSync after save
        if (spec.Actions && spec.Actions.length > 0) {
            for (const action of spec.Actions) {
                log.entities.actions.push({
                    id: action.AgentActionID || 'unknown',
                    actionId: action.ActionID
                });
            }
        }

        // Track steps (for Flow agents)
        if (spec.Steps && spec.Steps.length > 0) {
            for (const step of spec.Steps) {
                log.entities.steps.push({
                    id: step.ID || 'unknown',
                    name: step.Name,
                    agentId: spec.ID,
                    stepType: step.StepType
                });
            }
        }

        // Track paths (for Flow agents)
        if (spec.Paths && spec.Paths.length > 0) {
            for (const path of spec.Paths) {
                log.entities.paths.push({
                    id: path.ID || 'unknown',
                    sourceStepId: path.OriginStepID,
                    destStepId: path.DestinationStepID,
                    agentId: spec.ID
                });
            }
        }

        // Track sub-agents recursively
        if (spec.SubAgents && spec.SubAgents.length > 0) {
            for (const subAgentSpec of spec.SubAgents) {
                this.extractSubAgentEntities(subAgentSpec, log, 1);
            }
        }
    }

    /**
     * Recursively extracts sub-agent details
     * SubAgentSpec wraps an AgentSpec, so we need to extract from the .SubAgent property
     */
    private extractSubAgentEntities(
        subAgentSpec: SubAgentSpec,
        log: BuilderExecutionLog,
        level: number
    ): void {
        // SubAgentSpec contains the actual AgentSpec in the SubAgent property
        const agent = subAgentSpec.SubAgent;

        // Track sub-agent
        log.entities.agents.push({
            id: agent.ID,
            name: agent.Name,
            type: 'subagent',
            level
        });

        // Track sub-agent prompts - PromptID is populated by AgentSpecSync
        if (agent.Prompts && agent.Prompts.length > 0) {
            for (const prompt of agent.Prompts) {
                log.entities.prompts.push({
                    id: (prompt as any).PromptID || 'unknown',
                    name: prompt.PromptName || `Prompt for ${agent.Name}`,
                    associatedWith: agent.ID
                });
            }
        }

        // Track sub-agent actions - AgentActionID is populated by AgentSpecSync
        if (agent.Actions && agent.Actions.length > 0) {
            for (const action of agent.Actions) {
                log.entities.actions.push({
                    id: action.AgentActionID || 'unknown',
                    actionId: action.ActionID
                });
            }
        }

        // Recursively track nested sub-agents
        if (agent.SubAgents && agent.SubAgents.length > 0) {
            for (const nested of agent.SubAgents) {
                this.extractSubAgentEntities(nested, log, level + 1);
            }
        }
    }

    /**
     * Calculates summary statistics
     */
    private calculateSummary(log: BuilderExecutionLog): void {
        log.summary.totalAgents = log.entities.agents.filter(a => a.type === 'parent').length;
        log.summary.totalSubAgents = log.entities.agents.filter(a => a.type === 'subagent').length;
        log.summary.totalPrompts = log.entities.prompts.length;
        log.summary.totalActions = log.entities.actions.length;
        log.summary.totalSteps = log.entities.steps.length;
        log.summary.totalPaths = log.entities.paths.length;
    }
}
