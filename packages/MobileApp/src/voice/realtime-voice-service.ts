/**
 * Realtime voice session orchestrator for the RN app.
 *
 * This is the mobile "host" — the same policy layer the Angular
 * `RealtimeSessionService` (`@memberjunction/ng-conversations`) provides, re-expressed as a
 * small framework-agnostic service. It:
 *
 *  1. mints an ephemeral, provider-native session config from the server via the
 *     `StartRealtimeClientSession` GraphQL mutation (prompt + tool authority stay server-side);
 *  2. resolves the matching `@memberjunction/ai-realtime-client` driver through the MJ
 *     `ClassFactory` by the server-reported `Provider` key — the RN ElevenLabs variant
 *     ({@link RNElevenLabsRealtimeClient}) is registered under `'elevenlabs'`, injecting the RN
 *     audio seams;
 *  3. opens the provider socket DIRECTLY (client-direct topology — audio frames never transit
 *     MJAPI), wiring transcript / state / tool-call / error events to a small typed API;
 *  4. relays executed tool results (`ExecuteRealtimeSessionTool`) and final transcripts
 *     (`RelayRealtimeTranscript`, which persists each turn as a `MJ: Conversation Detail` on the
 *     session's conversation — the realtime analogue of the chat send path) back to MJAPI.
 *
 * Everything runtime-failable is guarded: a missing server mutation, an unregistered provider, a
 * denied mic permission, or a build without native PCM audio all resolve to a clear
 * {@link VoiceSessionState} of `'unavailable'` (with a {@link VoiceUnavailableReason}) rather than
 * throwing — the screen renders a graceful fallback.
 */

