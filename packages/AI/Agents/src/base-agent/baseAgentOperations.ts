/**
 * @fileoverview BaseAgentOperations - Layer 4 of the BaseAgent modular inheritance hierarchy.
 * Handles loop executions (ForEach and While), sub-agent dispatching, client-side tools execution,
 * chat feedback request tracking, and nested template variable resolution.
 * 
 * @module @memberjunction/ai-agents
 */

import {
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIAgentRunEntityExtended,
    ForEachOperation,
    WhileOperation,
    AgentSubAgentRequest,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    AgentChatMessageMetadata,
    AgentChatMessage,
    AgentResponseForm,
    AgentClientToolInvocation,
    ClientToolResultSummary,
    AgentPayloadChangeRequest,
    AgentConfiguration,
} from '@memberjunction/ai-core-plus';
import {
    MJAIAgentTypeEntity,
    MJAIAgentRequestEntity,
    MJAIAgentRequestTypeEntity,
    MJAIAgentRelationshipEntity,
} from '@memberjunction/core-entities';
import { UserInfo, LogError, LogStatus, IsVerboseLoggingEnabled, RunView } from '@memberjunction/core';
import { MJActionEntityExtended } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { UUIDsEqual, SafeExpressionEvaluator, CopyScalarsAndArrays } from '@memberjunction/global';
import { ChatMessage } from '@memberjunction/ai';
import { BaseAgentPrompt } from './baseAgentPrompt';
import { ActionResultSummary } from './baseAgentState';
import { PayloadChangeResultSummary, PayloadManagerResult } from '../PayloadManager';
import { ClientToolRequestManager } from '../ClientToolRequestManager';
import { AgentRunner } from '../AgentRunner';
import { ConversationMessageResolver } from '../utils/ConversationMessageResolver';
import _ from 'lodash';

/**
 * BaseAgentOperations implements looping (ForEach, While), sub-agent execution routines,
 * client-side UI tools handling, chat step feedback request generation, and path/template resolver helpers.
 */
export abstract class BaseAgentOperations extends BaseAgentPrompt {

