/**
 * @fileoverview Agent Client Session for the MJ Agent Client SDK.
 *
 * Manages the lifecycle of a client session connected to an MJ agent.
 * Uses GraphQL transport (via Metadata.Provider) for:
 * - Subscribing to client tool requests
 * - Sending tool responses back to the server
 * - Sending enriched tool definitions to the server
 * - Running agents (wrapping GraphQLAIClient)
 *
 * Exposes RxJS observables for reactive consumption by any framework.
 *
 * @module @memberjunction/ai-agent-client
 */

import { Subject, Subscription, Observable } from 'rxjs';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
    GraphQLAIClient,
    RunAIAgentFromConversationDetailParams as GQLRunAgentFromDetailParams,
} from '@memberjunction/graphql-dataprovider';
import { ClientToolRegistry, ClientToolHandler } from './ClientToolRegistry';
import {
    ClientToolRequest,
    ClientToolResult,
    ClientToolMetadata,
    ClientToolDecorator,
    ClientToolDecoratorContext,
    ClientToolRequestEvent,
    ClientToolResultEvent,
    SessionError,
    AgentProgress,
    RunAgentParams,
    RunAgentFromConversationDetailParams,
    RunAgentResult,
} from './AgentClientTypes';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Manages a client session connected to an MJ agent.
 *
 * Handles bidirectional communication via GraphQL:
 * - Subscribes to ClientToolRequest notifications for tool invocation
 * - Sends tool responses via RespondToClientToolRequest mutation
 * - Sends enriched tool definitions via UpdateClientToolDefinitions mutation
 * - Wraps GraphQLAIClient for agent execution (RunAgent, RunAgentFromConversationDetail)
 *
 * All events are exposed as RxJS observables for framework-agnostic reactive consumption.
 *
 * @example
 * ```typescript
 * const session = new AgentClientSession();
 * session.RegisterTool({
 *     Name: 'NavigateToRecord',
 *     Description: 'Open an entity record',
 *     ParameterSchema: { type: 'object', properties: { EntityName: { type: 'string' } } },
 *     Handler: async (params) => ({ Success: true, Data: 'navigated' })
 * });
 * session.StartSession('session-123');
 * session.ToolRequested$.subscribe(event => console.log('Tool invoked:', event));
 * ```
 */
export class AgentClientSession {
    private toolRegistry: ClientToolRegistry;
    private subscription: Subscription | null = null;
    private _sessionId: string | null = null;
    private _isActive = false;

    /**
     * The metadata provider this session is bound to. Set by the constructor or via
     * {@link Provider} setter. When null, falls back to the global `Metadata.Provider`.
     *
     * **Why this exists:** browser apps can hold multiple `GraphQLDataProvider` instances
     * connected to different MJ servers in parallel (multi-tenant client, federated UIs).
     * Each `AgentClientSession` must subscribe to a specific server's tool-request stream —
     * letting the session reach for the global default would silently route every session's
     * subscription through whichever provider happened to be registered last.
     */
    private _provider: IMetadataProvider | null = null;

    /** Decorators that enrich base tool metadata with runtime context */
    private toolDecorators = new Map<string, ClientToolDecorator>();
    /** Current runtime context for decorators */
    private decoratorContext: ClientToolDecoratorContext = {
        AvailableEntities: [],
        CurrentAppName: '',
        CustomContext: {}
    };

    // --- RxJS Observable Events ---

    /** Emitted when a tool request is received from the server (before execution) */
    public ToolRequested$ = new Subject<ClientToolRequestEvent>();

    /** Emitted after a tool has been executed (with result) */
    public ToolExecuted$ = new Subject<ClientToolResultEvent>();

    /** Emitted when an error occurs during tool execution or communication */
    public Error$ = new Subject<SessionError>();

    /** Emitted when session state changes (true = active, false = stopped) */
    public SessionActive$ = new Subject<boolean>();

    /** Emitted on agent progress updates during RunAgent / RunAgentFromConversationDetail */
    public AgentProgress$ = new Subject<AgentProgress>();

