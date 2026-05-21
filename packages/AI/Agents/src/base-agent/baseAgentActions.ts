/**
 * @fileoverview BaseAgentActions - Layer 5 of the BaseAgent modular inheritance hierarchy.
 * Handles action execution, action-related parameter formatting, file output detection,
 * large media/binary content extraction and interception, and resolving media placeholders
 * in strings, payloads, and messages.
 * 
 * @module @memberjunction/ai-agents
 */

import {
    MJAIAgentRunStepEntityExtended,
    ExecuteAgentParams,
    BaseAgentNextStep,
    AgentAction,
    AgentChatMessageMetadata,
    AgentChatMessage,
    FileOutputRef,
    ParseFileOutputRef,
    MediaOutput
} from '@memberjunction/ai-core-plus';
import { UserInfo, LogStatus, LogError, IsVerboseLoggingEnabled } from '@memberjunction/core';
import { MJActionEntityExtended, ActionResult, ActionParam } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAgentOperations } from './baseAgentOperations';
import { ActionResultSummary } from './baseAgentState';

/**
 * BaseAgentActions extends BaseAgentOperations to implement action execution flow,
 * validation of action scopes, formatting of parameters, file output extraction,
 * and media reference resolution.
 */
export abstract class BaseAgentActions extends BaseAgentOperations {

    /**
     * Inspects a set of action output params for any value matching the FileOutputRef shape
     * (an object with `fileName`, `mimeType`, and either `fileData` or `fileId`).
     * Returns all matching FileOutputRef values found across all output params.
     *
     * Detection is shape-based, not name-based — actions can name their file output
     * parameter anything and it will still be detected.
     *
     * @param outputParams - The output parameters from an action result
     * @returns Array of detected file output references
     * @protected
     * @since 5.22.0
     */
    protected detectFileOutputs(outputParams: ActionParam[]): FileOutputRef[] {
        const results: FileOutputRef[] = [];
        for (const param of outputParams) {
            if (param.Value == null) continue;
            const ref = ParseFileOutputRef(param.Value);
            if (ref) results.push(ref);
        }
        return results;
    }

