/**
 * @fileoverview BaseAgentInit - Layer 2 of the BaseAgent modular inheritance hierarchy.
 * Handles agent type, engines, and starting payload initialization, data preloading,
 * input validation, and storage configuration.
 * 
 * @module @memberjunction/ai-agents
 */

import {
    MJAIAgentTypeEntity,
    MJAIAgentNoteEntity,
    MJAIAgentExampleEntity,
    FileStorageEngineBase
} from '@memberjunction/core-entities';
import {
    MJAIAgentRunEntityExtended,
    MJAIAgentEntityExtended,
    ExecuteAgentParams,
    AgentConfiguration,
    ExecuteAgentResult
} from '@memberjunction/ai-core-plus';
import { UserInfo, Metadata, LogStatus, LogStatusEx, LogError, LogErrorEx, IsVerboseLoggingEnabled, IMetadataProvider } from '@memberjunction/core';
import { BaseAgentType } from '../agent-types/base-agent-type';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { AgentDataPreloader } from '../AgentDataPreloader';
import { JSONValidator, UUIDsEqual } from '@memberjunction/global';
import { BaseAgentState } from './baseAgentState';

/**
 * BaseAgentInit extends BaseAgentState to provide initialization and validation routines
 * executed at the beginning of an agent run.
 */
export class BaseAgentInit extends BaseAgentState {
    /**
     * Engine-default wall-clock timeout applied to any agent run whose
     * `ExecuteAgentParams.maxExecutionTimeMs` is not set. Sub-classes can
     * override to globally change the default. Intentionally generous
     * (2 hours) — tighten per-run for interactive scenarios.
     */
    protected get DefaultAgentTimeoutMS(): number {
        return 2 * 60 * 60 * 1000;
    }

    /**
     * Initializes the specific agent type strategy instance.
     * @param params Agent execution parameters
     * @param config The agent configuration
     */
    protected async initializeAgentType(params: ExecuteAgentParams, config: AgentConfiguration): Promise<void> {
        this._agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
        this._agentTypeState = await this._agentTypeInstance.InitializeAgentTypeState(params);
    }

    /**
     * Sub-classes can override this method to perform any specialized initialization
     * of the starting payload.
     * @param params Agent execution parameters
     */
    protected async initializeStartingPayload<P = any>(params: ExecuteAgentParams<any, P>): Promise<void> {
        // Base class does nothing; intended for subclass overrides.
    }

    /**
     * Initializes the AI and Action engines. Subclasses can override this to add any
     * additional engine/metadata loading initialization.
     * 
     * @param contextUser Optional user context
     */
    protected async initializeEngines(contextUser?: UserInfo): Promise<void> {
        await AIEngine.Instance.Config(false, contextUser);
        await ActionEngineServer.Instance.Config(false, contextUser);
    }

