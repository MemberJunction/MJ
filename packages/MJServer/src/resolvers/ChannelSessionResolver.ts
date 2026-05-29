/**
 * GraphQL resolver for AI channel sessions (Phase 1(c)(viii)).
 *
 * Exposes four mutations:
 *   - `IssueChannelParticipantToken` — mints a short-lived LiveKit JWT for a
 *     browser participant. Pure token signing; no room join happens here.
 *   - `StartChannelSession` — opens a `ChannelSession` (text-chat or
 *     WebRTC-based voice, or text-in/voice-out), spawns `Run()` fire-and-forget,
 *     registers the session, and returns `SessionID` to the client.
 *   - `EndChannelSession` — looks up a session by ID and calls `Stop()`.
 *     Idempotent: missing session ⇒ `{ OK: false }`, never throws.
 *   - `SubmitChannelTextTurn` — push a user-text turn into a running
 *     `TextInputAudioOutputTransport`-backed session (the "type to Sage,
 *     hear Sage speak" demo path).
 *
 * Exposes one subscription:
 *   - `ChannelAudioOut(SessionID)` — streams outbound TTS audio frames for a
 *     text-in/voice-out session, base64-encoded for JSON transport. Frames are
 *     published by the in-process bridge wired in `StartChannelSession`.
 *
 * Reuses the existing `ClientToolRequest` subscription for tool round-trips.
 * See plans/audio-agent-architecture.md section "ClientToolRequest pipeline"
 * + "7. Where the runtime lives".
 *
 * AUTH PATTERN: Mirrors `RunAIAgentResolver` — `@Ctx() { userPayload }`,
 * `GetUserFromPayload(userPayload)`, `CheckAPIKeyScopeAuthorization()` for
 * agent-execute scope, and `CheckUserReadPermissions` for entity-level reads.
 * No new auth machinery introduced.
 *
 * KNOWN LIMITATION (Phase 1(c)(viii)):
 *   `WebRTCTransport.Open()` is still skeleton — it throws SKELETON_MESSAGE.
 *   For voice-* channels, `StartChannelSession` returns the SessionID before
 *   `Run()` reaches `Transport.Open()`, so the mutation succeeds, but the
 *   background `Run()` immediately fails and finalizes the `AIAgentRun` as
 *   `Failed`. The token-issuance and session-lifecycle plumbing is verified
 *   end-to-end; actual audio bridging lands in the Phase 1(c) follow-up that
 *   wires `@livekit/rtc-node`. Clients calling `IssueChannelParticipantToken`
 *   alone (no `StartChannelSession`) work fully today.
 */
import {
    Resolver,
    Mutation,
    Arg,
    Ctx,
    ObjectType,
    InputType,
    Field,
    Int,
    Subscription,
    Root,
    PubSub,
    PubSubEngine,
} from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentChannelEntity,
    MJAIAgentChannelConfigEntity,
    MJAIAgentRunEntity,
    MJTaskEntity,
} from '@memberjunction/core-entities';
import type { AudioFrame } from '@memberjunction/ai';
import {
    ChannelSession,
    IssueLiveKitParticipantToken,
    TextInputAudioOutputTransport,
    WebRTCTransport,
    type AgentChannelConfig,
    type ChannelKind,
    type ChannelTranscriptEvent,
    type ITransportAdapter,
    type ChannelStopReason,
} from '@memberjunction/ai-agent-channel-runtime';

import { ResolverBase } from '../generic/ResolverBase.js';
import { AppContext, UserPayload } from '../types.js';
import { ChannelSessionRegistry } from '../services/ChannelSessionRegistry.js';
import { NullTransport } from '../services/NullTransport.js';
import { PubSubManager } from '../generic/PubSubManager.js';
import { TaskOrchestrator, TaskGraphResponse } from '../services/TaskOrchestrator.js';
import { GetReadWriteProvider } from '../util.js';
import type { IMetadataProvider } from '@memberjunction/core';

/**
 * Pubsub topic for outbound audio frames from a `TextInputAudioOutputTransport`.
 * One topic shared across sessions; the subscription filter narrows to the
 * caller's `SessionID`. Matches the pattern used by `SearchKnowledgeStreamResolver`
 * and `ClientToolRequestResolver` — see `plans/audio-agent-architecture.md`.
 */
export const CHANNEL_AUDIO_OUT_TOPIC = 'CHANNEL_AUDIO_OUT';

/**
 * Pubsub topic for transcript events from a channel session (user finals,
 * assistant-text deltas as the JSON parser extracts them, the post-execution
 * structured response carrying actionable commands, errors). One topic shared
 * across sessions; subscription filter narrows by `SessionID`.
 */
export const CHANNEL_TRANSCRIPT_TOPIC = 'CHANNEL_TRANSCRIPT';

