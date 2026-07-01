import { LogError, LogStatusEx } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { ExecuteAgentParams, ExecuteAgentResult, MJAIAgentRunEntityExtended } from "@memberjunction/ai-core-plus";
import { SafeJSONParse, CleanAndParseJSON } from "@memberjunction/global";
import { FireAndForgetHelper, StallDecision } from "./fireAndForgetHelper";

/** Mutable holder for the most recent run id observed on the PubSub stream. */
interface RunIdRef { id?: string; }

/**
 * Client for executing AI operations through GraphQL.
 * This class provides an easy way to execute AI prompts and agents from a client application.
 * 
 * The GraphQLAIClient follows the same naming convention as other GraphQL clients
 * in the MemberJunction ecosystem, such as GraphQLActionClient and GraphQLSystemUserClient.
 * 
 * @example
 * ```typescript
 * // Create the client
 * const aiClient = new GraphQLAIClient(graphQLProvider);
 * 
 * // Run an AI prompt
 * const promptResult = await aiClient.RunAIPrompt({
 *   promptId: "prompt-id",
 *   data: { context: "user data" },
 *   temperature: 0.7
 * });
 * 
 * // Run an AI agent
 * const agentResult = await aiClient.RunAIAgent({
 *   agentId: "agent-id",
 *   messages: [{ role: "user", content: "Hello" }],
 *   sessionId: "session-123"
 * });
 * ```
 */
export class GraphQLAIClient {
    /**
     * The GraphQLDataProvider instance used to execute GraphQL requests
     * @private
     */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLAIClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Run an AI prompt with the specified parameters.
     * 
     * This method invokes an AI prompt on the server through GraphQL and returns the result.
     * Parameters are automatically serialized as needed, and results are parsed for consumption.
     * 
     * @param params The parameters for running the AI prompt
     * @returns A Promise that resolves to a RunAIPromptResult object
     * 
     * @example
     * ```typescript
     * const result = await aiClient.RunAIPrompt({
     *   promptId: "prompt-id",
     *   data: { key: "value" },
     *   temperature: 0.7,
     *   topP: 0.9
     * });
     * 
     * if (result.success) {
     *   console.log('Output:', result.output);
     *   console.log('Parsed Result:', result.parsedResult);
     * } else {
     *   console.error('Error:', result.error);
     * }
     * ```
     */
    public async RunAIPrompt(params: RunAIPromptParams): Promise<RunAIPromptResult> {
        try {
            // Build the mutation with all possible parameters
            const mutation = gql`
                mutation RunAIPrompt(
                    $promptId: String!,
                    $data: String,
                    $overrideModelId: String,
                    $overrideVendorId: String,
                    $configurationId: String,
                    $skipValidation: Boolean,
                    $templateData: String,
                    $responseFormat: String,
                    $temperature: Float,
                    $topP: Float,
                    $topK: Int,
                    $minP: Float,
                    $frequencyPenalty: Float,
                    $presencePenalty: Float,
                    $seed: Int,
                    $stopSequences: [String!],
                    $includeLogProbs: Boolean,
                    $topLogProbs: Int,
                    $messages: String,
                    $rerunFromPromptRunID: String,
                    $systemPromptOverride: String
                ) {
                    RunAIPrompt(
                        promptId: $promptId,
                        data: $data,
                        overrideModelId: $overrideModelId,
                        overrideVendorId: $overrideVendorId,
                        configurationId: $configurationId,
                        skipValidation: $skipValidation,
                        templateData: $templateData,
                        responseFormat: $responseFormat,
                        temperature: $temperature,
                        topP: $topP,
                        topK: $topK,
                        minP: $minP,
                        frequencyPenalty: $frequencyPenalty,
                        presencePenalty: $presencePenalty,
                        seed: $seed,
                        stopSequences: $stopSequences,
                        includeLogProbs: $includeLogProbs,
                        topLogProbs: $topLogProbs,
                        messages: $messages,
                        rerunFromPromptRunID: $rerunFromPromptRunID,
                        systemPromptOverride: $systemPromptOverride
                    ) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        tokensUsed
                        promptRunId
                        rawResult
                        validationResult
                        chatResult
                    }
                }
            `;

            // Prepare variables, serializing complex objects to JSON strings
            const variables = this.preparePromptVariables(params);

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            // Process and return the result
            return this.processPromptResult(result);
        } catch (e) {
            return this.handlePromptError(e);
        }
    }

    /**
     * Prepares variables for the AI prompt mutation
     * @param params The prompt parameters
     * @returns The prepared variables for GraphQL
     * @private
     */
    private preparePromptVariables(params: RunAIPromptParams): Record<string, any> {
        const variables: Record<string, any> = {
            promptId: params.promptId
        };

        // Serialize complex objects to JSON strings
        if (params.data !== undefined) {
            variables.data = typeof params.data === 'object' ? JSON.stringify(params.data) : params.data;
        }
        if (params.templateData !== undefined) {
            variables.templateData = typeof params.templateData === 'object' ? JSON.stringify(params.templateData) : params.templateData;
        }
        if (params.messages !== undefined) {
            variables.messages = JSON.stringify(params.messages);
        }

        // Add optional scalar parameters
        if (params.overrideModelId !== undefined) variables.overrideModelId = params.overrideModelId;
        if (params.overrideVendorId !== undefined) variables.overrideVendorId = params.overrideVendorId;
        if (params.configurationId !== undefined) variables.configurationId = params.configurationId;
        if (params.skipValidation !== undefined) variables.skipValidation = params.skipValidation;
        if (params.responseFormat !== undefined) variables.responseFormat = params.responseFormat;
        if (params.temperature !== undefined) variables.temperature = params.temperature;
        if (params.topP !== undefined) variables.topP = params.topP;
        if (params.topK !== undefined) variables.topK = params.topK;
        if (params.minP !== undefined) variables.minP = params.minP;
        if (params.frequencyPenalty !== undefined) variables.frequencyPenalty = params.frequencyPenalty;
        if (params.presencePenalty !== undefined) variables.presencePenalty = params.presencePenalty;
        if (params.seed !== undefined) variables.seed = params.seed;
        if (params.stopSequences !== undefined) variables.stopSequences = params.stopSequences;
        if (params.includeLogProbs !== undefined) variables.includeLogProbs = params.includeLogProbs;
        if (params.topLogProbs !== undefined) variables.topLogProbs = params.topLogProbs;
        if (params.rerunFromPromptRunID !== undefined) variables.rerunFromPromptRunID = params.rerunFromPromptRunID;
        if (params.systemPromptOverride !== undefined) variables.systemPromptOverride = params.systemPromptOverride;

        return variables;
    }