import { MJGlobal } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
    BaseRealtimeClient,
    RealtimeAudioActivity,
    RealtimeClientError,
    RealtimeClientState,
    RealtimeClientToolCall,
    RealtimeClientTranscript,
} from '@memberjunction/ai-realtime-client';
import type { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import {
    LoadRNVoiceDrivers,
    acquireVoiceInputStream,
    configureVoiceAudioSession,
    isRealtimePcmAudioSupported,
    requestMicrophonePermission,
    resetVoiceAudioSession,
} from './rn-audio-adapter';

// Keep the RN driver's @RegisterClass side effect alive under the bundler (see the adapter).
LoadRNVoiceDrivers();

/**
 * UI-facing session state. Extends the driver's {@link RealtimeClientState} with host-policy
 * states: `'idle'` (nothing started), `'thinking'` (a relayed tool call is executing server-side),
 * and `'unavailable'` (the feature cannot run in this environment — see {@link VoiceUnavailableReason}).
 */
export type VoiceSessionState =
    | 'idle'
    | 'connecting'
    | 'listening'
    | 'speaking'
    | 'thinking'
    | 'error'
    | 'closed'
    | 'unavailable';

/** Why a voice session could not start — drives the graceful "voice unavailable" copy. */
export type VoiceUnavailableReason =
    | 'audio' // no native PCM audio module in this build (expo-audio is file-based)
    | 'permission' // microphone permission denied
    | 'backend' // the StartRealtimeClientSession mutation is absent / failed
    | 'provider'; // no client driver registered for the server-reported provider

/** A transcript line surfaced to the UI. `narration` turns are ephemeral (never persisted). */
export interface VoiceTranscript {
    /** Which side of the conversation spoke. */
    Role: 'User' | 'Assistant';
    /** The transcribed text (final turns only reach the UI as captions). */
    Text: string;
    /** `'normal'` conversation turn vs `'narration'` (ephemeral spoken progress update). */
    Kind: 'normal' | 'narration';
    /** `true` when this final turn supersedes the previous same-role turn (post-barge-in correction). */
    ReplacesPrevious: boolean;
}

/** An error surfaced to the UI. `Fatal` errors end the session. */
export interface VoiceError {
    /** Human-readable message. */
    Message: string;
    /** Whether the session is no longer usable. */
    Fatal: boolean;
}

/**
 * Discriminated event delivered to a {@link RealtimeVoiceService.on} subscriber. One subscription
 * receives every kind — the screen switches on `Type`. When `Type === 'state'` and the state is
 * `'unavailable'`, `Reason` explains why.
 */
export type VoiceServiceEvent =
    | { Type: 'state'; State: VoiceSessionState; Reason?: VoiceUnavailableReason }
    | { Type: 'transcript'; Transcript: VoiceTranscript }
    | { Type: 'error'; Error: VoiceError };

/** Options for {@link RealtimeVoiceService.start}. */
export interface StartVoiceSessionOptions {
    /** The agent the realtime co-agent voices on behalf of (resolved by the caller). */
    TargetAgentID: string;
    /** Optional existing conversation to attach the session (and its transcripts) to. */
    ConversationID?: string | null;
}

/** Narrow projection of the `StartRealtimeClientSession` mutation payload this host consumes. */
interface StartRealtimeClientSessionPayload {
    AgentSessionId: string;
    ConversationId: string | null;
    Provider: string;
    Model: string;
    EphemeralToken: string;
    ExpiresAt: string;
    SessionConfigJson: string;
    ModelName: string | null;
}

/**
 * Drives a single client-direct realtime voice session. Create one per screen; call
 * {@link start} to begin and {@link stop} to tear down. Provider-agnostic: all wire concerns live
 * in the ClassFactory-resolved driver.
 */
export class RealtimeVoiceService {
    private client: BaseRealtimeClient | null = null;
    private agentSessionId: string | null = null;
    private conversationId: string | null = null;
    private state: VoiceSessionState = 'idle';
    private readonly handlers = new Set<(event: VoiceServiceEvent) => void>();

    /** The active session's conversation id (server-created when none was supplied), or `null`. */
    public get ConversationID(): string | null {
        return this.conversationId;
    }

    /** The current UI session state. */
    public get State(): VoiceSessionState {
        return this.state;
    }

    /**
     * Subscribe to session events (state changes, transcripts, errors). Returns an unsubscribe
     * function. Safe to call more than once; each subscriber receives every event kind.
     */
    public on(handler: (event: VoiceServiceEvent) => void): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    /**
     * The active driver's audio activity (per-direction RMS levels + spectrum bins), or `null`
     * when no session is live or the driver attached no meters. On RN the driver attaches no Web
     * Audio meters, so this returns `null` and the UI falls back to turn-state animation — sampled
     * cheaply per animation frame by the screen.
     */
    public getAudioActivity(): RealtimeAudioActivity | null {
        return this.client?.GetAudioActivity() ?? null;
    }

    /**
     * Start a voice session. Resolves once the session is connecting (or has degraded to
     * `'unavailable'` / `'error'`); further progress arrives via {@link on}. Never throws — every
     * failure path emits a state event and returns.
     */
    public async start(options: StartVoiceSessionOptions): Promise<void> {
        if (this.state !== 'idle' && this.state !== 'closed' && this.state !== 'unavailable') {
            return; // a session is already in progress
        }
        this.conversationId = options.ConversationID ?? null;

        // Gate 1 — audio plane. An expo-audio-only build cannot stream PCM (see the adapter),
        // so there is no point minting a server session that could carry no audio.
        if (!isRealtimePcmAudioSupported()) {
            this.setUnavailable('audio');
            return;
        }
        // Gate 2 — microphone permission (real expo-audio flow).
        if (!(await requestMicrophonePermission())) {
            this.setUnavailable('permission');
            return;
        }
        await configureVoiceAudioSession();
        this.setState('connecting');

        // Gate 3 — server session mint.
        const session = await this.mintSession(options.TargetAgentID);
        if (!session) {
            this.setUnavailable('backend');
            return;
        }
        this.agentSessionId = session.AgentSessionId;
        this.conversationId = session.ConversationId ?? this.conversationId;

        // Gate 4 — provider driver.
        const client = this.resolveClient(session.Provider);
        if (!client) {
            this.setUnavailable('provider');
            void this.closeServerSession();
            return;
        }
        this.client = client;
        this.wireClientHandlers(client);

        try {
            await client.Connect(this.buildClientConfig(session), acquireVoiceInputStream());
        } catch (error) {
            this.emitError(this.describeError(error), true);
            this.setState('error');
            await this.stop();
        }
    }

    /**
     * End the session: disconnect the provider socket, close the server-side agent session, and
     * revert the audio session. Safe to call when nothing is active; never throws.
     */
    public async stop(): Promise<void> {
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.Disconnect();
            } catch {
                /* teardown must never throw */
            }
        }
        await this.closeServerSession();
        await resetVoiceAudioSession();
        if (this.state !== 'error' && this.state !== 'unavailable') {
            this.setState('closed');
        }
        this.agentSessionId = null;
    }

    // ── Session mint ────────────────────────────────────────────────────────────

    /**
     * Calls `StartRealtimeClientSession` to have the server mint an ephemeral provider-native
     * session config. Returns `null` (never throws) when the mutation is absent, errors, or
     * returns no ephemeral token — the caller degrades to the `'backend'` unavailable state.
     */
    private async mintSession(targetAgentId: string): Promise<StartRealtimeClientSessionPayload | null> {
        const mutation = `
            mutation StartRealtimeClientSession($targetAgentId: String!, $conversationId: String) {
                StartRealtimeClientSession(targetAgentId: $targetAgentId, conversationId: $conversationId) {
                    AgentSessionId
                    ConversationId
                    Provider
                    Model
                    EphemeralToken
                    ExpiresAt
                    SessionConfigJson
                    ModelName
                }
            }
        `;
        try {
            const provider = GraphQLDataProvider.Instance;
            if (!provider) {
                return null;
            }
            const result = (await provider.ExecuteGQL(mutation, {
                targetAgentId,
                conversationId: this.conversationId,
            })) as { StartRealtimeClientSession?: StartRealtimeClientSessionPayload } | null;
            const payload = result?.StartRealtimeClientSession;
            return payload?.EphemeralToken ? payload : null;
        } catch (error) {
            console.warn('[RealtimeVoice] StartRealtimeClientSession failed:', this.describeError(error));
            return null;
        }
    }

    /** Resolves the client driver for `provider` via the ClassFactory (null when unregistered). */
    private resolveClient(provider: string): BaseRealtimeClient | null {
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeClient, provider);
        if (!registration) {
            return null;
        }
        return MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, provider) ?? null;
    }

    /** Builds the client-direct config the driver connects with. */
    private buildClientConfig(session: StartRealtimeClientSessionPayload): ClientRealtimeSessionConfig {
        return {
            Provider: session.Provider,
            Model: session.Model,
            EphemeralToken: session.EphemeralToken,
            ExpiresAt: session.ExpiresAt,
            SessionConfig: this.parseSessionConfig(session.SessionConfigJson),
        };
    }

    /** Parses the opaque server-built session config; an unparseable value degrades to `{}`. */
    private parseSessionConfig(sessionConfigJson: string | null): JSONObject {
        if (!sessionConfigJson) {
            return {};
        }
        try {
            return JSON.parse(sessionConfigJson) as JSONObject;
        } catch {
            return {};
        }
    }

    // ── Driver event wiring ──────────────────────────────────────────────────────

    /** Subscribes host policy to the driver's events. */
    private wireClientHandlers(client: BaseRealtimeClient): void {
        client.OnStateChange((state) => this.onClientStateChange(state));
        client.OnTranscript((transcript) => this.onClientTranscript(transcript));
        client.OnToolCall((call) => {
            void this.onToolCall(call);
        });
        client.OnError((error) => this.onClientError(error));
    }

    /** Maps a driver state to the UI state (`'connected'` is suppressed — stays `'connecting'`). */
    private onClientStateChange(state: RealtimeClientState): void {
        switch (state) {
            case 'connecting':
                this.setState('connecting');
                break;
            case 'connected':
                break; // wait for 'listening'
            case 'listening':
                this.setState('listening');
                break;
            case 'speaking':
                this.setState('speaking');
                break;
            case 'error':
                this.setState('error');
                break;
            case 'closed':
                if (this.state !== 'error') {
                    this.setState('closed');
                }
                break;
        }
    }

    /**
     * Transcript policy: final NORMAL turns become captions AND persist to the conversation via
     * `RelayRealtimeTranscript`; final NARRATION turns are ephemeral (surfaced, never persisted);
     * interim deltas are dropped (the driver already drives the speaking state).
     */
    private onClientTranscript(transcript: RealtimeClientTranscript): void {
        if (!transcript.IsFinal) {
            return;
        }
        this.emit({
            Type: 'transcript',
            Transcript: {
                Role: transcript.Role,
                Text: transcript.Text,
                Kind: transcript.Kind,
                ReplacesPrevious: transcript.ReplacesPrevious ?? false,
            },
        });
        if (transcript.Kind === 'normal') {
            void this.relayTranscript(transcript.Role, transcript.Text, transcript.ReplacesPrevious ?? false);
        }
    }

    /** A fatal driver error ends the session; non-fatal errors are surfaced without teardown. */
    private onClientError(error: RealtimeClientError): void {
        this.emitError(error.Message, error.Fatal);
        if (error.Fatal) {
            this.setState('error');
        }
    }

    // ── Server relays ────────────────────────────────────────────────────────────

    /**
     * Executes a relayed tool call server-side (`ExecuteRealtimeSessionTool`) and feeds the result
     * back to the model. The session shows `'thinking'` while the tool runs. A failure feeds a
     * structured error result back so the model can narrate the failure rather than hanging.
     */
    private async onToolCall(call: RealtimeClientToolCall): Promise<void> {
        const client = this.client;
        if (!client || !this.agentSessionId) {
            return;
        }
        this.setState('thinking');
        const resultJson = await this.executeSessionTool(call.CallID, call.ToolName, call.ArgumentsJson);
        client.SendToolResult(call.CallID, resultJson);
    }

    /** Calls `ExecuteRealtimeSessionTool`; returns a structured error result JSON on any failure. */
    private async executeSessionTool(callId: string, toolName: string, argsJson: string): Promise<string> {
        const mutation = `
            mutation ExecuteRealtimeSessionTool($agentSessionId: String!, $callId: String!, $toolName: String!, $argsJson: String!) {
                ExecuteRealtimeSessionTool(agentSessionId: $agentSessionId, callId: $callId, toolName: $toolName, argsJson: $argsJson)
            }
        `;
        try {
            const result = (await GraphQLDataProvider.Instance.ExecuteGQL(mutation, {
                agentSessionId: this.agentSessionId,
                callId,
                toolName,
                argsJson,
            })) as { ExecuteRealtimeSessionTool?: string } | null;
            return result?.ExecuteRealtimeSessionTool ?? '{}';
        } catch (error) {
            return JSON.stringify({ success: false, error: this.describeError(error) });
        }
    }

    /**
     * Persists a final transcript turn as a `MJ: Conversation Detail` on the session's conversation
     * via `RelayRealtimeTranscript` (`replacesPrevious` updates the previous turn in place after a
     * barge-in correction). Best-effort — a failed relay never disturbs the live call.
     */
    private async relayTranscript(role: 'User' | 'Assistant', text: string, replacesPrevious: boolean): Promise<void> {
        if (!this.agentSessionId) {
            return;
        }
        const mutation = `
            mutation RelayRealtimeTranscript($agentSessionId: String!, $role: String!, $text: String!, $replacesPrevious: Boolean) {
                RelayRealtimeTranscript(agentSessionId: $agentSessionId, role: $role, text: $text, replacesPrevious: $replacesPrevious)
            }
        `;
        try {
            await GraphQLDataProvider.Instance.ExecuteGQL(mutation, {
                agentSessionId: this.agentSessionId,
                role: role.toLowerCase(),
                text,
                replacesPrevious,
            });
        } catch (error) {
            console.warn('[RealtimeVoice] RelayRealtimeTranscript failed:', this.describeError(error));
        }
    }

    /** Closes the server-side agent session (`CloseAgentSession`). Best-effort; never throws. */
    private async closeServerSession(): Promise<void> {
        if (!this.agentSessionId) {
            return;
        }
        const mutation = `
            mutation CloseAgentSession($agentSessionId: String!) {
                CloseAgentSession(agentSessionId: $agentSessionId)
            }
        `;
        try {
            await GraphQLDataProvider.Instance.ExecuteGQL(mutation, { agentSessionId: this.agentSessionId });
        } catch (error) {
            console.warn('[RealtimeVoice] CloseAgentSession failed:', this.describeError(error));
        }
    }

    // ── Emit helpers ─────────────────────────────────────────────────────────────

    /** Records + emits a new UI state (idempotent — repeated states are still delivered). */
    private setState(state: VoiceSessionState): void {
        this.state = state;
        this.emit({ Type: 'state', State: state });
    }

    /** Records + emits the `'unavailable'` state with the reason it could not start. */
    private setUnavailable(reason: VoiceUnavailableReason): void {
        this.state = 'unavailable';
        this.emit({ Type: 'state', State: 'unavailable', Reason: reason });
    }

    /** Emits an error event. */
    private emitError(message: string, fatal: boolean): void {
        this.emit({ Type: 'error', Error: { Message: message, Fatal: fatal } });
    }

    /** Fans one event out to every subscriber (a throwing subscriber never breaks the others). */
    private emit(event: VoiceServiceEvent): void {
        for (const handler of this.handlers) {
            try {
                handler(event);
            } catch {
                /* a subscriber's error must not disrupt session policy */
            }
        }
    }

    /** Normalizes an unknown thrown value into a message string. */
    private describeError(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
