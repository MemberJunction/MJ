import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { PromptSpec, PromptSpecSync } from "@memberjunction/ai-core-plus";

/**
 * Creates a new AI prompt using the PromptSpec interface for deterministic configuration.
 * This action is restricted to the Agent Manager agent only.
 *
 * The action accepts a complete PromptSpec object and creates:
 * - A Template entity for the prompt text
 * - An AIPrompt entity with all 50+ configuration fields
 * - Optional AIPromptModel relationships for model selection
 *
 * Intelligent defaults are applied for fields not specified, optimized for agent prompts
 * that need structured JSON responses with validation.
 *
 * @example Basic Usage
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Create Prompt',
 *   Params: [
 *     {
 *       Name: 'PromptSpec',
 *       Value: {
 *         Name: 'Data Collector - Main Prompt',
 *         Description: 'System prompt for data collection agent',
 *         PromptText: 'You are a data collector...',
 *         ResponseFormat: 'JSON',
 *         OutputType: 'object',
 *         OutputExample: '{"action": "...", "data": {...}}'
 *       }
 *     }
 *   ]
 * });
 * // Returns: { PromptID: '...', TemplateID: '...' }
 * ```
 *
 * @example With All Options
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Create Prompt',
 *   Params: [
 *     {
 *       Name: 'PromptSpec',
 *       Value: {
 *         Name: 'Sentiment Analyzer - Main Prompt',
 *         Description: 'Analyzes sentiment in customer feedback',
 *         PromptText: 'You are a sentiment analyzer...',
 *         ResponseFormat: 'JSON',
 *         PromptRole: 'System',
 *         PromptPosition: 'First',
 *         OutputType: 'object',
 *         OutputExample: '{"sentiment": "positive", "confidence": 0.95}',
 *         ValidationBehavior: 'Strict',
 *         MaxRetries: 3,
 *         RetryDelayMS: 1500,
 *         SelectionStrategy: 'Specific',
 *         PowerPreference: 'Highest',
 *         Models: [
 *           { ModelID: 'gpt4-id', VendorID: 'openai-id', Priority: 1 },
 *           { ModelID: 'claude-id', VendorID: 'anthropic-id', Priority: 2 }
 *         ]
 *       }
 *     }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Create Prompt")
export class CreatePromptAction extends BaseAgentManagementAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // 1. Validate Agent Manager permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) {
                return permissionError;
            }

            // 2. Extract PromptSpec parameter
            const specParam = this.getObjectParam(params, 'PromptSpec', true);
            if (specParam.error) {
                return specParam.error;
            }

            if (!specParam.value) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'PromptSpec parameter is required. Provide a complete prompt specification.'
                };
            }

            // 3. Validate that the spec has required fields
            const spec = specParam.value as unknown as PromptSpec;

            if (!spec.Name || spec.Name.trim() === '') {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'PromptSpec.Name is required and cannot be empty'
                };
            }

            if (!spec.Description || spec.Description.trim() === '') {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'PromptSpec.Description is required and cannot be empty'
                };
            }

            if (!spec.PromptText || spec.PromptText.trim() === '') {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'PromptSpec.PromptText is required and cannot be empty'
                };
            }

            // 4. Create prompt using PromptSpecSync
            const sync = new PromptSpecSync();
            const result = await sync.createFromSpec(spec, params.ContextUser);

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: 'CREATION_FAILED',
                    Message: result.ErrorMessage || 'Failed to create prompt',
                    Params: params.Params
                };
            }

            // 5. Add output parameters
            params.Params.push({
                Name: 'PromptID',
                Value: result.PromptID!,
                Type: 'Output'
            });

            params.Params.push({
                Name: 'TemplateID',
                Value: result.TemplateID!,
                Type: 'Output'
            });

            // 6. Return success result
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created prompt '${spec.Name}' with template`,
                Params: params.Params
            };

        } catch (e) {
            return this.handleError(e, 'create prompt');
        }
    }
}

/**
 * Function to load the action and prevent tree shaking
 */
export function LoadCreatePromptAction() {
    return CreatePromptAction;
}
