import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { AIAgentEntityExtended } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { AIEngine } from "@memberjunction/aiengine";
import { BaseAction } from "@memberjunction/actions";
import { AgentSpecSync } from "@memberjunction/ai-agent-manager";
import { AgentSpec, AgentActionSpec } from "@memberjunction/ai-core-plus";
import { AIAgentDefinition } from "@memberjunction/ai-agent-manager";
import { UserInfo, Metadata } from "@memberjunction/core";

/**
 * Creates a new AI agent with specified configuration using AgentSpec for complete configuration.
 * This action is restricted to the Agent Manager agent only.
 *
 * Supports creating agents from:
 * 1. Full AgentSpec/AIAgentDefinition object (from Planning Designer) - RECOMMENDED
 * 2. Automatically applies intelligent defaults for production-ready agents
 * 3. Validates configuration before database writes
 * 4. Recursively creates sub-agent hierarchies
 *
 * @example
 * ```typescript
 * // Create from Planning Designer output (recommended)
 * const result = await runAction({
 *   ActionName: 'Create Agent',
 *   Params: [
 *     {
 *       Name: 'AgentSpec',
 *       Value: {
 *         name: 'Customer Feedback Analyzer',
 *         description: 'Analyzes customer feedback...',
 *         type: 'Loop',
 *         actions: [...],
 *         subAgents: [...],
 *         payloadDownstreamPaths: ['*'],
 *         // ... full spec
 *       }
 *     }
 *   ]
 * });
 * // Returns AgentID and SubAgentIDs in output params
 * ```
 */
