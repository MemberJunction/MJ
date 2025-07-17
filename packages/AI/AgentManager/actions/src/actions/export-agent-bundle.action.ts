import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { AIAgentEntity, AIAgentPromptEntity, AIPromptEntity, AIPromptEntityExtended, ActionEntity, AIAgentActionEntity } from "@memberjunction/core-entities";

/**
 * Exports an AI agent with all its configurations, sub-agents, prompts, and actions as a metadata bundle.
 * This allows for backing up, sharing, or migrating agent configurations between systems.
 * Restricted to Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Export Agent Bundle',
 *   Params: [
 *     { Name: 'AgentID', Value: '12345678-1234-1234-1234-123456789012' },
 *     { Name: 'IncludeSubAgents', Value: 'true' },
 *     { Name: 'IncludePrompts', Value: 'true' },
 *     { Name: 'IncludeActions', Value: 'true' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Export Agent Bundle")
export class ExportAgentBundleAction extends BaseAgentManagementAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // 1. Validate permissions
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) {
                return permissionError;
            }

            // 2. Extract and validate parameters
            const agentIdResult = this.getStringParam(params, 'AgentID');
            if (agentIdResult.error) {
                return agentIdResult.error;
            }

            const includeSubAgentsResult = this.getStringParam(params, 'IncludeSubAgents', false);
            const includeSubAgents = includeSubAgentsResult.value?.toLowerCase() === 'true';

            const includePromptsResult = this.getStringParam(params, 'IncludePrompts', false);
            const includePrompts = includePromptsResult.value?.toLowerCase() === 'true';

            const includeActionsResult = this.getStringParam(params, 'IncludeActions', false);
            const includeActions = includeActionsResult.value?.toLowerCase() === 'true';

            // 3. Load the main agent
            const agentResult = await this.loadAgent(agentIdResult.value!, params.ContextUser);
            if (agentResult.error) {
                return agentResult.error;
            }

            const agent = agentResult.agent!;

            // 4. Build the export bundle
            const bundle = await this.buildAgentBundle(
                agent,
                includeSubAgents,
                includePrompts,
                includeActions,
                params.ContextUser
            );

            // 5. Add bundle as output parameter
            params.Params.push({
                Name: 'Bundle',
                Value: bundle,
                Type: 'Output'
            });

            // 6. Return success result
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Agent bundle for '${agent.Name}' exported successfully`,
                Params: params.Params
            };

        } catch (e) {
            return this.handleError(e, 'export agent bundle');
        }
    }

    /**
     * Builds the complete agent bundle with all requested components
     */
    private async buildAgentBundle(
        agent: AIAgentEntity,
        includeSubAgents: boolean,
        includePrompts: boolean,
        includeActions: boolean,
        contextUser: any
    ): Promise<any> {
        const bundle: any = {
            exportedAt: new Date().toISOString(),
            version: '1.0',
            agent: this.serializeAgent(agent),
            subAgents: [],
            prompts: [],
            actions: []
        };

        // Collect all agent data in parallel for better performance
        const promises: Promise<any>[] = [];

        if (includeSubAgents) {
            promises.push(this.collectSubAgents(agent.ID, contextUser));
        }

        if (includePrompts) {
            promises.push(this.collectAgentPrompts(agent.ID, contextUser));
        }

        if (includeActions) {
            promises.push(this.collectAgentActions(agent.ID, contextUser));
        }

        const results = await Promise.all(promises);

        // Assign results based on what was requested
        let resultIndex = 0;
        if (includeSubAgents) {
            bundle.subAgents = results[resultIndex++];
        }
        if (includePrompts) {
            bundle.prompts = results[resultIndex++];
        }
        if (includeActions) {
            bundle.actions = results[resultIndex++];
        }

        return bundle;
    }

    /**
     * Serializes an agent entity to export format
     */
    private serializeAgent(agent: AIAgentEntity): any {
        return {
            id: agent.ID,
            name: agent.Name,
            description: agent.Description,
            status: agent.Status,
            typeID: agent.TypeID,
            parentID: agent.ParentID,
            createdAt: agent.__mj_CreatedAt,
            updatedAt: agent.__mj_UpdatedAt
        };
    }

    /**
     * Collects all sub-agents recursively
     */
    private async collectSubAgents(agentId: string, contextUser: any): Promise<any[]> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'AI Agents',
            ExtraFilter: `ParentID = '${agentId}'`,
            OrderBy: 'Name'
        }, contextUser);

        if (!result.Success || !result.Results) {
            return [];
        }

        const subAgents: any[] = [];
        for (const subAgent of result.Results) {
            const serialized = this.serializeAgent(subAgent);
            
            // Recursively collect sub-agents of this sub-agent
            serialized.subAgents = await this.collectSubAgents(subAgent.ID, contextUser);
            
            subAgents.push(serialized);
        }

        return subAgents;
    }

    /**
     * Collects all prompts associated with the agent
     */
    private async collectAgentPrompts(agentId: string, contextUser: any): Promise<any[]> {
        const rv = new RunView();
        
        // Get agent prompt associations with prompt details
        const result = await rv.RunView({
            EntityName: 'MJ: AI Agent Prompts',
            ExtraFilter: `AgentID = '${agentId}'`,
            OrderBy: 'ExecutionOrder'
        }, contextUser);

        if (!result.Success || !result.Results) {
            return [];
        }

        const prompts: any[] = [];
        for (const agentPrompt of result.Results) {
            // Load the full prompt details
            const prompt = await this.loadPromptDetails(agentPrompt.PromptID, contextUser);
            if (prompt) {
                prompts.push({
                    association: {
                        id: agentPrompt.ID,
                        executionOrder: agentPrompt.ExecutionOrder,
                        status: agentPrompt.Status
                    },
                    prompt: {
                        id: prompt.ID,
                        name: prompt.Name,
                        description: prompt.Description,
                        typeID: prompt.TypeID,
                        categoryID: prompt.CategoryID,
                        status: prompt.Status,
                        promptRole: prompt.PromptRole,
                        promptPosition: prompt.PromptPosition,
                        responseFormat: prompt.ResponseFormat,
                        templateText: prompt.TemplateText
                    }
                });
            }
        }

        return prompts;
    }

    /**
     * Collects all actions associated with the agent
     */
    private async collectAgentActions(agentId: string, contextUser: any): Promise<any[]> {
        const rv = new RunView();
        
        // Get agent action associations
        const result = await rv.RunView({
            EntityName: 'MJ: AI Agent Actions',
            ExtraFilter: `AgentID = '${agentId}'`,
            OrderBy: 'Action'
        }, contextUser);

        if (!result.Success || !result.Results) {
            return [];
        }

        const actions: any[] = [];
        for (const agentAction of result.Results) {
            // Load the full action details
            const action = await this.loadActionDetails(agentAction.ActionID, contextUser);
            if (action) {
                actions.push({
                    association: {
                        id: agentAction.ID,
                        priority: agentAction.Priority,
                        status: agentAction.Status,
                        executionOrder: agentAction.ExecutionOrder
                    },
                    action: {
                        id: action.ID,
                        name: action.Name,
                        description: action.Description,
                        driverClass: action.DriverClass,
                        type: action.Type,
                        status: action.Status,
                        categoryID: action.CategoryID
                    }
                });
            }
        }

        return actions;
    }

    /**
     * Loads prompt details by ID
     */
    private async loadPromptDetails(promptId: string, contextUser: any): Promise<AIPromptEntityExtended | null> {
        try {
            const md = this.getMetadata();
            const prompt = await md.GetEntityObject<AIPromptEntityExtended>('AI Prompts', contextUser);
            if (!prompt) {
                return null;
            }

            const loaded = await prompt.Load(promptId);
            return loaded ? prompt : null;
        } catch (e) {
            console.error('Error loading prompt details:', e);
            return null;
        }
    }

    /**
     * Loads action details by ID
     */
    private async loadActionDetails(actionId: string, contextUser: any): Promise<ActionEntity | null> {
        try {
            const md = this.getMetadata();
            const action = await md.GetEntityObject<ActionEntity>('Actions', contextUser);
            if (!action) {
                return null;
            }

            const loaded = await action.Load(actionId);
            return loaded ? action : null;
        } catch (e) {
            console.error('Error loading action details:', e);
            return null;
        }
    }
}

/**
 * Function to load the action and prevent tree shaking
 */
export function LoadExportAgentBundleAction() {
    return ExportAgentBundleAction;
}