    /**
     * Intercepts large media content in action results and replaces with placeholder references.
     * This prevents context overflow when action results contain large base64 data (images, audio, video).
     *
     * Uses generic ValueType=MediaOutput detection from action metadata to identify media output params.
     * Intercepted media is stored in _mediaOutputs with refId and persist=false (not saved unless used).
     *
     * @param actionParams - The output parameters from an action result
     * @param actionEntity - Optional action entity metadata for ValueType checking
     * @returns Sanitized parameters with large media content replaced by ${media:ref-id} placeholders
     * @protected
     * @since 3.1.0
     */
    protected interceptLargeBinaryContent(actionParams: ActionParam[], actionEntity?: MJActionEntityExtended): ActionParam[] {
        if (!actionParams || actionParams.length === 0) {
            return actionParams;
        }

        const sanitizedParams: ActionParam[] = [];

        for (const param of actionParams) {
            // Only process output params
            if (param.Type !== 'Output' && param.Type !== 'Both') {
                sanitizedParams.push(param);
                continue;
            }

            // Check if this param is marked as MediaOutput in action metadata
            const paramMetadata = actionEntity?.Params?.find(p => p.Name === param.Name);
            const valueType = paramMetadata?.ValueType as string | undefined;
            const isMediaOutputParam = valueType === 'MediaOutput';

            // Handle MediaOutput params (e.g., Generate Image action)
            if (isMediaOutputParam && Array.isArray(param.Value)) {
                const mediaItems = param.Value as MediaOutput[];
                const references: string[] = [];
                let extractedCount = 0;

                for (let i = 0; i < mediaItems.length; i++) {
                    const media = mediaItems[i];
                    // Only intercept if there's substantial data
                    if (media.data && media.data.length > BaseAgentActions.LARGE_BINARY_THRESHOLD) {
                        // Generate unique reference ID
                        const refId = `media-${Date.now().toString(36)}-${i}-${Math.random().toString(36).substring(2, 8)}`;

                        // Store in unified media outputs with persist=false (won't be saved unless placeholder is used)
                        this._mediaOutputs.push({
                            ...media,
                            refId,
                            persist: false  // Not persisted unless placeholder is resolved in final output
                        });

                        references.push(`\${media:${refId}}`);
                        extractedCount++;
                    }
                }

                if (extractedCount > 0) {
                    // Replace array with references
                    sanitizedParams.push({
                        Name: param.Name,
                        Type: param.Type,
                        Value: {
                            mediaReferences: references,
                            count: mediaItems.length,
                            note: `${extractedCount} media item(s) extracted. Use placeholder syntax in your response: <img src="${references[0]}" alt="description" />`
                        }
                    });
                    this.logStatus(`📦 Extracted ${extractedCount} ${param.Name} item(s) to media references`, true);
                    continue;
                }
            }

            // Fallback: Check for standalone Base64 strings in MediaOutput or other params
            if (typeof param.Value === 'string' && param.Value.length > BaseAgentActions.LARGE_BINARY_THRESHOLD) {
                // Check if it looks like base64 (no spaces, alphanumeric with +/=)
                const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
                if (isMediaOutputParam || base64Pattern.test(param.Value.substring(0, 1000))) {
                    const refId = `data-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

                    // Store in unified media outputs with persist=false
                    this._mediaOutputs.push({
                        modality: 'Image', // Default to image, could be enhanced with mime detection
                        mimeType: 'application/octet-stream',
                        data: param.Value,
                        label: `Media data from ${param.Name}`,
                        refId,
                        persist: false
                    });

                    sanitizedParams.push({
                        Name: param.Name,
                        Type: param.Type,
                        Value: `\${media:${refId}}`
                    });
                    this.logStatus(`📦 Extracted large binary content from '${param.Name}' to media reference`, true);
                    continue;
                }
            }

            // Keep param as-is if no extraction needed
            sanitizedParams.push(param);
        }

        return sanitizedParams;
    }

    /**
     * Resolves media placeholders in a string.
     * Replaces ${media:ref-id} with actual data URIs (data:mime;base64,...).
     * Sets persist=true on resolved media so it will be saved to AIAgentRunMedia.
     *
     * @param text - The string that may contain media placeholders
     * @returns String with placeholders resolved to actual data URIs
     * @protected
     * @since 3.1.0
     */
    protected resolveMediaPlaceholdersInString(text: string): string {
        // Check if any media has a refId (meaning we have intercepted media to resolve)
        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!text || !hasRefIds) {
            return text;
        }

        // Match ${media:ref-id} pattern
        const placeholderRegex = /\$\{media:([a-z0-9-]+)\}/g;

        return text.replace(placeholderRegex, (match, refId: string) => {
            const media = this._mediaOutputs.find(m => m.refId === refId);
            if (media?.data) {
                // Mark for persistence since it's being used in final output
                media.persist = true;
                return `data:${media.mimeType};base64,${media.data}`;
            }
            // Keep placeholder if not found (shouldn't happen in normal flow)
            this.logStatus(`⚠️ Media reference '${refId}' not found in registry`, true);
            return match;
        });
    }

    /**
     * Resolves media placeholders in a payload of any type.
     * - For strings: resolves placeholders directly
     * - For objects: recursively processes all string properties
     * - For arrays: recursively processes all elements
     *
     * @param payload - The payload that may contain media placeholders in string values
     * @returns Payload with all placeholders resolved to actual data URIs
     * @protected
     * @since 3.1.0
     */
    protected resolveMediaPlaceholdersInPayload<T>(payload: T): T {
        // Check if any media has a refId (meaning we have intercepted media to resolve)
        const hasRefIds = this._mediaOutputs.some(m => m.refId);
        if (!hasRefIds) {
            return payload;
        }

        // Count how many media items have persist=false before resolution
        const unpersisted = this._mediaOutputs.filter(m => m.refId && m.persist === false).length;
        const resolved = this.resolveMediaPlaceholdersRecursive(payload);
        // Count how many were marked for persistence (persist changed from false to true)
        const persistedAfter = this._mediaOutputs.filter(m => m.refId && m.persist === true).length;
        const resolvedCount = persistedAfter - (unpersisted - this._mediaOutputs.filter(m => m.refId && m.persist === false).length);

        if (resolvedCount > 0) {
            this.logStatus(`✅ Resolved ${resolvedCount} media placeholder(s) in final payload`, true);
        }

        return resolved;
    }

    /**
     * Recursively resolves media placeholders in any value.
     * 
     * @param value - The value to recursively resolve placeholders in
     * @returns The resolved value
     * @protected
     */
    protected resolveMediaPlaceholdersRecursive<T>(value: T): T {
        if (value === null || value === undefined) {
            return value;
        }

        // Handle strings directly
        if (typeof value === 'string') {
            return this.resolveMediaPlaceholdersInString(value) as T;
        }

        // Handle arrays
        if (Array.isArray(value)) {
            return value.map(item => this.resolveMediaPlaceholdersRecursive(item)) as T;
        }

        // Handle objects
        if (typeof value === 'object') {
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(value as object)) {
                result[key] = this.resolveMediaPlaceholdersRecursive((value as Record<string, unknown>)[key]);
            }
            return result as T;
        }

        // Return primitives (numbers, booleans) as-is
        return value;
    }

    /**
     * Formats a parameter value for display in action execution messages.
     * Truncates long strings and formats objects/arrays for readability.
     *
     * @param value - The parameter value to format
     * @param maxLength - Maximum length before truncation (default: 100)
     * @returns Formatted value suitable for message display
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
            // For objects/arrays, use compact JSON
            stringValue = JSON.stringify(value);
        } else {
            stringValue = String(value);
        }

        // Truncate if too long
        if (stringValue.length > maxLength) {
            return `\`${stringValue.substring(0, maxLength)}...\``;
        }

        // Use inline code formatting for values
        return `\`${stringValue}\``;
    }

    /**
     * Returns the default payload self write paths for the agent. If not specified, it will return undefined
     * 
     * @returns Array of default payload paths allowed for self writes, or undefined
     * @protected
     */
    protected getDefaultPayloadSelfWritePaths(): string[] | undefined {
        return undefined;
    }

    /**
     * Executes a single Action.
     * Resolves the Action by name using the ActionEngine system, formats parameters,
     * preserves caller context, tracks permissions, and returns the completion result.
     * 
     * @param params - Parameters from agent execution for context passing
     * @param action - Action configuration to execute
     * @param actionEntity - Action entity containing metadata
     * @param contextUser - Optional user context for permissions
     * @returns ActionResult object containing outcomes and logs
     * @public
     */
    public async ExecuteSingleAction(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended, 
        contextUser?: UserInfo
    ): Promise<ActionResult> {
        
        try {
            const actionEngine = ActionEngineServer.Instance;

            // Convert params object to ActionParam array
            const actionParams = Object.entries(action.params || {}).map(([key, value]) => ({
                Name: key,
                Value: value,
                Type: 'Input' as const
            }));

            // Build action context: preserve the agent's context by reference
            const actionContext = typeof params.context === 'object' && params.context ? params.context : {};
            (actionContext as Record<string, unknown>).AgentID = params.agent.ID;
            if (this._resolvedStorageAccountId) {
                (actionContext as Record<string, unknown>).__resolvedStorageAccountId = this._resolvedStorageAccountId;
            }

            // Execute the action and return the full ActionResult
            const result = await actionEngine.RunAction({
                Action: actionEntity,
                Params: actionParams,
                ContextUser: contextUser,
                Filters: [],
                SkipActionLog: false,
                Context: actionContext
            });
            
            if (result.Success) {
                this.logStatus(`   ✅ Action '${action.name}' completed successfully`, true, params);
            } else {
                this.logStatus(`   ❌ Action '${action.name}' failed: ${result.Message || 'Unknown error'}`, false, params);
            }
            
            return result;
            
        } catch (error) {
            this.logError(error, {
                category: 'ActionExecution',
                metadata: {
                    actionName: action.name,
                    actionParams: action.params
                }
            });
            throw new Error(`Error executing actions: ${error.message}`);
        }
    }

    /**
     * Executes the Action step containing one or more parallel actions.
     * Manages step lifecycle entities, runs PreProcess and PostProcess hooks,
     * monitors cancellation tokens, handles media output extraction/interception,
     * captures file generation outputs, and publishes results back to conversation messages.
     * 
     * Implements the abstract signature defined in BaseAgentOperations.
     * 
     * @param params - Execution run parameters
     * @param previousDecision - Step decision object containing requested actions
     * @param parentStepId - Database step ID of the parent loop if executing inside a loop
     * @param addConversationMessage - Whether to append progress and result user messages to the chat history
     * @param stepCount - Sequence count of steps in this run
     * @returns Promise resolving to a Retry step decision with updated payload
     * @protected
     */
    protected async executeActionsStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId: string,
        addConversationMessage: boolean = true,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep> {
        
        try {
            const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
            const actions: AgentAction[] = previousDecision.actions || [];
            // Check for cancellation before starting
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled before action execution');
            }

            // Report action execution progress with markdown formatting for parameters
            let progressMessage: string;
            if (actions.length === 1) {
                const aa = actions[0];
                progressMessage = `Executing **${aa.name}** action`;

                // Add parameters if they exist
                if (aa.params && Object.keys(aa.params).length > 0) {
                    const paramsList = Object.entries(aa.params)
                        .map(([key, value]) => {
                            const displayValue = this.formatParamValueForMessage(value);
                            return `• **${key}**: ${displayValue}`;
                        })
                        .join('\n');
                    progressMessage += ` with parameters:\n${paramsList}`;
                } else {
                    progressMessage += '.';
                }
            } else {
                progressMessage = `Executing **${actions.length} actions** in parallel:\n\n` + actions.map((aa, index) => {
                    let actionText = `${index + 1}. **${aa.name}**`;

                    // Add parameters if they exist
                    if (aa.params && Object.keys(aa.params).length > 0) {
                        const paramsList = Object.entries(aa.params)
                            .map(([key, value]) => {
                                const displayValue = this.formatParamValueForMessage(value);
                                return `   • **${key}**: ${displayValue}`;
                            })
                            .join('\n');
                        actionText += `\n${paramsList}`;
                    }

                    return actionText;
                }).join('\n\n');
            }
                
            params.onProgress?.({
                step: 'action_execution',
                message: this.formatHierarchicalMessage(progressMessage),
                metadata: {
                    actionCount: actions.length,
                    actionNames: actions.map(a => a.name),
                    stepCount: stepCount + 1,
                    hierarchicalStep: this.buildHierarchicalStep(stepCount + 1, this._parentStepCounts)
                },
                displayMode: 'live'
            });

            // Build detailed action execution message with parameters using markdown formatting
            let actionMessage: string;
            if (actions.length === 1) {
                const aa = actions[0];
                actionMessage = `I'm executing the **${aa.name}** action`;

                // Add parameters if they exist
                if (aa.params && Object.keys(aa.params).length > 0) {
                    const paramsList = Object.entries(aa.params)
                        .map(([key, value]) => {
                            const displayValue = this.formatParamValueForMessage(value);
                            return `• **${key}**: ${displayValue}`;
                        })
                        .join('\n');
                    actionMessage += ` with parameters:\n${paramsList}`;
                } else {
                    actionMessage += '.';
                }
            } else {
                actionMessage = `I'm executing **${actions.length} actions** in parallel:\n\n` + actions.map((aa, index) => {
                    let actionText = `${index + 1}. **${aa.name}**`;

                    // Add parameters if they exist
                    if (aa.params && Object.keys(aa.params).length > 0) {
                        const paramsList = Object.entries(aa.params)
                            .map(([key, value]) => {
                                const displayValue = this.formatParamValueForMessage(value);
                                return `   • **${key}**: ${displayValue}`;
                            })
                            .join('\n');
                        actionText += `\n${paramsList}`;
                    }

                    return actionText;
                }).join('\n\n');
            }

            if (addConversationMessage) {
                // Add assistant message (no metadata)
                params.conversationMessages.push({
                    role: 'assistant',
                    content: actionMessage
                });
            }

            const actionEngine = ActionEngineServer.Instance;
            const agentActions = AIEngine.Instance.AgentActions.filter(aa => UUIDsEqual(aa.AgentID, params.agent.ID));

            // Use _effectiveActions which includes runtime action changes
            const effectiveActions = this._effectiveActions.length > 0
                ? this._effectiveActions
                : actionEngine.Actions.filter(a =>
                    agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID))
                  );

            // Call agent type's pre-processing for actions
            try {
                const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
                
                await this.AgentTypeInstance.PreProcessActionStep(
                    actions,
                    currentPayload,
                    this.AgentTypeState,
                    previousDecision,
                    params
                );
            } catch (error) {
                LogError(`Error in PreProcessActionStep: ${error.message}`);
            }

            // Track step numbers for parallel actions
            let numActionsProcessed = 0;
            const baseStepNumber = (this._agentRun!.Steps?.length || 0) + 1;

            // Execute all actions in parallel
            let lastStep: MJAIAgentRunStepEntityExtended | undefined = undefined;
            const actionPromises = actions.map(async (aa) => {
                const actionEntity = effectiveActions.find(a => a.Name === aa.name);
                if (!actionEntity) {
                    throw new Error(`Action "${aa.name}" Not Found for Agent "${params.agent.Name}". Available actions: ${effectiveActions.map(a => a.Name).join(', ')}`);
                }

                // Prepare input data for the action step
                const actionInputData = {
                    actionName: aa.name,
                    actionParams: aa.params
                };
                
                const stepEntity = await this.createStepEntity({ stepType: 'Actions', stepName: `Execute Action: ${aa.name}`, contextUser: params.contextUser, targetId: actionEntity.ID, inputData: actionInputData, payloadAtStart: currentPayload, payloadAtEnd: currentPayload, parentId: parentStepId });
                lastStep = stepEntity;
                // Override step number to ensure unique values for parallel actions
                stepEntity.StepNumber = baseStepNumber + numActionsProcessed++;
                
                // Increment execution count for this action
                this.incrementExecutionCount(actionEntity.ID);
                
                let actionResult: ActionResult;
                try {
                    // Execute the action
                    actionResult = await this.ExecuteSingleAction(params, aa, actionEntity, params.contextUser);
                    
                    // Update step entity with ActionExecutionLog ID if available
                    if (actionResult.LogEntry?.ID) {
                        stepEntity.TargetLogID = actionResult.LogEntry.ID;
                        await stepEntity.Save();
                    }
                    
                    // Prepare output data with action result
                    const outputData = {
                        actionResult: {
                            success: actionResult.Success,
                            resultCode: actionResult.Result?.ResultCode,
                            message: actionResult.Message,
                            parameters: actionResult.Params
                        }
                    };
                    
                    // Finalize step entity with output data
                    await this.finalizeStepEntity(stepEntity, actionResult.Success, 
                        actionResult.Success ? undefined : actionResult.Message, outputData);
                    
                    return { success: true, result: actionResult, action: aa, actionEntity, stepEntity };
                    
                } catch (error) {
                    await this.finalizeStepEntity(stepEntity, false, error.message);

                    return { success: false, result: actionResult!, error: error.message, action: aa, actionEntity, stepEntity };
                }
            });
            
            // Wait for all actions to complete
            const actionResults = await Promise.all(actionPromises);
            
            // Check for cancellation after actions complete
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled after action execution');
            }
            