    /**
     * @param toolRegistry  Optional pre-built tool registry. Defaults to a fresh empty registry.
     * @param provider      Optional `IMetadataProvider` to bind this session to. Pass an explicit
     *   provider when your app talks to multiple MJ servers in parallel; otherwise the session
     *   falls back to `Metadata.Provider` (the global default), which is fine for single-server apps.
     */
    constructor(toolRegistry?: ClientToolRegistry, provider?: IMetadataProvider) {
        this.toolRegistry = toolRegistry ?? new ClientToolRegistry();
        this._provider = provider ?? null;
    }

    /**
     * The metadata provider this session uses. Falls back to the global `Metadata.Provider`
     * when no explicit provider was supplied.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    /** The current session ID, or null if no session is active */
    public get SessionId(): string | null {
        return this._sessionId;
    }

    /** Whether a session is currently active and listening for tool requests */
    public get IsActive(): boolean {
        return this._isActive;
    }

    /** The underlying tool registry */
    public get ToolRegistry(): ClientToolRegistry {
        return this.toolRegistry;
    }

    // ================================================================
    // Tool Registration
    // ================================================================

    /**
     * Register a client-side tool. The consuming application calls this
     * to make tools available for server-side agents to invoke.
     * Re-registration is allowed (existing tool is replaced).
     */
    public RegisterTool(tool: {
        Name: string;
        Description: string;
        ParameterSchema: Record<string, unknown>;
        Handler: ClientToolHandler;
    }): void {
        if (this.toolRegistry.GetTool(tool.Name)) {
            this.toolRegistry.Unregister(tool.Name);
        }
        this.toolRegistry.Register(tool);
    }

    /**
     * Unregister a client-side tool.
     */
    public UnregisterTool(toolName: string): void {
        this.toolRegistry.Unregister(toolName);
    }

    /**
     * Get all registered tool definitions.
     */
    public GetRegisteredTools(): ReturnType<ClientToolRegistry['GetAllTools']> {
        return this.toolRegistry.GetAllTools();
    }

    // ================================================================
    // Tool Decoration & Management
    // ================================================================

    /**
     * Register a decorator that enriches a metadata-driven tool with runtime context.
     */
    public RegisterToolDecorator(toolName: string, decorator: ClientToolDecorator): void {
        this.toolDecorators.set(toolName, decorator);
    }

    /**
     * Set the runtime context that decorators receive.
     * Call this whenever context changes (user navigates, new data loads, etc.)
     */
    public SetDecoratorContext(context: ClientToolDecoratorContext): void {
        this.decoratorContext = context;
    }

    /**
     * Decorate base tools with runtime context and send definitions to the server.
     */
    public async DecorateAndSendTools(baseTools: ClientToolMetadata[]): Promise<void> {
        const enriched = baseTools.map(tool => {
            const decorator = this.toolDecorators.get(tool.Name);
            return decorator ? decorator(tool, this.decoratorContext) : tool;
        });

        if (this._sessionId) {
            await this.sendToolDefinitionsToServer(this._sessionId, enriched);
        }
    }

    /**
     * Add a client tool dynamically at runtime.
     * Registers the handler locally and notifies the server.
     */
    public async AddClientTool(tool: ClientToolMetadata & { Handler: ClientToolHandler }): Promise<void> {
        if (this.toolRegistry.GetTool(tool.Name)) {
            this.toolRegistry.Unregister(tool.Name);
        }
        this.toolRegistry.Register({
            Name: tool.Name,
            Description: tool.Description,
            ParameterSchema: tool.InputSchema,
            Handler: tool.Handler
        });
        await this.notifyToolsChanged();
    }

    /**
     * Remove a client tool at runtime.
     */
    public async RemoveClientTool(toolName: string): Promise<void> {
        this.toolRegistry.Unregister(toolName);
        await this.notifyToolsChanged();
    }

    // ================================================================
    // Session Management
    // ================================================================