    /**
     * Processes the result from the AI prompt mutation
     * @param result The raw GraphQL result
     * @returns The processed RunAIPromptResult
     * @private
     */
    private processPromptResult(result: any): RunAIPromptResult {
        if (!result?.RunAIPrompt) {
            throw new Error("Invalid response from server");
        }

        const promptResult = result.RunAIPrompt;

        // Parse JSON results if they exist
        let parsedResult: any;
        let validationResult: any;
        let chatResult: any;

        try {
            if (promptResult.parsedResult) {
                parsedResult = CleanAndParseJSON(promptResult.parsedResult);
            }
        } catch (e) {
            // Keep as string if parsing fails
            parsedResult = promptResult.parsedResult;
        }

        try {
            if (promptResult.validationResult) {
                validationResult = JSON.parse(promptResult.validationResult);
            }
        } catch (e) {
            validationResult = promptResult.validationResult;
        }

        try {
            if (promptResult.chatResult) {
                chatResult = JSON.parse(promptResult.chatResult);
            }
        } catch (e) {
            chatResult = promptResult.chatResult;
        }

        return {
            success: promptResult.success,
            output: promptResult.output,
            parsedResult,
            error: promptResult.error,
            executionTimeMs: promptResult.executionTimeMs,
            tokensUsed: promptResult.tokensUsed,
            promptRunId: promptResult.promptRunId,
            rawResult: promptResult.rawResult,
            validationResult,
            chatResult
        };
    }

    /**
     * Handles errors in the AI prompt execution
     * @param e The error
     * @returns An error result
     * @private
     */
    private handlePromptError(e: unknown): RunAIPromptResult {
        const error = e as Error;
        LogError(`Error running AI prompt: ${error}`);
        return {
            success: false,
            error: error.message || 'Unknown error occurred'
        };
    }

    /**
     * Run an AI agent with the specified parameters.
     *
     * This method invokes an AI agent on the server through GraphQL and returns the result.
     * The agent can maintain conversation context across multiple interactions.
     *
     * If a progress callback is provided in params.onProgress, this method will subscribe
     * to real-time progress updates from the GraphQL server and forward them to the callback.
     *
     * @param params The parameters for running the AI agent
     * @returns A Promise that resolves to a RunAIAgentResult object
     *
     * @example
     * ```typescript
     * const result = await aiClient.RunAIAgent({
     *   agentId: "agent-id",
     *   messages: [
     *     { role: "user", content: "What's the weather like?" }
     *   ],
     *   sessionId: "session-123",
     *   data: { location: "New York" },
     *   onProgress: (progress) => {
     *     console.log(`Progress: ${progress.message} (${progress.percentage}%)`);
     *   }
     * });
     *
     * if (result.success) {
     *   console.log('Response:', result.payload);
     *   console.log('Execution time:', result.executionTimeMs, 'ms');
     * } else {
     *   console.error('Error:', result.errorMessage);
     * }
     * ```
     */
    public async RunAIAgent(
        params: ExecuteAgentParams,
        sourceArtifactId?: string,
        sourceArtifactVersionId?: string
    ): Promise<ExecuteAgentResult> {
        try {
            const mutation = this.buildRunAIAgentMutation();
            const variables = this.prepareAgentVariables(params, sourceArtifactId, sourceArtifactVersionId);
            // Enable fire-and-forget to avoid Azure proxy timeouts
            variables.fireAndForget = true;

            const runIdRef: RunIdRef = {};
            return await FireAndForgetHelper.Execute<ExecuteAgentResult>({
                dataProvider: this._dataProvider,
                mutation,
                variables,
                mutationFieldName: 'RunAIAgent',
                operationLabel: 'RunAIAgent',
                validateAck: (ack) => ack?.success === true,
                isCompletionEvent: (parsed) => this.isAgentCompletionEvent(parsed),
                extractResult: (parsed) => this.extractAgentResult(parsed),
                onMessage: (parsed) => {
                    this.captureAgentRunId(parsed, runIdRef);
                    if (params.onProgress) this.forwardAgentProgress(parsed, params.onProgress);
                },
                onStall: () => this.reconcileAgentRun(runIdRef.id ? `ID='${runIdRef.id}'` : undefined),
                createErrorResult: (msg) => this.createAgentErrorResult(msg),
            });
        } catch (e) {
            return this.handleAgentError(e);
        }
    }

    /**
     * Build the RunAIAgent mutation document including fireAndForget parameter.
     */
    private buildRunAIAgentMutation(): string {
        return gql`
            mutation RunAIAgent(
                $agentId: String!,
                $messages: String!,
                $sessionId: String!,
                $data: String,
                $payload: String,
                $templateData: String,
                $lastRunId: String,
                $autoPopulateLastRunPayload: Boolean,
                $configurationId: String,
                $conversationDetailId: String,
                $createArtifacts: Boolean,
                $createNotification: Boolean,
                $sourceArtifactId: String,
                $sourceArtifactVersionId: String,
                $fireAndForget: Boolean
            ) {
                RunAIAgent(
                    agentId: $agentId,
                    messages: $messages,
                    sessionId: $sessionId,
                    data: $data,
                    payload: $payload,
                    templateData: $templateData,
                    lastRunId: $lastRunId,
                    autoPopulateLastRunPayload: $autoPopulateLastRunPayload,
                    configurationId: $configurationId,
                    conversationDetailId: $conversationDetailId,
                    createArtifacts: $createArtifacts,
                    createNotification: $createNotification,
                    sourceArtifactId: $sourceArtifactId,
                    sourceArtifactVersionId: $sourceArtifactVersionId,
                    fireAndForget: $fireAndForget
                ) {
                    success
                    errorMessage
                    executionTimeMs
                    result
                }
            }
        `;
    }