            // Build a clean summary of action results
            const actionSummaries: ActionResultSummary[] = actionResults.map(result => {
                const actionResult = result.success ? result.result : null;

                // Filter to output params only
                const outputParams = result.result?.Params?.filter(p => p.Type === 'Both' || p.Type === 'Output') || [];

                // Intercept large media content (images, audio, video) and replace with placeholders
                const sanitizedParams = this.interceptLargeBinaryContent(outputParams, result.actionEntity);

                // Collect file outputs (PDF, Excel, Word, etc.)
                const fileOutputs = this.detectFileOutputs(outputParams);
                this._fileOutputs.push(...fileOutputs);

                return {
                    actionName: result.action.name,
                    success: result.success,
                    params: sanitizedParams,
                    resultCode: actionResult?.Result?.ResultCode || (result.success ? 'SUCCESS' : 'ERROR'),
                    message: result.success ? actionResult?.Message || 'Action completed' : result.error || 'Unknown error',
                    aiDirectives: result.success ? actionResult?.AIDirectives : undefined
                };
            });
            
            // Check if any actions failed
            const failedActions = actionSummaries.filter(a => !a.success);

            // Add user message with the results
            const header = failedActions.length > 0
                ? `${failedActions.length} of ${actionSummaries.length} action(s) failed:`
                : `Action results:`;
            const resultsMessage = `${header}\n${this.formatActionResultsAsMarkdown(actionSummaries)}`;