// -----------------------------------------------------------------------------
// Input / Output types
// -----------------------------------------------------------------------------

@InputType()
export class IssueChannelParticipantTokenInput {
    @Field()
    AgentID!: string;

    @Field()
    ChannelName!: string;

    @Field()
    RoomName!: string;

    @Field({ nullable: true })
    ParticipantIdentity?: string;

    @Field({ nullable: true })
    ParticipantName?: string;

    @Field(() => Int, { nullable: true })
    TtlSeconds?: number;
}

@ObjectType()
export class IssueChannelParticipantTokenResult {
    @Field()
    Token!: string;

    @Field()
    ServerURL!: string;

    @Field()
    RoomName!: string;

    @Field(() => Int)
    TtlSeconds!: number;
}

@InputType()
export class StartChannelSessionInput {
    @Field()
    AgentID!: string;

    @Field()
    ChannelName!: string;

    @Field({ nullable: true })
    ConversationID?: string;

    @Field({ nullable: true })
    RoomName?: string;

    @Field(() => GraphQLJSONObject, { nullable: true })
    ConfigOverrides?: Record<string, unknown>;
}

@ObjectType()
export class StartChannelSessionResult {
    @Field()
    SessionID!: string;

    /**
     * Channel name echoed back for client convenience. (`AgentRunID` is
     * intentionally not returned here — see resolver docstring "KNOWN
     * LIMITATION". Clients can query `MJ: AI Agent Runs` filtered by
     * `AIAgentChannelID + UserID + Status='Running'` to find the row.)
     */
    @Field()
    ChannelName!: string;
}

@InputType()
export class EndChannelSessionInput {
    @Field()
    SessionID!: string;

    @Field({ nullable: true })
    Reason?: string;
}

@ObjectType()
export class EndChannelSessionResult {
    @Field()
    OK!: boolean;
}

@InputType()
export class SubmitChannelTextTurnInput {
    @Field()
    SessionID!: string;

    @Field()
    Text!: string;
}

@ObjectType()
export class SubmitChannelTextTurnResult {
    @Field()
    OK!: boolean;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

/**
 * One outbound audio frame from a `TextInputAudioOutputTransport`, delivered
 * over a GraphQL subscription. The raw `Uint8Array` is base64-encoded for
 * transport over JSON — clients decode back to bytes before feeding into
 * `<audio>` / Web Audio playback.
 */
@ObjectType()
export class ChannelAudioOutFrame {
    @Field()
    SessionID!: string;

    /** Base64-encoded frame payload (`AudioFrame.data`). */
    @Field()
    DataBase64!: string;

    @Field(() => Int)
    SampleRateHz!: number;

    @Field(() => Int)
    ChannelCount!: number;

    /** MIME-ish media type, e.g. `'audio/pcm'`, `'audio/mpeg'`. */
    @Field()
    MediaType!: string;
}

/**
 * Internal pubsub payload — matches the public `ChannelAudioOutFrame` shape
 * 1:1. Kept as a separate type so the filter signature can be precise.
 * Exported only so the wire-encoder helper has a named return type for tests.
 */
export interface ChannelAudioOutPayload {
    SessionID: string;
    DataBase64: string;
    SampleRateHz: number;
    ChannelCount: number;
    MediaType: string;
}

/**
 * GraphQL-side shape for a transcript event. A flat ObjectType (rather than
 * a GraphQL union) keeps the subscription contract trivial for the widget:
 * filter by `Kind`, read the relevant fields. `ActionableCommands` and
 * `ResponseForm` use `GraphQLJSONObject` because their internal shape is
 * agent-defined and not worth mirroring as strong types here.
 */
@ObjectType()
export class ChannelTranscriptEventDTO {
    @Field()
    SessionID!: string;

    /** Discriminator: 'user' | 'assistant-text' | 'agent-response' | 'error'. */
    @Field()
    Kind!: string;

    /** Text for `user`, `assistant-text`, `error`, and `agent-response.message`. */
    @Field({ nullable: true })
    Text?: string;

    /** Only meaningful on `user` and `assistant-text`. */
    @Field({ nullable: true })
    IsFinal?: boolean;

    /**
     * `agent-response.actionableCommands`. Array of `ActionableCommand`-shaped
     * objects from `@memberjunction/ai-core-plus`. Untyped here on purpose —
     * the widget casts on consumption.
     */
    @Field(() => [GraphQLJSONObject], { nullable: true })
    ActionableCommands?: Record<string, unknown>[];