    /**
     * Prepares variables for the AI agent mutation
     * @param params The agent parameters
     * @param sourceArtifactId Optional source artifact ID for versioning
     * @param sourceArtifactVersionId Optional source artifact version ID for versioning
     * @returns The prepared variables for GraphQL
     * @private
     */
    private prepareAgentVariables(
        params: ExecuteAgentParams,
        sourceArtifactId?: string,
        sourceArtifactVersionId?: string
    ): Record<string, any> {
        const variables: Record<string, any> = {
            agentId: params.agent.ID,
            messages: JSON.stringify(params.conversationMessages),
            sessionId: this._dataProvider.sessionId
        };

        // Serialize optional complex objects to JSON strings
        if (params.data !== undefined) {
            variables.data = typeof params.data === 'object' ? JSON.stringify(params.data) : params.data;
        } 
        if (params.payload !== undefined) {
            variables.payload = typeof params.payload === 'object' ? JSON.stringify(params.payload) : params.payload;
        }

        // Add optional scalar parameters
        if (params.lastRunId !== undefined) variables.lastRunId = params.lastRunId;
        if (params.autoPopulateLastRunPayload !== undefined) variables.autoPopulateLastRunPayload = params.autoPopulateLastRunPayload;
        if (params.configurationId !== undefined) variables.configurationId = params.configurationId;
        if (params.conversationDetailId !== undefined) {
            variables.conversationDetailId = params.conversationDetailId;
            // When conversationDetailId is provided, enable server-side artifact and notification creation
            // This is a GraphQL resolver-level concern, not agent execution concern
            variables.createArtifacts = true;
            variables.createNotification = true;
        }
        // Add source artifact tracking for versioning (GraphQL resolver-level concern)
        if (sourceArtifactId !== undefined) variables.sourceArtifactId = sourceArtifactId;
        if (sourceArtifactVersionId !== undefined) variables.sourceArtifactVersionId = sourceArtifactVersionId;

        return variables;
    }

    /**
     * Processes the result from the AI agent mutation
     * @param result The raw GraphQL result
     * @returns The processed RunAIAgentResult
     * @private
     */
    private processAgentResult(result: string): ExecuteAgentResult {
        return SafeJSONParse(result) as ExecuteAgentResult;        
    }

    /**
     * Handles errors in the AI agent execution
     * @param e The error
     * @returns An error result
     * @private
     */
    private handleAgentError(e: unknown): ExecuteAgentResult {
        const error = e as Error;
        const errorMessage = error?.message || String(e);
        LogError(`Error running AI agent: ${errorMessage}`);

        // Provide a meaningful error message that helps the user understand what happened.
        // CORS/network errors from Azure proxy timeouts appear as "Failed to fetch".
        const isFetchError = errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError');
        const isTimeoutError = errorMessage.includes('timed out') || errorMessage.includes('timeout');

        let userMessage: string;
        if (isFetchError) {
            userMessage = 'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.';
        } else if (isTimeoutError) {
            userMessage = errorMessage; // Already has a helpful message from the completion timeout
        } else {
            userMessage = errorMessage;
        }

        return {
            success: false,
            agentRun: undefined,
            errorMessage: userMessage
        } as ExecuteAgentResult;
    }

    /**
     * Run an AI agent using an existing conversation detail ID.
     * This is an optimized method that loads conversation history server-side,
     * avoiding the need to send large attachment data from client to server.
     *
     * Use this method when:
     * - The user's message has already been saved as a ConversationDetail
     * - The conversation may have attachments (images, documents, etc.)
     * - You want optimal performance by loading history on the server
     *
     * @param params The parameters for running the AI agent from conversation detail
     * @returns A Promise that resolves to an ExecuteAgentResult object
     *
     * @example
     * ```typescript
     * const result = await aiClient.RunAIAgentFromConversationDetail({
     *   conversationDetailId: "detail-id-123",
     *   agentId: "agent-id",
     *   maxHistoryMessages: 20,
     *   createArtifacts: true,
     *   onProgress: (progress) => {
     *     console.log(`Progress: ${progress.message}`);
     *   }
     * });
     * ```
     */
    public async RunAIAgentFromConversationDetail(
        params: RunAIAgentFromConversationDetailParams
    ): Promise<ExecuteAgentResult> {
        try {
            const mutation = this.buildConversationDetailMutation();
            const variables = this.prepareConversationDetailVariables(params);

            return await FireAndForgetHelper.Execute<ExecuteAgentResult>({
                dataProvider: this._dataProvider,
                mutation,
                variables,
                mutationFieldName: 'RunAIAgentFromConversationDetail',
                operationLabel: 'RunAIAgentFromConversationDetail',
                validateAck: (ack) => ack?.success === true,
                isCompletionEvent: (parsed) =>
                    this.isConversationDetailCompletionEvent(parsed, params.conversationDetailId),
                extractResult: (parsed) => this.extractAgentResult(parsed),
                onMessage: params.onProgress
                    ? (parsed) => this.forwardConversationDetailProgress(parsed, params.onProgress!)
                    : undefined,
                // Reconcile by the caller-known ConversationDetailID rather than a run id scraped off
                // the shared session stream: that key is operation-specific, so concurrent
                // conversation-detail runs on one session can never cross-resolve to each other.
                onStall: () => this.reconcileAgentRun(`ConversationDetailID='${params.conversationDetailId}'`),
                createErrorResult: (msg) => this.createAgentErrorResult(msg),
            });
        } catch (e) {
            return this.handleAgentError(e);
        }
    }

    /**
     * Build the RunAIAgentFromConversationDetail mutation document.
     */
    private buildConversationDetailMutation(): string {
        return gql`
            mutation RunAIAgentFromConversationDetail(
                $conversationDetailId: String!,
                $agentId: String!,
                $sessionId: String!,
                $maxHistoryMessages: Int,
                $data: String,
                $payload: String,
                $lastRunId: String,
                $autoPopulateLastRunPayload: Boolean,
                $configurationId: String,
                $planMode: Boolean,
                $requestedSkillIDs: [String!],
                $createArtifacts: Boolean,
                $createNotification: Boolean,
                $sourceArtifactId: String,
                $sourceArtifactVersionId: String,
                $fireAndForget: Boolean
            ) {
                RunAIAgentFromConversationDetail(
                    conversationDetailId: $conversationDetailId,
                    agentId: $agentId,
                    sessionId: $sessionId,
                    maxHistoryMessages: $maxHistoryMessages,
                    data: $data,
                    payload: $payload,
                    lastRunId: $lastRunId,
                    autoPopulateLastRunPayload: $autoPopulateLastRunPayload,
                    configurationId: $configurationId,
                    planMode: $planMode,
                    requestedSkillIDs: $requestedSkillIDs,
                    createArtifacts: $createArtifacts,
                    createNotification: $createNotification,
                    sourceArtifactId: $sourceArtifactId,
                    sourceArtifactVersionId: $sourceArtifactVersionId,
                    fireAndForget: $fireAndForget
                ) {
                    success
                    errorMessage
                    executionTimeMs
                    result
                }
            }
        `;
    }

