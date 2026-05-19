/**
 * @fileoverview Angular adapter for the MJ Agent Client SDK.
 *
 * Thin Angular wrapper around AgentClientSession from @memberjunction/ai-agent-client.
 * Provides Angular dependency injection and lifecycle management.
 *
 * This service does NOT contain business logic, GraphQL code, or tool handlers.
 * All heavy lifting is in the core SDK. The consuming application registers tools
 * and handles events as appropriate for its context.
 *
 * @module @memberjunction/ng-agent-client
 */

import { Injectable, OnDestroy } from '@angular/core';
import {
    AgentClientSession,
    ClientToolDefinition,
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
} from '@memberjunction/ai-agent-client';
import { Observable } from 'rxjs';

/**
 * Angular injectable wrapper around the framework-agnostic AgentClientSession.
 *
 * Provides:
 * - Angular DI (providedIn: root singleton)
 * - Automatic cleanup via ngOnDestroy
 * - Pass-through access to all SDK observables and methods
 *
 * Usage:
 * ```typescript
 * const agentClient = inject(AgentClientService);
 * agentClient.RegisterTool({ Name: 'NavigateToRecord', ... });
 * agentClient.StartSession('session-123');
 * agentClient.ToolRequested$.subscribe(e => console.log('Tool:', e));
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AgentClientService implements OnDestroy {
    private session = new AgentClientSession();

    // --- Observable Pass-Through ---

    /** Emitted when a tool request is received from the server (before execution) */
    public get ToolRequested$(): Observable<ClientToolRequestEvent> {
        return this.session.ToolRequested$;
    }

    /** Emitted after a tool has been executed (with result) */
    public get ToolExecuted$(): Observable<ClientToolResultEvent> {
        return this.session.ToolExecuted$;
    }

    /** Emitted when agent execution progress updates arrive */
    public get AgentProgress$(): Observable<AgentProgress> {
        return this.session.AgentProgress$;
    }

    /** Emitted when session state changes */
    public get SessionActive$(): Observable<boolean> {
        return this.session.SessionActive$;
    }

    /** Emitted on errors during tool execution or communication */
    public get Error$(): Observable<SessionError> {
        return this.session.Error$;
    }

    // --- Session State ---

    /** The current session ID, or null if no session is active */
    public get SessionId(): string | null {
        return this.session.SessionId;
    }

    /** Whether a session is currently active */
    public get IsActive(): boolean {
        return this.session.IsActive;
    }

    // --- Tool Registration ---

    /** Register a client-side tool handler */
    public RegisterTool(tool: ClientToolDefinition): void {
        this.session.RegisterTool(tool);
    }

    /** Unregister a client-side tool */
    public UnregisterTool(toolName: string): void {
        this.session.UnregisterTool(toolName);
    }

    /** Get all registered tool definitions */
    public GetRegisteredTools(): ClientToolDefinition[] {
        return this.session.GetRegisteredTools();
    }

    // --- Tool Decoration ---

    /** Register a decorator for runtime enrichment of a metadata-driven tool */
    public RegisterToolDecorator(toolName: string, decorator: ClientToolDecorator): void {
        this.session.RegisterToolDecorator(toolName, decorator);
    }

    /** Set the runtime context for decorators */
    public SetDecoratorContext(context: ClientToolDecoratorContext): void {
        this.session.SetDecoratorContext(context);
    }

    /** Decorate base tools and send enriched definitions to the server */
    public async DecorateAndSendTools(baseTools: ClientToolMetadata[]): Promise<void> {
        return this.session.DecorateAndSendTools(baseTools);
    }

    // --- Session Lifecycle ---

    /** Start listening for client tool requests for a session */
    public StartSession(sessionId: string): void {
        this.session.StartSession(sessionId);
    }

    /** Stop listening and clean up the session */
    public StopSession(): void {
        this.session.StopSession();
    }

    // --- Agent Execution ---

    /** Run an agent with a message */
    public async RunAgent(params: RunAgentParams): Promise<RunAgentResult> {
        return this.session.RunAgent(params);
    }

    /** Run an agent from an existing conversation detail */
    public async RunAgentFromConversationDetail(params: RunAgentFromConversationDetailParams): Promise<RunAgentResult> {
        return this.session.RunAgentFromConversationDetail(params);
    }

    // --- Angular Lifecycle ---

    public ngOnDestroy(): void {
        this.session.Dispose();
    }
}