    /** `agent-response.responseForm` — for prompt-the-user input forms. */
    @Field(() => GraphQLJSONObject, { nullable: true })
    ResponseForm?: Record<string, unknown>;
}

/** Internal pubsub payload for transcript events — shape parallels the DTO. */
export interface ChannelTranscriptPayload {
    SessionID: string;
    Kind: string;
    Text?: string;
    IsFinal?: boolean;
    ActionableCommands?: Record<string, unknown>[];
    ResponseForm?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Resolver
// -----------------------------------------------------------------------------

/**
 * Configured channel kinds that always require a WebRTC transport at runtime.
 * `phone` and `video-realtime` use other transports (Twilio / future) and are
 * not handled by this resolver yet.
 *
 * NOTE: `voice-cascaded` also accepts a `TextInputAudioOutputTransport` when
 * the caller omits `RoomName` — see `buildTransportForChannel`. The "type to
 * Sage, hear Sage speak" demo uses that path.
 */
const WEBRTC_CHANNEL_KINDS: ReadonlySet<ChannelKind> = new Set<ChannelKind>([
    'voice-cascaded',
    'voice-realtime',
]);

@Resolver()
export class ChannelSessionResolver extends ResolverBase {
    /**
     * Mint a short-lived LiveKit participant token after verifying that the
     * caller is allowed to drive the requested agent on the requested channel.
     *
     * The token alone is enough for the browser to connect to the LiveKit
     * room; the server-side participant (the channel runtime) is started
     * separately via `StartChannelSession`.
     */
    @Mutation(() => IssueChannelParticipantTokenResult)
    async IssueChannelParticipantToken(
        @Arg('input') input: IssueChannelParticipantTokenInput,
        @Ctx() { userPayload }: AppContext
    ): Promise<IssueChannelParticipantTokenResult> {
        const contextUser = this.GetUserFromPayload(userPayload);
        if (!contextUser) {
            throw new Error('Unable to determine current user');
        }

        await this.CheckAPIKeyScopeAuthorization('agent:execute', input.AgentID, userPayload);
        this.CheckUserReadPermissions('MJ: AI Agents', userPayload);

        // Resolve metadata — agent + channel + per-agent channel config.
        await this.validateChannelBinding(input.AgentID, input.ChannelName, contextUser);

        const { ApiKey, ApiSecret, ServerURL } = this.readLiveKitConfig();

        const ttlSeconds = input.TtlSeconds ?? 3600;
        const identity = input.ParticipantIdentity ?? contextUser.ID;
        const token = await IssueLiveKitParticipantToken({
            ApiKey,
            ApiSecret,
            RoomName: input.RoomName,
            ParticipantIdentity: identity,
            ParticipantName: input.ParticipantName,
            TtlSeconds: ttlSeconds,
        });

        LogStatus(
            `[ChannelSessionResolver] Issued LiveKit token agent=${input.AgentID} channel='${input.ChannelName}' room='${input.RoomName}' identity='${identity}' ttl=${ttlSeconds}s`
        );

        return {
            Token: token,
            ServerURL,
            RoomName: input.RoomName,
            TtlSeconds: ttlSeconds,
        };
    }

    /**
     * Construct a `ChannelSession`, kick off `Run()` in the background, and
     * register the session for later teardown. Returns the `SessionID` as
     * soon as construction succeeds — the agent run itself proceeds async.
     *
     * For text-chat channels, a `NullTransport` is wired (no media). For
     * voice-cascaded / voice-realtime channels, a `WebRTCTransport` is
     * constructed against the configured LiveKit endpoint — see the
     * resolver-level "KNOWN LIMITATION" note about the still-skeleton
     * `WebRTCTransport.Open()`.
     */
    @Mutation(() => StartChannelSessionResult)
    async StartChannelSession(
        @Arg('input') input: StartChannelSessionInput,
        @Ctx() { userPayload, providers }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ): Promise<StartChannelSessionResult> {
        const contextUser = this.GetUserFromPayload(userPayload);
        if (!contextUser) {
            throw new Error('Unable to determine current user');
        }

        await this.CheckAPIKeyScopeAuthorization('agent:execute', input.AgentID, userPayload);
        this.CheckUserReadPermissions('MJ: AI Agents', userPayload);

        const channelKind = await this.validateChannelBinding(
            input.AgentID,
            input.ChannelName,
            contextUser
        );

        const transport = await this.buildTransportForChannel(channelKind, input, contextUser);
        const provider = GetReadWriteProvider(providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider;

        const session = new ChannelSession({
            AgentID: input.AgentID,
            ChannelName: channelKind,
            Transport: transport,
            ContextUser: contextUser,
            ConversationID: input.ConversationID,
            ConfigOverrides: input.ConfigOverrides as Partial<AgentChannelConfig> | undefined,
            OnTranscript: (event) =>
                this.publishTranscriptEvent(session.SessionID, event),
            // Voice's `taskGraph` executor. The cascaded engine invokes this
            // when a conversation-manager (Sage) emits `payload.taskGraph`.
            // Mirrors what `TaskOrchestrationResolver.ExecuteTaskGraph` does
            // for the chat client, but runs in-process instead of going
            // through GraphQL. Same `TaskOrchestrator` class either way.
            OnTaskGraph: (invocation) =>
                this.runTaskGraphForVoiceSession(
                    invocation,
                    contextUser,
                    userPayload,
                    pubSub,
                    provider,
                    session.SessionID
                ),
        });

        ChannelSessionRegistry.Instance.Register(session);

        // For the text-in / voice-out demo path, kick off the bridge that
        // drains the transport's outbound audio queue and republishes onto
        // the `CHANNEL_AUDIO_OUT_TOPIC` pubsub. Subscribers filter by
        // SessionID. The bridge exits cleanly when the transport closes.
        if (transport instanceof TextInputAudioOutputTransport) {
            this.startAudioOutBridge(session.SessionID, transport);
        }

        // Fire-and-forget — `Run()` finalizes the AIAgentRun on its own,
        // success or failure. Errors caught + logged so they don't surface
        // as unhandled promise rejections.
        session
            .Run()
            .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(
                    `[ChannelSessionResolver] ChannelSession ${session.SessionID} failed: ${msg}`
                );
            })
            .finally(() => {
                ChannelSessionRegistry.Instance.Unregister(session.SessionID);
            });