    /**
     * Prepare variables for RunAIAgentFromConversationDetail mutation.
     */
    private prepareConversationDetailVariables(
        params: RunAIAgentFromConversationDetailParams
    ): Record<string, unknown> {
        const variables: Record<string, unknown> = {
            conversationDetailId: params.conversationDetailId,
            agentId: params.agentId,
            sessionId: this._dataProvider.sessionId,
            fireAndForget: true
        };

        if (params.maxHistoryMessages !== undefined) variables.maxHistoryMessages = params.maxHistoryMessages;
        if (params.data !== undefined) {
            variables.data = typeof params.data === 'object' ? JSON.stringify(params.data) : params.data;
        }
        if (params.payload !== undefined) {
            variables.payload = typeof params.payload === 'object' ? JSON.stringify(params.payload) : params.payload;
        }
        if (params.lastRunId !== undefined) variables.lastRunId = params.lastRunId;
        if (params.autoPopulateLastRunPayload !== undefined) variables.autoPopulateLastRunPayload = params.autoPopulateLastRunPayload;
        if (params.configurationId !== undefined) variables.configurationId = params.configurationId;
        if (params.planMode !== undefined) variables.planMode = params.planMode;
        if (params.requestedSkillIDs !== undefined) variables.requestedSkillIDs = params.requestedSkillIDs;
        if (params.createArtifacts !== undefined) variables.createArtifacts = params.createArtifacts;
        if (params.createNotification !== undefined) variables.createNotification = params.createNotification;
        if (params.sourceArtifactId !== undefined) variables.sourceArtifactId = params.sourceArtifactId;
        if (params.sourceArtifactVersionId !== undefined) variables.sourceArtifactVersionId = params.sourceArtifactVersionId;

        return variables;
    }

    // ===== Agent Event Matching =====

    /**
     * Check if a PubSub message is the completion event for an agent execution.
     * Used by RunAIAgent which doesn't have a conversationDetailId to correlate on.
     */
    private isAgentCompletionEvent(parsed: Record<string, unknown>): boolean {
        const data = parsed.data as Record<string, unknown> | undefined;
        return parsed.resolver === 'RunAIAgentResolver' &&
            parsed.type === 'StreamingContent' &&
            data?.type === 'complete';
    }

    /**
     * Check if a PubSub message is the completion event for a specific conversation detail.
     * Used by RunAIAgentFromConversationDetail which correlates by conversationDetailId.
     */
    private isConversationDetailCompletionEvent(
        parsed: Record<string, unknown>,
        conversationDetailId: string
    ): boolean {
        const data = parsed.data as Record<string, unknown> | undefined;
        return parsed.resolver === 'RunAIAgentResolver' &&
            parsed.type === 'StreamingContent' &&
            data?.type === 'complete' &&
            data?.conversationDetailId === conversationDetailId;
    }

    // ===== Agent Run Reconciliation (idle-stall recovery) =====

    /**
     * Capture the agent run id from any PubSub message so the reconciliation hook has a
     * handle even before progress flows. Used only by the plain RunAIAgent path, which
     * has no conversationDetailId to reconcile on (the conversation-detail path reconciles
     * by ConversationDetailID instead). Heartbeats carry `data.runId`;
     * progress/streaming/completion carry `data.agentRunId`. Ignores the 'unknown'
     * placeholder used by background error events.
     */
    private captureAgentRunId(parsed: Record<string, unknown>, ref: RunIdRef): void {
        const data = parsed.data as Record<string, unknown> | undefined;
        const id = (data?.agentRunId ?? data?.runId) as string | undefined;
        if (id && id !== 'unknown') {
            ref.id = id;
        }
    }

