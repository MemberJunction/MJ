/**
 * @fileoverview Collaborator owned by {@link AgentStepExecutionHelper} encapsulating
 * next-step validation routing (`ValidateNextStep`), Plan/Failed/Retry/Chat step
 * validators, and fatal / configuration error classification.
 *
 * @module @memberjunction/ai-agents
 */

import {
    type AgentConfiguration,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { AIErrorType } from '@memberjunction/ai';
import { IsVerboseLoggingEnabled, LogError, LogStatus } from '@memberjunction/core';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import type { AgentRunContext } from '../AgentRunContext';
import { SafeResolveEffectiveAgentProperties } from '../AgentHelperResolver';
import { AgentStepTypeRegistry } from './AgentStepTypeRegistry';

/**
 * Collaborator handling next-step validation dispatch and prompt/config error classification.
 */
export class AgentStepValidationHelper {
    public async ValidateNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const policy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy(nextStep.step);

        if (ctx.PlanModeActive && !ctx.PlanApproved && policy && !policy.AllowedInUnapprovedPlanMode) {
            ctx.GeneralValidationRetryCount++;
            return {
                step: 'Retry',
                terminate: false,
                errorMessage:
                    'Plan mode is active for this request. Present your plan first via a "Plan" next step and wait for approval before executing actions or sub-agents.',
            };
        }

        if (!policy) {
            ctx.Hooks.LogError(`Invalid next step '${nextStep.step}' for agent '${params.agent.Name}'`, {
                agent: params.agent,
                category: 'NextStepValidation',
            });
            return {
                step: 'Failed',
                terminate: true,
                errorMessage: `Invalid next step '${nextStep.step}'`,
            };
        }

        const agentTypeName = ctx.AgentConfig?.agentType?.Name ?? null;
        if (!AgentStepTypeRegistry.Instance.DoesStepApplyToAgentType(policy.AppliesTo, agentTypeName)) {
            ctx.Hooks.LogError(
                `Step type '${policy.StepKey}' (AppliesTo='${policy.AppliesTo}') is not permitted for agent type '${agentTypeName}'`,
                { agent: params.agent, category: 'NextStepValidation' }
            );
            return {
                step: 'Failed',
                terminate: true,
                errorMessage: `Step type '${policy.StepKey}' does not apply to agent type '${agentTypeName}' (AppliesTo='${policy.AppliesTo}')`,
            };
        }

        if (policy.ConfigSchema && policy.ConfigSchema.trim().length > 0) {
            const schemaResult = policy.Handler.ValidateConfigSchema(policy.ConfigSchema, nextStep.customStepData);
            if (!schemaResult.Valid) {
                ctx.GeneralValidationRetryCount++;
                const summary = `Custom step '${policy.StepKey}' customStepData failed ConfigSchema validation: ${schemaResult.Errors.join('; ')}`;
                ctx.Hooks.LogError(summary, {
                    agent: params.agent,
                    category: 'CustomStepConfigSchemaValidation',
                    metadata: {
                        stepKey: policy.StepKey,
                        validationErrors: schemaResult.Errors,
                    },
                });
                return {
                    step: 'Retry',
                    terminate: false,
                    errorMessage: summary,
                    retryInstructions:
                        `Custom step '${policy.StepKey}' customStepData failed ConfigSchema validation:\n` +
                        schemaResult.Errors.map((e, i) => `${i + 1}. ${e}`).join('\n'),
                };
            }
        }

        return policy.Handler.Validate<P>(ctx, params, nextStep, currentPayload, agentRun, currentStep);
    }

    public async ValidatePlanNextStep<P>(
        ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        if (!nextStep.planDetails?.plan || nextStep.planDetails.plan.trim().length === 0) {
            if (nextStep.step !== 'Retry') {
                ctx.GeneralValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: 'Plan text is required when presenting a Plan for approval',
            };
        }
        return nextStep;
    }

    public async ValidateFailedNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return nextStep;
    }

    public async ValidateRetryNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return nextStep;
    }

    public async ValidateChatNextStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
        chatHandlingOption?: MJAIAgentEntity['ChatHandlingOption']
    ): Promise<BaseAgentNextStep<P>> {
        const effectiveChatOption =
            chatHandlingOption !== undefined
                ? chatHandlingOption
                : (SafeResolveEffectiveAgentProperties(params.agent)?.ChatHandlingOption ?? params.agent.ChatHandlingOption);
        const effectiveOption = effectiveChatOption;

        if (effectiveOption) {
            let mappedStep: 'Success' | 'Failed' | 'Retry';

            switch (effectiveOption) {
                case 'Consult':
                    return nextStep;
                case 'Success':
                    mappedStep = 'Success';
                    break;
                case 'Failed':
                    mappedStep = 'Failed';
                    break;
                case 'Retry':
                    mappedStep = 'Retry';
                    break;
                default:
                    LogError(
                        `Invalid ChatHandlingOption value: ${effectiveOption}. Expected 'Consult', 'Success', 'Failed', or 'Retry'. Treating as null and allowing Chat to propagate.`
                    );
                    return nextStep;
            }

            const remappedStep: BaseAgentNextStep<P> =
                mappedStep === 'Retry'
                    ? {
                          ...nextStep,
                          step: 'Retry',
                          terminate: false,
                          errorMessage: nextStep.errorMessage || 'Chat was remapped to Retry by ChatHandlingOption',
                      }
                    : {
                          ...nextStep,
                          step: mappedStep,
                      };

            if (params.verbose === true || IsVerboseLoggingEnabled()) {
                LogStatus(`Remapping Chat step to ${effectiveOption} based on agent's ChatHandlingOption`);
            }

            return await ctx.Hooks.ValidateNextStep(params, remappedStep, currentPayload, agentRun, currentStep);
        }

        return nextStep;
    }

    public IsFatalPromptError(promptResult: AIPromptRunResult): boolean {
        if (promptResult?.errorMessage) {
            const templateErrorPattern = /Failed to render/i;
            if (templateErrorPattern.test(promptResult.errorMessage)) {
                return true;
            }

            if (
                promptResult.errorMessage.includes('No suitable model found') ||
                promptResult.errorMessage.includes('No credentials found') ||
                promptResult.errorMessage.includes('No valid API credentials')
            ) {
                return true;
            }
        }

        if (!promptResult?.chatResult?.errorInfo) {
            return false;
        }

        const errorInfo = promptResult.chatResult.errorInfo;

        if (errorInfo.severity === 'Fatal') {
            return true;
        }

        const fatalErrorTypes: AIErrorType[] = [
            'ContextLengthExceeded',
            'Authentication',
            'NoCredentials',
            'InvalidRequest',
        ];

        return fatalErrorTypes.includes(errorInfo.errorType);
    }

    public IsConfigurationError(
        ctx: AgentRunContext,
        errorMessage: string,
        config?: AgentConfiguration
    ): { isConfigError: boolean; detailedMessage: string } {
        const propertyMatch = errorMessage.match(/reading '(\w+)'/i);
        const accessedProperty = propertyMatch ? propertyMatch[1].toLowerCase() : '';

        const CONFIG_RELATED_PROPERTIES = new Set([
            'prompt',
            'childprompt',
            'systemprompt',
            'prompts',
            'agent',
            'agents',
            'agenttype',
            'agenttypes',
            'model',
            'models',
            'vendor',
            'vendors',
            'template',
            'templates',
        ]);
        const isConfigRelatedProperty = accessedProperty !== '' && CONFIG_RELATED_PROPERTIES.has(accessedProperty);

        const configErrorPatterns = [
            {
                pattern: isConfigRelatedProperty
                    ? /cannot read propert(y|ies) of (undefined|null)/i
                    : /__NEVER_MATCH_GENERIC_UNDEFINED_ACCESS__/,
                getMessage: () => {
                    const property = accessedProperty || 'unknown property';

                    let details = `Attempted to access property '${property}' on an undefined or null object.`;

                    if (property.toLowerCase().includes('prompt')) {
                        details += `\n\n🔧 Configuration Issue: Missing prompt configuration.`;
                        if (config) {
                            if (!config.childPrompt) {
                                details += `\n   - Agent does not have a child prompt configured`;
                                if (ctx.AgentTypeInstance) {
                                    const guidance = ctx.AgentTypeInstance.GetPromptConfigurationGuidance();
                                    details += `\n${guidance}`;
                                }
                            }
                            if (!config.systemPrompt) {
                                details += `\n   - Agent type does not have a system prompt configured`;
                            }
                        }
                    } else if (property.toLowerCase().includes('agent')) {
                        details += `\n\n🔧 Configuration Issue: Missing agent configuration.`;
                        details += `\n   - Ensure agent type is properly configured`;
                        details += `\n   - Check that agent metadata is complete`;
                    }

                    return details;
                },
            },
            {
                pattern: /childprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    let details = `Agent is missing required child prompt configuration.\n\n` + `🔧 Configuration Fix:\n`;

                    if (ctx.AgentTypeInstance) {
                        const guidance = ctx.AgentTypeInstance.GetPromptConfigurationGuidance();
                        details += `${guidance}`;
                    } else {
                        details +=
                            `   - Ensure agent has AI Agent Prompts relationship configured\n` +
                            `   - Verify that prompt exists in AI Prompts table and is active`;
                    }

                    return details;
                },
            },
            {
                pattern: /systemprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    return (
                        `Agent type is missing system prompt configuration.\n\n` +
                        `🔧 Configuration Fix:\n` +
                        `   - Check agent type's SystemPromptID in AI Agent Types table\n` +
                        `   - Verify system prompt exists and is active\n` +
                        `   - Some agent types (like Flow) may not require system prompts`
                    );
                },
            },
            {
                pattern: /no prompts configured/i,
                getMessage: () => {
                    return (
                        `Agent has no prompts configured.\n\n` +
                        `🔧 Configuration Fix:\n` +
                        `   - Add at least one AI Agent Prompt relationship to this agent\n` +
                        `   - Or for Flow agents: Add Prompt-type steps to the agent's step graph`
                    );
                },
            },
            {
                pattern: /agent type not found/i,
                getMessage: () => {
                    return (
                        `Agent references an agent type that doesn't exist.\n\n` +
                        `🔧 Configuration Fix:\n` +
                        `   - Verify TypeID in AI Agents table matches existing AI Agent Types record\n` +
                        `   - Check that AIEngine.Instance.AgentTypes includes the required type\n` +
                        `   - Ensure Config() has been called to load agent types`
                    );
                },
            },
            {
                pattern: /child prompt not found/i,
                getMessage: () => {
                    return (
                        `Referenced child prompt doesn't exist or isn't loaded.\n\n` +
                        `🔧 Configuration Fix:\n` +
                        `   - Check AI Agent Prompts relationship has valid PromptID\n` +
                        `   - Verify prompt exists in AI Prompts table\n` +
                        `   - Ensure AIEngine.Instance.Prompts includes the prompt`
                    );
                },
            },
            {
                pattern: /agent configuration/i,
                getMessage: () => {
                    return (
                        `General agent configuration error.\n\n` +
                        `🔧 Configuration Check:\n` +
                        `   - Review agent metadata in AI Agents table\n` +
                        `   - Check all foreign key relationships are valid\n` +
                        `   - Verify agent type is properly configured`
                    );
                },
            },
            {
                pattern: /Failed to render.*child prompt templates/i,
                getMessage: () => {
                    return (
                        `Template rendering error: ${errorMessage}\n\n` +
                        `🔧 Template Configuration Fix:\n` +
                        `   - Check nunjucks template syntax in prompt content\n` +
                        `   - Use {% raw %}{{}}{% endraw %} for literal braces in examples\n` +
                        `   - Verify all template variables are properly defined\n` +
                        `   - Ensure template variables referenced in content exist in context`
                    );
                },
            },
        ];

        for (const { pattern, getMessage } of configErrorPatterns) {
            if (pattern.test(errorMessage)) {
                const detailedMessage = getMessage();
                return {
                    isConfigError: true,
                    detailedMessage: `Configuration Error: ${detailedMessage}\n\nOriginal Error: ${errorMessage}`,
                };
            }
        }

        return {
            isConfigError: false,
            detailedMessage: errorMessage,
        };
    }
}