        LogStatus(
            `[ChannelSessionResolver] StartChannelSession sessionID=${session.SessionID} agent=${input.AgentID} channel='${channelKind}'`
        );

        return {
            SessionID: session.SessionID,
            ChannelName: channelKind,
        };
    }

    /**
     * Stop a live channel session. Idempotent — calling on an unknown or
     * already-ended SessionID returns `{ OK: false }` rather than throwing.
     */
    @Mutation(() => EndChannelSessionResult)
    async EndChannelSession(
        @Arg('input') input: EndChannelSessionInput,
        @Ctx() { userPayload }: AppContext
    ): Promise<EndChannelSessionResult> {
        const contextUser = this.GetUserFromPayload(userPayload);
        if (!contextUser) {
            throw new Error('Unable to determine current user');
        }

        const session = ChannelSessionRegistry.Instance.Get(input.SessionID);
        if (!session) {
            LogStatus(
                `[ChannelSessionResolver] EndChannelSession sessionID=${input.SessionID} — not found (already ended or unknown)`
            );
            return { OK: false };
        }

        const reason = this.mapReasonString(input.Reason);
        try {
            await session.Stop(reason);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(
                `[ChannelSessionResolver] EndChannelSession sessionID=${input.SessionID} Stop() threw: ${msg}`
            );
        }
        ChannelSessionRegistry.Instance.Unregister(input.SessionID);
        return { OK: true };
    }

    /**
     * Push a user-text turn into a running `TextInputAudioOutputTransport`-backed
     * session. Used by the "type to Sage, hear Sage speak" demo where the
     * browser has no microphone — the user types, this mutation surfaces the
     * text to the channel engine as a `user-text` control event, and outbound
     * TTS audio streams back over `ChannelAudioOut`.
     *
     * Returns `OK:false` (no throw) for:
     *   - unknown / already-ended SessionID
     *   - session whose transport is not a `TextInputAudioOutputTransport`
     *     (e.g. WebRTC voice or text-chat) — wrong call site
     */
    @Mutation(() => SubmitChannelTextTurnResult)
    async SubmitChannelTextTurn(
        @Arg('input') input: SubmitChannelTextTurnInput,
        @Ctx() { userPayload }: AppContext
    ): Promise<SubmitChannelTextTurnResult> {
        const contextUser = this.GetUserFromPayload(userPayload);
        if (!contextUser) {
            return { OK: false, ErrorMessage: 'Unable to determine current user' };
        }

        const session = ChannelSessionRegistry.Instance.Get(input.SessionID);
        if (!session) {
            return { OK: false, ErrorMessage: `Session not found: ${input.SessionID}` };
        }

        const transport = session.Transport;
        if (!(transport instanceof TextInputAudioOutputTransport)) {
            return {
                OK: false,
                ErrorMessage:
                    'Session is not a text-input channel — SubmitChannelTextTurn requires a TextInputAudioOutputTransport.',
            };
        }

        transport.PushUserText(input.Text);
        LogStatus(
            `[ChannelSessionResolver] SubmitChannelTextTurn sessionID=${input.SessionID} textLen=${input.Text.length}`
        );
        return { OK: true };
    }

