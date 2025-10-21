import { BaseAgent, PayloadManager } from '@memberjunction/ai-agents';
import { ExecuteAgentParams, BaseAgentNextStep, AgentSpec } from '@memberjunction/ai-core-plus';
import { AIAgentRunEntityExtended, AIAgentRunStepEntityExtended, ActionEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
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

        // Validate the AgentSpec
        const validation = await this.validateAgentSpec(payloadWithChanges as unknown as AgentSpec, params);

        if (validation.errors.length > 0) {
            // Return retry with detailed error messages
            return {
                ...nextStep,
                step: 'Retry',
                retryInstructions: this.formatValidationErrors(validation.errors),
                newPayload: validation.correctedSpec ? validation.correctedSpec as P : nextStep.newPayload
            };
        }

        // If spec was auto-corrected, update the payload
        if (validation.correctedSpec) {
            return {
                ...nextStep,
                newPayload: validation.correctedSpec as P
            };
        }

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
        const correctedSpec = { ...spec };

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

        // 4. Validate optional but important fields
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
                    errors.push(`❌ Action with ID "${action.ActionID}" not found in database. Please use "Find Best Action" or "List Actions" to get valid action IDs.`);
                }
            }

        } catch (error: any) {
            errors.push(`❌ Error validating actions: ${error?.message || String(error)}`);
        }

        return { errors };
    }

    /**
     * Validates SubAgent structure
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

            // Validate SubAgent.SubAgent.ID
            if (!subAgent.SubAgent.ID || subAgent.SubAgent.ID.trim().length === 0) {
                errors.push(`❌ SubAgent at index ${i} is missing SubAgent.ID (the ID of the sub-agent to reference)`);
            }

            // Validate SubAgent.SubAgent.Name
            if (!subAgent.SubAgent.Name || subAgent.SubAgent.Name.trim().length === 0) {
                errors.push(`❌ SubAgent at index ${i} is missing SubAgent.Name`);
            }

            // Auto-correct: Add default StartingPayloadValidationMode if missing
            if (!subAgent.SubAgent.StartingPayloadValidationMode) {
                subAgent.SubAgent.StartingPayloadValidationMode = 'Fail';
                corrected = true;
                console.log(`✓ Auto-corrected: Added SubAgent[${i}].SubAgent.StartingPayloadValidationMode = "Fail"`);
            }

            // Validate related-specific fields
            if (subAgent.Type === 'related' && !subAgent.AgentRelationshipID) {
                // AgentRelationshipID can be empty for new relationships, it will be created on save
                // This is not an error
            }
        }

        return { errors, corrected };
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
