/**
 * @fileoverview Angular adapter for the MJ Agent Client SDK.
 *
 * Provides an injectable service that wraps AgentClientSession with
 * RxJS observables for reactive Angular consumption.
 *
 * @module @memberjunction/ng-agent-client
 */

import { Injectable, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import {
    AgentClientSession,
    ClientToolRegistry,
    WebSocketTransport,
    ClientToolDefinition,
    AgentMessage,
    AgentProgress,
    AgentError,
    ClientToolRequest,
    TransportOptions,
} from '@memberjunction/ai-agent-client';

/**
 * Angular injectable service that wraps the framework-agnostic Agent Client SDK.
 *
 * Provides RxJS observable bridges for agent messages, progress, and connection state.
 * Pre-registers built-in navigation and component tools.
 */
@Injectable({ providedIn: 'root' })
export class AgentClientService implements OnDestroy {
    private session: AgentClientSession | null = null;
    private toolRegistry = new ClientToolRegistry();
    private router = inject(Router);

    /** Stream of all agent messages received during the session */
    public AgentMessages$ = new BehaviorSubject<AgentMessage[]>([]);

    /** Whether the client is currently connected to an agent */
    public IsConnected$ = new BehaviorSubject<boolean>(false);

    /** Stream of agent progress updates */
    public Progress$ = new Subject<AgentProgress>();

    /** Stream of agent errors */
    public Errors$ = new Subject<AgentError>();

    /** Stream of client tool requests (for UI visualization) */
    public ToolRequests$ = new Subject<ClientToolRequest>();

    constructor() {
        this.registerBuiltInTools();
    }

    /**
     * Connect to an agent using WebSocket transport.
     *
     * @param url - The WebSocket URL of the agent server
     * @param agentId - The ID of the agent to connect to
     * @param conversationId - Optional existing conversation to resume
     * @param options - Optional transport options (auth, reconnection)
     */
    public async ConnectToAgent(
        url: string,
        agentId: string,
        conversationId?: string,
        options?: TransportOptions
    ): Promise<void> {
        // Clean up any existing session
        await this.Disconnect();

        const transport = new WebSocketTransport();
        await transport.Connect(url, options);

        this.session = new AgentClientSession(transport, this.toolRegistry);
        this.setupSessionHandlers();

        await this.session.Connect(agentId, conversationId);
        this.IsConnected$.next(true);
    }

    /**
     * Send a user message to the connected agent.
     */
    public async SendMessage(content: string): Promise<void> {
        if (!this.session) {
            throw new Error('Not connected to an agent. Call ConnectToAgent() first.');
        }
        await this.session.SendMessage(content);
    }

    /**
     * Disconnect from the current agent session.
     */
    public async Disconnect(): Promise<void> {
        if (this.session) {
            await this.session.Disconnect();
            this.session = null;
            this.IsConnected$.next(false);
            this.AgentMessages$.next([]);
        }
    }

    /**
     * Register a custom client-side tool.
     */
    public RegisterTool(tool: ClientToolDefinition): void {
        this.toolRegistry.Register(tool);
    }

    /**
     * Get the current conversation ID.
     */
    public get ConversationId(): string | null {
        return this.session?.ConversationId ?? null;
    }

    /**
     * Clean up on service destruction.
     */
    public ngOnDestroy(): void {
        // Fire-and-forget disconnect on destroy
        this.Disconnect().catch(() => { /* intentional: best-effort cleanup */ });
        this.AgentMessages$.complete();
        this.IsConnected$.complete();
        this.Progress$.complete();
        this.Errors$.complete();
        this.ToolRequests$.complete();
    }

    /**
     * Set up event handlers on the session that feed into RxJS observables.
     */
    private setupSessionHandlers(): void {
        if (!this.session) return;

        this.session.OnAgentMessage((msg) => {
            const current = this.AgentMessages$.value;
            this.AgentMessages$.next([...current, msg]);
        });

        this.session.OnProgress((progress) => {
            this.Progress$.next(progress);
        });

        this.session.OnError((error) => {
            this.Errors$.next(error);
            if (error.Code === 'DISCONNECTED') {
                this.IsConnected$.next(false);
            }
        });

        this.session.OnToolRequest((req) => {
            this.ToolRequests$.next(req);
        });
    }

    /**
     * Register built-in navigation and component tools.
     */
    private registerBuiltInTools(): void {
        this.toolRegistry.Register({
            Name: 'navigate_to_record',
            Description: 'Navigate the browser to a specific entity record in MJ Explorer',
            ParameterSchema: {
                type: 'object',
                properties: {
                    EntityName: { type: 'string' },
                    RecordID: { type: 'string' },
                },
                required: ['EntityName', 'RecordID'],
            },
            Handler: async (params) => {
                const entityName = String(params['EntityName']);
                const recordId = String(params['RecordID']);
                await this.router.navigate(['/resource', 'entity', entityName, recordId]);
                return { Success: true, Data: { Navigated: true } };
            },
        });

        this.toolRegistry.Register({
            Name: 'navigate_to_app',
            Description: 'Switch to a different MJ Explorer application',
            ParameterSchema: {
                type: 'object',
                properties: {
                    AppName: { type: 'string' },
                },
                required: ['AppName'],
            },
            Handler: async (params) => {
                const appName = String(params['AppName']);
                await this.router.navigate(['/app', appName]);
                return { Success: true, Data: { Navigated: true } };
            },
        });

        this.toolRegistry.Register({
            Name: 'navigate_to_tab',
            Description: 'Switch to a specific tab within the current application',
            ParameterSchema: {
                type: 'object',
                properties: {
                    TabName: { type: 'string' },
                },
                required: ['TabName'],
            },
            Handler: async (params) => {
                // Tab navigation is handled via the app's internal routing
                const tabName = String(params['TabName']);
                return { Success: true, Data: { TabName: tabName, Note: 'Tab switch requested' } };
            },
        });
    }
}