    /**
     * Stream transcript events for a channel session. Engines emit user
     * finals, assistant-text deltas (as the streaming JSON parser extracts
     * the `message` field), and a final `agent-response` event carrying
     * the actionable-command chips. One shared topic; filter by SessionID.
     */
    @Subscription(() => ChannelTranscriptEventDTO, {
        topics: CHANNEL_TRANSCRIPT_TOPIC,
        filter: ({
            payload,
            args,
        }: {
            payload: ChannelTranscriptPayload;
            args: { SessionID: string };
        }) => payload.SessionID === args.SessionID,
    })
    ChannelTranscript(
        @Root() notification: ChannelTranscriptPayload,
        @Arg('SessionID') _sessionID: string,
        @PubSub() _pubSub: PubSubEngine
    ): ChannelTranscriptEventDTO {
        return {
            SessionID: notification.SessionID,
            Kind: notification.Kind,
            Text: notification.Text,
            IsFinal: notification.IsFinal,
            ActionableCommands: notification.ActionableCommands,
            ResponseForm: notification.ResponseForm,
        };
    }

    /**
     * Stream outbound agent audio for a `TextInputAudioOutputTransport`-backed
     * session. Pattern matches `ClientToolRequestResolver` / `SearchKnowledgeStreamResolver`:
     * a shared topic, with a filter that narrows by `SessionID`.
     *
     * The publisher side is `startAudioOutBridge`, kicked off in
     * `StartChannelSession` when the chosen transport is a
     * `TextInputAudioOutputTransport`.
     */
    @Subscription(() => ChannelAudioOutFrame, {
        topics: CHANNEL_AUDIO_OUT_TOPIC,
        filter: ({ payload, args }: { payload: ChannelAudioOutPayload; args: { SessionID: string } }) =>
            payload.SessionID === args.SessionID,
    })
    ChannelAudioOut(
        @Root() notification: ChannelAudioOutPayload,
        @Arg('SessionID') _sessionID: string,
        @PubSub() _pubSub: PubSubEngine
    ): ChannelAudioOutFrame {
        return {
            SessionID: notification.SessionID,
            DataBase64: notification.DataBase64,
            SampleRateHz: notification.SampleRateHz,
            ChannelCount: notification.ChannelCount,
            MediaType: notification.MediaType,
        };
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Verify that the agent + channel exist and that an active
     * `AIAgentChannelConfig` binds them. Returns the channel's `Name` typed
     * as `ChannelKind` (cast checked via the inner runtime, not at the type
     * level — channel rows are user-defined).
     */
    private async validateChannelBinding(
        agentID: string,
        channelName: string,
        contextUser: UserInfo
    ): Promise<ChannelKind> {
        const md = new Metadata();

        const agent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
        const agentLoaded = await agent.Load(agentID);
        if (!agentLoaded) {
            throw new Error(`AI Agent not found for ID='${agentID}'.`);
        }
        if (agent.Status !== 'Active') {
            throw new Error(
                `AI Agent '${agent.Name}' is not active (Status='${agent.Status}').`
            );
        }

        const rv = new RunView();
        const channelLookup = await rv.RunView<MJAIAgentChannelEntity>(
            {
                EntityName: 'MJ: AI Agent Channels',
                ExtraFilter: `Name='${escapeSqlString(channelName)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser
        );
        if (!channelLookup.Success) {
            throw new Error(
                `Failed to look up AI Agent Channel '${channelName}': ${channelLookup.ErrorMessage}`
            );
        }
        const channel = channelLookup.Results?.[0];
        if (!channel) {
            throw new Error(`AI Agent Channel not found for Name='${channelName}'.`);
        }

        const configLookup = await rv.RunView<MJAIAgentChannelConfigEntity>(
            {
                EntityName: 'MJ: AI Agent Channel Configs',
                ExtraFilter: `AIAgentID='${escapeSqlString(agentID)}' AND AIAgentChannelID='${escapeSqlString(channel.ID)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser
        );
        if (!configLookup.Success) {
            throw new Error(
                `Failed to look up AI Agent Channel Config for agent='${agentID}' channel='${channelName}': ${configLookup.ErrorMessage}`
            );
        }
        const channelConfig = configLookup.Results?.[0];
        if (!channelConfig) {
            throw new Error(
                `No AI Agent Channel Config binds agent='${agent.Name}' to channel='${channelName}'.`
            );
        }
        if (channelConfig.Status !== 'Active') {
            throw new Error(
                `AI Agent Channel Config for agent='${agent.Name}', channel='${channelName}' is not Active (Status='${channelConfig.Status}').`
            );
        }

        return channel.Name as ChannelKind;
    }

    /**
     * Pick the right transport for the channel kind.
     *
     *   - `voice-cascaded` WITH `RoomName` → `WebRTCTransport` (the original
     *     full-WebRTC path; mic-in / speaker-out via LiveKit).
     *   - `voice-cascaded` WITHOUT `RoomName` → `TextInputAudioOutputTransport`
     *     (the "text-in / voice-out" demo path; user text comes via
     *     `SubmitChannelTextTurn`, agent audio streams via `ChannelAudioOut`).
     *   - `voice-realtime` → `WebRTCTransport` (requires `RoomName`).
     *   - any other channel kind (e.g. `text-chat`) → `NullTransport`.
     *
     * `sessionID` is `undefined` on first call because `ChannelSession` mints
     * the ID at construction — the bridge that drains
     * `TextInputAudioOutputTransport.OutboundAudioFrames` is started in
     * `StartChannelSession` once the session exists.
     */
    private async buildTransportForChannel(
        channelKind: ChannelKind,
        input: StartChannelSessionInput,
        contextUser: UserInfo
    ): Promise<ITransportAdapter> {
        if (channelKind === 'voice-cascaded' && !input.RoomName) {
            // Text-in / voice-out demo path. SessionID is patched in after
            // construction — the transport accepts it via Options but only
            // uses it for logging / subscription keying, so a stable value
            // isn't strictly required at construction time.
            return new TextInputAudioOutputTransport({
                SessionID: 'pending',
                UserDisplayName: contextUser.Email ?? contextUser.ID,
                AgentDisplayName: `MJ Agent (${input.AgentID})`,
            });
        }
        if (WEBRTC_CHANNEL_KINDS.has(channelKind)) {
            if (!input.RoomName) {
                throw new Error(
                    `StartChannelSession on channel='${channelKind}' requires input.RoomName.`
                );
            }
            const { ApiKey, ApiSecret, ServerURL } = this.readLiveKitConfig();
            const agentIdentity = `mj-agent:${input.AgentID}`;
            const agentToken = await IssueLiveKitParticipantToken({
                ApiKey,
                ApiSecret,
                RoomName: input.RoomName,
                ParticipantIdentity: agentIdentity,
                ParticipantName: `MJ Agent (${contextUser.Email ?? contextUser.ID})`,
                TtlSeconds: 3600,
            });
            return new WebRTCTransport({
                ServerURL,
                Token: agentToken,
                RoomName: input.RoomName,
                ParticipantIdentity: agentIdentity,
            });
        }
        return new NullTransport();
    }

    /**
     * Drain `TextInputAudioOutputTransport.OutboundAudioFrames` and publish
     * each frame onto `CHANNEL_AUDIO_OUT_TOPIC` with the owning `SessionID`.
     * Runs as a fire-and-forget task for the lifetime of the session — the
     * iterator closes when `Close()` is called on the transport, at which
     * point the loop exits naturally.
     */
    /**
     * Execute a taskGraph emitted by a conversation-manager (Sage) within
     * a voice session. Wraps `TaskOrchestrator` — same code path the chat
     * client uses via `ExecuteTaskGraph`, but called in-process so voice
     * doesn't need to round-trip through GraphQL.
     *
     * The aggregated text returned is the concatenation of successful
     * task `output` values — for the common single-task case (Sage →
     * Research Agent) this is just the one specialist's answer.
     *
     * Failures: any task error is appended to the result with a "Task X
     * failed:" prefix so the user hears something useful instead of
     * silent confusion.
     */
    private async runTaskGraphForVoiceSession(
        invocation: { TaskGraph: unknown; ConversationDetailID: string },
        contextUser: UserInfo,
        userPayload: UserPayload,
        pubSub: PubSubEngine,
        provider: IMetadataProvider,
        sessionID: string
    ): Promise<{ Message: string; ConversationDetailID?: string }> {
        const taskGraph = invocation.TaskGraph as TaskGraphResponse;
        if (!taskGraph?.workflowName || !taskGraph.tasks?.length) {
            return { Message: '' };
        }

        // Environment ID — same fallback the rest of MJServer uses when
        // the user object lacks an explicit binding.
        const environmentId =
            (contextUser as { EnvironmentID?: string }).EnvironmentID ??
            'F51358F3-9447-4176-B313-BF8025FD8D09';

        LogStatus(
            `[ChannelSessionResolver] taskgraph workflow='${taskGraph.workflowName}' tasks=${taskGraph.tasks.length} session=${sessionID}`
        );

        const orchestrator = new TaskOrchestrator(
            contextUser,
            pubSub,
            sessionID,
            userPayload,
            false, // createNotifications — voice user is already listening live
            invocation.ConversationDetailID,
            provider
        );

        const { parentTaskId } = await orchestrator.createTasksFromGraph(
            taskGraph,
            invocation.ConversationDetailID,
            environmentId
        );

        const results = await orchestrator.executeTasksForParent(parentTaskId);

        // Aggregate textual outputs. Tasks executed in dependency order;
        // for single-task workflows this is the one specialist's answer.
        //
        // Important: many MJ agents put a short *status* line in their
        // `Message` ("Completed summary, see payload") and the actual
        // substantive content in `payload`. `TaskOrchestrator.extractAgentOutput`
        // prefers Message when present — fine for chat (the linked
        // artifact card carries the payload), but voice has no card to
        // click. We detect placeholder messages here and fall back to the
        // task's underlying `AIAgentRun.FinalPayload` for the real text.
        const parts: string[] = [];
        for (const r of results) {
            if (!r.success) {
                if (r.error) parts.push(`Task ${r.taskId} failed: ${r.error}`);
                continue;
            }

            let text = '';
            if (typeof r.output === 'string') {
                text = r.output.trim();
                if (isPlaceholderMessage(text)) {
                    const fallback = await this.extractTaskPayloadText(
                        r.taskId,
                        contextUser
                    );
                    if (fallback) text = fallback;
                }
            } else if (r.output && typeof r.output === 'object') {
                text = extractPayloadText(r.output);
            }

            if (text) parts.push(text);
        }

        return { Message: parts.join('\n\n') };
    }

    /**
     * Recover an agent's full payload text for a completed task.
     *
     * Path: `TaskOrchestrator.executeTask` appends `__TASK_OUTPUT__\n<json>`
     * to `Task.Description` with the underlying `agentRunId`. We parse that,
     * load the `AIAgentRun`, and pull text from common payload fields. If
     * any step fails, we return empty — caller falls back to the original
     * Message text.
     */
    private async extractTaskPayloadText(
        taskId: string,
        contextUser: UserInfo
    ): Promise<string> {
        try {
            const md = new Metadata();
            const taskEntity = await md.GetEntityObject<MJTaskEntity>(
                'MJ: Tasks',
                contextUser
            );
            const loaded = await taskEntity.Load(taskId);
            if (!loaded) return '';

            const desc = taskEntity.Description ?? '';
            const marker = '__TASK_OUTPUT__\n';
            const idx = desc.lastIndexOf(marker);
            if (idx === -1) return '';
            const blob = desc.slice(idx + marker.length).trim();
            let outputMeta: { agentRunId?: string } = {};
            try {
                outputMeta = JSON.parse(blob) as { agentRunId?: string };
            } catch {
                return '';
            }
            if (!outputMeta.agentRunId) return '';

            const runEntity = await md.GetEntityObject<MJAIAgentRunEntity>(
                'MJ: AI Agent Runs',
                contextUser
            );
            const runLoaded = await runEntity.Load(outputMeta.agentRunId);
            if (!runLoaded) return '';

            const finalPayloadRaw = runEntity.FinalPayload;
            if (!finalPayloadRaw) return '';
            let parsed: unknown;
            try {
                parsed = typeof finalPayloadRaw === 'string'
                    ? JSON.parse(finalPayloadRaw)
                    : finalPayloadRaw;
            } catch {
                return '';
            }
            return extractPayloadText(parsed);
        } catch (err) {
            LogError(
                `[ChannelSessionResolver] extractTaskPayloadText failed for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`
            );
            return '';
        }
    }

    /**
     * Publish a transcript event onto `CHANNEL_TRANSCRIPT_TOPIC` for the
     * voice widget's subscription. The widget filters on `SessionID`.
     * Pure shim — no business logic; the engine decides what events fire
     * and when.
     */
    private publishTranscriptEvent(
        sessionID: string,
        event: ChannelTranscriptEvent
    ): void {
        const payload: ChannelTranscriptPayload = {
            SessionID: sessionID,
            Kind: event.Kind,
            Text:
                event.Kind === 'user' || event.Kind === 'assistant-text'
                    ? event.Text
                    : event.Kind === 'agent-response'
                    ? event.Message
                    : event.Kind === 'error'
                    ? event.Message
                    : undefined,
            IsFinal:
                event.Kind === 'user' || event.Kind === 'assistant-text'
                    ? event.IsFinal
                    : undefined,
            ActionableCommands:
                event.Kind === 'agent-response'
                    ? (event.ActionableCommands as Record<string, unknown>[] | undefined)
                    : undefined,
            ResponseForm:
                event.Kind === 'agent-response'
                    ? (event.ResponseForm as Record<string, unknown> | undefined)
                    : undefined,
        };
        PubSubManager.Instance.Publish(
            CHANNEL_TRANSCRIPT_TOPIC,
            payload as unknown as Record<string, unknown>
        );
    }

    private startAudioOutBridge(sessionID: string, transport: TextInputAudioOutputTransport): void {
        void (async () => {
            try {
                for await (const frame of transport.OutboundAudioFrames) {
                    const payload = encodeAudioFrameForWire(sessionID, frame);
                    PubSubManager.Instance.Publish(CHANNEL_AUDIO_OUT_TOPIC, payload as unknown as Record<string, unknown>);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(
                    `[ChannelSessionResolver] Audio-out bridge for session=${sessionID} crashed: ${msg}`
                );
            }
        })();
    }

    /**
     * Read LiveKit credentials from environment variables. We intentionally
     * keep this off `mj.config.cjs` for now — Phase 1(c)(viii) is the first
     * code that needs it, and env vars match how the existing Auth0 / Azure
     * settings are wired (see `mj.config.auth.example.cjs`). When more LiveKit
     * knobs land, a `liveKit` section on the config schema is the natural next
     * step.
     */
    private readLiveKitConfig(): { ApiKey: string; ApiSecret: string; ServerURL: string } {
        const ApiKey = process.env.LIVEKIT_API_KEY;
        const ApiSecret = process.env.LIVEKIT_API_SECRET;
        const ServerURL = process.env.LIVEKIT_SERVER_URL;
        if (!ApiKey || !ApiSecret || !ServerURL) {
            throw new Error(
                'LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and ' +
                'LIVEKIT_SERVER_URL in your environment (or mj.config.cjs) before using ' +
                'channel session mutations.'
            );
        }
        return { ApiKey, ApiSecret, ServerURL };
    }

    /**
     * Map an optional caller-provided reason string to a `ChannelStopReason`.
     * Unknown / missing values become `'cancelled'`.
     */
    private mapReasonString(raw: string | undefined): ChannelStopReason {
        if (!raw) return 'cancelled';
        const normalized = raw.trim().toLowerCase();
        switch (normalized) {
            case 'completed':
            case 'user-disconnect':
            case 'cancelled':
            case 'error':
            case 'timeout':
                return normalized;
            default:
                return 'cancelled';
        }
    }
}

/**
 * Escape a string for safe embedding inside a single-quoted SQL literal.
 * Doubles single quotes. We're working with UUIDs and short channel names here,
 * but defending against pathological input is cheap.
 */
function escapeSqlString(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Detect agent `Message` text that's a status pointer rather than the real
 * answer — e.g. "Completed summarization, findings stored in payload".
 *
 * The pattern is common: MJ agents that operate on structured payloads
 * often leave only a brief log line in the human-readable Message field
 * because the substantive content lives in the payload (and gets surfaced
 * as an artifact in chat). Voice has no artifact card UX, so we treat
 * these as a signal to look elsewhere.
 *
 * Heuristic, not bulletproof — short messages OR messages that reference
 * the payload/artifact/stored elsewhere. False positives cost us one
 * extra DB load; false negatives mean voice speaks the placeholder.
 */
function isPlaceholderMessage(msg: string): boolean {
    if (!msg) return true;
    const trimmed = msg.trim();
    if (trimmed.length < 80) return true;
    const lower = trimmed.toLowerCase();
    return (
        /in (the )?payload|see (the )?payload|stored in|saved (to|in)|details (in|on|are in)|results (in|are in)|metadata (stored|saved)/.test(
            lower
        )
    );
}

/**
 * Pull substantive text from an agent's payload object. Tries the common
 * conventions (summary, message, content, text, response, answer, result,
 * body) in priority order. Last resort: pretty-print JSON. Returns empty
 * string if nothing usable is found.
 *
 * Order matters: `summary` first because agents that produce both a
 * narrative `summary` and structured side-fields almost always intend
 * `summary` to be the human-spoken form.
 */
function extractPayloadText(payload: unknown): string {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload.trim();
    if (typeof payload !== 'object') return String(payload);

    const obj = payload as Record<string, unknown>;
    const candidates = [
        'summary',
        'Summary',
        'message',
        'Message',
        'content',
        'Content',
        'text',
        'Text',
        'response',
        'Response',
        'answer',
        'Answer',
        'result',
        'Result',
        'body',
        'Body',
    ];
    for (const key of candidates) {
        const val = obj[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
    }
    // Composite content (e.g. `{ findings: [...] }`) — fall through to
    // a pretty JSON dump. Not great for voice but better than silence.
    try {
        return JSON.stringify(payload, null, 2);
    } catch {
        return '';
    }
}

/**
 * Convert a raw `AudioFrame` into the on-wire shape published to
 * `CHANNEL_AUDIO_OUT_TOPIC`. Base64-encodes the `Uint8Array` so it survives
 * JSON serialization across the GraphQL subscription transport.
 *
 * Pure helper — exported for unit tests.
 */
export function encodeAudioFrameForWire(sessionID: string, frame: AudioFrame): ChannelAudioOutPayload {
    return {
        SessionID: sessionID,
        DataBase64: Buffer.from(frame.data).toString('base64'),
        SampleRateHz: frame.sampleRateHz,
        ChannelCount: frame.channelCount,
        MediaType: frame.mediaType,
    };
}