    /**
     * Preloads data sources configured for the agent (views, queries).
     * Loads configured data sources and merges them into data, context, and payload.
     * @param params Agent execution parameters
     */
    protected async preloadAgentData(params: ExecuteAgentParams): Promise<void> {
        if (params.disableDataPreloading === true) {
            this.logStatus(`⏭️  Data preloading disabled for agent '${params.agent.Name}'`, true, params);
            return;
        }

        try {
            const preloadedResult = await AgentDataPreloader.Instance.PreloadAgentData(
                params.agent.ID,
                params.contextUser,
                this._agentRun?.ID
            );

            const totalSources =
                Object.keys(preloadedResult.data).length +
                Object.keys(preloadedResult.context).length +
                Object.keys(preloadedResult.payload).length;

            const hadActivity = totalSources > 0 || preloadedResult.failedSources.length > 0;

            if (totalSources > 0) {
                const destinations: string[] = [];
                if (Object.keys(preloadedResult.data).length > 0) {
                    destinations.push(`data(${Object.keys(preloadedResult.data).length})`);
                }
                if (Object.keys(preloadedResult.context).length > 0) {
                    destinations.push(`context(${Object.keys(preloadedResult.context).length})`);
                }
                if (Object.keys(preloadedResult.payload).length > 0) {
                    destinations.push(`payload(${Object.keys(preloadedResult.payload).length})`);
                }

                this.logStatus(
                    `📊 Preloaded ${totalSources} data source(s) for agent '${params.agent.Name}': ${destinations.join(', ')}`,
                    true,
                    params
                );

                params.data = {
                    ...preloadedResult.data,
                    ...params.data
                };

                if (preloadedResult.context && typeof preloadedResult.context === 'object') {
                    if (!params.context || typeof params.context !== 'object') {
                        params.context = preloadedResult.context;
                    } else {
                        for (const key of Object.keys(preloadedResult.context)) {
                            if (!(key in params.context)) {
                                (params.context as Record<string, unknown>)[key] = (preloadedResult.context as Record<string, unknown>)[key];
                            }
                        }
                    }
                }

                params.payload = {
                    ...preloadedResult.payload,
                    ...params.payload
                };
            } else if (!hadActivity) {
                this.logStatus(`📭 No data sources configured for agent '${params.agent.Name}'`, true, params);
                return;
            }

            const stepEntity = await this.createStepEntity({
                stepType: 'Validation',
                stepName: 'Data Source Preloading',
                contextUser: params.contextUser
            });

            if (preloadedResult.failedSources.length > 0) {
                const failureDetails = preloadedResult.failedSources
                    .map(f => `${f.name}${f.entityName ? ` (Entity: ${f.entityName})` : ''}: ${f.errorMessage}`)
                    .join('; ');

                const warningMessage = `${preloadedResult.failedSources.length} data source(s) failed to load: ${failureDetails}`;

                await this.finalizeStepEntity(stepEntity, true, warningMessage, {
                    loadedSources: preloadedResult.loadedSources,
                    failedSources: preloadedResult.failedSources
                });

                if (this._agentRun) {
                    const existing = this._agentRun.ErrorMessage || '';
                    this._agentRun.ErrorMessage = existing
                        ? `${existing}\n\n[Data Preloading Warning] ${warningMessage}`
                        : `[Data Preloading Warning] ${warningMessage}`;
                    await this._agentRun.Save();
                }
            } else {
                await this.finalizeStepEntity(stepEntity, true, undefined, {
                    loadedSources: preloadedResult.loadedSources
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logError(`Failed to preload data for agent '${params.agent.Name}': ${errorMessage}`, {
                agent: params.agent,
                category: 'DataPreloading',
                severity: 'warning'
            });
        }
    }

    /**
     * Validates that the agent entity status is active.
     * @param agent The agent entity to validate
     * @returns Error result if validation fails, null if valid
     */
    protected async validateAgent(agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
        if (agent.Status !== 'Active') {
            if (this._agentRun) {
                this._agentRun.ErrorMessage = `Agent '${agent.Name}' is not active. Current status: ${agent.Status}`;
                this._agentRun.Status = 'Failed';
                this._agentRun.Success = false;
                this._agentRun.FinalStep = 'Failed';
            }
            return {
                success: false,
                agentRun: this._agentRun!
            };
        }
        return null;
    }

    /**
     * Handles validation of the starting payload if configured.
     * @param params The execution parameters
     * @returns Error result if validation fails and mode is 'Fail', null otherwise
     */
    protected async handleStartingPayloadValidation<P = any>(params: ExecuteAgentParams<any, P>): Promise<ExecuteAgentResult | null> {
        const agent = params.agent;
        
        if (!agent.StartingPayloadValidation || params.payload === undefined) {
            return null;
        }

        try {
            let validationSchema: any;
            try {
                validationSchema = JSON.parse(agent.StartingPayloadValidation);
            } catch (parseError) {
                this.logError(`Invalid StartingPayloadValidation JSON for agent ${agent.Name}: ${parseError.message}`, {
                    category: 'StartingPayloadValidation',
                    metadata: {
                        agentName: agent.Name,
                        agentId: agent.ID,
                        validationSchema: agent.StartingPayloadValidation
                    }
                });
                return null;
            }

            let payloadToValidate = params.payload;
            const jsonValidator = new JSONValidator();
            const validationResult = jsonValidator.validate(payloadToValidate, validationSchema);

            if (!validationResult.Success) {
                const errorMessages = validationResult.Errors.map(e => e.Message);
                return this.handleStartingValidationFailure(params, errorMessages);
            }

            this.logStatus(`✅ Starting payload validation passed for agent ${agent.Name}`, true, params);
            return null;

        } catch (error) {
            this.logError(`Unexpected error during starting payload validation: ${error instanceof Error ? error.message : String(error)}`, {
                category: 'StartingPayloadValidation',
                metadata: {
                    agentName: agent.Name,
                    agentId: agent.ID,
                    error: error instanceof Error ? error.message : String(error)
                }
            });
            return null;
        }
    }

    /**
     * Helper method to handle validation failures and fail or warn depending on the mode.
     * @param params Execution parameters
     * @param errorMessages Array of validation error messages
     */
    private handleStartingValidationFailure(
        params: ExecuteAgentParams,
        errorMessages: string[]
    ): ExecuteAgentResult | null {
        const mode = params.agent.StartingPayloadValidationMode || 'Fail';
        const validationFeedback = `Starting payload validation failed:\n${errorMessages.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

        if (mode === 'Fail') {
            this.logError(`Starting payload validation failed for agent ${params.agent.Name}`, {
                agent: params.agent,
                category: 'StartingPayloadValidation',
                metadata: { errors: errorMessages }
            });

            if (this._agentRun) {
                this._agentRun.ErrorMessage = validationFeedback;
                this._agentRun.Status = 'Failed';
                this._agentRun.Success = false;
                this._agentRun.FinalStep = 'Failed';
            }

            return {
                success: false,
                agentRun: this._agentRun!,
                payload: params.payload
            };
        } else {
            this.logStatus(
                `⚠️ WARNING: ${validationFeedback}`,
                false,
                params
            );
            return null;
        }
    }

    /**
     * Loads all required configuration for agent execution.
     * 
     * @param agent The agent to load configuration for
     * @returns Configuration object with loaded entities
     */
    protected async loadAgentConfiguration(agent: MJAIAgentEntityExtended): Promise<AgentConfiguration> {
        const engine = AIEngine.Instance;

        let metadataOptional: boolean = false;
        if (agent.DriverClass) {
            this.logStatus(`🔧 Using custom driver class '${agent.DriverClass}' for agent '${agent.Name}'`, true);   
            metadataOptional = true;
        }

        const agentType = engine.AgentTypes.find(at => UUIDsEqual(at.ID, agent.TypeID));
        if (!agentType && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type not found for ID: ${agent.TypeID}`
            };
        }

        const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(agentType);
        const requiresAgentLevelPrompts = agentTypeInstance.RequiresAgentLevelPrompts;

        const systemPrompt = engine.Prompts.find(p => UUIDsEqual(p.ID, agentType!.SystemPromptID));

        if (!systemPrompt) {
            metadataOptional = true;
        }

        const agentPrompt = engine.AgentPrompts
            .filter(ap => UUIDsEqual(ap.AgentID, agent.ID) && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];

        if (!agentPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `No prompts configured for agent: ${agent.Name}`
            };
        }

        const childPrompt = agentPrompt ? engine.Prompts.find(p => UUIDsEqual(p.ID, agentPrompt.PromptID)) : undefined;

        if (!childPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `Child prompt not found for ID: ${agentPrompt?.PromptID}`
            };
        }

