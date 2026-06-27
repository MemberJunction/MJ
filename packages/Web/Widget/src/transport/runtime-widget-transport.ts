/**
 * @fileoverview The production transport: reuses `@memberjunction/graphql-dataprovider`
 * (configured outside Angular with the guest JWT) + `ConversationsRuntime` to hold a
 * text conversation with the pinned support agent. It REUSES the unified pathway — no
 * new chat engine, no new agent dispatch (anti-drift checklist).
 *
 * open-Q #2 (provider reuse): `GraphQLDataProvider` runs fine outside Angular via
 * `setupGraphQLClient` — it is a plain `IMetadataProvider`. This transport uses it
 * directly rather than writing a slimmer client.
 *
 * NOTE: this path requires a live MJAPI; it is exercised by W3's acceptance (gated on
 * Auth0/MJAPI boot). Unit tests cover the UI + session client via the mock transport.
 *
 * @module @memberjunction/web-widget
 */

import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { MJConversationEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { setupGraphQLClient, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import type { WidgetSession } from '../types.js';
import type { IWidgetTransport, WidgetProgressCallback, WidgetTurnResult } from './widget-transport.js';

const CONVERSATIONS_ENTITY = 'MJ: Conversations';
const CONVERSATION_DETAILS_ENTITY = 'MJ: Conversation Details';

/** Reuses ConversationsRuntime + the GraphQL provider against MJAPI with the guest token. */
export class RuntimeWidgetTransport implements IWidgetTransport {
    private token = '';
    private session: WidgetSession | null = null;
    private conversationId: string | null = null;
    private contextUser: UserInfo | null = null;

    constructor(private readonly apiUrl: string) {}

    /** Configures the GraphQL provider with the guest token, boots the runtime, opens a conversation. */
    public async Initialize(session: WidgetSession): Promise<void> {
        this.session = session;
        this.token = session.token;

        const provider = await setupGraphQLClient(this.buildConfig());
        this.contextUser = provider.CurrentUser;
        // No-op when already configured for this process; safe to call per mount.
        await ConversationsRuntime.Instance.Config(false, provider.CurrentUser, provider);

        this.conversationId = await this.createConversation();
    }

    /** Swaps in a refreshed token (the next provider call uses it; conversation is preserved). */
    public UpdateToken(token: string): void {
        this.token = token;
    }

    /** Persists the user's message, runs the pinned agent, returns its reply. */
    public async SendMessage(text: string, onProgress?: WidgetProgressCallback): Promise<WidgetTurnResult> {
        if (!this.session || !this.conversationId) {
            return { reply: '', success: false, error: 'Widget transport not initialized.' };
        }
        try {
            const detail = await this.saveUserMessage(text);
            if (!detail) {
                return { reply: '', success: false, error: 'Could not record your message.' };
            }
            const result = await ConversationsRuntime.Instance.AgentRunner.processMessage({
                conversationId: this.conversationId,
                message: detail,
                conversationDetailId: detail.ID,
                applicationId: this.session.applicationId,
                // D5: ALWAYS pin the support agent — never the unfiltered fallback.
                explicitAgentId: this.session.pinnedAgentId,
                onProgress: (p) => onProgress?.(p.message ?? 'Working…', p.percentage),
            });
            if (!result || !result.success) {
                return { reply: '', success: false, error: result?.agentRun?.ErrorMessage ?? 'The agent could not respond.' };
            }
            return { reply: await this.readLatestAgentReply(), success: true };
        } catch (err) {
            return { reply: '', success: false, error: err instanceof Error ? err.message : 'Unexpected error.' };
        }
    }

    public async Dispose(): Promise<void> {
        this.session = null;
        this.conversationId = null;
        this.contextUser = null;
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private buildConfig(): GraphQLProviderConfigData {
        const base = this.apiUrl.replace(/\/+$/, '');
        const wsUrl = base.replace(/^http/, 'ws');
        return new GraphQLProviderConfigData(this.token, base, wsUrl, async () => this.token);
    }

    /** Creates the conversation row the guest's turns attach to. */
    private async createConversation(): Promise<string> {
        const md = new Metadata();
        const convo = await md.GetEntityObject<MJConversationEntity>(CONVERSATIONS_ENTITY, this.contextUser ?? undefined);
        convo.NewRecord();
        convo.Name = 'Web Widget Support';
        if (this.contextUser?.ID) {
            convo.UserID = this.contextUser.ID;
        }
        // Stamp the per-session id so the Widget Guest RLS filters ({{ScopeResourceID}}) isolate
        // this guest's conversation from other anonymous guests sharing the Anonymous principal.
        // Read-isolation is enforced by the SIGNED session scope, so a client mis-stamp can only
        // hide the guest's own rows from itself — never expose another session's rows.
        if (this.session?.sessionId) {
            convo.ExternalID = this.session.sessionId;
        }
        const saved = await convo.Save();
        if (!saved) {
            throw new Error(`Failed to create widget conversation: ${convo.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return convo.ID;
    }

    /** Saves the visitor's message as a Conversation Detail and returns the entity. */
    private async saveUserMessage(text: string): Promise<MJConversationDetailEntity | null> {
        const md = new Metadata();
        const detail = await md.GetEntityObject<MJConversationDetailEntity>(CONVERSATION_DETAILS_ENTITY, this.contextUser ?? undefined);
        detail.NewRecord();
        detail.ConversationID = this.conversationId!;
        detail.Role = 'User';
        detail.Message = text;
        const saved = await detail.Save();
        if (!saved) {
            return null;
        }
        return detail;
    }

    /** Reads the newest AI Conversation Detail for the conversation (the agent's reply). */
    private async readLatestAgentReply(): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView<MJConversationDetailEntity>(
            {
                EntityName: CONVERSATION_DETAILS_ENTITY,
                ExtraFilter: `ConversationID='${this.conversationId}' AND Role='AI'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            this.contextUser ?? undefined,
        );
        if (result.Success && result.Results.length > 0) {
            return result.Results[0].Message ?? '';
        }
        return '';
    }
}