    /**
     * Declares the abstract signature for the actions step execution, which is implemented in BaseAgentActions.
     * 
     * @param params - The agent execution parameters
     * @param previousDecision - The step decision containing the actions to execute
     * @param parentStepId - The database step ID of the parent loop if executing inside a loop
     * @param addConversationMessage - Whether to append the action execution message to the chat history
     * @param stepCount - The current step execution counter
     * @returns A promise resolving to the next step outcome
     * @protected
     */
    protected abstract executeActionsStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId?: string,
        addConversationMessage?: boolean,
        stepCount?: number
    ): Promise<BaseAgentNextStep>;

    /**
     * Declares the abstract signature for Chat step validation and potential remapping, which is implemented in BaseAgent.
     * 
     * @param params - The agent execution parameters
     * @param chatStep - The candidate Chat step decision
     * @param mergedPayload - The current accumulated payload
     * @param agentRun - The active database AgentRun record
     * @param stepEntity - The database step tracking entity
     * @returns A promise resolving to the validated/remapped next step outcome
     * @protected
     */
    protected abstract validateChatNextStep<P>(
        params: ExecuteAgentParams,
        chatStep: BaseAgentNextStep<P>,
        mergedPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>>;

    /**
     * Cache for AIAgentRequestType records to avoid repeated queries during Chat step feedback request generation.
     * @protected
     */
    protected _requestTypeCache: MJAIAgentRequestTypeEntity[] | null = null;

    /**
     * Resolves the list of active actions configured for this agent, merging runtime overrides from execution parameters.
     * 
     * @param agentId - The ID of the agent whose actions are being retrieved
     * @returns Array of active actions
     * @protected
     */
    protected getEffectiveActionsForValidation(agentId: string): MJActionEntityExtended[] {
        if (this._effectiveActions.length > 0) {
            return this._effectiveActions;
        }

        const agentActions = AIEngine.Instance.AgentActions.filter(
            aa => UUIDsEqual(aa.AgentID, agentId) && aa.Status === 'Active'
        );
        return ActionEngineServer.Instance.Actions.filter(a =>
            agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID)) && a.Status === 'Active'
        );
    }

    /**
     * Orchestrates the execution of a ForEach loop over a collection path on the payload.
     * 
     * @param params - Execution run parameters
     * @param config - The active agent configurations
     * @param previousDecision - The loop decision containing collection configuration
     * @returns Promise resolving to the next decision step
     * @protected
     */
    protected async executeForEachLoop(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const forEach = previousDecision.forEach as ForEachOperation;
        if (!forEach) {
            return this.createFailedStep('ForEach configuration missing', previousDecision);
        }

        const validationMessage = this.validateForEachOperation(forEach);
        if (validationMessage) {
            return this.createFailedStep(`ForEach configuration invalid: ${validationMessage}`, previousDecision);
        }

        const currentPayload = previousDecision.newPayload || previousDecision.previousPayload;
        const collection = this.getCollectionFromPayload(currentPayload, forEach.collectionPath);

        if (!collection) {
            return this.createFailedStep(`Collection path "${forEach.collectionPath}" not an array`, previousDecision);
        }

        const loopStepEntity = await this.createForEachLoopStep(forEach, collection, currentPayload, params);
        const loopResults = await this.executeForEachIterations(forEach, collection, currentPayload, loopStepEntity.ID, params, config);

        return this.completeForEachLoop(forEach, loopStepEntity, loopResults, previousDecision, params);
    }

    /**
     * Validates a While loop operation config checking for condition, item variable, and valid action or sub-agent names.
     * 
     * @param whileOp - The While loop operation configuration to validate
     * @returns Error message string if invalid, otherwise null
     * @protected
     */
    protected validateWhileOperation(whileOp: WhileOperation): string | null {
        if (!whileOp.condition || whileOp.condition.trim() === '') {
            return 'Condition is required';
        }
        if (!whileOp.itemVariable || whileOp.itemVariable.trim() === '') {
            return 'Item variable is required';
        }

        if (whileOp.action) {
            return this.validateActionInAgent(whileOp.action.name);
        } else if (whileOp.subAgent) {
            return this.validateSubAgentInAgent(whileOp.subAgent.name);
        }

        return null;
    }

    /**
     * Validates a ForEach loop operation config checking for collection path, item variable, and valid action or sub-agent names.
     * 
     * @param forEach - The ForEach loop operation configuration to validate
     * @returns Error message string if invalid, otherwise null
     * @protected
     */
    protected validateForEachOperation(forEach: ForEachOperation): string | null {
        if (!forEach.itemVariable || forEach.itemVariable.trim() === '') {
            return 'Item variable is required';
        }
        if (!forEach.collectionPath || forEach.collectionPath.trim() === '') {
            return 'Collection path is required';
        }

        if (forEach.action) {
            return this.validateActionInAgent(forEach.action.name);
        } else if (forEach.subAgent) {
            return this.validateSubAgentInAgent(forEach.subAgent.name);
        }

        return null;
    }

    /**
     * Helper to validate that an action name specified in a loop exists in the agent's effective actions (fuzzy matched).
     * 
     * @param actionName - The candidate action name
     * @returns Error message string if invalid, otherwise null
     * @protected
     */
    protected validateActionInAgent(actionName: string): string | null {
        const effectiveActions = this.getEffectiveActionsForValidation(this._agentRun!.AgentID);
        const normalizedName = actionName.trim().toLowerCase();

        const exactMatch = effectiveActions.find(a => a.Name.trim().toLowerCase() === normalizedName);
        if (exactMatch) {
            return null;
        }

        const partialMatches = effectiveActions.filter(a =>
            a.Name.trim().toLowerCase().includes(normalizedName)
        );

        if (partialMatches.length === 1) {
            return null;
        } else if (partialMatches.length > 1) {
            return `Ambiguous action '${actionName}' specified. Matches: ${partialMatches.map(a => a.Name).join(', ')}`;
        } else {
            return `No action '${actionName}' found. Available: ${effectiveActions.map(a => a.Name).join(', ')}`;
        }
    }

    /**
     * Helper to validate that a sub-agent name specified in a loop is configured as a child or related agent.
     * 
     * @param subAgentName - The sub-agent name to validate
     * @returns Error message string if invalid, otherwise null
     * @protected
     */
    protected validateSubAgentInAgent(subAgentName: string): string | null {
        const relatedAgents = AIEngine.Instance.AgentRelationships.filter(ar => UUIDsEqual(ar.AgentID, this._agentRun!.AgentID));
        const childAgents = AIEngine.Instance.Agents.filter(a => UUIDsEqual(a.ParentID, this._agentRun!.AgentID));

        let subAgent = relatedAgents.filter(ra => ra.SubAgent?.trim().toLowerCase() === subAgentName.trim().toLowerCase());
        if (subAgent.length === 0) {
            subAgent = relatedAgents.filter(ra => ra.SubAgent?.trim().toLowerCase().includes(subAgentName.trim().toLowerCase() || ''));
            if (subAgent.length > 1) {
                return `Ambiguous sub-agent '${subAgentName}' specified`;
            } else if (subAgent.length === 0) {
                let childAgent = childAgents.filter(ca => ca.Name?.trim().toLowerCase() === subAgentName.trim().toLowerCase());
                if (childAgent.length === 0) {
                    childAgent = childAgents.filter(ca => ca.Name?.trim().toLowerCase().includes(subAgentName.trim().toLowerCase() || ''));
                    if (childAgent.length > 1) {
                        return `Ambiguous child agent '${subAgentName}' specified`;
                    } else if (childAgent.length === 0) {
                        return `No child agent '${subAgentName}' found`;
                    }
                }
            }
        }

        return null;
    }

    /**
     * extracts a collection array from the payload at the specified path (removing payload prefix if present).
     * 
     * @param payload - The payload to query
     * @param path - The dot-notation collection path
     * @returns The extracted array or null if not found or not an array
     * @protected
     */
    protected getCollectionFromPayload(payload: any, path: string): any[] | null {
        const cleanPath = path.toLowerCase().startsWith('payload.')
            ? path.substring(8)
            : path;

        const value = this.getValueFromPath(payload, cleanPath);
        return Array.isArray(value) ? value : null;
    }

    /**
     * Creates a step entity in the database to track the overall ForEach loop execution.
     * 
     * @param forEach - The loop configuration
     * @param collection - The list of items being processed
     * @param payload - Current payload state
     * @param params - Execution parameters
     * @returns A promise resolving to the saved MJAIAgentRunStepEntityExtended record
     * @protected
     */
    protected async createForEachLoopStep(
        forEach: ForEachOperation,
        collection: any[],
        payload: any,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        const stepEntity = await this.createStepEntity({
            stepType: 'ForEach',
            stepName: `ForEach: ${forEach.collectionPath} (${collection.length} items)`,
            contextUser: params.contextUser,
            inputData: { forEach, count: collection.length },
            payloadAtStart: payload
        });
        return stepEntity;
    }

    /**
     * Executes all iterations of a ForEach loop concurrently or sequentially depending on loop configuration.
     * 
     * @param forEach - The loop configuration
     * @param collection - Array of loop items
     * @param initialPayload - Payload state at loop start
     * @param parentStepId - Database step ID of the ForEach parent step
     * @param params - Execution parameters
     * @param config - Agent configuration
     * @returns Object containing iteration results, errors, and final payload
     * @protected
     */
    protected async executeForEachIterations(
        forEach: ForEachOperation,
        collection: any[],
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any }> {
        const executionMode = forEach.executionMode || 'sequential';

        if (executionMode === 'parallel') {
            return this.executeForEachIterationsParallel(forEach, collection, initialPayload, parentStepId, params, config);
        } else {
            return this.executeForEachIterationsSequential(forEach, collection, initialPayload, parentStepId, params, config);
        }
    }

    /**
     * Executes ForEach loop iterations sequentially.
     * 
     * @param forEach - The loop configuration
     * @param collection - Array of loop items
     * @param initialPayload - Payload state at loop start
     * @param parentStepId - Parent database step ID
     * @param params - Execution parameters
     * @param config - Agent configuration
     * @returns Iteration results, errors, and final payload
     * @protected
     */
    protected async executeForEachIterationsSequential(
        forEach: ForEachOperation,
        collection: any[],
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any }> {
        let currentPayload = initialPayload;
        const maxIterations = forEach.maxIterations ?? 1000;
        const results: Array<BaseAgentNextStep> = [];
        const errors = [];

        for (let i = 0; i < Math.min(collection.length, maxIterations); i++) {
            if (i > 0 && forEach.delayBetweenIterationsMs) {
                await new Promise(resolve => setTimeout(resolve, forEach.delayBetweenIterationsMs));
            }

            const iterResult = await this.executeSingleForEachIteration(
                forEach,
                collection[i],
                i,
                currentPayload,
                parentStepId,
                params,
                config
            );

            if (iterResult.error) {
                errors.push(iterResult.error);
                if (!forEach.continueOnError) break;
            } else {
                results.push(iterResult.result);
                currentPayload = iterResult.payload;
            }
        }

        return { results, errors, finalPayload: currentPayload };
    }

    /**
     * Executes ForEach iterations in parallel concurrency batches.
     * 
     * @param forEach - The loop configuration
     * @param collection - Array of loop items
     * @param initialPayload - Payload state at loop start
     * @param parentStepId - Parent database step ID
     * @param params - Execution parameters
     * @param config - Agent configuration
     * @returns Iteration results, errors, and final payload
     * @protected
     */
    protected async executeForEachIterationsParallel(
        forEach: ForEachOperation,
        collection: any[],
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any }> {
        const maxIterations = forEach.maxIterations ?? 1000;
        const maxConcurrency = forEach.maxConcurrency ?? 10;
        const itemsToProcess = Math.min(collection.length, maxIterations);

        const batches = this.createBatches(collection.slice(0, itemsToProcess), maxConcurrency);
        const allResults: Array<{ index: number; result?: BaseAgentNextStep; error?: any; payload?: any }> = [];

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            const batchPromises = batch.map(({ item, index }) =>
                this.executeSingleForEachIteration(
                    forEach,
                    item,
                    index,
                    initialPayload,
                    parentStepId,
                    params,
                    config
                ).then(iterResult => ({
                    index,
                    result: iterResult.result,
                    error: iterResult.error,
                    payload: iterResult.payload
                }))
            );

            const batchResults = await Promise.all(batchPromises);
            allResults.push(...batchResults);

            if (forEach.delayBetweenIterationsMs && batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, forEach.delayBetweenIterationsMs));
            }

            const hasFailure = batchResults.some(r => r.error);
            if (hasFailure && !forEach.continueOnError) {
                break;
            }
        }

        allResults.sort((a, b) => a.index - b.index);
        return this.applyForEachResultsSequentially(allResults, initialPayload, forEach.continueOnError || false);
    }

    /**
     * Splits an array of items into separate chunks for parallel concurrency.
     * 
     * @param items - The full list of items
     * @param maxConcurrency - The maximum batch size
     * @returns Array of batches containing item and its index
     * @protected
     */
    protected createBatches<T>(
        items: T[],
        maxConcurrency: number
    ): Array<Array<{ item: T; index: number }>> {
        const batches: Array<Array<{ item: T; index: number }>> = [];

        for (let i = 0; i < items.length; i += maxConcurrency) {
            const batch = items.slice(i, i + maxConcurrency).map((item, batchOffset) => ({
                item,
                index: i + batchOffset
            }));
            batches.push(batch);
        }

        return batches;
    }

    /**
     * Processes parallel batch results in original sequence to apply changes to the active payload orderly.
     * 
     * @param sortedResults - Iteration results sorted by original index
     * @param initialPayload - Payload state at loop start
     * @param continueOnError - Whether to proceed with other changes on failure
     * @returns Combined loop result summary
     * @protected
     */
    protected applyForEachResultsSequentially(
        sortedResults: Array<{ index: number; result?: BaseAgentNextStep; error?: any; payload?: any }>,
        initialPayload: any,
        continueOnError: boolean
    ): { results: BaseAgentNextStep[], errors: any[], finalPayload: any } {
        let currentPayload = initialPayload;
        const results: BaseAgentNextStep[] = [];
        const errors: any[] = [];

        for (const { result, error, payload } of sortedResults) {
            if (error) {
                errors.push(error);
                if (!continueOnError) {
                    break;
                }
            } else if (result) {
                results.push(result);
                currentPayload = payload || currentPayload;
            }
        }

        return { results, errors, finalPayload: currentPayload };
    }

    /**
     * Runs a single iteration of a ForEach loop, calling either action or sub-agent routines.
     * 
     * @param forEach - The loop configuration
     * @param item - The specific iteration item
     * @param index - The iteration index
     * @param currentPayload - The current active payload
     * @param parentStepId - Database step ID of the loop parent step
     * @param params - Execution parameters
     * @param config - Agent configuration
     * @returns Object containing iteration payload update, error details, or step result
     * @protected
     */
    protected async executeSingleForEachIteration(
        forEach: ForEachOperation,
        item: any,
        index: number,
        currentPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ payload?: any, error?: any, result?: BaseAgentNextStep }> {
        try {
            const beforeHook = this.AgentTypeInstance.BeforeLoopIteration?.(
                { item, itemVariable: forEach.itemVariable, index, payload: currentPayload, loopType: 'ForEach', actionParams: forEach.action?.params || {} }
            );
            let resolvedParams = beforeHook?.actionParams || forEach.action?.params || {};

            let result;
            if (forEach.action) {
                const matchedAction = this.findAgentActionForLoop(forEach.action.name, params.agent.ID, params.agent.Name, params);

                const context = {
                    item,
                    index,
                    payload: currentPayload,
                    data: params.data
                };

                resolvedParams = this.resolveTemplates(resolvedParams, context, forEach.itemVariable);
                const resolvedAction = {
                    name: matchedAction.Action,
                    params: resolvedParams
                };
                const actionStep = { step: 'Actions' as const, actions: [resolvedAction], newPayload: currentPayload, previousPayload: currentPayload, terminate: false };
                result = await this.executeActionsStep(params, actionStep as BaseAgentNextStep, parentStepId, false);
            } else if (forEach.subAgent) {
                const subAgentStep = { step: 'Sub-Agent' as const, subAgent: forEach.subAgent, newPayload: currentPayload, previousPayload: currentPayload };
                result = await this.processSubAgentStep(params, subAgentStep as BaseAgentNextStep, parentStepId, item);
                result.priorStepResult = this.formatSubAgentResultAsMarkdown(
                    forEach.subAgent.name,
                    result as unknown as ExecuteAgentResult
                );
            } else {
                throw new Error('ForEach missing action/subAgent');
            }

            const iterPayload = result.newPayload || currentPayload;
            const afterHook = this.AgentTypeInstance.AfterLoopIteration?.(
                { currentPayload: iterPayload, item, itemVariable: forEach.itemVariable, index, loopContext: { actionOutputMapping: forEach.action?.outputMapping } }
            );

            return { payload: afterHook || iterPayload, result };

        } catch (error) {
            return { error: { index, item, message: (error as Error).message } };
        }
    }

    /**
     * Finalizes the overall ForEach database step record and formats results summary.
     * 
     * @param forEach - The loop configuration
     * @param loopStepEntity - The loop database tracking step
     * @param loopResults - The combined results from all iterations
     * @param previousDecision - The loop decision containing details
     * @param params - Execution parameters
     * @returns A promise resolving to a retry instruction step
     * @protected
     */
    protected async completeForEachLoop(
        forEach: ForEachOperation,
        loopStepEntity: MJAIAgentRunStepEntityExtended,
        loopResults: { results: BaseAgentNextStep[], errors: any[], finalPayload: any },
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        loopStepEntity.PayloadAtEnd = this.serializePayloadAtEnd(loopResults.finalPayload);
        await this.finalizeStepEntity(loopStepEntity,
                                      loopResults.errors.length === 0,
                                      loopResults.errors.join('\n\n'),
                                      loopResults);

        if (this.AgentTypeInstance.InjectLoopResultsAsMessage) {
            this.injectLoopResultsMessage('ForEach', forEach.collectionPath, loopResults.results, loopResults.errors, params, forEach.action?.name);
        }

        return {
            step: 'Retry',
            retryInstructions: `Completed ForEach loop request using collection at '${forEach.collectionPath}'`,
            terminate: false,
            newPayload: loopResults.finalPayload,
            previousPayload: previousDecision.previousPayload
        };
    }

    /**
     * Helper to format and push loop completion summaries into the conversation messages list.
     * 
     * @param loopType - The loop type ('ForEach' or 'While')
     * @param collectionOrCondition - The target path or expression condition
     * @param results - Iteration step decisions
     * @param errors - List of caught iteration errors
     * @param params - Execution parameters
     * @param actionName - The target action executed in the loop body
     * @protected
     */
    protected injectLoopResultsMessage(
        loopType: 'ForEach' | 'While',
        collectionOrCondition: string,
        results: BaseAgentNextStep[],
        errors: unknown[],
        params: ExecuteAgentParams,
        actionName?: string
    ): void {
        const label = loopType === 'ForEach' ? 'Collection' : 'Condition';
        const content = `## Loop Completed\n**Type:** ${loopType}\n**${label}:** ${collectionOrCondition}\n` +
                     `**Processed:** ${results.length}, **Errors:** ${errors.length}\n\n` +
                     this.formatLoopResultsAsMarkdown(results, errors);

        const metadata = this.resolveLoopExpirationMetadata(params, actionName);

        params.conversationMessages.push({
            role: 'user',
            content,
            metadata
        } as AgentChatMessage);
    }

    /**
     * Formats loop iteration outputs and sub-agent payloads to markdown.
     * 
     * @param results - Iteration results
     * @param errors - Caught errors
     * @returns Markdown text block
     * @protected
     */
    protected formatLoopResultsAsMarkdown(results: BaseAgentNextStep[], errors: unknown[]): string {
        const lines: string[] = [];

        for (let i = 0; i < results.length; i++) {
            const iterResult = results[i].priorStepResult;

            if (Array.isArray(iterResult)) {
                lines.push(`### Iteration ${i + 1}`);
                lines.push(this.formatActionResultsAsMarkdown(iterResult));
            } else if (iterResult != null) {
                lines.push(`### Iteration ${i + 1}`);
                const text = typeof iterResult === 'string'
                    ? iterResult
                    : JSON.stringify(iterResult);
                lines.push(text);
            }
        }

        if (errors.length > 0) {
            lines.push(`### Errors`);
            for (const err of errors) {
                const errMsg = typeof err === 'string' ? err : (err as Record<string, unknown>)?.message || JSON.stringify(err);
                lines.push(`• ✗ ${errMsg}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Resolves the compaction turn configuration and expiration modes for loops.
     * 
     * @param params - Execution parameters
     * @param actionName - Optional action name
     * @returns Conversation metadata block
     * @protected
     */
    protected resolveLoopExpirationMetadata(
        params: ExecuteAgentParams,
        actionName?: string
    ): AgentChatMessageMetadata {
        const baseMetadata: AgentChatMessageMetadata = {
            turnAdded: this._promptTurnCount,
            messageType: 'loop-result'
        };

        if (params.messageExpirationOverride) {
            const override = params.messageExpirationOverride;
            if (override.expirationTurns != null && override.expirationMode !== 'None') {
                return {
                    ...baseMetadata,
                    expirationTurns: override.expirationTurns,
                    expirationMode: override.expirationMode || 'Remove',
                    compactMode: override.compactMode,
                    compactLength: override.compactLength,
                    compactPromptId: override.compactPromptId
                };
            }
        }

        if (actionName) {
            const agentActions = AIEngine.Instance.AgentActions.filter(
                aa => UUIDsEqual(aa.AgentID, params.agent.ID)
            );
            const effectiveActions = this._effectiveActions.length > 0
                ? this._effectiveActions
                : ActionEngineServer.Instance.Actions.filter(a =>
                    agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID))
                );
            const matchedAction = effectiveActions.find(
                a => a.Name.trim().toLowerCase() === actionName.trim().toLowerCase()
            );

            if (matchedAction) {
                const agentAction = agentActions.find(aa => UUIDsEqual(aa.ActionID, matchedAction.ID));
                if (agentAction?.ResultExpirationTurns != null && agentAction.ResultExpirationMode !== 'None') {
                    return {
                        ...baseMetadata,
                        expirationTurns: agentAction.ResultExpirationTurns,
                        expirationMode: agentAction.ResultExpirationMode as 'Remove' | 'Compact',
                        compactMode: agentAction.CompactMode as 'First N Chars' | 'AI Summary' | undefined,
                        compactLength: agentAction.CompactLength ?? undefined,
                        compactPromptId: agentAction.CompactPromptID ?? undefined
                    };
                }
            }
        }

        return {
            ...baseMetadata,
            expirationTurns: 3,
            expirationMode: 'Remove'
        };
    }

    /**
     * Resolves loops action names to actual action entities using exact or fuzzy search.
     * 
     * @param actionName - Candidate action name
     * @param agentId - Active agent ID
     * @param agentName - Active agent name
     * @param params - Execution parameters
     * @returns Resolved action name wrapper object
     * @protected
     */
    protected findAgentActionForLoop(
        actionName: string,
        agentId: string,
        agentName: string,
        params: ExecuteAgentParams
    ): { Action: string } {
        const effectiveActions = this.getEffectiveActionsForValidation(agentId);
        const normalizedName = actionName.trim().toLowerCase();

        let matchedAction = effectiveActions.find(a =>
            a.Name.trim().toLowerCase() === normalizedName
        );

        if (!matchedAction) {
            const containsMatches = effectiveActions.filter(a =>
                a.Name.trim().toLowerCase().includes(normalizedName)
            );

            if (containsMatches.length === 1) {
                matchedAction = containsMatches[0];
                this.logStatus(`Action fuzzy matched: '${actionName}' → '${matchedAction.Name}'`, true, params);
            } else if (containsMatches.length > 1) {
                throw new Error(`Ambiguous action '${actionName}'. Matches: ${containsMatches.map(a => a.Name).join(', ')}`);
            } else {
                throw new Error(`Action '${actionName}' not found for agent '${agentName}'. Available: ${effectiveActions.map(a => a.Name).join(', ')}`);
            }
        }

        return { Action: matchedAction.Name };
    }

    /**
     * Builds a standardized failure decision step containing error message.
     * 
     * @param errorMessage - Error description
     * @param previousDecision - Previous decision state
     * @returns Standard failure step decision
     * @protected
     */
    protected createFailedStep(errorMessage: string, previousDecision: BaseAgentNextStep): BaseAgentNextStep {
        return {
            step: 'Failed',
            terminate: false,
            errorMessage,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload
        };
    }

    /**
     * Orchestrates the execution of a While loop until the expression condition fails.
     * 
     * @param params - Execution parameters
     * @param config - Agent configurations
     * @param previousDecision - Next decision containing condition info
     * @returns Next decision step outcome
     * @protected
     */
    protected async executeWhileLoop(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const whileOp = previousDecision.while as WhileOperation;
        if (!whileOp) {
            return this.createFailedStep('While configuration missing', previousDecision);
        }

        const validationMessage = this.validateWhileOperation(whileOp);
        if (validationMessage) {
            return this.createFailedStep(`While configuration invalid: ${validationMessage}`, previousDecision);
        }

        const currentPayload = previousDecision.newPayload || previousDecision.previousPayload;
        const loopStepEntity = await this.createWhileLoopStep(whileOp, currentPayload, params);
        const loopResults = await this.executeWhileIterations(whileOp, currentPayload, loopStepEntity.ID, params, config);

        return this.completeWhileLoop(whileOp, loopStepEntity, loopResults, previousDecision, params);
    }

    /**
     * Creates a step entity in the database to track While loop executions.
     * 
     * @param whileOp - While loop configuration
     * @param payload - Current payload
     * @param params - Execution parameters
     * @returns Promise resolving to database step record
     * @protected
     */
    protected async createWhileLoopStep(
        whileOp: WhileOperation,
        payload: any,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        const stepEntity = await this.createStepEntity({
            stepType: 'While',
            stepName: `While: ${whileOp.condition}`,
            contextUser: params.contextUser,
            inputData: { while: whileOp },
            payloadAtStart: payload
        });
        return stepEntity;
    }

    /**
     * Evaluates While conditions and executes iterations sequentially.
     * 
     * @param whileOp - While loop configuration
     * @param initialPayload - Payload state at loop start
     * @param parentStepId - Database step ID of While parent step
     * @param params - Execution parameters
     * @param config - Agent configurations
     * @returns Iteration results, errors, final payload and total iterations executed
     * @protected
     */
    protected async executeWhileIterations(
        whileOp: WhileOperation,
        initialPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ results: BaseAgentNextStep[], errors: any[], finalPayload: any, iterations: number }> {
        let currentPayload = initialPayload;
        const maxIterations = whileOp.maxIterations ?? 100;
        const results: BaseAgentNextStep[] = [];
        const errors = [];
        let iterationCount = 0;

        const evaluator = new SafeExpressionEvaluator();

        while (iterationCount < maxIterations) {
            if (iterationCount > 0 && whileOp.delayBetweenIterationsMs) {
                await new Promise(resolve => setTimeout(resolve, whileOp.delayBetweenIterationsMs));
            }

            const evalResult = evaluator.evaluate(whileOp.condition, { payload: currentPayload, results, errors });
            if (!evalResult.success || !evalResult.value) {
                break;
            }

            const attemptContext = { attemptNumber: iterationCount + 1, totalAttempts: iterationCount };
            const iterResult = await this.executeSingleWhileIteration(
                whileOp,
                attemptContext,
                iterationCount,
                currentPayload,
                parentStepId,
                params,
                config
            );

            if (iterResult.error) {
                errors.push(iterResult.error);
                if (!whileOp.continueOnError) break;
            } else {
                results.push(iterResult.result);
                currentPayload = iterResult.payload;
            }

            iterationCount++;
        }

        return { results, errors, finalPayload: currentPayload, iterations: iterationCount };
    }

    /**
     * Runs a single iteration of a While loop.
     * 
     * @param whileOp - While loop configuration
     * @param attemptContext - Object containing attempt counts
     * @param index - Loop index counter
     * @param currentPayload - Current active payload
     * @param parentStepId - Parent database step ID
     * @param params - Execution parameters
     * @param config - Agent configurations
     * @returns Payload update and step results
     * @protected
     */
    protected async executeSingleWhileIteration(
        whileOp: WhileOperation,
        attemptContext: any,
        index: number,
        currentPayload: any,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ payload?: any, error?: any, result?: BaseAgentNextStep }> {
        try {
            const beforeHook = this.AgentTypeInstance.BeforeLoopIteration?.(
                { item: attemptContext, index, itemVariable: whileOp.itemVariable, payload: currentPayload, loopType: 'While', actionParams: whileOp.action?.params || {} }
            );
            let resolvedParams = beforeHook?.actionParams || whileOp.action?.params || {};

            let result;
            if (whileOp.action) {
                const matchedAction = this.findAgentActionForLoop(whileOp.action.name, params.agent.ID, params.agent.Name, params);

                const context = {
                    item: attemptContext,
                    index,
                    payload: currentPayload,
                    data: params.data
                };
                
                resolvedParams = this.resolveTemplates(resolvedParams, context, whileOp.itemVariable || 'item');

                const resolvedAction = {
                    name: matchedAction.Action,
                    params: resolvedParams
                };
                const actionStep = { step: 'Actions' as const, actions: [resolvedAction], newPayload: currentPayload, previousPayload: currentPayload, terminate: false };
                result = await this.executeActionsStep(params, actionStep as BaseAgentNextStep, parentStepId, false);
            } else if (whileOp.subAgent) {
                const subAgentStep = { step: 'Sub-Agent' as const, subAgent: whileOp.subAgent, newPayload: currentPayload, previousPayload: currentPayload };
                result = await this.processSubAgentStep(params, subAgentStep as BaseAgentNextStep, parentStepId, attemptContext);
                result.priorStepResult = this.formatSubAgentResultAsMarkdown(
                    whileOp.subAgent.name,
                    result as unknown as ExecuteAgentResult
                );
            } else {
                throw new Error('While missing action/subAgent');
            }

            const iterPayload = result.newPayload || currentPayload;
            const afterHook = this.AgentTypeInstance.AfterLoopIteration?.(
                { currentPayload: iterPayload, item: attemptContext, itemVariable: whileOp.itemVariable, index, loopContext: { actionOutputMapping: whileOp.action?.outputMapping } }
            );

            return { payload: afterHook || iterPayload, result };

        } catch (error) {
            return { error: { index, item: attemptContext, message: (error as Error).message } };
        }
    }

    /**
     * Finalizes the database step tracking a While loop execution.
     * 
     * @param whileOp - While loop configuration
     * @param loopStepEntity - The loop database tracking step
     * @param loopResults - The combined results from all While iterations
     * @param previousDecision - Next decision details
     * @param params - Execution parameters
     * @returns Next decision step outcome
     * @protected
     */
    protected async completeWhileLoop(
        whileOp: WhileOperation,
        loopStepEntity: MJAIAgentRunStepEntityExtended,
        loopResults: { results: BaseAgentNextStep[], errors: any[], finalPayload: any, iterations: number },
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        loopStepEntity.PayloadAtEnd = this.serializePayloadAtEnd(loopResults.finalPayload);

        await this.finalizeStepEntity(loopStepEntity,
                                      loopResults.errors.length === 0,
                                      loopResults.errors.join('\n\n'),
                                      loopResults);

        if (this.AgentTypeInstance.InjectLoopResultsAsMessage) {
            this.injectLoopResultsMessage('While', whileOp.condition, loopResults.results, loopResults.errors, params, whileOp.action?.name);
        }

        return {
            step: 'Retry',
            retryInstructions: `Completed While loop request using condition '${whileOp.condition}' after ${loopResults.iterations} iteration(s)`,
            terminate: false,
            newPayload: loopResults.finalPayload,
            previousPayload: previousDecision.previousPayload
        };
    }

    /**
     * Dispatches a sub-agent execution by wrapping configuration parameters and invoking an AgentRunner instance.
     * 
     * @param params - Execution run parameters
     * @param subAgentRequest - Sub-agent execution request details
     * @param subAgent - Sub-agent entity to run
     * @param stepEntity - Database step entity for logging
     * @param payload - Optional initial payload state to supply to sub-agent
     * @param contextMessage - Context history message to prepend
     * @param stepCount - Execution step count
     * @returns Promise resolving to execution results of the sub-agent
     * @protected
     */
    protected async ExecuteSubAgent<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
        payload?: SR,
        contextMessage?: ChatMessage,
        stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        try {
            this.logStatus(`🤖 Executing sub-agent '${subAgentRequest.name}'`, true, params);

            const runner = new AgentRunner(params.provider || this._activeProvider);
            const subAgentMessages = this.prepareSubAgentMessages(
                params,
                subAgentRequest,
                subAgent,
                contextMessage
            );
            
            this.logStatus(`📨 Sub-agent message: "${subAgentRequest.message}"`, true, params);
            if (subAgentRequest.templateParameters) {
                this.logStatus(`📎 Template parameters: ${JSON.stringify(subAgentRequest.templateParameters)}`, true, params);
            }
            if (params.effortLevel !== undefined && params.effortLevel !== null) {
                this.logStatus(`🎯 Propagating effort level ${params.effortLevel} to sub-agent '${subAgentRequest.name}'`, true, params);
            }

            const parentStepCountsToPass = [...this._parentStepCounts, stepCount + 1];
            const subAgentActionChanges = this.filterActionChangesForSubAgent(params.actionChanges);
            const subAgentContext = subAgentRequest.context !== undefined ? subAgentRequest.context : params.context;

            const result = await runner.RunAgent<SC, SR>({
                agent: subAgent,
                conversationMessages: subAgentMessages,
                contextUser: params.contextUser,
                cancellationToken: params.cancellationToken,
                onProgress: params.onProgress,
                onStreaming: params.onStreaming,
                parentAgentHierarchy: this._agentHierarchy,
                parentDepth: this._depth,
                parentStepCounts: parentStepCountsToPass,
                parentRun: this._agentRun,
                payload: payload,
                configurationId: params.configurationId,
                effortLevel: params.effortLevel,
                apiKeys: params.apiKeys,
                data: {
                    ...params.data,
                    ...subAgentRequest.templateParameters,
                },
                context: subAgentContext,
                verbose: params.verbose,
                actionChanges: subAgentActionChanges,
                PrimaryScopeEntityName: params.PrimaryScopeEntityName,
                PrimaryScopeRecordID: params.PrimaryScopeRecordID,
                SecondaryScopes: params.SecondaryScopes,
                onAgentRunCreated: async (agentRunId: string) => {
                    stepEntity.TargetLogID = agentRunId;
                    await stepEntity.Save();
                }
            });
            
            if (result.success) {
                this.logStatus(`✅ Sub-agent '${subAgentRequest.name}' completed successfully`, true, params);
            } else {
                this.logStatus(`Sub-agent '${subAgentRequest.name}' failed: ${result.agentRun?.ErrorMessage || 'Unknown error'}`);
            }
            
            return result;
        } catch (error) {
            this.logError(error, {
                category: 'SubAgentExecution',
                metadata: {
                    agentName: params.agent.Name,
                    subAgentName: subAgentRequest.name,
                    message: subAgentRequest.message
                }
            });
            throw new Error(`Error executing sub-agent: ${(error as Error).message}`);
        }
    }

    /**
     * Resolves and filters parent conversation messages depending on configured relationship MessageMode.
     * 
     * @param params - Execution parameters
     * @param subAgentRequest - Request details
     * @param subAgent - Target sub-agent record
     * @param contextMessage - Context message to include
     * @returns Array of chat messages
     * @protected
     */
    protected prepareSubAgentMessages(
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        contextMessage?: ChatMessage
    ): ChatMessage[] {
        const engine = AIEngine.Instance;
        let messages: ChatMessage[] = [];

        const relationship = engine.AgentRelationships.find(
            r => UUIDsEqual(r.AgentID, params.agent.ID) && UUIDsEqual(r.SubAgentID, subAgent.ID)
        );

        const messageMode = relationship?.MessageMode || subAgent.MessageMode || 'None';
        const maxMessages = relationship?.MaxMessages || subAgent.MaxMessages || null;

        switch (messageMode) {
            case 'None':
                break;
            case 'All':
                messages = [...params.conversationMessages];
                break;
            case 'Latest':
                if (maxMessages && maxMessages > 0) {
                    messages = params.conversationMessages.slice(-maxMessages);
                } else {
                    messages = [...params.conversationMessages];
                }
                break;
            case 'Bookend':
                if (maxMessages && maxMessages > 2 && params.conversationMessages.length > maxMessages) {
                    const firstTwo = params.conversationMessages.slice(0, 2);
                    const remaining = params.conversationMessages.slice(-(maxMessages - 2));
                    const omittedCount = params.conversationMessages.length - maxMessages;

                    messages = [
                        ...firstTwo,
                        {
                            role: 'system',
                            content: `[${omittedCount} messages omitted for context management]`
                        },
                        ...remaining
                    ];
                } else {
                    messages = [...params.conversationMessages];
                }
                break;
        }

        if (contextMessage) {
            messages.push(contextMessage);
        }

        if (subAgentRequest.message) {
            messages.push({
                role: 'user',
                content: subAgentRequest.message
            });
        }

        return messages;
    }

    /**
     * Determines and filters down runtime action changes according to sub-agent inheritance scopes.
     * 
     * @param actionChanges - Original action changes array
     * @returns Filtered action changes array
     * @protected
     */
    protected filterActionChangesForSubAgent(
        actionChanges: any[] | undefined
    ): any[] | undefined {
        if (!actionChanges?.length) {
            return undefined;
        }

        const filtered: any[] = [];

        for (const change of actionChanges) {
            switch (change.scope) {
                case 'root':
                    continue;
                case 'global':
                    filtered.push(change);
                    break;
                case 'all-subagents':
                    filtered.push({ ...change, scope: 'global' });
                    break;
                case 'specific':
                    filtered.push(change);
                    break;
            }
        }

        return filtered.length > 0 ? filtered : undefined;
    }

    /**
     * Executes a sub-agent with direct parent/child scope paths coupling.
     * 
     * @param params - Execution parameters
     * @param previousDecision - Next step decision details
     * @param parentStepId - Database step ID of parent step
     * @param subAgentPayloadOverride - Optional direct payload block to supply
     * @param stepCount - Number of executed steps
     * @returns Standard step decision outcome
     * @protected
     */
    protected async executeChildSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: any,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision!.subAgent as AgentSubAgentRequest<SC>;
        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before sub-agent execution');
        }

        params.onProgress?.({
            step: 'subagent_execution',
            message: this.formatHierarchicalMessage(`Delegating to ${subAgentRequest.name} agent`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                reason: subAgentRequest.message,
                stepCount: stepCount + 1,
                hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
            }
        });
        
        params.conversationMessages.push({
            role: 'assistant',
            content: `I'm delegating this task to the "${subAgentRequest.name}" agent.\n\nReason: ${subAgentRequest.message}`
        });
        
        const inputData = {
            agentName: params.agent.Name,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            conversationMessages: params.conversationMessages,
            parentAgentHierarchy: this._agentHierarchy
        };
        
        const subAgentEntity = AIEngine.Instance.Agents.find(a => a.Name === subAgentRequest.name &&
                                                            UUIDsEqual(a.ParentID, params.agent.ID));
        if (!subAgentEntity) {
            throw new Error(`Sub-agent '${subAgentRequest.name}' not found`);
        }
        const stepEntity = await this.createStepEntity({ stepType: 'Sub-Agent', stepName: `Execute Sub-Agent: ${subAgentRequest.name}`, contextUser: params.contextUser, targetId: subAgentEntity.ID, inputData, payloadAtStart: previousDecision!.newPayload, parentId: parentStepId });
        
        this.incrementExecutionCount(subAgentEntity.ID);
        
        try {
            const { downstreamPaths, upstreamPaths } = this.computeUpstreamDownstreamPaths(params, subAgentEntity, subAgentRequest);
            let scopedPayload = null;
            if (!subAgentPayloadOverride) {
                scopedPayload = await this.computeChildSubAgentPayload<SC, SR>(params, subAgentEntity, downstreamPaths, subAgentRequest, previousDecision);
            } else {
                scopedPayload = subAgentPayloadOverride;
            }

            stepEntity.PayloadAtStart = this.serializePayloadAtStart(previousDecision!.newPayload);

            const subAgentResult = await this.ExecuteSubAgent<SC, SR>(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                scopedPayload as SR,
                undefined,
                stepCount
            );
            
            let mergedPayload = previousDecision!.newPayload;
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;
            if (subAgentResult.success) {
                let resultPayloadForMerge = subAgentResult.payload;
                if (subAgentEntity.PayloadScope) {
                    resultPayloadForMerge = this._payloadManager.reversePayloadScope(
                        subAgentResult.payload,
                        subAgentEntity.PayloadScope
                    );
                }
                
                const mergeResult = this._payloadManager.mergeUpstreamPayload(
                    subAgentRequest.name,
                    previousDecision!.newPayload,
                    resultPayloadForMerge,
                    upstreamPaths,
                    params.verbose === true || IsVerboseLoggingEnabled()
                );
                
                mergedPayload = mergeResult.result;                
                
                const mergeChangeRequest: AgentPayloadChangeRequest<any> = {
                    newElements: {},
                    updateElements: {},
                    removeElements: {}
                };
                
                const originalKeys = Object.keys(previousDecision!.newPayload || {});
                const mergedKeys = Object.keys(mergedPayload || {});
                
                for (const key of mergedKeys) {
                    if (!(key in (previousDecision!.newPayload || {}))) {
                        mergeChangeRequest.newElements![key] = mergedPayload[key];
                    } else if (!_.isEqual(previousDecision!.newPayload[key], mergedPayload[key])) {
                        mergeChangeRequest.updateElements![key] = mergedPayload[key];
                    }
                }
                
                for (const key of originalKeys) {
                    if (!(key in (mergedPayload || {}))) {
                        mergeChangeRequest.removeElements![key] = '_DELETE_';
                    }
                }
                
                if (Object.keys(mergeChangeRequest.newElements!).length > 0 || 
                    Object.keys(mergeChangeRequest.updateElements!).length > 0 || 
                    Object.keys(mergeChangeRequest.removeElements!).length > 0) {
                    
                    const mergeAnalysis = this._payloadManager.applyAgentChangeRequest<SR>(
                        previousDecision!.previousPayload,
                        mergeChangeRequest as AgentPayloadChangeRequest<SR>,
                        {
                            validateChanges: false,
                            logChanges: true,
                            analyzeChanges: true,
                            generateDiff: true,
                            agentName: `${subAgentRequest.name} (upstream merge)`,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );
                    
                    currentStepPayloadChangeResult = this.buildPayloadChangeResultSummary(mergeAnalysis);
                    
                    if (mergeResult.blockedOperations && mergeResult.blockedOperations.length > 0) {
                        if (!currentStepPayloadChangeResult.payloadValidation) {
                            currentStepPayloadChangeResult.payloadValidation = {};
                        }
                        currentStepPayloadChangeResult.payloadValidation.upstreamMergeViolations = {
                            subAgentName: subAgentRequest.name,
                            attemptedOperations: mergeResult.blockedOperations,
                            authorizedPaths: upstreamPaths,
                            timestamp: new Date().toISOString()
                        };
                    }
                    
                    if (mergeAnalysis.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Sub-agent merge warnings: ${mergeAnalysis.warnings.join('; ')}`);
                    }
                }
            } else {
                const msg = `Sub-agent '${subAgentRequest.name}' execution failed: ${subAgentResult.agentRun?.ErrorMessage || 'Unknown error'}`;
                LogError(msg);
                stepEntity.Success = false;
                stepEntity.ErrorMessage = msg;
            }

            if (subAgentResult.agentRun?.ID) {
                stepEntity.TargetLogID = subAgentResult.agentRun.ID;
                stepEntity.SubAgentRun = subAgentResult.agentRun;
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(mergedPayload);
            }
            
            if (params.cancellationToken?.aborted) {
                await this.finalizeStepEntity(stepEntity, false, 'Cancelled during sub-agent execution');
                throw new Error('Cancelled during sub-agent execution');
            }
            
            this._subAgentRuns.push(subAgentResult);

            if (subAgentResult.mediaOutputs?.length) {
                this._mediaOutputs.push(...subAgentResult.mediaOutputs);
                const refCount = subAgentResult.mediaOutputs.filter(m => m.refId).length;
                if (refCount > 0) {
                    this.logStatus(`📦 Collected ${refCount} media reference(s) from sub-agent '${subAgentRequest.name}'`, true);
                }
            }

            if (subAgentResult.fileOutputs?.length) {
                this._fileOutputs.push(...subAgentResult.fileOutputs);
                this.logStatus(`📄 Collected ${subAgentResult.fileOutputs.length} file output(s) from sub-agent '${subAgentRequest.name}'`, true);
            }

            const shouldTerminate = subAgentRequest.terminateAfter;
            const outputData = {
                subAgentResult: {
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0,
                },
                shouldTerminate: shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
                })
            }; 

            await this.finalizeStepEntity(stepEntity, subAgentResult.success,
                subAgentResult.agentRun?.ErrorMessage, outputData);

            if (subAgentResult.agentRun?.FinalStep === 'Chat') {
                const chatStep: BaseAgentNextStep<SR, SC> = {
                    step: 'Chat',
                    terminate: true,
                    message: subAgentResult.agentRun?.Message || null,
                    previousPayload: previousDecision?.newPayload,
                    newPayload: mergedPayload,
                    responseForm: subAgentResult.responseForm,
                    actionableCommands: subAgentResult.actionableCommands,
                    automaticCommands: subAgentResult.automaticCommands
                };

                return await this.validateChatNextStep(params, chatStep, mergedPayload, this._agentRun!, stepEntity!);
            }
            
            const resultMessage = this.formatSubAgentResultAsMarkdown(subAgentRequest.name, subAgentResult);
            const subAgentMetadata: AgentChatMessageMetadata = {
                turnAdded: this._promptTurnCount,
                messageType: 'sub-agent-result',
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentEntity.ID,
                expirationTurns: 3,
                expirationMode: 'Remove'
            };

            if (params.messageExpirationOverride) {
                const override = params.messageExpirationOverride;
                if (override.expirationTurns != null) {
                    subAgentMetadata.expirationTurns = override.expirationTurns;
                    subAgentMetadata.expirationMode = override.expirationMode || 'Remove';
                    subAgentMetadata.compactMode = override.compactMode;
                    subAgentMetadata.compactLength = override.compactLength;
                    subAgentMetadata.compactPromptId = override.compactPromptId;
                }
            }

            params.conversationMessages.push({
                role: 'user',
                content: resultMessage,
                metadata: subAgentMetadata
            } as AgentChatMessage);

            if (stepEntity) {
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(mergedPayload);
            }

            if (this._agentRun) {
                this._agentRun.FinalPayloadObject = mergedPayload;
            }
            
            return {
                ...subAgentResult,
                step: subAgentResult.success ? 'Success' : 'Failed',
                errorMessage: subAgentResult.success ? undefined : (subAgentResult.agentRun?.ErrorMessage || 'Sub-agent failed with no error message'),
                terminate: shouldTerminate,
                previousPayload: previousDecision?.newPayload,
                newPayload: mergedPayload
            };            
        } catch (error) {
            const payload = stepEntity.PayloadAtEnd
                ? JSON.parse(stepEntity.PayloadAtEnd)
                : (previousDecision?.newPayload || params.payload);

            stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
            await this.finalizeStepEntity(stepEntity, false, (error as Error).message);

            return {
                errorMessage: `Sub-agent execution failed: ${(error as Error).message}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload
            };
        }
    }

    /**
     * Resolves the downstream path configuration string mapping for a child sub-agent.
     * 
     * @param params - Execution parameters
     * @param subAgentEntity - The sub-agent metadata entity
     * @param subAgentRequest - Request details
     * @returns Object containing lists of downstream and upstream paths
     * @protected
     */
    protected computeUpstreamDownstreamPaths<SC = any>(        
        params: ExecuteAgentParams, 
        subAgentEntity: MJAIAgentEntityExtended, 
        subAgentRequest: AgentSubAgentRequest<SC>
    ): { downstreamPaths: string[], upstreamPaths: string[] } {
        let downstreamPaths: string[] = ['*'];
        let upstreamPaths: string[] = ['*'];
        
        try {
            if ((subAgentEntity as any).PayloadDownstreamPaths) {
                downstreamPaths = JSON.parse((subAgentEntity as any).PayloadDownstreamPaths);
            }
            if ((subAgentEntity as any).PayloadUpstreamPaths) {
                upstreamPaths = JSON.parse((subAgentEntity as any).PayloadUpstreamPaths);
            }
        } catch (parseError) {
            this.logError(`Failed to parse payload paths for sub-agent ${subAgentRequest.name}: ${(parseError as Error).message}`, {
                category: 'SubAgentExecution',
                metadata: {
                    agentName: params.agent.Name,
                    subAgentName: subAgentRequest.name,
                    subAgentId: subAgentEntity.ID,
                    downstreamPaths: (subAgentEntity as any).PayloadDownstreamPaths,
                    upstreamPaths: (subAgentEntity as any).PayloadUpstreamPaths
                }
            });
        }

        return { downstreamPaths, upstreamPaths };
    }

    /**
     * Extracts and computes the scoped sub-agent payload based on downstream path restrictions.
     * 
     * @param params - Execution parameters
     * @param subAgentEntity - The sub-agent entity record
     * @param downstreamPaths - Allowed downstream paths
     * @param subAgentRequest - Request details
     * @param previousDecision - Previous decision state
     * @returns Scoped payload object
     * @protected
     */
    protected async computeChildSubAgentPayload<SC = any, SR = any>(
        params: ExecuteAgentParams, 
        subAgentEntity: MJAIAgentEntityExtended,
        downstreamPaths: string[],        
        subAgentRequest: AgentSubAgentRequest<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>
    ): Promise<any> {
        const downstreamPayload = this._payloadManager.extractDownstreamPayload(
            subAgentRequest.name,
            previousDecision!.newPayload,
            downstreamPaths
        );
        
        let scopedPayload = downstreamPayload;
        if (subAgentEntity.PayloadScope) {
            scopedPayload = this._payloadManager.applyPayloadScope(downstreamPayload, subAgentEntity.PayloadScope) as Partial<SR>;
            if (scopedPayload === null) {
                const errorMessage = `Critical: Failed to extract payload scope '${subAgentEntity.PayloadScope}' for sub-agent '${subAgentRequest.name}'. The specified path does not exist in the payload.`;
                this.logError(errorMessage, {
                    category: 'SubAgentExecution',
                    metadata: {
                        agentName: params.agent.Name,
                        subAgentName: subAgentRequest.name,
                        payloadScope: subAgentEntity.PayloadScope,
                        availableKeys: Object.keys(downstreamPayload || {})
                    }
                });
                throw new Error(errorMessage);
            }
        }
        return scopedPayload;
    }

    /**
     * Dispatches a sub-agent request to either child or related execution handlers depending on configuration mapping.
     * 
     * @param params - Execution parameters
     * @param previousDecision - Current decision state
     * @param parentStepId - Database step ID of parent step
     * @param subAgentPayloadOverride - Optional payload overrides
     * @param stepCount - Total steps executed
     * @returns Next step decision outcome
     * @protected
     */
    protected async processSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: any,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision!.subAgent as AgentSubAgentRequest<SC>;
        const name = subAgentRequest?.name;

        if (!name) {
            return {
                step: 'Failed',
                terminate: false,
                errorMessage: 'Sub-agent name is required',
                previousPayload: previousDecision?.newPayload,
                newPayload: previousDecision?.newPayload
            };
        }

        const childAgents = AIEngine.Instance.Agents.filter(a =>
            UUIDsEqual(a.ParentID, params.agent.ID) &&
            a.Status === 'Active'
        );
        const childAgent = childAgents.find(a => a.Name.trim().toLowerCase() === name.trim().toLowerCase());

        if (childAgent) {
            return await this.executeChildSubAgentStep<SC, SR>(params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount);
        }

        const activeRelationships = AIEngine.Instance.AgentRelationships.filter(ar =>
            UUIDsEqual(ar.AgentID, params.agent.ID) &&
            ar.Status === 'Active'
        );

        for (const relationship of activeRelationships) {
            const relatedAgent = AIEngine.Instance.Agents.find(a =>
                UUIDsEqual(a.ID, relationship.SubAgentID) &&
                a.Status === 'Active'
            );

            if (relatedAgent && relatedAgent.Name.trim().toLowerCase() === name.trim().toLowerCase()) {
                return await this.executeRelatedSubAgentStep<SC, SR>(params, previousDecision!, relatedAgent, relationship, parentStepId, subAgentPayloadOverride, stepCount);
            }
        }

        this.logError(`Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'`, {
            agent: params.agent,
            category: 'SubAgentExecution'
        });

        return {
            step: 'Retry',
            terminate: false,
            errorMessage: `Sub-agent '${name}' not found or not active`,
            previousPayload: previousDecision?.newPayload,
            newPayload: previousDecision?.newPayload
        };
    }

    /**
     * Executes related sub-agents communicating through message mapping rather than direct payload inheritance.
     * 
     * @param params - Execution parameters
     * @param previousDecision - Step decision details
     * @param subAgentEntity - The sub-agent entity record
     * @param relationship - Relationship configuration details
     * @param parentStepId - Database step ID of parent step
     * @param subAgentPayloadOverride - Optional payload override
     * @param stepCount - Execution step counter
     * @returns Next decision step outcome
     * @protected
     */
    protected async executeRelatedSubAgentStep<SC = any, SR = any>(
        params: ExecuteAgentParams<SC>,
        previousDecision: BaseAgentNextStep<SR, SC>,
        subAgentEntity: MJAIAgentEntityExtended,
        relationship: MJAIAgentRelationshipEntity,
        parentStepId?: string,
        subAgentPayloadOverride?: SR,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision.subAgent as AgentSubAgentRequest<SC>;

        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before related sub-agent execution');
        }

        params.onProgress?.({
            step: 'subagent_execution',
            percentage: 60,
            message: this.formatHierarchicalMessage(`Delegating to ${subAgentRequest.name} agent`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                reason: subAgentRequest.message,
                relationshipType: 'related',
                stepCount: stepCount + 1,
                hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
            }
        });

        params.conversationMessages.push({
            role: 'assistant',
            content: `I'm delegating this task to the "${subAgentRequest.name}" agent.\n\nReason: ${subAgentRequest.message}`
        });

        const inputData = {
            agentName: params.agent.Name,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            conversationMessages: params.conversationMessages,
            parentAgentHierarchy: this._agentHierarchy,
            relationshipType: 'related'
        };

        const stepEntity = await this.createStepEntity({
            stepType: 'Sub-Agent',
            stepName: `Execute Related Sub-Agent: ${subAgentRequest.name}`,
            contextUser: params.contextUser,
            targetId: subAgentEntity.ID,
            inputData,
            payloadAtStart: previousDecision.newPayload,
            parentId: parentStepId
        });

        this.incrementExecutionCount(subAgentEntity.ID);

        try {
            stepEntity.PayloadAtStart = this.serializePayloadAtStart(previousDecision.newPayload);

            let initialSubAgentPayload: SR | undefined = subAgentPayloadOverride;
            if (!initialSubAgentPayload && relationship.SubAgentInputMapping) {
                const mapped = this.applySubAgentInputMapping(
                    previousDecision.newPayload as unknown as Record<string, unknown>,
                    relationship.SubAgentInputMapping
                );
                if (mapped && Object.keys(mapped).length > 0) {
                    initialSubAgentPayload = mapped as SR;

                    if (params.verbose === true || IsVerboseLoggingEnabled()) {
                        LogStatus(`Related sub-agent '${subAgentRequest.name}' receiving mapped payload: ${JSON.stringify(Object.keys(mapped))}`);
                    }
                }
            }

            let contextPaths: string[] = [];
            if (relationship.SubAgentContextPaths) {
                try {
                    contextPaths = JSON.parse(relationship.SubAgentContextPaths);
                } catch (parseError) {
                    LogError(`Failed to parse SubAgentContextPaths for sub-agent ${subAgentRequest.name}: ${(parseError as Error).message}`);
                }
            }

            const contextMessage = this.prepareRelatedSubAgentContextMessage(
                previousDecision.newPayload as unknown as Record<string, unknown>,
                contextPaths,
                params
            );

            if (contextMessage && (params.verbose === true || IsVerboseLoggingEnabled())) {
                LogStatus(`Related sub-agent '${subAgentRequest.name}' receiving context from paths: ${contextPaths.join(', ')}`);
            }

            const subAgentResult = await this.ExecuteSubAgent<SC, SR>(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                initialSubAgentPayload,
                contextMessage,
                stepCount
            );

            if (subAgentResult.mediaOutputs?.length) {
                this._mediaOutputs.push(...subAgentResult.mediaOutputs);
                const refCount = subAgentResult.mediaOutputs.filter(m => m.refId).length;
                if (refCount > 0) {
                    this.logStatus(`📦 Collected ${refCount} media reference(s) from related sub-agent '${subAgentRequest.name}'`, true);
                }
            }

            if (subAgentResult.fileOutputs?.length) {
                this._fileOutputs.push(...subAgentResult.fileOutputs);
                this.logStatus(`📄 Collected ${subAgentResult.fileOutputs.length} file output(s) from related sub-agent '${subAgentRequest.name}'`, true);
            }

            let mergedPayload = previousDecision.newPayload;
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;

            if (subAgentResult.success && relationship.SubAgentOutputMapping) {
                const payloadChange = this.applySubAgentOutputMapping(
                    subAgentResult.payload as unknown as Record<string, unknown>,
                    previousDecision.newPayload as unknown as Record<string, unknown>,
                    relationship.SubAgentOutputMapping
                );

                if (payloadChange && payloadChange.updateElements) {
                    const mergeResult = this._payloadManager.applyAgentChangeRequest<SR>(
                        previousDecision.newPayload,
                        payloadChange as AgentPayloadChangeRequest<SR>,
                        {
                            validateChanges: true,
                            logChanges: true,
                            analyzeChanges: true,
                            generateDiff: true,
                            agentName: `${subAgentRequest.name} (related agent mapping)`,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );

                    mergedPayload = mergeResult.result;
                    currentStepPayloadChangeResult = this.buildPayloadChangeResultSummary(mergeResult);

                    if (mergeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Related sub-agent mapping warnings: ${mergeResult.warnings.join('; ')}`);
                    }
                }
            }

            const shouldTerminate = subAgentRequest.terminateAfter === true;
            const outputData = {
                subAgentResult: {
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0,
                    hasMergedPayload: !!(relationship.SubAgentOutputMapping && mergedPayload !== previousDecision.newPayload)
                },
                shouldTerminate: shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult
                })
            };

            if (stepEntity) {
                stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(mergedPayload);
            }

            await this.finalizeStepEntity(
                stepEntity,
                subAgentResult.success,
                subAgentResult.agentRun?.ErrorMessage,
                outputData
            );

            if (subAgentResult.agentRun?.FinalStep === 'Chat') {
                const chatStep: BaseAgentNextStep<SR, SC> = {
                    step: 'Chat',
                    terminate: true,
                    message: subAgentResult.agentRun?.Message || null,
                    previousPayload: previousDecision?.newPayload,
                    newPayload: mergedPayload,
                    responseForm: subAgentResult.responseForm,
                    actionableCommands: subAgentResult.actionableCommands,
                    automaticCommands: subAgentResult.automaticCommands
                };

                return await this.validateChatNextStep(params, chatStep, mergedPayload, this._agentRun!, stepEntity!);
            }

            const relatedResultMessage = this.formatSubAgentResultAsMarkdown(subAgentRequest.name, subAgentResult);
            const relatedMetadata: AgentChatMessageMetadata = {
                turnAdded: this._promptTurnCount,
                messageType: 'sub-agent-result',
                subAgentName: subAgentRequest.name,
                subAgentId: subAgentEntity.ID,
                expirationTurns: 3,
                expirationMode: 'Remove'
            };

            if (params.messageExpirationOverride) {
                const override = params.messageExpirationOverride;
                if (override.expirationTurns != null) {
                    relatedMetadata.expirationTurns = override.expirationTurns;
                    relatedMetadata.expirationMode = override.expirationMode || 'Remove';
                    relatedMetadata.compactMode = override.compactMode;
                    relatedMetadata.compactLength = override.compactLength;
                    relatedMetadata.compactPromptId = override.compactPromptId;
                }
            }

            params.conversationMessages.push({
                role: 'user',
                content: relatedResultMessage,
                metadata: relatedMetadata
            } as AgentChatMessage);

            if (this._agentRun) {
                this._agentRun.FinalPayloadObject = mergedPayload;
            }

            return {
                ...subAgentResult,
                step: subAgentResult.success ? 'Success' : 'Failed',
                errorMessage: subAgentResult.success ? undefined : (subAgentResult.agentRun?.ErrorMessage || 'Related sub-agent failed with no error message'),
                terminate: shouldTerminate,
                previousPayload: previousDecision?.newPayload,
                newPayload: mergedPayload
            };
        } catch (error) {
            const payload = stepEntity.PayloadAtEnd
                ? JSON.parse(stepEntity.PayloadAtEnd)
                : (previousDecision?.newPayload || params.payload);

            stepEntity.PayloadAtEnd = this.serializePayloadAtEnd(payload);
            await this.finalizeStepEntity(stepEntity, false, (error as Error).message);

            return {
                errorMessage: `Related sub-agent execution failed: ${(error as Error).message}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload
            };
        }
    }

    /**
     * Maps sub-agent result values back to parent payload paths according to mapping JSON configurations.
     * 
     * @param subAgentResult - Sub-agent final payload block
     * @param _parentPayload - Parent payload block
     * @param mappingConfig - Mapping JSON configurations
     * @returns Payload change request mapping block
     * @protected
     */
    protected applySubAgentOutputMapping<P>(
        subAgentResult: Record<string, unknown>,
        _parentPayload: Record<string, unknown>,
        mappingConfig: string
    ): AgentPayloadChangeRequest<P> | null {
        try {
            const mapping: Record<string, string> = JSON.parse(mappingConfig);
            const updateObj: Record<string, unknown> = {};

            for (const [subAgentPath, parentPath] of Object.entries(mapping)) {
                let value: unknown;

                if (subAgentPath === '*') {
                    value = subAgentResult;
                } else {
                    value = this.getValueFromPath(subAgentResult, subAgentPath);
                }

                if (value !== undefined) {
                    const pathParts = parentPath.split('.');
                    let current = updateObj;

                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        const cleanPart = part.endsWith('[]') ? part.slice(0, -2) : part;
                        if (!(cleanPart in current)) {
                            current[cleanPart] = {};
                        }
                        current = current[cleanPart] as Record<string, unknown>;
                    }

                    this.setMappedValue(current, pathParts[pathParts.length - 1], value);
                }
            }

            if (Object.keys(updateObj).length === 0) {
                return null;
            }

            return {
                updateElements: updateObj as Partial<P>
            };
        } catch (error) {
            LogError(`Failed to parse SubAgentOutputMapping: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Assigns values to target paths, supporting array appending operations.
     * 
     * @param target - Object container
     * @param key - Path key ending with [] if array appending
     * @param value - Value to set
     * @protected
     */
    protected setMappedValue(
        target: Record<string, unknown>,
        key: string,
        value: unknown
    ): void {
        const isArrayAppend = key.endsWith('[]');
        const actualKey = isArrayAppend ? key.slice(0, -2) : key;

        if (isArrayAppend) {
            if (!(actualKey in target)) {
                target[actualKey] = [];
            }

            if (!Array.isArray(target[actualKey])) {
                throw new Error(
                    `Cannot append to '${actualKey}': target is not an array. ` +
                    `Use '${actualKey}' without [] suffix for property update.`
                );
            }

            (target[actualKey] as unknown[]).push(value);
        } else {
            target[actualKey] = value;
        }
    }

    /**
     * Prepares sub-agent initial payload values by pulling out matching source paths in the parent payload.
     * 
     * @param parentPayload - Source parent payload
     * @param mappingConfig - Mapping JSON configurations
     * @returns Mapped sub-agent payload block
     * @protected
     */
    protected applySubAgentInputMapping(
        parentPayload: Record<string, unknown>,
        mappingConfig: string
    ): Record<string, unknown> | null {
        try {
            const mapping: Record<string, string> = JSON.parse(mappingConfig);
            const subAgentPayload: Record<string, unknown> = {};

            for (const [parentPath, subAgentPath] of Object.entries(mapping)) {
                let value: unknown;

                if (parentPath === '*') {
                    value = parentPayload;
                } else {
                    value = this.getValueFromPath(parentPayload, parentPath);
                }

                if (value !== undefined) {
                    const pathParts = subAgentPath.split('.');
                    let current = subAgentPayload;

                    for (let i = 0; i < pathParts.length - 1; i++) {
                        const part = pathParts[i];
                        if (!(part in current)) {
                            current[part] = {};
                        }
                        current = current[part] as Record<string, unknown>;
                    }

                    current[pathParts[pathParts.length - 1]] = value;
                }
            }

            if (Object.keys(subAgentPayload).length === 0) {
                return null;
            }

            return subAgentPayload;
        } catch (error) {
            LogError(`Failed to parse SubAgentInputMapping: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Extracts parent context payload or conversation history to inject as user messages inside related sub-agents.
     * 
     * @param parentPayload - Parent payload
     * @param contextPaths - Specific paths to pull
     * @param params - Execution run parameters
     * @returns Formatted chat context message
     * @protected
     */
    protected prepareRelatedSubAgentContextMessage(
        parentPayload: Record<string, unknown>,
        contextPaths: string[],
        params?: ExecuteAgentParams
    ): ChatMessage | null {
        if (!contextPaths || contextPaths.length === 0) {
            return null;
        }

        if (contextPaths.includes('*')) {
            return {
                role: 'user',
                content: `Parent Agent Context:\n\n${JSON.stringify(parentPayload, null, 2)}`
            };
        }

        const contextData: Record<string, unknown> = {};

        for (const path of contextPaths) {
            let value: unknown;

            if (ConversationMessageResolver.isConversationReference(path) && params?.conversationMessages) {
                value = ConversationMessageResolver.resolve(path, params.conversationMessages);
            } else {
                value = this.getValueFromPath(parentPayload, path);
            }

            if (value !== undefined) {
                contextData[path] = value;
            }
        }

        if (Object.keys(contextData).length === 0) {
            return null;
        }

        const contextLines = Object.entries(contextData).map(([key, value]) => {
            const valueStr = typeof value === 'object'
                ? JSON.stringify(value, null, 2)
                : String(value);
            return `${key}:\n${valueStr}`;
        });

        return {
            role: 'user',
            content: `Parent Agent Context:\n\n${contextLines.join('\n\n')}`
        };
    }

    /**
     * Dispatches the execution of client-side tools, managing timers and responses sequentializing when necessary.
     * 
     * @param params - Execution run parameters
     * @param config - Agent configurations
     * @param previousDecision - Next decision details containing tools invocations
     * @param stepCount - Execution step count
     * @returns Promise resolving to the next decision step outcome
     * @protected
     */
    protected async executeClientToolsStep(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep> {
        const clientTools: AgentClientToolInvocation[] = previousDecision.clientTools ?? [];
        if (clientTools.length === 0) {
            return await this.executePromptStep(params, config, previousDecision, stepCount);
        }

        if (!params.sessionID) {
            const errorMsg = 'Cannot execute client tools: no sessionID provided in ExecuteAgentParams';
            LogError(errorMsg);
            params.conversationMessages.push({
                role: 'user',
                content: `Client tool execution skipped: ${errorMsg}`
            });
            return await this.executePromptStep(params, config, previousDecision, stepCount);
        }

        const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;

        const toolMessage = clientTools.length === 1
            ? `I'm invoking the **${clientTools[0].Name}** client tool${clientTools[0].Description ? ` — ${clientTools[0].Description}` : ''}.`
            : `I'm invoking **${clientTools.length} client tools**:\n\n` +
              clientTools.map((t, i) => `${i + 1}. **${t.Name}**${t.Description ? ` — ${t.Description}` : ''}`).join('\n');

        params.conversationMessages.push({
            role: 'assistant',
            content: toolMessage
        });

        params.onProgress?.({
            step: 'action_execution',
            message: this.formatHierarchicalMessage(toolMessage),
            metadata: {
                toolCount: clientTools.length,
                toolNames: clientTools.map(t => t.Name),
                stepCount: stepCount + 1,
                hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
            },
            displayMode: 'live'
        });

        const defaultTimeout = params.clientToolTimeoutMs ?? 30_000;
        const results: ClientToolResultSummary[] = [];
        const agentRunID = this._agentRun?.ID ?? 'unknown';

        for (const tool of clientTools) {
            const stepEntity = await this.createStepEntity({
                stepType: 'Tool',
                stepName: `Client Tool: ${tool.Name}`,
                inputData: { toolName: tool.Name, params: tool.Params },
                contextUser: params.contextUser,
                payloadAtStart: currentPayload,
                payloadAtEnd: currentPayload
            });

            const timeoutMs = tool.TimeoutMs ?? defaultTimeout;

            const response = await ClientToolRequestManager.Instance.RequestClientTool(
                `ct_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                tool.Name,
                tool.Params,
                params.sessionID,
                agentRunID,
                timeoutMs,
                tool.Description
            );

            await this.finalizeStepEntity(
                stepEntity,
                response.Success,
                response.ErrorMessage,
                { result: response.Result }
            );

            results.push({
                ToolName: tool.Name,
                Success: response.Success,
                Result: response.Result,
                ErrorMessage: response.ErrorMessage
            });
        }

        const resultsMarkdown = this.formatClientToolResultsAsMarkdown(results);
        params.conversationMessages.push({
            role: 'user',
            content: resultsMarkdown,
            metadata: {
                turnAdded: this._promptTurnCount,
                messageType: 'client-tool-result'
            }
        } as AgentChatMessage);

        if (previousDecision.terminateAfterExecution) {
            return {
                step: 'Success',
                terminate: true,
                message: previousDecision.message || 'Client tools executed successfully.',
                payloadChangeRequest: previousDecision.payloadChangeRequest,
                scratchpad: previousDecision.scratchpad,
                responseForm: previousDecision.responseForm,
                actionableCommands: previousDecision.actionableCommands,
                automaticCommands: previousDecision.automaticCommands
            };
        }

        return await this.executePromptStep(params, config, previousDecision, stepCount);
    }

    /**
     * Formats client tool results as a compact markdown summary for the conversation.
     * 
     * @param results - Array of tool execution summaries
     * @returns Markdown text block
     * @protected
     */
    protected formatClientToolResultsAsMarkdown(results: ClientToolResultSummary[]): string {
        const failedCount = results.filter(r => !r.Success).length;
        const header = failedCount > 0
            ? `${failedCount} of ${results.length} client tool(s) failed:`
            : 'Client tool results:';

        const lines = results.map(r => {
            const icon = r.Success ? '✓' : '✗';
            let line = `${icon} **${r.ToolName}**: ${r.Success ? 'succeeded' : 'failed'}`;
            if (r.ErrorMessage) line += ` — ${r.ErrorMessage}`;
            if (r.Success && r.Result != null) {
                const resultStr = typeof r.Result === 'string' ? r.Result : JSON.stringify(r.Result);
                if (resultStr.length <= 500) {
                    line += `\n  Result: ${resultStr}`;
                }
            }
            return line;
        });

        return `${header}\n${lines.join('\n')}`;
    }

    /**
     * Handles step executions that demand user feedback interaction (Chat steps).
     * 
     * @param params - Execution run parameters
     * @param previousDecision - Next decision details
     * @returns Next decision step outcome
     * @protected
     */
    protected async executeChatStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const stepEntity = await this.createStepEntity({ stepType: 'Chat', stepName: 'User Interaction', contextUser: params.contextUser });

        await this.finalizeStepEntity(stepEntity, true);

        if (this._depth === 0) {
            await this.createFeedbackRequest(params, stepEntity, previousDecision);
        }

        return {
            step: 'Chat',
            terminate: true,
            message: previousDecision.message || 'Additional information needed from user',
            priorStepResult: previousDecision.message,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            responseForm: previousDecision.responseForm,
            actionableCommands: previousDecision.actionableCommands,
            automaticCommands: previousDecision.automaticCommands
        };
    }

    /**
     * Creates and records a persistent feedback request in the database.
     * 
     * @param params - Execution parameters
     * @param stepEntity - step database tracking record
     * @param previousDecision - Next decision details
     * @protected
     */
    protected async createFeedbackRequest(
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        previousDecision: BaseAgentNextStep
    ): Promise<void> {
        try {
            const requestTypeId = await this.resolveRequestTypeId(previousDecision, params.contextUser);
            const resolvedStrategy = await this.resolveAssignmentStrategy(params, requestTypeId);
            const requestForUserId = this.resolveUserFromStrategy(resolvedStrategy, params);
            const priority = resolvedStrategy?.priority ?? 50;
            const expirationMinutes = resolvedStrategy?.expirationMinutes;

            const request = await (params.provider || this._activeProvider).GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                params.contextUser
            );
            request.NewRecord();
            request.AgentID = params.agent.ID;
            request.RequestedAt = new Date();
            request.RequestForUserID = requestForUserId;
            request.Status = 'Requested';
            request.Request = previousDecision.message || 'Agent needs user input';
            request.RequestTypeID = requestTypeId;
            request.ResponseSchema = previousDecision.responseForm
                ? JSON.stringify(previousDecision.responseForm)
                : null;
            request.Priority = priority;
            request.OriginatingAgentRunID = this._agentRun?.ID || null;
            request.OriginatingAgentRunStepID = stepEntity.ID;

            if (expirationMinutes != null && expirationMinutes > 0) {
                request.ExpiresAt = new Date(Date.now() + expirationMinutes * 60_000);
            }

            const saved = await request.Save();
            if (saved) {
                this._feedbackRequestId = request.ID;
                this.logStatus(
                    `📋 Created feedback request ${request.ID} for user ${requestForUserId || '(system)'}`,
                    true,
                    params
                );
            } else {
                LogError(`Failed to save AIAgentRequest for agent ${params.agent.Name}`);
            }
        } catch (error) {
            LogError(`Error creating feedback request: ${(error as Error).message}`);
        }
    }

    /**
     * Resolves active request routing configurations and assignment strategies.
     * 
     * @param params - Execution parameters
     * @param requestTypeId - Active request type record ID
     * @returns Resolved strategy config
     * @protected
     */
    protected async resolveAssignmentStrategy(
        params: ExecuteAgentParams,
        requestTypeId: string | null
    ): Promise<any> {
        if (params.assignmentStrategy) {
            return params.assignmentStrategy;
        }

        const agentType = AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, params.agent.TypeID));
        const typeStrategy = (AIEngine.Instance as any).parseAssignmentStrategy ? (AIEngine.Instance as any).parseAssignmentStrategy(agentType?.AssignmentStrategy ?? null) : null;
        if (typeStrategy) {
            return typeStrategy;
        }

        const categoryStrategy = await this.resolveCategoryAssignmentStrategy(params);
        if (categoryStrategy) {
            return categoryStrategy;
        }

        if (requestTypeId && this._requestTypeCache) {
            const requestType = this._requestTypeCache.find(t => UUIDsEqual(t.ID, requestTypeId));
            if (requestType) {
                const rtStrategy = (AIEngine.Instance as any).parseAssignmentStrategy ? (AIEngine.Instance as any).parseAssignmentStrategy((requestType as any).DefaultAssignmentStrategy) : null;
                if (rtStrategy) {
                    return rtStrategy;
                }
            }
        }

        return null;
    }

    /**
     * Walks up the agent's category hierarchy looking for an AssignmentStrategy.
     * 
     * @param params - Execution parameters
     * @returns Assignment strategy or null
     * @protected
     */
    protected async resolveCategoryAssignmentStrategy(
        params: ExecuteAgentParams
    ): Promise<any> {
        const categoryId = params.agent.CategoryID;
        if (!categoryId) return null;

        try {
            const categories = AIEngine.Instance.AgentCategories;
            let currentId: string | null = categoryId;
            const visited = new Set<string>();
            while (currentId && !visited.has(currentId)) {
                visited.add(currentId);
                const cat = categories.find(c => UUIDsEqual(c.ID, currentId));
                if (!cat) break;

                const strategy = (AIEngine.Instance as any).parseAssignmentStrategy ? (AIEngine.Instance as any).parseAssignmentStrategy((cat as any).AssignmentStrategy) : null;
                if (strategy) return strategy;

                currentId = cat.ParentID;
            }
        } catch (error) {
            LogError(`Error resolving category assignment strategy: ${(error as Error).message}`);
        }

        return null;
    }

    /**
     * Resolves the target assignee user ID based on resolved routing strategies.
     * 
     * @param strategy - Resolved routing strategy
     * @param params - Execution parameters
     * @returns Assigned User ID or null
     * @protected
     */
    protected resolveUserFromStrategy(
        strategy: any | null,
        params: ExecuteAgentParams
    ): string | null {
        if (!strategy) {
            if (params.contextUser?.ID) {
                LogStatus(`⚠️ No assignment strategy configured for agent ${params.agent.Name}; defaulting to context user`);
                return params.contextUser.ID;
            }
            LogStatus(`⚠️ No assignment strategy and no context user for agent ${params.agent.Name}; request will be unassigned`);
            return null;
        }

        switch (strategy.type) {
            case 'RunUser':
                return params.contextUser?.ID
                    ?? this._agentRun?.UserID
                    ?? null;

            case 'AgentOwner':
                return params.agent.OwnerUserID ?? null;

            case 'SpecificUser':
                return strategy.userID ?? null;

            case 'List':
                LogStatus(`ℹ️ List-based assignment strategy configured but not yet implemented; defaulting to context user`);
                return params.contextUser?.ID ?? null;

            case 'SharedInbox':
                return null;

            default:
                return params.contextUser?.ID ?? null;
        }
    }

    /**
     * Resolves and records the database request type records, matching approval patterns or basic questions.
     * 
     * @param previousDecision - Decision details
     * @param contextUser - Requesting User
     * @returns A promise resolving to request type ID
     * @protected
     */
    protected async resolveRequestTypeId(
        previousDecision: BaseAgentNextStep,
        contextUser?: UserInfo
    ): Promise<string | null> {
        try {
            if (!this._requestTypeCache) {
                const rv = new RunView();
                const result = await rv.RunView<MJAIAgentRequestTypeEntity>({
                    EntityName: 'MJ: AI Agent Request Types',
                    ResultType: 'entity_object'
                }, contextUser);
                this._requestTypeCache = result.Success ? result.Results : [];
            }

            let typeName = 'Information';
            if (previousDecision.responseForm) {
                typeName = this.detectRequestTypeName(previousDecision.responseForm);
            }

            const matchedType = this._requestTypeCache.find(t => t.Name === typeName);
            return matchedType?.ID || null;
        } catch (error) {
            LogError(`Error resolving request type: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Standardizes options detection based on form responses.
     * 
     * @param form - Target response form details
     * @returns Name of requested type
     * @protected
     */
    protected detectRequestTypeName(form: AgentResponseForm): string {
        const q = form.questions?.[0];
        if (!q || form.questions.length !== 1) {
            return 'Information';
        }
        const qType = q.type;
        if ((qType.type === 'buttongroup' || qType.type === 'radio') && 'options' in qType) {
            const opts = qType.options;
            if (opts.length === 2) {
                const labels = opts.map(o => o.label.toLowerCase());
                const hasPositive = labels.some(l => l.includes('approv') || l.includes('yes') || l.includes('accept'));
                const hasNegative = labels.some(l => l.includes('reject') || l.includes('no') || l.includes('deny'));
                if (hasPositive && hasNegative) {
                    return 'Approval';
                }
            }
        }
        return 'Information';
    }

    /**
     * Resolves values in a template parameters configuration record using recursive object walk.
     * 
     * @param obj - Target object config
     * @param context - Interpolation values context
     * @param itemVariable - Name of loop item variable
     * @returns Resolved object
     * @protected
     */
    protected resolveTemplates(
        obj: Record<string, unknown>,
        context: Record<string, any>,
        itemVariable: string
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.resolveValueFromContext(value, context, itemVariable);
            } else if (Array.isArray(value)) {
                result[key] = value.map(v =>
                    typeof v === 'string' ? this.resolveValueFromContext(v, context, itemVariable) : v
                );
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.resolveTemplates(value as Record<string, unknown>, context, itemVariable);
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Resolves a value from context using variable references.
     * Supports both scalar and complex object iterations.
     * 
     * @param value - Target template string
     * @param context - Interpolation values context
     * @param itemVariable - Name of loop item variable
     * @returns Interpolated output
     * @protected
     */
    protected resolveValueFromContext(value: string, context: Record<string, any>, itemVariable: string): any {
        const trimmedValue = value.trim();
        if (trimmedValue.startsWith('{{') && trimmedValue.endsWith('}}')) {
            value = trimmedValue.substring(2, trimmedValue.length - 2).trim();
        } else if (trimmedValue.includes('{{')) {
            return this.resolveInlineTemplateExpressions(trimmedValue, context, itemVariable);
        }

        const ivToLower = itemVariable?.trim().toLowerCase();
        const valueLower = value?.toLowerCase();

        if (valueLower === ivToLower) {
            return context.item;
        }

        if (valueLower?.startsWith(`${ivToLower}.`)) {
            const path = value.substring(ivToLower.length + 1);
            return this.getValueFromPath(context.item, path);
        }

        for (const [varName, varValue] of Object.entries(context)) {
            if (value === varName) {
                return varValue;
            }

            if (value?.trim().toLowerCase().startsWith(`${varName}.`)) {
                const path = value.substring(varName.length + 1);
                return this.getValueFromPath(varValue, path);
            }
        }

        return value;
    }

    /**
     * Resolves multiple template expressions embedded inline within a literal string.
     * 
     * @param template - Target template string
     * @param context - Interpolation values context
     * @param itemVariable - Name of loop item variable
     * @returns Interpolated string output
     * @protected
     */
    protected resolveInlineTemplateExpressions(
        template: string,
        context: Record<string, any>,
        itemVariable: string
    ): string {
        const expressionPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
        return template.replace(expressionPattern, (_match: string, expr: string) => {
            const resolved = this.resolveValueFromContext(expr.trim(), context, itemVariable);
            if (resolved === expr.trim()) {
                return _match;
            }
            return String(resolved ?? '');
        });
    }

    /**
     * Resolves a value from a nested object/array path using dot notation and array index references.
     * 
     * @param obj - Target object/array
     * @param path - Dot notation path
     * @returns Extracted value or undefined
     * @protected
     */
    protected getValueFromPath(obj: any, path: string): unknown {
        const parts = path.split('.');
        let current = obj;

        for (const part of parts) {
            if (!part) continue;

            const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);

            if (arrayMatch) {
                const arrayName = arrayMatch[1];
                const index = parseInt(arrayMatch[2], 10);

                if (current && typeof current === 'object' && arrayName in current) {
                    current = current[arrayName];

                    if (Array.isArray(current) && index >= 0 && index < current.length) {
                        current = current[index];
                    } else {
                        return undefined;
                    }
                } else {
                    return undefined;
                }
            } else {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return undefined;
                }
            }
        }

        return current;
    }

    /**
     * Formats an array of action result summaries as markdown.
     * 
     * @param actionSummaries - summaries to format
     * @returns Markdown summary text
     * @protected
     */
    protected formatActionResultsAsMarkdown(actionSummaries: ActionResultSummary[]): string {
        return actionSummaries.map(a => {
            const marker = a.success ? '✓' : '✗';
            const lines: string[] = [];

            lines.push(`## ${a.actionName} ${marker}`);
            lines.push(`**Result:** ${a.resultCode} — ${a.message || '(no message)'}`);

            if (a.params && a.params.length > 0) {
                lines.push('**Output:**');
                for (const p of a.params) {
                    lines.push(`• \`${p.Name}\`: ${this.formatParamValueForResult(p.Value)}`);
                }
            }

            return lines.join('\n');
        }).join('\n\n');
    }

    /**
     * Formats sub-agent execution results as markdown block.
     * 
     * @param subAgentName - Name of sub-agent
     * @param result - Sub-agent execution outcome
     * @returns Markdown text block
     * @protected
     */
    protected formatSubAgentResultAsMarkdown(subAgentName: string, result: ExecuteAgentResult): string {
        const marker = result.success ? '✓' : '✗';
        const lines: string[] = [];

        lines.push(`## Sub-agent: ${subAgentName} ${marker}`);

        const status = result.agentRun?.Status || (result.success ? 'Completed' : 'Failed');
        lines.push(`**Status:** ${status}`);

        if (!result.success && result.agentRun?.ErrorMessage) {
            lines.push(`**Error:** ${result.agentRun.ErrorMessage}`);
        }

        if (result.payload != null) {
            const payloadStr = typeof result.payload === 'string'
                ? result.payload
                : JSON.stringify(result.payload);
            lines.push(`**Payload:**\n${payloadStr}`);
        }

        return lines.join('\n');
    }

    /**
     * Formats action parameters value for inclusion in action results block.
     * 
     * @param value - Value to format
     * @param maxLength - Optional max characters count
     * @returns String presentation
     * @protected
     */
    protected formatParamValueForResult(value: unknown, maxLength: number = 0): string {
        if (value === null || value === undefined) {
            return '`null`';
        }

        if (typeof value === 'boolean' || typeof value === 'number') {
            return `\`${String(value)}\``;
        }

        let stringValue: string;
        if (typeof value === 'string') {
            stringValue = value;
        } else {
            stringValue = JSON.stringify(value);
        }

        if (maxLength > 0 && stringValue.length > maxLength) {
            return `${stringValue.substring(0, maxLength)}…`;
        }

        return stringValue;
    }

    /**
     * Formats action parameter values for display in action run messages.
     * 
     * @param value - Value to format
     * @param maxLength - Maximum display length
     * @returns Formatted parameter string
     * @protected
     */
    protected formatParamValueForMessage(value: any, maxLength: number = 100): string {
        if (value === null || value === undefined) {
            return 'null';
        }

        let stringValue: string;

        if (typeof value === 'string') {
            stringValue = value;
        } else if (typeof value === 'object') {
            stringValue = JSON.stringify(value);
        } else {
            stringValue = String(value);
        }

        if (stringValue.length > maxLength) {
            return `\`${stringValue.substring(0, maxLength)}...\``;
        }

        return `\`${stringValue}\``;
    }

    /**
     * Resolves the agent type name for a given type ID.
     * 
     * @param typeID - The agent type ID
     * @returns The agent type name
     * @protected
     */
    protected getAgentTypeName(typeID: string): string {
        const agentType = AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, typeID));
        return agentType?.Name || 'Unknown';
    }

    /**
     * Builds payload change result summaries, extracting validation and diff details.
     * 
     * @param changeResult - Payload manager change results block
     * @returns Standard change summary block
     * @protected
     */
    protected buildPayloadChangeResultSummary(changeResult: PayloadManagerResult<any>): PayloadChangeResultSummary {
        return {
            applied: changeResult.applied,
            warnings: changeResult.warnings,
            requiresFeedback: changeResult.requiresFeedback,
            timestamp: changeResult.timestamp,
            
            payloadValidation: changeResult.blockedOperations && changeResult.blockedOperations.length > 0 ? {
                selfWriteViolations: {
                    deniedOperations: changeResult.blockedOperations,
                    timestamp: changeResult.timestamp.toISOString()
                }
            } : undefined,
            
            analysis: changeResult.analysis ? {
                totalWarnings: changeResult.analysis.summary.totalWarnings,
                warningsByType: changeResult.analysis.summary.warningsByType,
                suspiciousChanges: changeResult.analysis.summary.suspiciousChanges,
                criticalWarnings: changeResult.analysis.criticalWarnings.map(w => ({
                    type: w.type,
                    severity: w.severity,
                    path: w.path,
                    message: w.message
                }))
            } : undefined,
            
            diffSummary: changeResult.diff ? {
                added: changeResult.diff.summary.added,
                removed: changeResult.diff.summary.removed,
                modified: changeResult.diff.summary.modified,
                totalChanges: changeResult.diff.summary.totalPaths
            } : undefined
        };
    }
}
