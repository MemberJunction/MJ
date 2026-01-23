import { BaseAgent, PayloadManager } from '@memberjunction/ai-agents';
import { ExecuteAgentParams, BaseAgentNextStep, AgentSpec, AIAgentRunEntityExtended, AIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';
import { ActionEntity } from "@memberjunction/core-entities";
import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';

/**
 * Architect Agent - Transforms technical design into validated AgentSpec JSON
 *
 * This agent creates AgentSpec objects from technical designs and validates them
 * before passing to the Builder Agent for persistence. It overrides validateSuccessNextStep
 * to ensure the generated AgentSpec is valid before proceeding.
 *
 * Key responsibilities:
 * - Transform design documents into AgentSpec format
 * - Validate required fields are present
 * - Verify action IDs exist in database
 * - Verify prompt IDs exist (if specified)
 * - Validate SubAgent structure
 * - Auto-correct minor issues (casing, missing optional fields)
 * - Force retry with detailed errors if validation fails
 */
@RegisterClass(BaseAgent, 'AgentArchitectAgent')
export class AgentArchitectAgent extends BaseAgent {

    /**
     * Applies payload changes if any are requested in the next step
     */
    protected applyPayloadChanges<P>(payload: P, nextStep: BaseAgentNextStep<P>): P {
        if (nextStep.payloadChangeRequest) {
            const pm = new PayloadManager();
            const result = pm.applyAgentChangeRequest<P>(payload, nextStep.payloadChangeRequest);
            return result.result || payload;
        }
        return payload;
    }

    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: AIAgentRunEntityExtended,
        currentStep: AIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // First call base validation
        const baseValidation = await super.validateSuccessNextStep(params, nextStep, currentPayload, agentRun, currentStep);
        if (baseValidation.step === 'Retry') {
            return baseValidation;
        }

        // Apply payload changes to get the spec that would be sent forward
        const payloadWithChanges = this.applyPayloadChanges<P>(currentPayload, nextStep);

        // The payload IS the AgentSpec
        const agentSpec = payloadWithChanges as AgentSpec;

        console.log('🏗️ Architect Agent: Validating AgentSpec:', agentSpec ? `Name="${agentSpec.Name}"` : 'agentSpec is null/undefined');

        // Validate the AgentSpec
        const validation = await this.validateAgentSpec(agentSpec, params);

        if (validation.errors.length > 0) {
            console.log('❌ Architect Agent: Validation failed with errors:', validation.errors);
            // Return retry with detailed error messages
            return {
                ...nextStep,
                step: 'Retry',
                retryInstructions: this.formatValidationErrors(validation.errors),
                newPayload: nextStep.newPayload
            };
        }

        // If spec was auto-corrected, update the payload with corrected spec
        if (validation.correctedSpec) {
            console.log('✓ Architect Agent: Auto-corrected AgentSpec, updating payload');
            return {
                ...nextStep,
                newPayload: validation.correctedSpec as P
            };
        }

        console.log('✅ Architect Agent: AgentSpec validation passed');
        return nextStep;
    }

    /**
     * Validates an AgentSpec object
     * Returns errors array and potentially a corrected spec
     */
    protected async validateAgentSpec(
        spec: AgentSpec,
        params: ExecuteAgentParams
    ): Promise<{ errors: string[]; correctedSpec?: AgentSpec }> {
        const errors: string[] = [];
        let corrected = false;

        // Check if spec exists
        if (!spec) {
            errors.push('❌ AgentSpec is null or undefined. Ensure you place the AgentSpec in payload.agentSpec (inside a payloadChangeRequest with newElements or replaceElements)');
            return { errors };
        }

        const correctedSpec = { ...spec };

        // Deduplicate arrays to fix common LLM retry issues
        const dedupeResult = this.deduplicateAgentSpec(correctedSpec);
        if (dedupeResult.hadDuplicates) {
            corrected = true;
            console.log('✓ Auto-corrected: Removed duplicate entries from AgentSpec arrays');
        }

        // 1. Validate required fields
        if (!correctedSpec.Name || correctedSpec.Name.trim().length === 0) {
            errors.push('❌ AgentSpec.Name is required and cannot be empty');
        }

        if (!correctedSpec.StartingPayloadValidationMode) {
            // Auto-correct: add default
            correctedSpec.StartingPayloadValidationMode = 'Fail';
            corrected = true;
            console.log('✓ Auto-corrected: Added default StartingPayloadValidationMode = "Fail"');
        } else if (correctedSpec.StartingPayloadValidationMode !== 'Fail' && correctedSpec.StartingPayloadValidationMode !== 'Warn') {
            errors.push(`❌ StartingPayloadValidationMode must be either "Fail" or "Warn", got: "${correctedSpec.StartingPayloadValidationMode}"`);
        }

        // 2. Validate Actions if specified
        if (correctedSpec.Actions && correctedSpec.Actions.length > 0) {
            const actionValidation = await this.validateActions(correctedSpec.Actions, params);
            if (actionValidation.errors.length > 0) {
                errors.push(...actionValidation.errors);
            }
        }

        // 3. Validate SubAgents if specified
        if (correctedSpec.SubAgents && correctedSpec.SubAgents.length > 0) {
            const subAgentValidation = this.validateSubAgents(correctedSpec.SubAgents);
            if (subAgentValidation.errors.length > 0) {
                errors.push(...subAgentValidation.errors);
            }
            if (subAgentValidation.corrected) {
                corrected = true;
            }
        }

        // 4. Validate TypeID and Status
        const specWithType = correctedSpec as any;
        if (!specWithType.TypeID) {
            errors.push('❌ TypeID is required - must be "@lookup:MJ: AI Agent Types.Name=Loop" or "@lookup:MJ: AI Agent Types.Name=Flow"');
        }

        if (!specWithType.Status) {
            // Auto-correct: add default
            specWithType.Status = 'Active';
            corrected = true;
            console.log('✓ Auto-corrected: Added default Status = "Active"');
        } else if (!['Active', 'Inactive', 'Pending'].includes(specWithType.Status)) {
            errors.push(`❌ Status must be "Active", "Inactive", or "Pending", got: "${specWithType.Status}"`);
        }

        // 5. Validate agent type-specific requirements
        const isLoopAgent = specWithType.TypeID?.includes('Loop');
        const isFlowAgent = specWithType.TypeID?.includes('Flow');

        if (isLoopAgent) {
            // Loop agents require at least one prompt
            if (!correctedSpec.Prompts || correctedSpec.Prompts.length === 0) {
                errors.push('❌ Loop agents require at least ONE prompt in the Prompts array');
            }
        }

        if (isFlowAgent) {
            // CRITICAL: Flow agents MUST have empty Prompts array (no agent-level prompts)
            if (correctedSpec.Prompts && correctedSpec.Prompts.length > 0) {
                errors.push('❌ Flow agents MUST have empty Prompts array. If LLM is needed, use a Prompt step OR a Loop sub-agent instead of agent-level prompts.');
            }

            // Flow agents require Steps and Paths
            if (!correctedSpec.Steps || correctedSpec.Steps.length === 0) {
                errors.push('❌ Flow agents require at least ONE step in the Steps array');
            }
            // Paths are technically optional (single-step flows), but validate if present
            if (correctedSpec.Steps && correctedSpec.Steps.length > 1) {
                if (!correctedSpec.Paths || correctedSpec.Paths.length === 0) {
                    errors.push('❌ Flow agents with multiple steps require at least ONE path in the Paths array');
                }
            }

            // Validate that at least one step is marked as StartingStep
            if (correctedSpec.Steps && correctedSpec.Steps.length > 0) {
                const hasStartingStep = correctedSpec.Steps.some(step => step.StartingStep === true);
                if (!hasStartingStep) {
                    errors.push('❌ Flow agents require at least ONE step with StartingStep: true');
                }

                // Validate each step based on its type
                for (let i = 0; i < correctedSpec.Steps.length; i++) {
                    const step = correctedSpec.Steps[i];

                    // Validate Action steps
                    if (step.StepType === 'Action') {
                        if (!step.ActionID) {
                            errors.push(`❌ Action step "${step.Name}" (index ${i}) must have ActionID field`);
                        }

                        // Validate ActionInputMapping if provided (supports both string and object)
                        if (step.ActionInputMapping) {
                            try {
                                if (typeof step.ActionInputMapping === 'string') {
                                    JSON.parse(step.ActionInputMapping);
                                }
                                // else it's already an object, which is valid and will be stringified later
                            } catch (e: any) {
                                errors.push(`❌ Step "${step.Name}" (index ${i}) has invalid ActionInputMapping JSON: ${e?.message || String(e)}`);
                            }
                        }

                        // Validate ActionOutputMapping if provided (supports both string and object)
                        if (step.ActionOutputMapping) {
                            try {
                                if (typeof step.ActionOutputMapping === 'string') {
                                    JSON.parse(step.ActionOutputMapping);
                                }
                                // else it's already an object, which is valid and will be stringified later
                            } catch (e: any) {
                                errors.push(`❌ Step "${step.Name}" (index ${i}) has invalid ActionOutputMapping JSON: ${e?.message || String(e)}`);
                            }
                        }
                    }

                    // Validate Prompt steps
                    if (step.StepType === 'Prompt') {
                        // If PromptID is empty or not provided, PromptText is required for inline creation
                        if (!step.PromptID || step.PromptID === '') {
                            if (!step.PromptText || step.PromptText.trim() === '') {
                                errors.push(`❌ Prompt step "${step.Name}" (index ${i}) has empty PromptID but missing PromptText. For inline prompt creation, PromptText is required.`);
                            }
                            // PromptName and PromptDescription are recommended but not required
                            if (!step.PromptName) {
                                console.log(`⚠️ Warning: Prompt step "${step.Name}" (index ${i}) is missing PromptName (will default to "[Step Name] Prompt")`);
                            }
                        }
                        // If PromptID is provided (existing prompt), other fields are optional
                    }

                    // Validate Sub-Agent steps
                    if (step.StepType === 'Sub-Agent') {
                        // SubAgentID can be empty "" for new sub-agents (will be linked by name matching)
                        // No validation needed here - linking happens in AgentSpecSync
                    }
                }
            }
        }

        // 6. Validate optional but important fields
        if (correctedSpec.FinalPayloadValidationMode &&
            !['Fail', 'Retry', 'Warn'].includes(correctedSpec.FinalPayloadValidationMode)) {
            errors.push(`❌ FinalPayloadValidationMode must be "Fail", "Retry", or "Warn", got: "${correctedSpec.FinalPayloadValidationMode}"`);
        }

        if (correctedSpec.InvocationMode &&
            !['Any', 'Agent', 'User', 'Never'].includes(correctedSpec.InvocationMode)) {
            errors.push(`❌ InvocationMode must be "Any", "Agent", "User", or "Never", got: "${correctedSpec.InvocationMode}"`);
        }

        return {
            errors,
            correctedSpec: corrected ? correctedSpec : undefined
        };
    }

    /**
     * Validates that action IDs exist in the database
     */
    protected async validateActions(
        actions: AgentSpec['Actions'],
        params: ExecuteAgentParams
    ): Promise<{ errors: string[] }> {
        const errors: string[] = [];

        if (!actions || actions.length === 0) {
            return { errors };
        }

        try {
            const rv = new RunView();
            const actionIds = actions
                .map(a => a.ActionID)
                .filter(id => id && id.trim().length > 0);

            if (actionIds.length === 0) {
                errors.push('❌ All actions must have an ActionID');
                return { errors };
            }

            // Query database for these action IDs
            const filter = actionIds.map(id => `ID='${id}'`).join(' OR ');
            const result = await rv.RunView<ActionEntity>({
                EntityName: 'Actions',
                ExtraFilter: filter,
                ResultType: 'entity_object'
            }, params.contextUser);

            if (!result.Success) {
                errors.push(`❌ Failed to validate actions: ${result.ErrorMessage}`);
                return { errors };
            }

            const foundIds = new Set(result.Results.map(a => a.ID));

            // Check which actions weren't found
            for (const action of actions) {
                if (!action.ActionID) {
                    errors.push('❌ Action is missing ActionID field');
                    continue;
                }

                if (!foundIds.has(action.ActionID)) {
                    errors.push(`❌ Action with ID "${action.ActionID}" not found in database. Please use "Find Candidate Actions" or "List Actions" to get valid action IDs.`);
                }
            }

        } catch (error: any) {
            errors.push(`❌ Error validating actions: ${error?.message || String(error)}`);
        }

        return { errors };
    }

    /**
     * Validates SubAgent structure recursively
     */
    protected validateSubAgents(
        subAgents: AgentSpec['SubAgents']
    ): { errors: string[]; corrected: boolean } {
        const errors: string[] = [];
        let corrected = false;

        if (!subAgents || subAgents.length === 0) {
            return { errors, corrected };
        }

        for (let i = 0; i < subAgents.length; i++) {
            const subAgent = subAgents[i];

            // Validate Type field
            if (!subAgent.Type) {
                errors.push(`❌ SubAgent at index ${i} is missing required "Type" field (must be "child" or "related")`);
                continue;
            }

            if (subAgent.Type !== 'child' && subAgent.Type !== 'related') {
                errors.push(`❌ SubAgent at index ${i} has invalid Type "${subAgent.Type}" (must be "child" or "related")`);
                continue;
            }

            // Validate SubAgent.SubAgent field
            if (!subAgent.SubAgent) {
                errors.push(`❌ SubAgent at index ${i} is missing required "SubAgent" field`);
                continue;
            }

            // SubAgent.ID can be empty string "" for NEW sub-agents (Builder creates them recursively)
            // Only validate that ID is not null/undefined
            if (subAgent.SubAgent.ID === null || subAgent.SubAgent.ID === undefined) {
                errors.push(`❌ SubAgent at index ${i} has null/undefined SubAgent.ID (use empty string "" for new sub-agents, or provide existing agent GUID)`);
            }

            // Validate SubAgent.SubAgent.Name
            if (!subAgent.SubAgent.Name || subAgent.SubAgent.Name.trim().length === 0) {
                errors.push(`❌ SubAgent at index ${i} is missing SubAgent.Name`);
            }

            // Validate TypeID ONLY for child sub-agents (related sub-agents use minimal spec without TypeID)
            if (subAgent.Type === 'child') {
                if (!subAgent.SubAgent.TypeID) {
                    errors.push(`❌ Child SubAgent[${i}] "${subAgent.SubAgent.Name}" is missing TypeID field`);
                } else {
                    // Validate Loop/Flow specific requirements for child sub-agents
                    const isLoopSubAgent = subAgent.SubAgent.TypeID.includes('Loop');
                    const isFlowSubAgent = subAgent.SubAgent.TypeID.includes('Flow');

                    if (isLoopSubAgent) {
                        // Loop sub-agents require at least one prompt
                        if (!subAgent.SubAgent.Prompts || subAgent.SubAgent.Prompts.length === 0) {
                            errors.push(`❌ Loop SubAgent[${i}] "${subAgent.SubAgent.Name}" requires at least ONE prompt in Prompts array`);
                        }
                    }

                    if (isFlowSubAgent) {
                        // Flow sub-agents MUST have empty Prompts array
                        if (subAgent.SubAgent.Prompts && subAgent.SubAgent.Prompts.length > 0) {
                            errors.push(`❌ Flow SubAgent[${i}] "${subAgent.SubAgent.Name}" MUST have empty Prompts array. Use Prompt steps or Loop sub-agents for LLM functionality.`);
                        }

                        // Flow sub-agents require Steps
                        if (!subAgent.SubAgent.Steps || subAgent.SubAgent.Steps.length === 0) {
                            errors.push(`❌ Flow SubAgent[${i}] "${subAgent.SubAgent.Name}" requires at least ONE step in Steps array`);
                        }
                    }
                }
            } else if (subAgent.Type === 'related') {
                // Related sub-agents should NOT have TypeID, Actions, SubAgents, or Prompts
                // Warn if they do (don't fail, just inform)
                if (subAgent.SubAgent.TypeID) {
                    console.log(`⚠️ Warning: Related SubAgent[${i}] "${subAgent.SubAgent.Name}" has TypeID field. Related sub-agents use minimal spec (ID, Name, StartingPayloadValidationMode, Status only).`);
                }
                if (subAgent.SubAgent.Actions && subAgent.SubAgent.Actions.length > 0) {
                    console.log(`⚠️ Warning: Related SubAgent[${i}] "${subAgent.SubAgent.Name}" has Actions field. Related sub-agents use minimal spec.`);
                }
                if (subAgent.SubAgent.SubAgents && subAgent.SubAgent.SubAgents.length > 0) {
                    console.log(`⚠️ Warning: Related SubAgent[${i}] "${subAgent.SubAgent.Name}" has SubAgents field. Related sub-agents use minimal spec.`);
                }
                if (subAgent.SubAgent.Prompts && subAgent.SubAgent.Prompts.length > 0) {
                    console.log(`⚠️ Warning: Related SubAgent[${i}] "${subAgent.SubAgent.Name}" has Prompts field. Related sub-agents use minimal spec.`);
                }
            }

            // Auto-correct: Add default StartingPayloadValidationMode if missing
            if (!subAgent.SubAgent.StartingPayloadValidationMode) {
                subAgent.SubAgent.StartingPayloadValidationMode = 'Fail';
                corrected = true;
                console.log(`✓ Auto-corrected: Added SubAgent[${i}].SubAgent.StartingPayloadValidationMode = "Fail"`);
            }

            // Auto-correct: Add default Status if missing
            if (!subAgent.SubAgent.Status) {
                subAgent.SubAgent.Status = 'Active';
                corrected = true;
                console.log(`✓ Auto-corrected: Added SubAgent[${i}].SubAgent.Status = "Active"`);
            }

            // Validate related-specific fields
            if (subAgent.Type === 'related') {
                // AgentRelationshipID can be empty for new relationships, it will be created on save

                // IMPORTANT: Related agents REQUIRE existing agent ID
                if (!subAgent.SubAgent.ID || subAgent.SubAgent.ID === '') {
                    errors.push(`❌ Related SubAgent[${i}] "${subAgent.SubAgent.Name}" must have existing agent ID. Use Find Candidate Agents to get the ID.`);
                }

                // IMPORTANT: Related agents REQUIRE mapping fields
                if (!subAgent.SubAgentInputMapping && !subAgent.SubAgentOutputMapping) {
                    errors.push(`❌ Related SubAgent[${i}] "${subAgent.SubAgent.Name}" must have at least SubAgentInputMapping or SubAgentOutputMapping`);
                }
            }

            // Recursively validate nested sub-agents
            if (subAgent.SubAgent.SubAgents && subAgent.SubAgent.SubAgents.length > 0) {
                const nestedValidation = this.validateSubAgents(subAgent.SubAgent.SubAgents);
                if (nestedValidation.errors.length > 0) {
                    // Prefix nested errors with parent context
                    const prefixedErrors = nestedValidation.errors.map(
                        err => `SubAgent[${i}] "${subAgent.SubAgent.Name}" -> ${err}`
                    );
                    errors.push(...prefixedErrors);
                }
                if (nestedValidation.corrected) {
                    corrected = true;
                }
            }
        }

        return { errors, corrected };
    }

    /**
     * Deduplicates arrays in AgentSpec to fix common LLM retry issues
     * Modifies spec in place and returns whether duplicates were found
     */
    protected deduplicateAgentSpec(spec: AgentSpec): { hadDuplicates: boolean } {
        let hadDuplicates = false;

        // Deduplicate Actions by ActionID
        if (spec.Actions && spec.Actions.length > 0) {
            const uniqueActions = new Map<string, typeof spec.Actions[0]>();
            for (const action of spec.Actions) {
                if (action.ActionID && !uniqueActions.has(action.ActionID)) {
                    uniqueActions.set(action.ActionID, action);
                }
            }
            if (uniqueActions.size < spec.Actions.length) {
                hadDuplicates = true;
                console.log(`🔧 Deduplicating Actions: ${spec.Actions.length} → ${uniqueActions.size}`);
                spec.Actions = Array.from(uniqueActions.values());
            }
        }

        // Deduplicate PayloadDownstreamPaths
        if (spec.PayloadDownstreamPaths && spec.PayloadDownstreamPaths.length > 0) {
            const uniquePaths = Array.from(new Set(spec.PayloadDownstreamPaths));
            if (uniquePaths.length < spec.PayloadDownstreamPaths.length) {
                hadDuplicates = true;
                console.log(`🔧 Deduplicating PayloadDownstreamPaths: ${spec.PayloadDownstreamPaths.length} → ${uniquePaths.length}`);
                spec.PayloadDownstreamPaths = uniquePaths;
            }
        }

        // Deduplicate PayloadUpstreamPaths
        if (spec.PayloadUpstreamPaths && spec.PayloadUpstreamPaths.length > 0) {
            const uniquePaths = Array.from(new Set(spec.PayloadUpstreamPaths));
            if (uniquePaths.length < spec.PayloadUpstreamPaths.length) {
                hadDuplicates = true;
                console.log(`🔧 Deduplicating PayloadUpstreamPaths: ${spec.PayloadUpstreamPaths.length} → ${uniquePaths.length}`);
                spec.PayloadUpstreamPaths = uniquePaths;
            }
        }

        // Deduplicate SubAgents by SubAgent.ID (for related) or SubAgent.Name (for child)
        if (spec.SubAgents && spec.SubAgents.length > 0) {
            const uniqueSubAgents = new Map<string, typeof spec.SubAgents[0]>();
            for (const subAgent of spec.SubAgents) {
                // Use ID for related agents, Name for child agents as key
                const key = subAgent.Type === 'related' && subAgent.SubAgent.ID
                    ? subAgent.SubAgent.ID
                    : subAgent.SubAgent.Name;
                if (key && !uniqueSubAgents.has(key)) {
                    uniqueSubAgents.set(key, subAgent);

                    // Recursively deduplicate nested sub-agents
                    if (subAgent.SubAgent.SubAgents && subAgent.SubAgent.SubAgents.length > 0) {
                        const nestedResult = this.deduplicateAgentSpec(subAgent.SubAgent as AgentSpec);
                        if (nestedResult.hadDuplicates) {
                            hadDuplicates = true;
                        }
                    }

                    // SubAgentContextPaths is Record<string, string>, no need to deduplicate
                    // (object keys are already unique by definition)
                }
            }
            if (uniqueSubAgents.size < spec.SubAgents.length) {
                hadDuplicates = true;
                console.log(`🔧 Deduplicating SubAgents: ${spec.SubAgents.length} → ${uniqueSubAgents.size}`);
                spec.SubAgents = Array.from(uniqueSubAgents.values());
            }
        }

        // Deduplicate Prompts by PromptID (if set) or PromptText hash
        if (spec.Prompts && spec.Prompts.length > 0) {
            const uniquePrompts = new Map<string, typeof spec.Prompts[0]>();
            for (const prompt of spec.Prompts) {
                const key = prompt.PromptID || this.hashString(prompt.PromptText || '');
                if (key && !uniquePrompts.has(key)) {
                    uniquePrompts.set(key, prompt);
                }
            }
            if (uniquePrompts.size < spec.Prompts.length) {
                hadDuplicates = true;
                console.log(`🔧 Deduplicating Prompts: ${spec.Prompts.length} → ${uniquePrompts.size}`);
                spec.Prompts = Array.from(uniquePrompts.values());
            }
        }

        // Deduplicate Steps (for Flow agents) by Name
        if (spec.Steps && spec.Steps.length > 0) {
            const uniqueSteps = new Map<string, typeof spec.Steps[0]>();
            for (const step of spec.Steps) {
                if (step.Name && !uniqueSteps.has(step.Name)) {
                    uniqueSteps.set(step.Name, step);
                }
            }
            if (uniqueSteps.size < spec.Steps.length) {
                hadDuplicates = true;
                console.log(`🔧 Deduplicating Steps: ${spec.Steps.length} → ${uniqueSteps.size}`);
                spec.Steps = Array.from(uniqueSteps.values());
            }
        }

        // Deduplicate Paths (for Flow agents) by OriginStepID + DestinationStepID
        if (spec.Paths && spec.Paths.length > 0) {
            const uniquePaths = new Map<string, typeof spec.Paths[0]>();
            for (const path of spec.Paths) {
                const key = `${path.OriginStepID}→${path.DestinationStepID}`;
                if (!uniquePaths.has(key)) {
                    uniquePaths.set(key, path);
                }
            }
            if (uniquePaths.size < spec.Paths.length) {
                hadDuplicates = true;
                console.log(`🔧 Deduplicating Paths: ${spec.Paths.length} → ${uniquePaths.size}`);
                spec.Paths = Array.from(uniquePaths.values());
            }
        }

        return { hadDuplicates };
    }

    /**
     * Simple hash function for string deduplication
     */
    protected hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    /**
     * Formats validation errors into a clear, actionable message
     */
    protected formatValidationErrors(errors: string[]): string {
        if (errors.length === 0) {
            return '';
        }

        const header = '## AgentSpec Validation Errors\n\nThe generated AgentSpec has the following issues that must be fixed:\n\n';
        const errorList = errors.map((err, idx) => `${idx + 1}. ${err}`).join('\n');
        const footer = '\n\n**Please fix these issues and regenerate the AgentSpec.**';

        return header + errorList + footer;
    }
}