@RegisterClass(BaseAction, "Create Agent")
export class CreateAgentAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Check if we received a full AgentSpec/AgentDefinition object
            const agentSpecParam = this.getObjectParam(params, 'AgentSpec', false);

            if (!agentSpecParam.value) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'AgentSpec parameter is required. Provide a complete agent specification from Planning Designer.'
                };
            }

            // Create agent from full specification
            return await this.createFromSpec(agentSpecParam.value, params);

        } catch (e) {
            return this.handleError(e, 'create agent');
        }
    }

    /**
     * Create agent from full AgentSpec or AIAgentDefinition (from Planning Designer)
     */
    private async createFromSpec(
        agentDef: any,
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            // 1. Convert AIAgentDefinition → AgentSpec format
            const agentSpec = this.convertToAgentSpec(agentDef);

            // 2. Apply intelligent defaults for production-ready configuration
            const enhancedSpec = this.applyIntelligentDefaults(agentSpec, params);

            // 3. Validate the spec before creating
            const validation = this.validateAgentSpec(enhancedSpec);
            if (!validation.isValid) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_FAILED',
                    Message: `Agent spec validation failed: ${validation.errors.join('; ')}`
                };
            }

            // 4. Lookup TypeID from type name if needed
            const typeID = await this.resolveTypeID(agentDef.type || 'Loop', params.ContextUser);
            if (!typeID) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_TYPE',
                    Message: `Agent type '${agentDef.type || 'Loop'}' not found`
                };
            }

            // 5. Create agent entity manually first to set TypeID (AgentSpec doesn't include TypeID)
            const md = this.getMetadata();
            const agentEntity = await md.GetEntityObject<AIAgentEntityExtended>('AI Agents', params.ContextUser);

            if (!agentEntity) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: 'Failed to create AI Agent entity object'
                };
            }

            // Set basic required fields
            agentEntity.NewRecord();
            agentEntity.Name = enhancedSpec.Name;
            agentEntity.Description = enhancedSpec.Description || '';
            agentEntity.TypeID = typeID;
            agentEntity.Status = 'Active';
            agentEntity.ExecutionOrder = 0;
            agentEntity.ExposeAsAction = enhancedSpec.InvocationMode === 'Top-Level';
            if (enhancedSpec.ParentID) {
                agentEntity.ParentID = enhancedSpec.ParentID;
            }

            // Set all AgentSpec fields on the entity
            this.applySpecToEntity(enhancedSpec, agentEntity);

            // Save the agent entity
            const saveResult = await agentEntity.Save();
            if (!saveResult) {
                const latestResult = agentEntity.LatestResult;
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: latestResult?.Message || 'Failed to save agent'
                };
            }

            const agentId = agentEntity.ID;

            // 6. Now use AgentSpecSync to save actions (if any)
            if (enhancedSpec.Actions && enhancedSpec.Actions.length > 0) {
                enhancedSpec.ID = agentId;
                const agentSpecSync = new AgentSpecSync(enhancedSpec, params.ContextUser);
                agentSpecSync.markDirty();
                await agentSpecSync.SaveToDatabase();
            }

            // 6. Handle prompt creation (from agentDef.prompt)
            let promptId: string | undefined;
            if (agentDef.prompt?.systemPrompt) {
                const promptResult = await this.createAndAssociatePrompt(
                    { ID: agentId, Name: enhancedSpec.Name } as any,
                    agentDef.prompt.systemPrompt,
                    params.ContextUser
                );

                if (!promptResult.success) {
                    return {
                        Success: true,
                        ResultCode: 'PARTIAL_SUCCESS',
                        Message: `Agent '${enhancedSpec.Name}' created but prompt creation failed: ${promptResult.error}`,
                        Params: [
                            { Name: 'AgentID', Value: agentId, Type: 'Output' },
                            { Name: 'PromptError', Value: promptResult.error, Type: 'Output' }
                        ]
                    };
                }
                promptId = promptResult.promptId;
            }

            // 7. Recursively create sub-agents
            const subAgentIds: string[] = [];
            const subAgentErrors: string[] = [];
            for (const subAgentDef of agentDef.subAgents || []) {
                try {
                    const subAgentId = await this.createSubAgentFromSpec(
                        subAgentDef,
                        agentId,
                        params.ContextUser
                    );
                    subAgentIds.push(subAgentId);
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    subAgentErrors.push(`Failed to create sub-agent '${subAgentDef.name}': ${errorMsg}`);
                }
            }

            // 8. Return success with all created IDs
            const outputParams = [
                { Name: 'AgentID', Value: agentId, Type: 'Output' as const }
            ];

            if (promptId) {
                outputParams.push({ Name: 'PromptID', Value: promptId, Type: 'Output' as const });
            }

            if (subAgentIds.length > 0) {
                outputParams.push({ Name: 'SubAgentIDs', Value: JSON.stringify(subAgentIds), Type: 'Output' as const });
            }

            if (subAgentErrors.length > 0) {
                outputParams.push({ Name: 'SubAgentErrors', Value: JSON.stringify(subAgentErrors), Type: 'Output' as const });
            }

            const successMessage = subAgentErrors.length > 0
                ? `Created agent '${enhancedSpec.Name}' with ${subAgentIds.length} sub-agents, but ${subAgentErrors.length} sub-agents failed`
                : `Successfully created agent '${enhancedSpec.Name}' with ${subAgentIds.length} sub-agents`;

            return {
                Success: true,
                ResultCode: subAgentErrors.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
                Message: successMessage,
                Params: outputParams
            };

        } catch (e) {
            return this.handleError(e, 'create agent from spec');
        }
    }

    /**
     * Convert AIAgentDefinition (from Planning Designer) to AgentSpec format
     */
    private convertToAgentSpec(agentDef: AIAgentDefinition): Partial<AgentSpec> {
        return {
            // Basic info
            Name: agentDef.name,
            Description: agentDef.description,
            IconClass: agentDef.iconClass || 'fa-solid fa-robot',

            // Payload control (from Planning Designer)
            PayloadDownstreamPaths: agentDef.payloadDownstreamPaths || ['*'],
            PayloadUpstreamPaths: agentDef.payloadUpstreamPaths || ['*'],

            // Validation (from Planning Designer)
            FinalPayloadValidation: agentDef.finalPayloadValidation || null,
            FinalPayloadValidationMode: agentDef.finalPayloadValidationMode || 'Retry',
            FinalPayloadValidationMaxRetries: agentDef.finalPayloadValidationMaxRetries || 3,

            // Execution
            InvocationMode: agentDef.exposeAsAction ? 'Top-Level' : 'Any',

            // Actions: Convert to AgentActionSpec format
            Actions: agentDef.actions?.map((action) => ({
                AgentActionID: '',  // Will be generated on save
                ActionID: action.id,
                Status: 'Active' as const,
                ResultExpirationMode: 'None' as const
            })) || []
        };
    }

    /**
     * Apply intelligent defaults for production-ready agent configuration
     */
    private applyIntelligentDefaults(
        spec: Partial<AgentSpec>,
        params: RunActionParams
    ): AgentSpec {
        return {
            // Required fields
            ID: spec.ID || '',
            Name: spec.Name!,

            // Basic info
            Description: spec.Description,
            IconClass: spec.IconClass ?? 'fa-solid fa-robot',
            LogoURL: spec.LogoURL,
            ParentID: spec.ParentID,
            DriverClass: spec.DriverClass,

            // Resource limits (safety guardrails to prevent runaway costs)
            MaxCostPerRun: spec.MaxCostPerRun ?? 10.0,  // $10 default max
            MaxTokensPerRun: spec.MaxTokensPerRun ?? 100000,  // 100K tokens
            MaxIterationsPerRun: spec.MaxIterationsPerRun ?? 25,  // 25 loops max
            MaxTimePerRun: spec.MaxTimePerRun ?? 300,  // 5 minutes

            // Execution frequency (for sub-agents)
            MinExecutionsPerRun: spec.MinExecutionsPerRun,
            MaxExecutionsPerRun: spec.MaxExecutionsPerRun,

            // Payload control (data flow and security)
            PayloadDownstreamPaths: spec.PayloadDownstreamPaths ?? ['*'],
            PayloadUpstreamPaths: spec.PayloadUpstreamPaths ?? ['*'],
            PayloadSelfReadPaths: spec.PayloadSelfReadPaths,
            PayloadSelfWritePaths: spec.PayloadSelfWritePaths,
            PayloadScope: spec.PayloadScope,

            // Validation (quality control)
            FinalPayloadValidation: spec.FinalPayloadValidation ?? null,
            FinalPayloadValidationMode: spec.FinalPayloadValidationMode ?? 'Retry',
            FinalPayloadValidationMaxRetries: spec.FinalPayloadValidationMaxRetries ?? 3,
            StartingPayloadValidation: spec.StartingPayloadValidation ?? null,
            StartingPayloadValidationMode: spec.StartingPayloadValidationMode ?? 'Fail',

            // Model and execution settings
            ModelSelectionMode: spec.ModelSelectionMode ?? 'Agent Type',
            InvocationMode: spec.InvocationMode ?? 'Any',
            DefaultPromptEffortLevel: spec.DefaultPromptEffortLevel,
            ChatHandlingOption: spec.ChatHandlingOption,  // Can be undefined

            // Artifact and ownership
            DefaultArtifactTypeID: spec.DefaultArtifactTypeID,
            OwnerUserID: spec.OwnerUserID ?? params.ContextUser.ID,

            // Relationships (will be populated during save)
            Actions: spec.Actions ?? [],
            SubAgents: spec.SubAgents ?? []
        };
    }

    /**
     * Validate agent spec before database creation
     */
    private validateAgentSpec(spec: AgentSpec): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Required fields
        if (!spec.Name || spec.Name.trim() === '') {
            errors.push('Name is required and cannot be empty');
        }

        // Resource limits sanity checks (prevent configuration errors)
        if (spec.MaxCostPerRun && spec.MaxCostPerRun > 100) {
            errors.push('MaxCostPerRun exceeds $100 safety limit');
        }
        if (spec.MaxTokensPerRun && spec.MaxTokensPerRun > 1000000) {
            errors.push('MaxTokensPerRun exceeds 1M token safety limit');
        }
        if (spec.MaxIterationsPerRun && spec.MaxIterationsPerRun > 100) {
            errors.push('MaxIterationsPerRun exceeds 100 iteration safety limit');
        }
        if (spec.MaxTimePerRun && spec.MaxTimePerRun > 3600) {
            errors.push('MaxTimePerRun exceeds 1 hour (3600s) safety limit');
        }

        // Validation schema format check
        if (spec.FinalPayloadValidation) {
            try {
                JSON.parse(spec.FinalPayloadValidation);
            } catch {
                errors.push('FinalPayloadValidation must be valid JSON');
            }
        }
        if (spec.StartingPayloadValidation) {
            try {
                JSON.parse(spec.StartingPayloadValidation);
            } catch {
                errors.push('StartingPayloadValidation must be valid JSON');
            }
        }

        // Payload paths format validation
        for (const path of spec.PayloadDownstreamPaths || []) {
            if (path !== '*' && !this.isValidJsonPath(path)) {
                errors.push(`Invalid downstream path format: ${path}`);
            }
        }
        for (const path of spec.PayloadUpstreamPaths || []) {
            if (path !== '*' && !this.isValidJsonPath(path)) {
                errors.push(`Invalid upstream path format: ${path}`);
            }
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * Validate JSON path format (basic validation)
     */
    private isValidJsonPath(path: string): boolean {
        // Basic validation: should not have spaces, should use dot notation or wildcards
        // Examples: "data.*", "analysis.results", "customer.id"
        return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_*][a-zA-Z0-9_*]*)*$/.test(path);
    }

    /**
     * Resolve agent type name to TypeID
     */
    private async resolveTypeID(typeName: string, contextUser: UserInfo): Promise<string | null> {
        const aiEngine = AIEngine.Instance;
        await aiEngine.Config(false, contextUser);

        const agentType = aiEngine.AgentTypes.find((t: any) =>
            t.Name?.toLowerCase() === typeName.toLowerCase()
        );

        return agentType?.ID || null;
    }

    /**
     * Recursively create sub-agent from specification
     */
    private async createSubAgentFromSpec(
        subAgentDef: AIAgentDefinition,
        parentId: string,
        contextUser: UserInfo
    ): Promise<string> {
        // Convert sub-agent definition
        const subAgentSpec = this.convertToAgentSpec(subAgentDef);

        // Set parent relationship
        subAgentSpec.ParentID = parentId;

        // Apply sub-agent specific defaults
        subAgentSpec.InvocationMode = 'Sub-Agent';  // Sub-agents can only be invoked as sub-agents
        subAgentSpec.MinExecutionsPerRun = subAgentSpec.MinExecutionsPerRun ?? 1;
        subAgentSpec.MaxExecutionsPerRun = subAgentSpec.MaxExecutionsPerRun ?? 1;  // Run once by default

        // Inherit resource limits from parent if not specified (optional - could be stricter)
        // For now, apply standard defaults
        const enhancedSpec = this.applyIntelligentDefaults(subAgentSpec, { ContextUser: contextUser } as any);

        // Resolve type
        const typeID = await this.resolveTypeID(subAgentDef.type || 'Loop', contextUser);
        if (!typeID) {
            throw new Error(`Sub-agent type '${subAgentDef.type || 'Loop'}' not found`);
        }

        // Validate
        const validation = this.validateAgentSpec(enhancedSpec);
        if (!validation.isValid) {
            throw new Error(`Sub-agent validation failed: ${validation.errors.join('; ')}`);
        }

        // Create sub-agent entity
        const md = new Metadata();
        const subAgentEntity = await md.GetEntityObject<AIAgentEntityExtended>('AI Agents', contextUser);

        if (!subAgentEntity) {
            throw new Error('Failed to create sub-agent entity object');
        }

        // Set basic fields
        subAgentEntity.NewRecord();
        subAgentEntity.Name = enhancedSpec.Name;
        subAgentEntity.Description = enhancedSpec.Description || '';
        subAgentEntity.TypeID = typeID;
        subAgentEntity.Status = 'Active';
        subAgentEntity.ExecutionOrder = subAgentDef.executionOrder || 0;
        subAgentEntity.ExposeAsAction = false;  // Sub-agents are never exposed as actions
        subAgentEntity.ParentID = enhancedSpec.ParentID || null;

        // Apply all AgentSpec fields
        this.applySpecToEntity(enhancedSpec, subAgentEntity);

        // Save the sub-agent
        const saveResult = await subAgentEntity.Save();
        if (!saveResult) {
            throw new Error('Failed to save sub-agent');
        }

        const subAgentId = subAgentEntity.ID;

        // Save actions using AgentSpecSync if any
        if (enhancedSpec.Actions && enhancedSpec.Actions.length > 0) {
            enhancedSpec.ID = subAgentId;
            const agentSpecSync = new AgentSpecSync(enhancedSpec, contextUser);
            agentSpecSync.markDirty();
            await agentSpecSync.SaveToDatabase();
        }

        // Create prompt if provided
        if (subAgentDef.prompt?.systemPrompt) {
            await this.createAndAssociatePrompt(
                { ID: subAgentId, Name: enhancedSpec.Name } as any,
                subAgentDef.prompt.systemPrompt,
                contextUser
            );
        }

        // Recursively create nested sub-agents
        for (const nestedSubAgent of subAgentDef.subAgents || []) {
            await this.createSubAgentFromSpec(nestedSubAgent, subAgentId, contextUser);
        }

        return subAgentId;
    }

    /**
     * Apply AgentSpec fields to an entity
     * Maps all AgentSpec configuration to the corresponding entity fields
     */
    private applySpecToEntity(spec: AgentSpec, entity: AIAgentEntityExtended): void {
        // Icon and branding
        entity.IconClass = spec.IconClass || null;
        entity.LogoURL = spec.LogoURL || null;
        entity.DriverClass = spec.DriverClass || null;

        // Model selection
        entity.ModelSelectionMode = spec.ModelSelectionMode || 'Agent Type';

        // Payload control - serialize JSON arrays to strings
        entity.PayloadDownstreamPaths = JSON.stringify(spec.PayloadDownstreamPaths || ['*']);
        entity.PayloadUpstreamPaths = JSON.stringify(spec.PayloadUpstreamPaths || ['*']);
        entity.PayloadSelfReadPaths = spec.PayloadSelfReadPaths
            ? JSON.stringify(spec.PayloadSelfReadPaths)
            : null;
        entity.PayloadSelfWritePaths = spec.PayloadSelfWritePaths
            ? JSON.stringify(spec.PayloadSelfWritePaths)
            : null;
        entity.PayloadScope = spec.PayloadScope || null;

        // Validation
        entity.FinalPayloadValidation = spec.FinalPayloadValidation || null;
        entity.FinalPayloadValidationMode = spec.FinalPayloadValidationMode || 'Retry';
        entity.FinalPayloadValidationMaxRetries = spec.FinalPayloadValidationMaxRetries || 3;
        entity.StartingPayloadValidation = spec.StartingPayloadValidation || null;
        entity.StartingPayloadValidationMode = spec.StartingPayloadValidationMode || 'Fail';

        // Resource limits
        entity.MaxCostPerRun = spec.MaxCostPerRun || null;
        entity.MaxTokensPerRun = spec.MaxTokensPerRun || null;
        entity.MaxIterationsPerRun = spec.MaxIterationsPerRun || null;
        entity.MaxTimePerRun = spec.MaxTimePerRun || null;

        // Execution frequency (for sub-agents)
        entity.MinExecutionsPerRun = spec.MinExecutionsPerRun || null;
        entity.MaxExecutionsPerRun = spec.MaxExecutionsPerRun || null;

        // Other configuration
        entity.DefaultPromptEffortLevel = spec.DefaultPromptEffortLevel || null;
        entity.ChatHandlingOption = spec.ChatHandlingOption || null;
        entity.DefaultArtifactTypeID = spec.DefaultArtifactTypeID || null;
        entity.InvocationMode = spec.InvocationMode || 'Any';
        if (spec.OwnerUserID) {
            entity.OwnerUserID = spec.OwnerUserID;
        }
    }
}

export function LoadCreateAgentAction() {
    // This function exists to prevent tree shaking from removing the action class
    // The side effect of loading this file is that the @RegisterClass decorator runs
}