            // Build metadata from AI Agent Actions configuration
            let metadata: AgentChatMessageMetadata | undefined;
            const agentActionConfigs = actionResults
                .map(r => agentActions.find(aa => UUIDsEqual(aa.ActionID, r.actionEntity.ID)))
                .filter((aa): aa is Exclude<typeof aa, undefined> => aa != null);

            if (agentActionConfigs.length > 0) {
                // Find the most restrictive expiration settings
                let minExpirationTurns: number | null = null;
                let expirationMode: 'None' | 'Remove' | 'Compact' = 'None';
                let compactMode: 'First N Chars' | 'AI Summary' | undefined;
                let compactLength: number | undefined;
                let compactPromptId: string | undefined;

                for (const agentAction of agentActionConfigs) {
                    if (agentAction.ResultExpirationTurns != null) {
                        if (minExpirationTurns === null || agentAction.ResultExpirationTurns < minExpirationTurns) {
                            minExpirationTurns = agentAction.ResultExpirationTurns;
                            expirationMode = agentAction.ResultExpirationMode as 'None' | 'Remove' | 'Compact' || 'None';
                            compactMode = agentAction.CompactMode as 'First N Chars' | 'AI Summary' | undefined;
                            compactLength = agentAction.CompactLength ?? undefined;
                            compactPromptId = agentAction.CompactPromptID ?? undefined;
                        }
                    }
                }

                if (minExpirationTurns !== null && expirationMode !== 'None') {
                    metadata = {
                        turnAdded: this._promptTurnCount,
                        messageType: 'action-result',
                        expirationTurns: minExpirationTurns,
                        expirationMode: expirationMode,
                        compactMode: compactMode,
                        compactLength: compactLength,
                        compactPromptId: compactPromptId
                    };
                }
            }