    /**
     * Reconcile against the persisted AI Agent Run when the client idle timer expires.
     * `filter` selects the run: the plain path passes `ID='<captured run id>'`; the
     * conversation-detail path passes `ConversationDetailID='<id>'` (a stable,
     * operation-specific key). 'Running' means execution is genuinely in progress (keep
     * waiting); any other status means executeAIAgent already returned, so we resolve
     * from the record — recovering a completion event lost to a socket blip.
     *
     * The recovered result rehydrates `payload` from the run's persisted Result so a
     * programmatic caller still receives the agent's output. The interactive
     * `responseForm` / actionable + automatic commands are intentionally NOT
     * reconstructed here: they live on the response ConversationDetail and the
     * conversation UI renders them from that record, independent of this return value.
     */
    private async reconcileAgentRun(filter: string | undefined): Promise<StallDecision<ExecuteAgentResult>> {
        if (!filter) {
            return 'continue'; // no handle yet — bounded by maxStallReconciles
        }

        const view = await this._dataProvider.RunView<MJAIAgentRunEntityExtended>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC', // newest run wins if a conversation detail was retried
            ResultType: 'entity_object',
            BypassCache: true, // true DB state — server wrote this via a different provider
        });

        const run = view.Success ? view.Results?.[0] : undefined;
        if (!run) {
            return 'continue'; // run not created yet / transient read miss — bounded by maxStallReconciles
        }

        if (run.Status === 'Running') {
            return 'continue';
        }

        const success = run.Status === 'Completed' || run.Status === 'Paused' || run.Status === 'AwaitingFeedback';
        return {
            resolve: {
                success,
                agentRun: run,
                payload: run.Result ? SafeJSONParse(run.Result) ?? undefined : undefined,
                errorMessage: run.ErrorMessage ?? undefined,
            } as ExecuteAgentResult,
        };
    }

    // ===== Agent Result Extraction =====

    /**
     * Extract an ExecuteAgentResult from a completion PubSub message.
     * The server publishes the full result JSON in the completion event data.
     */
    private extractAgentResult(parsed: Record<string, unknown>): ExecuteAgentResult {
        const data = parsed.data as Record<string, unknown>;
        const resultJson = data.result as string | undefined;
        if (resultJson) {
            return SafeJSONParse(resultJson) as ExecuteAgentResult;
        }
        // Fallback: construct a minimal result from the event data
        return {
            success: data.success as boolean,
            agentRun: undefined,
        } as ExecuteAgentResult;
    }

    // ===== Agent Progress Forwarding =====

    /**
     * Forward agent execution progress from PubSub to the AgentExecutionProgressCallback.
     * Maps server-side `currentStep` to the callback's expected `step` field.
     */
    private forwardAgentProgress(
        parsed: Record<string, unknown>,
        onProgress: NonNullable<ExecuteAgentParams['onProgress']>
    ): void {
        if (parsed.resolver !== 'RunAIAgentResolver' ||
            parsed.type !== 'ExecutionProgress' ||
            parsed.status !== 'ok') {
            return;
        }

        const data = parsed.data as Record<string, unknown> | undefined;
        const progress = data?.progress as Record<string, unknown> | undefined;
        if (!progress) return;

        onProgress({
            step: (progress.currentStep as string) as 'initialization',
            percentage: progress.percentage as number | undefined,
            message: progress.message as string,
            metadata: progress as Record<string, unknown>,
        });
    }

    /**
     * Forward agent execution progress from PubSub to the conversation detail progress callback.
     * Passes `currentStep` directly since the callback interface already uses that field name.
     */
    private forwardConversationDetailProgress(
        parsed: Record<string, unknown>,
        onProgress: NonNullable<RunAIAgentFromConversationDetailParams['onProgress']>
    ): void {
        if (parsed.resolver !== 'RunAIAgentResolver' ||
            parsed.type !== 'ExecutionProgress' ||
            parsed.status !== 'ok') {
            return;
        }

        const data = parsed.data as Record<string, unknown> | undefined;
        const progress = data?.progress as Record<string, unknown> | undefined;
        if (!progress) return;

        onProgress({
            currentStep: progress.currentStep as string,
            percentage: progress.percentage as number | undefined,
            message: progress.message as string,
            metadata: {
                ...progress,
                agentRun: data?.agentRun,
                agentRunId: data?.agentRunId,
            } as Record<string, unknown>,
        });
    }

    // ===== Agent Error Result =====

    /**
     * Create an error ExecuteAgentResult for fire-and-forget failures.
     */
    private createAgentErrorResult(errorMessage: string): ExecuteAgentResult {
        return {
            success: false,
            agentRun: undefined,
            errorMessage,
        } as ExecuteAgentResult;
    }

    /**
     * Execute a simple prompt without requiring a stored AI Prompt entity.
     * This method is designed for interactive components that need quick AI responses.
     * 
     * @param params The parameters for the simple prompt execution
     * @returns A Promise that resolves to a SimplePromptResult object
     * 
     * @example
     * ```typescript
     * const result = await aiClient.ExecuteSimplePrompt({
     *   systemPrompt: "You are a helpful assistant",
     *   messages: [
     *     { message: "What's the weather?", role: "user" }
     *   ],
     *   modelPower: "medium"
     * });
     * 
     * if (result.success) {
     *   console.log('Response:', result.result);
     *   if (result.resultObject) {
     *     console.log('Parsed JSON:', JSON.parse(result.resultObject));
     *   }
     * }
     * ```
     */
    public async ExecuteSimplePrompt(params: ExecuteSimplePromptParams): Promise<SimplePromptResult> {
        try {
            const mutation = gql`
                mutation ExecuteSimplePrompt(
                    $systemPrompt: String!,
                    $messages: String,
                    $preferredModels: [String!],
                    $modelPower: String,
                    $responseFormat: String
                ) {
                    ExecuteSimplePrompt(
                        systemPrompt: $systemPrompt,
                        messages: $messages,
                        preferredModels: $preferredModels,
                        modelPower: $modelPower,
                        responseFormat: $responseFormat
                    ) {
                        success
                        result
                        resultObject
                        modelName
                        error
                        executionTimeMs
                    }
                }
            `;

            // Prepare variables
            const variables: Record<string, any> = {
                systemPrompt: params.systemPrompt
            };

            // Convert messages array to JSON string if provided
            if (params.messages && params.messages.length > 0) {
                variables.messages = JSON.stringify(params.messages);
            }

            if (params.preferredModels) {
                variables.preferredModels = params.preferredModels;
            }

            if (params.modelPower) {
                variables.modelPower = params.modelPower;
            }

            if (params.responseFormat) {
                variables.responseFormat = params.responseFormat;
            }

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.ExecuteSimplePrompt) {
                throw new Error("Invalid response from server");
            }

            const promptResult = result.ExecuteSimplePrompt;

            // Parse resultObject if it exists
            let resultObject: any;
            if (promptResult.resultObject) {
                try {
                    resultObject = JSON.parse(promptResult.resultObject);
                } catch (e) {
                    resultObject = promptResult.resultObject;
                }
            }

            return {
                success: promptResult.success,
                result: promptResult.result,
                resultObject,
                modelName: promptResult.modelName,
                error: promptResult.error,
                executionTimeMs: promptResult.executionTimeMs
            };

        } catch (e) {
            const error = e as Error;
            LogError(`Error executing simple prompt: ${error}`);
            return {
                success: false,
                modelName: 'Unknown',
                error: error.message || 'Unknown error occurred'
            };
        }
    }

    /**
     * Generate embeddings for text using local embedding models.
     * This method is designed for interactive components that need fast similarity calculations.
     * 
     * @param params The parameters for embedding generation
     * @returns A Promise that resolves to an EmbedTextResult object
     * 
     * @example
     * ```typescript
     * const result = await aiClient.EmbedText({
     *   textToEmbed: ["Hello world", "How are you?"],
     *   modelSize: "small"
     * });
     * 
     * console.log('Embeddings:', result.embeddings);
     * console.log('Model used:', result.modelName);
     * console.log('Dimensions:', result.vectorDimensions);
     * ```
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        try {
            const mutation = gql`
                mutation EmbedText(
                    $textToEmbed: [String!]!,
                    $modelSize: String!
                ) {
                    EmbedText(
                        textToEmbed: $textToEmbed,
                        modelSize: $modelSize
                    ) {
                        embeddings
                        modelName
                        vectorDimensions
                        error
                    }
                }
            `;

            // Prepare variables - handle both single string and array
            const textArray = Array.isArray(params.textToEmbed) 
                ? params.textToEmbed 
                : [params.textToEmbed];

            const variables = {
                textToEmbed: textArray,
                modelSize: params.modelSize
            };

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.EmbedText) {
                throw new Error("Invalid response from server");
            }

            const embedResult = result.EmbedText;

            // Return single embedding or array based on input
            const returnEmbeddings = Array.isArray(params.textToEmbed)
                ? embedResult.embeddings
                : embedResult.embeddings[0];

            return {
                embeddings: returnEmbeddings,
                modelName: embedResult.modelName,
                vectorDimensions: embedResult.vectorDimensions,
                error: embedResult.error
            };

        } catch (e) {
            const error = e as Error;
            LogError(`Error generating embeddings: ${error}`);
            return {
                embeddings: Array.isArray(params.textToEmbed) ? [] : [],
                modelName: 'Unknown',
                vectorDimensions: 0,
                error: error.message || 'Unknown error occurred'
            };
        }
    }

    /**
     * Trigger the autotagging pipeline (fire-and-forget).
     * Returns a PipelineRunID that can be used to subscribe to PipelineProgress.
     */
    public async RunAutotagPipeline(options?: {
        contentSourceIDs?: string[];
        forceReprocess?: boolean;
    }): Promise<AutotagPipelineResult> {
        try {
            const mutation = gql`
                mutation RunAutotagPipeline($contentSourceIDs: [String!], $forceReprocess: Boolean) {
                    RunAutotagPipeline(contentSourceIDs: $contentSourceIDs, forceReprocess: $forceReprocess) {
                        Success
                        Status
                        ErrorMessage
                        PipelineRunID
                    }
                }
            `;

            const variables: Record<string, unknown> = {};
            if (options?.contentSourceIDs?.length) {
                variables['contentSourceIDs'] = options.contentSourceIDs;
            }
            if (options?.forceReprocess) {
                variables['forceReprocess'] = true;
            }

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.RunAutotagPipeline) {
                throw new Error('Invalid response from server');
            }

            return result.RunAutotagPipeline as AutotagPipelineResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.RunAutotagPipeline failed', undefined, e);
            return {
                Success: false,
                Status: 'Error',
                ErrorMessage: e.message || 'Unknown error'
            };
        }
    }

    /**
     * Pause a running classification pipeline.
     * Sets CancellationRequested on the process run so the engine pauses after the current batch.
     */
    public async PauseClassificationPipeline(processRunID: string): Promise<AutotagPipelineResult> {
        try {
            const mutation = gql`
                mutation PauseClassificationPipeline($processRunID: String!) {
                    PauseClassificationPipeline(processRunID: $processRunID) {
                        Success
                        Status
                        ErrorMessage
                        PipelineRunID
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(mutation, { processRunID });
            if (!result?.PauseClassificationPipeline) {
                throw new Error('Invalid response from server');
            }
            return result.PauseClassificationPipeline as AutotagPipelineResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.PauseClassificationPipeline failed', undefined, e);
            return { Success: false, Status: 'Error', ErrorMessage: e.message || 'Unknown error' };
        }
    }

    /**
     * Resume a paused classification pipeline from its last completed offset.
     */
    public async ResumeClassificationPipeline(processRunID: string): Promise<AutotagPipelineResult> {
        try {
            const mutation = gql`
                mutation ResumeClassificationPipeline($processRunID: String!) {
                    ResumeClassificationPipeline(processRunID: $processRunID) {
                        Success
                        Status
                        ErrorMessage
                        PipelineRunID
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(mutation, { processRunID });
            if (!result?.ResumeClassificationPipeline) {
                throw new Error('Invalid response from server');
            }
            return result.ResumeClassificationPipeline as AutotagPipelineResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.ResumeClassificationPipeline failed', undefined, e);
            return { Success: false, Status: 'Error', ErrorMessage: e.message || 'Unknown error' };
        }
    }

    // ========================================================================
    // Tag Governance — Suggestion Inbox + Tag Health
    // ========================================================================

    /**
     * Approve a pending tag suggestion. The server-side TagGovernanceEngine
     * either creates a new tag (when strategy is 'create-new') or merges into
     * an existing tag (when strategy is 'merge-into-existing'), then re-points
     * any existing free-text ContentItemTag rows whose Tag matches ProposedName.
     */
    public async PromoteTagSuggestion(params: {
        suggestionID: string;
        strategy: 'create-new' | 'merge-into-existing';
        targetTagID?: string;
    }): Promise<PromoteSuggestionResult> {
        try {
            const mutation = gql`
                mutation PromoteTagSuggestion($suggestionID: String!, $strategy: String!, $targetTagID: String) {
                    PromoteTagSuggestion(suggestionID: $suggestionID, strategy: $strategy, targetTagID: $targetTagID) {
                        Success
                        ResolvedTagID
                        ResolvedTagName
                        ErrorMessage
                    }
                }
            `;
            const variables: Record<string, unknown> = {
                suggestionID: params.suggestionID,
                strategy: params.strategy,
            };
            if (params.targetTagID) variables['targetTagID'] = params.targetTagID;
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            if (!result?.PromoteTagSuggestion) throw new Error('Invalid response from server');
            return result.PromoteTagSuggestion as PromoteSuggestionResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.PromoteTagSuggestion failed', undefined, e);
            return { Success: false, ErrorMessage: e.message || 'Unknown error' };
        }
    }

    /** Reject a pending tag suggestion with optional reviewer notes. */
    public async RejectTagSuggestion(params: { suggestionID: string; reviewerNotes?: string }): Promise<RejectSuggestionResult> {
        try {
            const mutation = gql`
                mutation RejectTagSuggestion($suggestionID: String!, $reviewerNotes: String) {
                    RejectTagSuggestion(suggestionID: $suggestionID, reviewerNotes: $reviewerNotes) {
                        Success
                        ErrorMessage
                    }
                }
            `;
            const variables: Record<string, unknown> = { suggestionID: params.suggestionID };
            if (params.reviewerNotes) variables['reviewerNotes'] = params.reviewerNotes;
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            if (!result?.RejectTagSuggestion) throw new Error('Invalid response from server');
            return result.RejectTagSuggestion as RejectSuggestionResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.RejectTagSuggestion failed', undefined, e);
            return { Success: false, ErrorMessage: e.message || 'Unknown error' };
        }
    }

    /**
     * Rebuild persisted tag embeddings for tags whose EmbeddingModelID doesn't
     * match the configured embedding model. Run after a global model change.
     */
    public async RebuildTagEmbeddings(): Promise<RebuildTagEmbeddingsResult> {
        try {
            const mutation = gql`
                mutation RebuildTagEmbeddings {
                    RebuildTagEmbeddings {
                        Success
                        Refreshed
                        Total
                        ErrorMessage
                    }
                }
            `;
            const result = await this._dataProvider.ExecuteGQL(mutation, {});
            if (!result?.RebuildTagEmbeddings) throw new Error('Invalid response from server');
            return result.RebuildTagEmbeddings as RebuildTagEmbeddingsResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.RebuildTagEmbeddings failed', undefined, e);
            return { Success: false, Refreshed: 0, Total: 0, ErrorMessage: e.message || 'Unknown error' };
        }
    }

    /**
     * Run the Tag Health emitters (merge / low-usage / wide-node) on demand.
     * All threshold parameters fall back to DEFAULT_TAG_HEALTH_THRESHOLDS server-side.
     */
    public async RunTagHealth(params?: {
        minCoOccurrence?: number;
        minNameSimilarity?: number;
        minEmbeddingSimilarity?: number;
        maxUsage?: number;
        maxImplicitChildren?: number;
    }): Promise<RunTagHealthResult> {
        try {
            const mutation = gql`
                mutation RunTagHealth(
                    $minCoOccurrence: Int,
                    $minNameSimilarity: Float,
                    $minEmbeddingSimilarity: Float,
                    $maxUsage: Int,
                    $maxImplicitChildren: Int
                ) {
                    RunTagHealth(
                        minCoOccurrence: $minCoOccurrence,
                        minNameSimilarity: $minNameSimilarity,
                        minEmbeddingSimilarity: $minEmbeddingSimilarity,
                        maxUsage: $maxUsage,
                        maxImplicitChildren: $maxImplicitChildren
                    ) {
                        Success
                        MergeCount
                        LowUsageCount
                        WideNodeCount
                        DurationMs
                        ErrorMessage
                    }
                }
            `;
            const variables: Record<string, unknown> = {};
            if (params?.minCoOccurrence != null) variables['minCoOccurrence'] = params.minCoOccurrence;
            if (params?.minNameSimilarity != null) variables['minNameSimilarity'] = params.minNameSimilarity;
            if (params?.minEmbeddingSimilarity != null) variables['minEmbeddingSimilarity'] = params.minEmbeddingSimilarity;
            if (params?.maxUsage != null) variables['maxUsage'] = params.maxUsage;
            if (params?.maxImplicitChildren != null) variables['maxImplicitChildren'] = params.maxImplicitChildren;
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            if (!result?.RunTagHealth) throw new Error('Invalid response from server');
            return result.RunTagHealth as RunTagHealthResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.RunTagHealth failed', undefined, e);
            return {
                Success: false,
                MergeCount: 0,
                LowUsageCount: 0,
                WideNodeCount: 0,
                DurationMs: 0,
                ErrorMessage: e.message || 'Unknown error'
            };
        }
    }

    /**
     * Trigger vectorization for an entity document.
     * Calls the server-side EntityVectorSyncer to embed and upsert entity records.
     */
    public async VectorizeEntity(params: VectorizeEntityParams): Promise<VectorizeEntityResult> {
        try {
            const mutation = gql`
                mutation VectorizeEntity(
                    $entityDocumentID: String!,
                    $entityID: String!,
                    $batchSize: Float
                ) {
                    VectorizeEntity(
                        entityDocumentID: $entityDocumentID,
                        entityID: $entityID,
                        batchSize: $batchSize
                    ) {
                        Success
                        Status
                        ErrorMessage
                        PipelineRunID
                    }
                }
            `;

            const variables: Record<string, unknown> = {
                entityDocumentID: params.entityDocumentID,
                entityID: params.entityID
            };
            if (params.batchSize !== undefined) {
                variables['batchSize'] = params.batchSize;
            }

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.VectorizeEntity) {
                throw new Error('Invalid response from server');
            }

            return result.VectorizeEntity as VectorizeEntityResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.VectorizeEntity failed', undefined, e);
            return {
                Success: false,
                Status: 'Error',
                ErrorMessage: e.message || 'Unknown error'
            };
        }
    }

    /**
     * Fetch vectors with metadata from Pinecone for a given entity document.
     * Returns the vector IDs, embedding values, and metadata stored in the vector index.
     *
     * @param params The parameters for fetching entity vectors
     * @returns A Promise that resolves to a FetchEntityVectorsResult
     */
    public async FetchEntityVectors(params: FetchEntityVectorsParams): Promise<FetchEntityVectorsResult> {
        try {
            const query = gql`
                query FetchEntityVectors(
                    $entityDocumentID: String!,
                    $maxRecords: Int,
                    $filter: String
                ) {
                    FetchEntityVectors(
                        entityDocumentID: $entityDocumentID,
                        maxRecords: $maxRecords,
                        filter: $filter
                    ) {
                        Success
                        TotalCount
                        ElapsedMs
                        ErrorMessage
                        Results {
                            ID
                            Values
                            Metadata
                        }
                    }
                }
            `;

            const variables: Record<string, unknown> = {
                entityDocumentID: params.entityDocumentID,
            };
            if (params.maxRecords !== undefined) {
                variables['maxRecords'] = params.maxRecords;
            }
            if (params.filter !== undefined) {
                variables['filter'] = params.filter;
            }

            const result = await this._dataProvider.ExecuteGQL(query, variables);

            if (!result?.FetchEntityVectors) {
                throw new Error('Invalid response from server');
            }

            return result.FetchEntityVectors as FetchEntityVectorsResult;
        } catch (error: unknown) {
            const e = error as Error;
            LogError('GraphQLAIClient.FetchEntityVectors failed', undefined, e);
            return {
                Success: false,
                Results: [],
                TotalCount: 0,
                ElapsedMs: 0,
                ErrorMessage: e.message || 'Unknown error',
            };
        }
    }
}

