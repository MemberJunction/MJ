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
            const userDetail = await this.saveUserMessage(text);
            if (!userDetail) {
                return { reply: '', success: false, error: 'Could not record your message.' };
            }
            // The agent writes its reply INTO a pre-created response detail whose id is passed as
            // `conversationDetailId` (the AgentRunner contract — see AgentRunner.ts: `options.conversationDetailId`
            // IS the agent response detail). Create it as Role='AI' so the reply is an agent turn, not a
            // second user turn; `message`/`latestMessageId` stays the user's triggering message.
            const agentDetail = await this.createAgentResponseDetail();
            if (!agentDetail) {
                return { reply: '', success: false, error: 'Could not start the agent response.' };
            }
            const result = await ConversationsRuntime.Instance.AgentRunner.processMessage({
                conversationId: this.conversationId,
                message: userDetail,
                conversationDetailId: agentDetail.ID,
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
        // Scope the conversation to the widget's Application. The returning-visitor lookup at mint
        // resolves the prior conversation by (VisitorKey AND ApplicationID), so without this the chain
        // never forms (PreviousConversationID stays null → no recap, no cross-session memory).
        // ApplicationScope must be 'Application' for ApplicationID to be set (CK_Conversation_ScopeAppBinding).
        if (this.session?.applicationId) {
            convo.ApplicationScope = 'Application';
            convo.ApplicationID = this.session.applicationId;
        }
        // Stamp the per-session id so the Widget Guest RLS filters ({{ScopeResourceID}}) isolate
        // this guest's conversation from other anonymous guests sharing the Anonymous principal.
        // Read-isolation is enforced by the SIGNED session scope, so a client mis-stamp can only
        // hide the guest's own rows from itself — never expose another session's rows.
        if (this.session?.sessionId) {
            convo.ExternalID = this.session.sessionId;
        }
        // Returning-visitor chain (RV1): when remembering is on, stamp the durable VisitorKey and link to
        // the visitor's prior conversation (resolved server-side by VisitorKey at mint). Both are null when
        // the widget's RememberReturningVisitors toggle is off, so this is a no-op in the default case.
        if (this.session?.rememberReturningVisitors) {
            if (this.session.visitorKey) {
                convo.VisitorKey = this.session.visitorKey;
            }
            if (this.session.previousConversationId) {
                convo.PreviousConversationID = this.session.previousConversationId;
            }
            // RV4 (host-identity path): when the mint resolved a polymorphic identity, stamp it so memory
            // injection keys off the resolved record rather than the anonymous cookie chain.
            if (this.session.resolvedEntityId && this.session.resolvedRecordId) {
                convo.ResolvedEntityID = this.session.resolvedEntityId;
                convo.ResolvedRecordID = this.session.resolvedRecordId;
            }
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

    /**
     * Creates the agent's response detail placeholder (Role='AI', In-Progress) the agent run writes
     * into. Mirrors how the chat UI / AgentRunner pre-create the response row; its id is passed as
     * `conversationDetailId` so the reply lands as an agent turn the widget can read back.
     */
    private async createAgentResponseDetail(): Promise<MJConversationDetailEntity | null> {
        const md = new Metadata();
        const detail = await md.GetEntityObject<MJConversationDetailEntity>(CONVERSATION_DETAILS_ENTITY, this.contextUser ?? undefined);
        detail.NewRecord();
        detail.ConversationID = this.conversationId!;
        detail.Role = 'AI';
        detail.Message = '⏳ Starting…';
        detail.Status = 'In-Progress';
        if (this.session?.pinnedAgentId) {
            detail.AgentID = this.session.pinnedAgentId;
        }
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
