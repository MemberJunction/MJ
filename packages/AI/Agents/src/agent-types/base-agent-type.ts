/**
 * @fileoverview Base agent type abstraction for the MemberJunction AI Agent framework.
 * 
 * This module defines the abstract BaseAgentType class that serves as the foundation
 * for different agent execution patterns. Agent types encapsulate reusable behavior
 * patterns (like loops, decision trees, or linear flows) that can be applied to
 * multiple agents through configuration rather than code duplication.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { AIPromptParams, AIPromptRunResult, BaseAgentNextStep, AgentPayloadChangeRequest, AgentAction, AgentSubAgentRequest, ExecuteAgentParams, AgentConfiguration} from '@memberjunction/ai-core-plus';
import { AIAgentTypeEntity } from '@memberjunction/core-entities';
import { AIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import { MJGlobal, JSONValidator } from '@memberjunction/global';
import { LogError, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { ActionResult } from '@memberjunction/actions-base';

/**
 * Abstract base class for agent type implementations.
 * 
 * Agent types define reusable execution patterns that control how agents behave.
 * Each agent type is associated with a system prompt that guides the LLM's output
 * format and decision-making process. Common agent type patterns include:
 * 
 * - **Loop**: Continues executing until a goal is achieved
 * - **SinglePass**: Executes once and returns a result
 * - **DecisionTree**: Makes branching decisions based on conditions
 * - **Pipeline**: Executes a series of steps in sequence
 * 
 * The agent type's system prompt should be designed to produce output that can
 * be parsed by the DetermineNextStep method to decide what happens next in the
 * agent's execution flow.
 * 
 * @abstract
 * @class BaseAgentType
 * 
 * @example
 * ```typescript
 * export class LoopAgentType extends BaseAgentType {
 *   public async DetermineNextStep(): Promise<BaseAgentNextStep> {
 *     // Parse LLM output to determine if goal is achieved
 *     const goalAchieved = // ... parsing logic
 *     
 *     return {
 *       step: goalAchieved ? 'success' : 'action',
 *       payload: result
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseAgentType {
    /**
     * JSON validator instance for cleaning and validating responses
     * @protected
     */
    protected _jsonValidator: JSONValidator = new JSONValidator();

    /**
     * Common placeholder for current payload injection
     * @static
     */
    public static readonly CURRENT_PAYLOAD_PLACEHOLDER = '_CURRENT_PAYLOAD';

    /**
     * This method allows each agent type to initialize its agent-run-specific state package as required. Not all agent
     * types require this and are able to live off just the current payload or other properties passed to them to 
     * DetermineNextStep(), but some require more complex internal state tracking.
     * @param params - the agent execution params
     * @returns the fully initialized initial agent-type state
     */
    public abstract InitializeAgentTypeState<ATS = any, P = any>(params: ExecuteAgentParams<any, P>): Promise<ATS>;

    /**
     * Analyzes the output from prompt execution to determine the next step.
     * 
     * This method is called after the hierarchical prompts have been executed
     * and should parse the LLM's response to determine what the agent should
     * do next. The implementation depends on the specific agent type's logic
     * and the format of output expected from its system prompt.
     * 
     * @abstract
     * @param {AIPromptRunResult | null} promptResult - Result from prompt execution (null for non-prompt steps)
     * @param {ExecuteAgentParams} params - The full execution parameters including agent and context
     * @returns {Promise<BaseAgentNextStep>} The determined next step and optional return value
     * 
     * @example
     * ```typescript
     * public async DetermineNextStep(): Promise<BaseAgentNextStep> {
     *   // Implementation might parse JSON output from LLM
     *   const response = JSON.parse(this.lastExecutionResult);
     *   
     *   if (response.taskComplete) {
     *     return { step: 'success', payload: response.payload };
     *   } else if (response.needsSubAgent) {
     *     return { step: 'subagent', payload: response.subAgentConfig };
     *   } else {
     *     return { step: 'action', payload: response.nextAction };
     *   }
     * }
     * ```
     */
    public abstract DetermineNextStep<P = any, ATS = any>(
        promptResult: AIPromptRunResult | null, 
        params: ExecuteAgentParams<any, P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P>>;

    /**
     * Determines the initial step when no previous decision exists.
     * 
     * This method allows agent types to customize how they begin execution.
     * For example:
     * - Loop agents might execute a prompt to determine initial actions
     * - Flow agents might look up their starting step from configuration
     * - Pipeline agents might execute the first step in their sequence
     * 
     * @abstract
     * @param {ExecuteAgentParams} params - The full execution parameters including agent, payload, and context
     * @returns {Promise<BaseAgentNextStep<P> | null>} The initial step, or null to use default behavior (prompt execution)
     * 
     * @since 2.76.0
     */
    public abstract DetermineInitialStep<P = any, ATS = any>(params: ExecuteAgentParams<P>, payload: P, agentTypeState: ATS): Promise<BaseAgentNextStep<P> | null>;

    /**
     * Pre-processes a retry step to allow agent types to customize retry behavior.
     * 
     * This method is called when the previous step returned 'Retry' as the next step.
     * Agent types can override this to provide custom behavior instead of the default
     * prompt execution. This is particularly useful for:
     * - Flow agents that need to evaluate paths after action execution
     * - State machine agents that need to transition based on results
     * - Pipeline agents that need to move to the next stage
     * 
     * @abstract
     * @param {ExecuteAgentParams} params - The full execution parameters
     * @param {BaseAgentNextStep} retryStep - The retry step that was returned
     * @returns {Promise<BaseAgentNextStep | null>} Custom next step, or null to use default retry behavior (prompt execution)
     * 
     * @since 2.76.0
     */
    public abstract PreProcessNextStep<P = any, ATS = any>(
        params: ExecuteAgentParams<P>,
        step: BaseAgentNextStep<P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P> | null>;

    // /**
    //  * The agent type is responsible for knowing what to retreive a payload from the prompt results for its
    //  * agent-type specific logic.
    //  */
    // public abstract RetrievePayload<P = any>(promptResult: AIPromptRunResult): Promise<P>;

    /**
     * The agent type is responsible for injecting a payload into the prompt. This can be done by updating the
     * system prompt by replacing a special non-Nunjucks placeholder, or by adding extra messages to the prompt.
     * @param payload - The payload to inject
     * @param prompt - The prompt parameters to update
     * @param agentInfo - Agent identification info including agent ID and run ID
     */
    public abstract InjectPayload<P = any, ATS = any>(
        payload: P,
        agentTypeState: ATS,
        prompt: AIPromptParams,
        agentInfo: { agentId: string; agentRunId?: string }
    ): Promise<void>;

    /**
     * Allows agent types to provide a custom prompt for a specific step.
     * This is used by agent types that need to override the default prompt
     * selection logic (e.g., Flow agents that use different prompts for different steps).
     * 
     * The base implementation should return the default prompt from configuration.
     * Agent types can override this to provide custom prompt selection logic.
     * 
     * @param {ExecuteAgentParams} params - The full execution parameters for additional context
     * @param {AgentConfiguration} config - The loaded agent configuration with default prompts
     * @param {BaseAgentNextStep | null} previousDecision - The previous step decision that may contain context
     * @returns {Promise<AIPromptEntityExtended | null>} A prompt entity to use (either custom or config.childPrompt)
     * 
     * @abstract
     * @since 2.76.0
     */
    public abstract GetPromptForStep<P = any, ATS = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        payload: P,
        agentTypeState: ATS,
        previousDecision?: BaseAgentNextStep<P> | null
    ): Promise<AIPromptEntityExtended | null>;

    /**
     * Helper method that retrieves an instance of the agent type based on the provided agent type entity.
     * 
     * This method uses the ClassFactory to create an instance of the agent type class
     * specified in the DriverClass field of the agent type entity. If the DriverClass is not
     * specified, it throws an error.
     * 
     * @async
     * @static
     * @method GetAgentTypeInstance
     * @param {AIAgentTypeEntity} agentType - The agent type entity to instantiate
     * 
     * @returns {Promise<BaseAgentType>} An instance of the agent type class
     * 
     * @throws {Error} If the agent type does not have a DriverClass specified or if instantiation fails
     * @param agentType 
     * @returns 
     */
    public static async GetAgentTypeInstance(agentType: AIAgentTypeEntity): Promise<BaseAgentType> {
        try {
            const agentTypeInstance = await this.getAgentTypeInstance(agentType);
            return agentTypeInstance;
        } catch (error) {
            LogError(error);
            throw new Error(`Failed to get agent type instance for ${agentType.Name}: ${error.message}`);
        }
    }


    /**
     * Instantiates the appropriate agent type class based on the agent type entity.
     * 
     * This method uses the MemberJunction class factory to dynamically instantiate
     * agent type classes. It uses the DriverClass field. If DriverClass is not specified
     * it throws an error.
     * 
     * @param {AIAgentTypeEntity} agentType - The agent type entity to instantiate
     * 
     * @returns {Promise<BaseAgentType | null>} Instance of the agent type class
     * 
     * @example
     * // For an agent type with DriverClass "LoopAgentType"
     * const agentTypeInstance = await this.getAgentTypeInstance(loopAgentType);
     * 
     * @protected
     */
    protected static async getAgentTypeInstance(agentType: AIAgentTypeEntity): Promise<BaseAgentType | null> {
        // Use DriverClass 
        if (!agentType.DriverClass) {
            throw new Error(`Agent type '${agentType.Name}' does not have a DriverClass specified. Please ensure the agent type is properly configured.`);
        }
        
        // Create an instance of the agent type using the DriverClass
        return this.getAgentInstanceWithDriverClass(agentType.DriverClass);
    }

    /**
     * Instantiates an agent type class using a specific driver class name.
     * 
     * This method is used when an individual agent has its own DriverClass override,
     * allowing for specialized implementations per agent instance.
     * 
     * @param {string} driverClass - The driver class name to instantiate
     * 
     * @returns {Promise<BaseAgentType | null>} Instance of the agent type class
     * 
     * @protected
     */
    protected static async getAgentInstanceWithDriverClass(driverClass: string): Promise<BaseAgentType | null> {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgentType>(BaseAgentType, driverClass);
        
        if (!instance) {
            throw new Error(`No implementation found for agent with DriverClass '${driverClass}'. Please ensure the class is registered with the ClassFactory.`);
        }

        // now check to make sure that the instance is NOT the base class BaseAgentType as that is not valid
        if (instance.constructor === BaseAgentType) {
            throw new Error(`The DriverClass '${driverClass}' is not a valid agent type implementation. It must extend BaseAgentType.`);
        }
        
        return instance;
    }

    /**
     * Parses JSON response from prompt execution with automatic validation syntax cleaning
     * 
     * @template T The expected response type
     * @param {AIPromptRunResult} promptResult - The prompt execution result
     * 
     * @returns {T | null} Parsed response or null if parsing fails
     * 
     * @protected
     */
    protected parseJSONResponse<T>(promptResult: AIPromptRunResult): T | null {
        if (!promptResult.success || !promptResult.result) {
            return null;
        }
        
        try {
            let response: T;
            if (typeof promptResult.result === 'string') {
                response = JSON.parse(promptResult.result);
            } else {
                response = promptResult.result as T;
            }
            
            // Clean validation syntax from the response
            response = this._jsonValidator.cleanValidationSyntax<T>(response);
            
            if (IsVerboseLoggingEnabled()) {
                console.log(`${this.constructor.name}: Cleaned response from validation syntax`, response);
            }
            
            return response;
        } catch (error) {
            LogError(`Failed to parse JSON response in ${this.constructor.name}: ${error.message}`);
            return null;
        }
    }

    /**
     * Creates a standardized next step object with common defaults
     * 
     * @template P The payload type
     * @param {BaseAgentNextStep['step']} step - The step type
     * @param {Partial<BaseAgentNextStep<P>>} options - Additional options to merge
     * 
     * @returns {BaseAgentNextStep<P>} The next step object
     * 
     * @protected
     */
    protected createNextStep<P>(
        step: BaseAgentNextStep['step'],
        options: Partial<BaseAgentNextStep<P>> = {}
    ): BaseAgentNextStep<P> {
        return {
            step,
            terminate: false,
            ...options
        } as BaseAgentNextStep<P>;
    }

    /**
     * Creates a retry step with a standardized error message
     * 
     * @template P The payload type
     * @param {string} errorMessage - The error message
     * @param {Partial<BaseAgentNextStep<P>>} options - Additional options
     * 
     * @returns {BaseAgentNextStep<P>} Retry step
     * 
     * @protected
     */
    protected createRetryStep<P>(
        errorMessage: string,
        options: Partial<BaseAgentNextStep<P>> = {}
    ): BaseAgentNextStep<P> {
        return this.createNextStep<P>('Retry', {
            errorMessage,
            terminate: false,
            ...options
        });
    }

    /**
     * Creates a success step with optional payload changes
     * 
     * @template P The payload type
     * @param {Partial<BaseAgentNextStep<P>>} options - Success options
     * 
     * @returns {BaseAgentNextStep<P>} Success step
     * 
     * @protected
     */
    protected createSuccessStep<P>(
        options: Partial<BaseAgentNextStep<P>> = {}
    ): BaseAgentNextStep<P> {
        return this.createNextStep<P>('Success', {
            terminate: true,
            ...options
        });
    }
    
    /**
     * Pre-processes an action step before execution.
     * 
     * This method is called by BaseAgent before action(s) are executed.
     * Agent types can override this method to perform custom pre-processing,
     * such as mapping payload values to action input parameters or modifying action configurations.
     * 
     * @param {AgentAction[]} actions - The actions that will be executed (can be modified)
     * @param {P} currentPayload - The current payload
     * @param {BaseAgentNextStep<P>} currentStep - The current step being executed
     * 
     * @returns {Promise<void>} Actions are modified in place
     * 
     * @since 2.76.0
     */
    public async PreProcessActionStep<P = any, ATS = any>(
        actions: AgentAction[],
        currentPayload: P,
        agentTypeState: ATS,
        currentStep: BaseAgentNextStep<P>,
        params?: ExecuteAgentParams<P>
    ): Promise<void> {
        // Default implementation does nothing
        // Subclasses can override to implement custom logic
    }
    
    /**
     * Post-processes the result of action execution.
     * 
     * This method is called by BaseAgent after action(s) have been executed.
     * Agent types can override this method to perform custom processing of action results,
     * such as mapping output parameters to the payload or storing results in agent-specific context.
     * 
     * @param {ActionResult[]} actionResults - The results from action execution
     * @param {AgentAction[]} actions - The actions that were executed
     * @param {P} currentPayload - The current payload
     * @param {BaseAgentNextStep<P>} currentStep - The current step being executed
     * 
     * @returns {Promise<AgentPayloadChangeRequest<P> | null>} Optional payload change request
     * 
     * @since 2.76.0
     */
    public async PostProcessActionStep<P = any, ATS = any>(
        actionResults: ActionResult[],
        actions: AgentAction[],
        currentPayload: P,
        agentTypeState: ATS,
        currentStep: BaseAgentNextStep<P>
    ): Promise<AgentPayloadChangeRequest<P> | null> {
        // Default implementation does nothing
        // Subclasses can override to implement custom logic
        return null;
    }
    
    /**
     * Post-processes the result of sub-agent execution.
     * 
     * This method is called by BaseAgent after a sub-agent has been executed.
     * Agent types can override this method to perform custom processing of sub-agent results,
     * such as extracting specific data from the sub-agent's payload or updating context.
     * 
     * @param {any} subAgentResult - The result from sub-agent execution
     * @param {AgentSubAgentRequest} subAgentRequest - The sub-agent request that was executed
     * @param {P} currentPayload - The current payload
     * @param {BaseAgentNextStep<P>} currentStep - The current step being executed
     * 
     * @returns {Promise<AgentPayloadChangeRequest<P> | null>} Optional payload change request
     * 
     * @since 2.76.0
     */
    public async PostProcessSubAgentStep<P = any, ATS = any>(
        subAgentResult: any,
        subAgentRequest: AgentSubAgentRequest,
        currentPayload: P,
        agentTypeState: ATS,
        currentStep: BaseAgentNextStep<P>
    ): Promise<AgentPayloadChangeRequest<P> | null> {
        // Default implementation does nothing
        // Subclasses can override to implement custom logic
        return null;
    }

    /**
     * Indicates whether this agent type requires agent-level prompts (AI Agent Prompts relationship).
     *
     * Some agent types (like Flow) use step-level prompts exclusively and don't need agent-level prompts.
     * Other agent types (like Loop) require agent-level prompts for their main reasoning loop.
     *
     * Default: true (most agent types require agent-level prompts)
     *
     * @returns {boolean} True if agent-level prompts are required, false if optional
     * @since 2.113.0
     */
    public get RequiresAgentLevelPrompts(): boolean {
        return true; // Default: agent-level prompts are required
    }

    /**
     * Provides agent-type-specific guidance for configuration errors related to missing prompts.
     * This allows each agent type to give contextual help based on its architecture.
     *
     * Default implementation provides generic guidance. Agent types should override to provide
     * specific instructions relevant to their configuration requirements.
     *
     * @returns {string} Configuration guidance specific to this agent type
     * @since 2.113.0
     */
    public GetPromptConfigurationGuidance(): string {
        return `   - Ensure agent has AI Agent Prompts relationship configured\n` +
               `   - Verify that prompt exists in AI Prompts table and is active`;
    }

    /**
     * Determines how to handle Success or Failed steps when no explicit termination is requested.
     *
     * This allows agent types to control their own fallback behavior:
     * - Loop agents use default behavior (return null) to process results with their main prompt
     * - Flow agents should terminate instead of falling back to prompts (return terminate step)
     * - Pipeline agents might want to move to the next stage
     *
     * Default implementation returns null, which causes base-agent to fall back to prompt execution
     * if prompts are configured. Agent types can override this to provide custom behavior.
     *
     * @param {BaseAgentNextStep<P>} step - The Success or Failed step that needs fallback handling
     * @param {AgentConfiguration} config - The loaded agent configuration
     * @param {ExecuteAgentParams} params - The execution parameters
     * @param {P} payload - The current payload
     * @param {ATS} agentTypeState - Agent type's state
     * @returns {Promise<BaseAgentNextStep<P> | null>} Custom step to execute, or null for default behavior
     *
     * @since 2.113.0
     */
    public async HandleStepFallback<P = any, ATS = any>(
        step: BaseAgentNextStep<P>,
        config: AgentConfiguration,
        params: ExecuteAgentParams<P>,
        payload: P,
        agentTypeState: ATS
    ): Promise<BaseAgentNextStep<P> | null> {
        // Default implementation: return null to use base-agent's default behavior
        // (fall back to prompt execution if prompts are configured)
        return null;
    }

    /**
     * Determines if loop results should be injected as a temporary user message
     * before the next prompt execution (for LLM reasoning).
     *
     * Default: true (most agent types benefit from seeing loop results)
     * Flow agents override to false (deterministic path navigation, no LLM)
     *
     * @returns true to inject results as message, false to skip
     * @since 2.112.0
     */
    public get InjectLoopResultsAsMessage(): boolean {
        return true;  // Default: Inject results for LLM reasoning
    }

    /**
     * Called before each loop iteration to prepare parameters and payload.
     *
     * Loop agents use this to resolve template variables ("item.email").
     * Flow agents typically don't need this (params already resolved).
     *
     * @param context - Current iteration context
     * @param agentTypeState - Agent type's state
     * @returns Modified context or null for default behavior
     * @since 2.112.0
     */
    public BeforeLoopIteration?<P>(
        context: {
            item: any;
            index: number;
            payload: P;
            loopType: 'ForEach' | 'While';
            itemVariable: string;
            actionParams: Record<string, unknown>;
            subAgentRequest?: { name: string; message: string; templateParameters?: Record<string, string> };
        } 
    ): {
        actionParams?: Record<string, unknown>;
        subAgentRequest?: { name: string; message: string; templateParameters?: Record<string, string> };
        payload?: P;
    } | null {
        return null;  // Default: No transformation
    }

    /**
     * Called after each loop iteration completes to process results.
     *
     * Flow agents use this to apply ActionOutputMapping and update payload.
     * Loop agents typically don't need this (just collect results).
     *
     * @param iterationResult - Results from this iteration
     * @param agentTypeState - Agent type's state
     * @returns Modified payload or null for default behavior (just collect result)
     * @since 2.112.0
     */
    public AfterLoopIteration?<P>(
        iterationResult: {
            actionResults?: ActionResult[];
            subAgentResult?: any;
            currentPayload: P;
            itemVariable: string;
            item: any;
            index: number;
            loopContext: any;  // BaseIterationContext (can't import due to circular dependency)
        } 
    ): P | null {
        return null;  // Default: No transformation
    }
}