        if (!agentType!.AgentPromptPlaceholder && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type '${agentType!.Name}' does not have AgentPromptPlaceholder configured.`
            };
        }

        return {
            success: true,
            agentType: agentType!,
            systemPrompt,
            childPrompt
        };
    }

    /**
     * Checks if all minimum execution requirements are met for actions and sub-agents.
     * @param agent The agent to check
     * @param agentRun The current agent run
     * @returns Array of violation messages (empty if all requirements are met)
     */
    protected async checkMinimumExecutionRequirements(agent: MJAIAgentEntityExtended, agentRun: MJAIAgentRunEntityExtended): Promise<string[]> {
        const violations: string[] = [];

        const agentActions = AIEngine.Instance.AgentActions.filter(aa =>
            UUIDsEqual(aa.AgentID, agent.ID) &&
            aa.Status === 'Active' &&
            aa.MinExecutionsPerRun != null &&
            aa.MinExecutionsPerRun > 0
        );
        
        for (const agentAction of agentActions) {
            const executionCount = await this.getActionExecutionCount(agentRun.ID, agentAction.ActionID);
            if (executionCount < agentAction.MinExecutionsPerRun) {
                violations.push(`Action '${agentAction.Action}' requires ${agentAction.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`);
            }
        }
        
        const subAgents = AIEngine.Instance.GetSubAgents(agent.ID, "Active").filter(a => 
            a.MinExecutionsPerRun != null && 
            a.MinExecutionsPerRun > 0
        );

        for (const subAgent of subAgents) {
            const executionCount = await this.getSubAgentExecutionCount(agentRun.ID, subAgent.ID);
            if (executionCount < subAgent.MinExecutionsPerRun) {
                violations.push(`Sub-agent '${subAgent.Name}' requires ${subAgent.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`);
            }
        }
        
        return violations;
    }

    /**
     * Gets the count of how many times a specific action has been executed in this agent run.
     * @param agentRunId The agent run ID (not used anymore, kept for signature compatibility)
     * @param actionId The action ID to count
     */
    protected async getActionExecutionCount(agentRunId: string, actionId: string): Promise<number> {
        return this.getExecutionCount(actionId);
    }

    /**
     * Gets the count of how many times a specific sub-agent has been executed in this agent run.
     * @param agentRunId The agent run ID (not used anymore, kept for signature compatibility)
     * @param subAgentId The sub-agent ID to count
     */
    protected async getSubAgentExecutionCount(agentRunId: string, subAgentId: string): Promise<number> {
        return this.getExecutionCount(subAgentId);
    }

    /**
     * Resolves the FileStorageAccount ID for this agent run.
     * Resolves hierarchy: Runtime -> Agent -> Category -> Type -> fallback.
     * @param params Execution parameters
     */
    protected async getStorageAccountID(params: ExecuteAgentParams): Promise<string | null> {
        // 1. Runtime override — highest priority
        if (params.override?.storageAccountId) {
            return params.override.storageAccountId;
        }

        // 2. Agent-level override
        if (params.agent.DefaultStorageAccountID) {
            return params.agent.DefaultStorageAccountID;
        }

        // 3. Category tree walk
        const categoryId = params.agent.CategoryID;
        if (categoryId) {
            try {
                const categories = AIEngine.Instance.AgentCategories;

                let currentId: string | null = categoryId;
                const visited = new Set<string>();
                while (currentId && !visited.has(currentId)) {
                    visited.add(currentId);
                    const cat = categories.find(c => UUIDsEqual(c.ID, currentId));
                    if (!cat) break;
                    if (cat.DefaultStorageAccountID) return cat.DefaultStorageAccountID;
                    currentId = cat.ParentID;
                }
            } catch (error) {
                LogError(`Error resolving category storage account: ${(error as Error).message}`);
            }
        }

        // 4. Agent Type-level default
        const agentTypeId = params.agent.TypeID;
        if (agentTypeId) {
            const agentType = AIEngine.Instance.AgentTypes.find(
                at => UUIDsEqual(at.ID, agentTypeId)
            );
            if (agentType?.DefaultStorageAccountID) {
                return agentType.DefaultStorageAccountID;
            }
        }

        // 5. System fallback — use cached metadata (already loaded during engine Config)
        const activeAccounts = FileStorageEngineBase.Instance.AccountsWithProviders
            .filter(a => a.provider.IsActive);

        if (activeAccounts.length === 0) {
            // No storage configured — return null, inline base64 fallback handles it downstream
            return null;
        }

        if (activeAccounts.length === 1) {
            return activeAccounts[0].account.ID;
        }

        // 2+ active accounts but nothing configured at any level
        const agentName = params.agent.Name || params.agent.ID;
        const typeName = params.agent.TypeID
            ? AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, params.agent.TypeID))?.Name || params.agent.TypeID
            : 'unknown';
        const categoryName = params.agent.CategoryID
            ? AIEngine.Instance.AgentCategories.find(c => UUIDsEqual(c.ID, params.agent.CategoryID))?.Name || params.agent.CategoryID
            : 'none';
        const accountNames = activeAccounts.map(a => `'${a.account.Name}' (${a.provider.Name})`).join(', ');

        throw new Error(
            `Multiple active file storage accounts detected (${accountNames}) but no DefaultStorageAccountID is configured ` +
            `for agent '${agentName}', category '${categoryName}', or agent type '${typeName}'.\n` +
            `To fix: Set DefaultStorageAccountID on one of the following (in order of priority):\n` +
            `  1. Agent '${agentName}' — for this specific agent\n` +
            `  2. Agent Category '${categoryName}' — for all agents in this category\n` +
            `  3. Agent Type '${typeName}' — for all agents of this type`
        );
    }
}