    /**
     * Start listening for client tool requests for a specific session.
     * Subscribes to the GraphQL ClientToolRequest subscription via the data provider.
     *
     * @param sessionId - The agent session ID to listen for
     */
    public StartSession(sessionId: string): void {
        this.StopSession();

        this._sessionId = sessionId;
        this._isActive = true;
        this.SessionActive$.next(true);

        const provider = this.getProvider();
        if (!provider) {
            this.Error$.next({ Message: 'GraphQL provider not available — cannot start session' });
            return;
        }

        const obs: Observable<Record<string, unknown>> = provider.ClientToolRequests(sessionId);
        this.subscription = obs.subscribe({
            next: (data: Record<string, unknown>) => {
                const raw = (data as Record<string, Record<string, unknown>>)['ClientToolRequest'];
                if (!raw) return;

                const request: ClientToolRequest = {
                    RequestID: String(raw['RequestID']),
                    ToolName: String(raw['ToolName']),
                    Params: typeof raw['Params'] === 'string'
                        ? JSON.parse(raw['Params'])
                        : (raw['Params'] as Record<string, unknown>) ?? {},
                    TimeoutMs: Number(raw['TimeoutMs']) || 30000,
                };
                const agentRunID = String(raw['AgentRunID'] ?? '');

                this.handleToolRequest(request, agentRunID);
            },
            error: (err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                this.Error$.next({ Message: `Subscription error: ${msg}` });
            }
        });

        LogStatus(`AgentClientSession: session started for ${sessionId}`);
    }

    /**
     * Stop listening for client tool requests and clean up the session.
     */
    public StopSession(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
        if (this._sessionId) {
            LogStatus(`AgentClientSession: session stopped for ${this._sessionId}`);
        }
        this._sessionId = null;
        this._isActive = false;
        this.SessionActive$.next(false);
    }

    // ================================================================
    // Agent Execution
    // ================================================================