/** Result from RunAutotagPipeline */
export interface AutotagPipelineResult {
    Success: boolean;
    Status?: string;
    ErrorMessage?: string;
    PipelineRunID?: string;
}

/** Result from PromoteTagSuggestion. */
export interface PromoteSuggestionResult {
    Success: boolean;
    ResolvedTagID?: string;
    ResolvedTagName?: string;
    ErrorMessage?: string;
}

/** Result from RejectTagSuggestion. */
export interface RejectSuggestionResult {
    Success: boolean;
    ErrorMessage?: string;
}

/** Result from RebuildTagEmbeddings. */
export interface RebuildTagEmbeddingsResult {
    Success: boolean;
    Refreshed: number;
    Total: number;
    ErrorMessage?: string;
}

/** Result from RunTagHealth. */
export interface RunTagHealthResult {
    Success: boolean;
    MergeCount: number;
    LowUsageCount: number;
    WideNodeCount: number;
    DurationMs: number;
    ErrorMessage?: string;
}

/** Parameters for VectorizeEntity */
export interface VectorizeEntityParams {
    entityDocumentID: string;
    entityID: string;
    batchSize?: number;
}

/** Result from VectorizeEntity */
export interface VectorizeEntityResult {
    Success: boolean;
    Status?: string;
    ErrorMessage?: string;
    PipelineRunID?: string;
    RecordsProcessed?: number;
}

