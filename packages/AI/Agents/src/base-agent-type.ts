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

import { AIPromptRunResult } from '@memberjunction/ai-prompts';
import { BaseAgentNextStep } from './types';

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
 *       returnValue: result
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseAgentType {
    /**
     * Analyzes the output from prompt execution to determine the next step.
     * 
     * This method is called after the hierarchical prompts have been executed
     * and should parse the LLM's response to determine what the agent should
     * do next. The implementation depends on the specific agent type's logic
     * and the format of output expected from its system prompt.
     * 
     * @abstract
     * @returns {Promise<BaseAgentNextStep>} The determined next step and optional return value
     * 
     * @example
     * ```typescript
     * public async DetermineNextStep(): Promise<BaseAgentNextStep> {
     *   // Implementation might parse JSON output from LLM
     *   const response = JSON.parse(this.lastExecutionResult);
     *   
     *   if (response.taskComplete) {
     *     return { step: 'success', returnValue: response.result };
     *   } else if (response.needsSubAgent) {
     *     return { step: 'subagent', returnValue: response.subAgentConfig };
     *   } else {
     *     return { step: 'action', returnValue: response.nextAction };
     *   }
     * }
     * ```
     */
    public abstract DetermineNextStep(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep>  
}