    /**
     * Run an AI agent. Wraps GraphQLAIClient.RunAIAgent() with a simplified API.
     *
     * @param params - Parameters for the agent run
     * @returns The agent execution result
     */
    public async RunAgent(params: RunAgentParams): Promise<RunAgentResult> {
        const provider = this.getProvider();
        if (!provider) {
            return { Success: false, ErrorMessage: 'GraphQL provider not available' };
        }

        const aiClient = new GraphQLAIClient(provider);

        try {
            // Build the ExecuteAgentParams expected by GraphQLAIClient.
            // GraphQLAIClient.RunAIAgent needs an ExecuteAgentParams which has an `agent` object
            // with an `ID` property. We create a minimal shim.
            const agentShim = { ID: params.AgentId } as { ID: string };

            const messages = params.Messages.map(m => ({
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content
            }));

            // Use the ExecuteGQL mutation directly for a cleaner interface,
            // since ExecuteAgentParams requires a full MJAIAgentEntityExtended object
            // which we don't have on the client side.
            const gqlRunParams: GQLRunAgentFromDetailParams = {
                conversationDetailId: params.ConversationDetailId ?? '',
                agentId: params.AgentId,
                data: params.Data,
                payload: params.Payload,
                lastRunId: params.LastRunId,
                autoPopulateLastRunPayload: params.AutoPopulateLastRunPayload,
                configurationId: params.ConfigurationId,
                planMode: params.PlanMode,
                createArtifacts: params.CreateArtifacts,
                createNotification: params.CreateNotification,
                sourceArtifactId: params.SourceArtifactId,
                sourceArtifactVersionId: params.SourceArtifactVersionId,
                onProgress: params.OnProgress ? (progress) => {
                    const agentProgress: AgentProgress = {
                        StatusMessage: progress.message,
                        PercentComplete: progress.percentage,
                        IsToolExecution: false,
                    };
                    this.AgentProgress$.next(agentProgress);
                    params.OnProgress!(agentProgress);
                } : undefined,
            };

            const result = await aiClient.RunAIAgentFromConversationDetail(gqlRunParams);

            // ExecuteAgentResult may have extra fields from the GraphQL response cast
            const resultRecord = result as Record<string, unknown>;
            return {
                Success: result.success,
                ErrorMessage: typeof resultRecord['errorMessage'] === 'string' ? resultRecord['errorMessage'] : undefined,
                ExecutionTimeMs: typeof resultRecord['executionTimeMs'] === 'number' ? resultRecord['executionTimeMs'] : undefined,
                Result: result,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AgentClientSession.RunAgent failed: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    /**
     * Run an AI agent from an existing conversation detail.
     * This is the optimized path that loads conversation history server-side.
     * Wraps GraphQLAIClient.RunAIAgentFromConversationDetail().
     *
     * @param params - Parameters for the agent run
     * @returns The agent execution result
     */
    public async RunAgentFromConversationDetail(
        params: RunAgentFromConversationDetailParams
    ): Promise<RunAgentResult> {
        const provider = this.getProvider();
        if (!provider) {
            return { Success: false, ErrorMessage: 'GraphQL provider not available' };
        }

        const aiClient = new GraphQLAIClient(provider);

        try {
            const gqlParams: GQLRunAgentFromDetailParams = {
                conversationDetailId: params.ConversationDetailId,
                agentId: params.AgentId,
                maxHistoryMessages: params.MaxHistoryMessages,
                data: params.Data,
                payload: params.Payload,
                lastRunId: params.LastRunId,
                autoPopulateLastRunPayload: params.AutoPopulateLastRunPayload,
                configurationId: params.ConfigurationId,
                planMode: params.PlanMode,
                createArtifacts: params.CreateArtifacts,
                createNotification: params.CreateNotification,
                sourceArtifactId: params.SourceArtifactId,
                sourceArtifactVersionId: params.SourceArtifactVersionId,
                onProgress: params.OnProgress ? (progress) => {
                    const agentProgress: AgentProgress = {
                        StatusMessage: progress.message,
                        PercentComplete: progress.percentage,
                        IsToolExecution: false,
                    };
                    this.AgentProgress$.next(agentProgress);
                    params.OnProgress!({
                        CurrentStep: progress.currentStep,
                        Percentage: progress.percentage,
                        Message: progress.message,
                        Metadata: progress.metadata,
                    });
                } : undefined,
            };

            const result = await aiClient.RunAIAgentFromConversationDetail(gqlParams);

            // ExecuteAgentResult may have extra fields from the GraphQL response cast
            const resultRecord = result as Record<string, unknown>;
            return {
                Success: result.success,
                ErrorMessage: typeof resultRecord['errorMessage'] === 'string' ? resultRecord['errorMessage'] : undefined,
                ExecutionTimeMs: typeof resultRecord['executionTimeMs'] === 'number' ? resultRecord['executionTimeMs'] : undefined,
                Result: result,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AgentClientSession.RunAgentFromConversationDetail failed: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    // ================================================================
    // Lifecycle
    // ================================================================

    /**
     * Dispose the session: stop listening, complete all observables, and clear state.
     * Call this when the session is no longer needed to prevent memory leaks.
     */
    public Dispose(): void {
        this.StopSession();
        this.ToolRequested$.complete();
        this.ToolExecuted$.complete();
        this.Error$.complete();
        this.SessionActive$.complete();
        this.AgentProgress$.complete();
        this.toolDecorators.clear();
    }

    // ================================================================
    // Private Helpers
    // ================================================================

    /**
     * Get the GraphQLDataProvider for this session — the explicit provider passed to the
     * constructor (or via {@link Provider} setter), falling back to the global default.
     * Returns null if the bound provider isn't a GraphQLDataProvider (the duck-typed
     * methods we need aren't present).
     */
    private getProvider(): GraphQLDataProvider | null {
        const provider = this.Provider;
        if (!provider) return null;
        // Check for the methods we need (duck-typing for safety)
        const gqlProvider = provider as unknown as GraphQLDataProvider;
        if (typeof gqlProvider.ClientToolRequests !== 'function' ||
            typeof gqlProvider.ExecuteGQL !== 'function') {
            return null;
        }
        return gqlProvider;
    }

    /**
     * Handle an incoming tool request: emit BEFORE event, honor host-side veto if set,
     * otherwise execute tool, emit AFTER event, and send response to server.
     *
     * **Cancel-enforcement:** `ToolRequested$.next(event)` fires subscribers
     * synchronously (RxJS `Subject` behavior). After the synchronous notify
     * completes, we inspect `event.Cancel` — if any subscriber set it to `true`,
     * we skip `toolRegistry.Execute`, skip the `ToolExecuted$` emit, and send a
     * failure response to the server with the optional `CancelReason` included in
     * the message. The agent receives the cancellation and can adapt its next turn.
     */
    private async handleToolRequest(request: ClientToolRequest, agentRunID: string): Promise<void> {
        const event: ClientToolRequestEvent = {
            Request: request,
            AgentRunID: agentRunID,
            Cancel: false,
        };
        this.ToolRequested$.next(event);

        if (event.Cancel) {
            const reasonSuffix = event.CancelReason ? `: ${event.CancelReason}` : '';
            const result: ClientToolResult = {
                Success: false,
                ErrorMessage: `Tool dispatch canceled by host${reasonSuffix}`,
            };
            // Intentionally NOT emitting ToolExecuted$ — the tool did not execute.
            // The JSDoc on AfterToolInvokedEventArgs (in @memberjunction/ng-conversations)
            // documents this contract on the widget side.
            await this.sendToolResponse(request.RequestID, result);
            return;
        }

        const result = await this.toolRegistry.Execute(
            request.ToolName,
            request.Params,
            request.TimeoutMs
        );

        this.ToolExecuted$.next({ Request: request, Result: result });

        await this.sendToolResponse(request.RequestID, result);
    }

    /**
     * Send a tool execution response back to the server via GraphQL mutation.
     */
    private async sendToolResponse(requestID: string, result: ClientToolResult): Promise<void> {
        const provider = this.getProvider();
        if (!provider) {
            this.Error$.next({ Message: 'GraphQL provider not available for tool response', RequestID: requestID });
            return;
        }

        try {
            const mutation = `
                mutation RespondToClientToolRequest(
                    $requestID: String!,
                    $success: Boolean!,
                    $result: String,
                    $errorMessage: String
                ) {
                    RespondToClientToolRequest(
                        requestID: $requestID,
                        success: $success,
                        result: $result,
                        errorMessage: $errorMessage
                    )
                }
            `;

            await provider.ExecuteGQL(mutation, {
                requestID,
                success: result.Success,
                result: result.Data != null ? JSON.stringify(result.Data) : undefined,
                errorMessage: result.ErrorMessage
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AgentClientSession: failed to send tool response: ${msg}`);
            this.Error$.next({ Message: `Failed to send response: ${msg}`, RequestID: requestID });
        }
    }

    /**
     * Send enriched tool definitions to the server via GraphQL mutation.
     */
    private async sendToolDefinitionsToServer(sessionID: string, tools: ClientToolMetadata[]): Promise<void> {
        const provider = this.getProvider();
        if (!provider) return;

        try {
            const mutation = `
                mutation UpdateClientToolDefinitions($sessionID: String!, $tools: String!) {
                    UpdateClientToolDefinitions(sessionID: $sessionID, tools: $tools)
                }
            `;
            await provider.ExecuteGQL(mutation, {
                sessionID,
                tools: JSON.stringify(tools)
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`AgentClientSession: failed to send tool definitions: ${msg}`);
        }
    }

    /** Notify server that client tools changed (add/remove at runtime) */
    private async notifyToolsChanged(): Promise<void> {
        if (!this._sessionId) return;

        const allTools: ClientToolMetadata[] = this.toolRegistry.GetAllTools().map(t => ({
            Name: t.Name,
            Description: t.Description,
            InputSchema: t.ParameterSchema,
        }));
        await this.sendToolDefinitionsToServer(this._sessionId, allTools);
    }
}