/** Parameters for FetchEntityVectors */
export interface FetchEntityVectorsParams {
    /** The ID of the EntityDocument whose vectors to fetch */
    entityDocumentID: string;
    /** Maximum number of vectors to return (default 1000) */
    maxRecords?: number;
    /** Optional additional filter string */
    filter?: string;
}

/** A single vector record with its embedding and metadata */
export interface EntityVectorItemResult {
    /** The vector ID in the index */
    ID: string;
    /** The embedding vector values */
    Values: number[];
    /** JSON-serialized metadata stored with the vector */
    Metadata: string;
}

/** Result from FetchEntityVectors */
export interface FetchEntityVectorsResult {
    Success: boolean;
    Results: EntityVectorItemResult[];
    TotalCount: number;
    ElapsedMs: number;
    ErrorMessage?: string;
}

/**
 * Parameters for executing a simple prompt
 */
export interface ExecuteSimplePromptParams {
    /**
     * The system prompt to set context for the model
     */
    systemPrompt: string;
    
    /**
     * Optional message history
     */
    messages?: Array<{message: string, role: 'user' | 'assistant'}>;
    
    /**
     * Preferred model names to use
     */
    preferredModels?: string[];
    
    /**
     * Power level for model selection
     */
    modelPower?: 'lowest' | 'medium' | 'highest';
    