            if (addConversationMessage) {
                // Add user message with results
                params.conversationMessages.push({
                    role: 'user',
                    content: resultsMessage,
                    metadata: metadata
                } as AgentChatMessage);

                // Surface explicit AI directives
                const allDirectives = actionSummaries
                    .filter(a => a.success && a.aiDirectives && a.aiDirectives.length > 0)
                    .flatMap(a => a.aiDirectives!);
                if (allDirectives.length > 0) {
                    const directiveText = allDirectives
                        .map(d => `[${d.Priority.toUpperCase()}/${d.Type}] ${d.Message}`)
                        .join('\n\n');
                    params.conversationMessages.push({
                        role: 'user',
                        content: `IMPORTANT — Follow these directives from the action results:\n\n${directiveText}`
                    });
                }
            }

            // Call agent type's post-processing for actions
            let finalPayload = currentPayload;
            
            try {
                const actionResultsOnly = actionResults.map(r => r.result).filter(r => r !== undefined) as ActionResult[];
                
                const payloadChangeRequest = await this.AgentTypeInstance.PostProcessActionStep(
                    actionResultsOnly,
                    actions,
                    currentPayload,
                    this.AgentTypeState,
                    previousDecision
                );
                
                if (payloadChangeRequest) {
                    const allowedPaths = params.agent.PayloadSelfWritePaths 
                        ? JSON.parse(params.agent.PayloadSelfWritePaths) 
                        : this.getDefaultPayloadSelfWritePaths();
                    
                    const changeResult = this._payloadManager.applyAgentChangeRequest(
                        currentPayload,
                        payloadChangeRequest,
                        {
                            validateChanges: true,
                            logChanges: true,
                            agentName: params.agent.Name,
                            analyzeChanges: true,
                            generateDiff: true,
                            allowedPaths: allowedPaths,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled()
                        }
                    );
                    
                    finalPayload = changeResult.result;
                    if (lastStep) {
                        lastStep.PayloadAtEnd = this.serializePayloadAtEnd(finalPayload);
                        await lastStep.Save();
                    }
                    
                    if (changeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Action post-processing payload warnings: ${changeResult.warnings.join('; ')}`);
                    }
                }
            } catch (error) {
                LogError(`Error in PostProcessActionStep: ${(error as Error).message}`);
            }
            
            return {
                terminate: false,
                step: 'Retry',
                previousPayload: previousDecision?.previousPayload || null,
                newPayload: finalPayload,
                priorStepResult: actionSummaries,
                retryReason: failedActions.length > 0
                    ? `Processing results with ${failedActions.length} failed action(s): ${failedActions.map(a => a.actionName).join(', ')}`
                    : `Analyzing results from ${actionSummaries.length} completed action(s) to formulate response`
            };
        }
        catch (e) {
            return {
                terminate: false,
                step: 'Retry',
                errorMessage: e instanceof Error ? e.message : String(e),
                retryReason: 'Error while processing actions, retry',
                newPayload: previousDecision?.newPayload || null,
                previousPayload: previousDecision?.previousPayload || null,
            };
        }
    }
}