    /**
     * Response format (e.g., "json")
     */
    responseFormat?: string;
}

/**
 * Result from executing a simple prompt
 */
export interface SimplePromptResult {
    /**
     * Whether the execution was successful
     */
    success: boolean;
    
    /**
     * The text response from the model
     */
    result?: string;
    
    /**
     * Parsed JSON object if the response contained JSON
     */
    resultObject?: any;
    
    /**
     * Name of the model used
     */
    modelName: string;
    
    /**
     * Error message if execution failed
     */
    error?: string;
    
    /**
     * Execution time in milliseconds
     */
    executionTimeMs?: number;
}

/**
 * Parameters for generating text embeddings
 */
export interface EmbedTextParams {
    /**
     * Text or array of texts to embed
     */
    textToEmbed: string | string[];
    
    /**
     * Size of the embedding model to use
     */
    modelSize: 'small' | 'medium';
}

/**
 * Result from generating text embeddings
 */
export interface EmbedTextResult {
    /**
     * Single embedding vector or array of vectors
     */
    embeddings: number[] | number[][];
    
    /**
     * Name of the model used
     */
    modelName: string;
    
    /**
     * Number of dimensions in each vector
     */
    vectorDimensions: number;
    
    /**
     * Error message if generation failed
     */
    error?: string;
}

/**
 * Parameters for running an AI prompt
 */
export interface RunAIPromptParams {
    /**
     * The ID of the AI prompt to run
     */
    promptId: string;
    
    /**
     * Data context to pass to the prompt (will be JSON serialized)
     */
    data?: Record<string, any>;
    
    /**
     * Override the default model ID
     */
    overrideModelId?: string;
    
    /**
     * Override the default vendor ID
     */
    overrideVendorId?: string;
    
    /**
     * Configuration ID to use
     */
    configurationId?: string;
    
    /**
     * Skip validation of the prompt
     */
    skipValidation?: boolean;
    
    /**
     * Template data for prompt templating (will be JSON serialized)
     */
    templateData?: Record<string, any>;
    
    /**
     * Response format (e.g., "json", "text")
     */
    responseFormat?: string;
    
    /**
     * Temperature parameter for the model (0.0 to 1.0)
     */
    temperature?: number;
    
    /**
     * Top-p sampling parameter
     */
    topP?: number;
    
    /**
     * Top-k sampling parameter
     */
    topK?: number;
    
    /**
     * Min-p sampling parameter
     */
    minP?: number;
    
    /**
     * Frequency penalty parameter
     */
    frequencyPenalty?: number;
    
    /**
     * Presence penalty parameter
     */
    presencePenalty?: number;
    
    /**
     * Random seed for reproducible outputs
     */
    seed?: number;
    
    /**
     * Stop sequences for the model
     */
    stopSequences?: string[];
    
    /**
     * Include log probabilities in the response
     */
    includeLogProbs?: boolean;
    
    /**
     * Number of top log probabilities to include
     */
    topLogProbs?: number;
    
    /**
     * Conversation messages (will be JSON serialized)
     */
    messages?: Array<{ role: string; content: string }>;
    
    /**
     * ID of a previous prompt run to rerun from
     */
    rerunFromPromptRunID?: string;
    
    /**
     * Override the system prompt
     */
    systemPromptOverride?: string;
}

/**
 * Result from running an AI prompt
 */
export interface RunAIPromptResult {
    /**
     * Whether the prompt execution was successful
     */
    success: boolean;
    
    /**
     * The output from the prompt
     */
    output?: string;
    
    /**
     * Parsed result data (if applicable)
     */
    parsedResult?: any;
    
    /**
     * Error message if the execution failed
     */
    error?: string;
    
    /**
     * Execution time in milliseconds
     */
    executionTimeMs?: number;
    
    /**
     * Number of tokens used
     */
    tokensUsed?: number;
    
    /**
     * ID of the prompt run record
     */
    promptRunId?: string;
    
    /**
     * Raw result from the model
     */
    rawResult?: string;
    
    /**
     * Validation result data
     */
    validationResult?: any;
    
    /**
     * Chat completion result data
     */
    chatResult?: any;
}

/**
 * Parameters for running an AI agent from an existing conversation detail.
 * This is the optimized method that loads conversation history server-side.
 */
export interface RunAIAgentFromConversationDetailParams {
    /**
     * The ID of the conversation detail (user's message) to use as context
     */
    conversationDetailId: string;

    /**
     * The ID of the AI agent to run
     */
    agentId: string;

    /**
     * Maximum number of history messages to include (default: 20)
     */
    maxHistoryMessages?: number;

    /**
     * Data context to pass to the agent (will be JSON serialized)
     */
    data?: Record<string, unknown>;

    /**
     * Payload to pass to the agent (will be JSON serialized)
     */
    payload?: Record<string, unknown> | string;

    /**
     * ID of the last agent run for continuity
     */
    lastRunId?: string;

    /**
     * Whether to auto-populate payload from last run
     */
    autoPopulateLastRunPayload?: boolean;

    /**
     * Configuration ID to use
     */
    configurationId?: string;

    /**
     * Whether Plan Mode is requested for this run (requires the agent's SupportsPlanMode capability)
     */
    planMode?: boolean;

    /**
     * Skill IDs the user requested via `/skill-name` mentions. The server intersects these with the
     * agent's accepted skills AND the user's Run permission before any are activated.
     */
    requestedSkillIDs?: string[];

    /**
     * Whether to create artifacts from the agent's payload
     */
    createArtifacts?: boolean;

    /**
     * Whether to create a user notification on completion
     */
    createNotification?: boolean;

    /**
     * Source artifact ID for versioning
     */
    sourceArtifactId?: string;

    /**
     * Source artifact version ID for versioning
     */
    sourceArtifactVersionId?: string;

    /**
     * Optional callback for progress updates
     */
    onProgress?: (progress: {
        currentStep: string;
        percentage?: number;
        message: string;
        metadata?: Record<string, unknown>;
    }) => void;
}
