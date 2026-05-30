import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
    EndSessionResult,
    StartSessionResult,
    SubmitTextTurnResult,
    VoiceAudioFrame,
    VoiceTranscriptEvent,
} from './voice-widget.types';

/**
 * GraphQL plumbing for the Voice Widget.
 *
 * Why a service (not inline in the component): keeps the component declarative
 * and makes the wire shapes easy to test/swap. **All calls go through
 * `GraphQLDataProvider`** — the same instance Explorer uses — so auth, token
 * refresh, WebSocket lifecycle, and reconnect logic are inherited for free.
 *
 * The component owns:
 *   - `AudioContext` lifecycle (must be created under a user gesture)
 *   - PCM decoding + scheduling (Web Audio API)
 *   - Transcript and status state
 *
 * The service owns:
 *   - `StartChannelSession` / `SubmitChannelTextTurn` / `EndChannelSession` mutations
 *   - `ChannelAudioOut` subscription
 */
@Injectable({ providedIn: 'root' })
export class VoiceWidgetService {
    /**
     * Open a text-in / voice-out channel session.
     *
     * Critically: we **omit `RoomName`**. The server's
     * `ChannelSessionResolver.buildTransportForChannel` interprets this as
     * "use `TextInputAudioOutputTransport`" — exactly the path we want for the
     * demo (no LiveKit, no microphone).
     */
    public async StartSession(
        agentID: string,
        channelName: string,
        conversationID?: string | null
    ): Promise<StartSessionResult> {
        const mutation = `
            mutation StartChannelSession($input: StartChannelSessionInput!) {
                StartChannelSession(input: $input) {
                    SessionID
                    ChannelName
                }
            }
        `;
        const input: Record<string, unknown> = { AgentID: agentID, ChannelName: channelName };
        if (conversationID) {
            // Server's StartChannelSessionInput already accepts ConversationID
            // (see ChannelSessionResolver). Passing it pins the voice session
            // to an existing chat; otherwise the server auto-creates one.
            input.ConversationID = conversationID;
        }
        const data = await GraphQLDataProvider.ExecuteGQL(mutation, { input });
        const result = data?.StartChannelSession as StartSessionResult | undefined;
        if (!result?.SessionID) {
            throw new Error('StartChannelSession returned no SessionID');
        }
        return result;
    }

    /**
     * Push a user-text turn into a running text-in/voice-out session. The
     * agent's reply is streamed back as audio over `ChannelAudioOut`.
     *
     * Returns `{ OK: false, ErrorMessage }` without throwing for known failure
     * modes (unknown SessionID, wrong transport kind) — matches the resolver's
     * contract.
     */
    public async SubmitTextTurn(sessionID: string, text: string): Promise<SubmitTextTurnResult> {
        const mutation = `
            mutation SubmitChannelTextTurn($input: SubmitChannelTextTurnInput!) {
                SubmitChannelTextTurn(input: $input) {
                    OK
                    ErrorMessage
                }
            }
        `;
        const variables = { input: { SessionID: sessionID, Text: text } };
        const data = await GraphQLDataProvider.ExecuteGQL(mutation, variables);
        return (data?.SubmitChannelTextTurn as SubmitTextTurnResult) ?? { OK: false };
    }

    /**
     * End the session. Idempotent — server returns `{ OK: false }` for unknown
     * sessions but never throws.
     */
    public async EndSession(sessionID: string, reason?: string): Promise<EndSessionResult> {
        const mutation = `
            mutation EndChannelSession($input: EndChannelSessionInput!) {
                EndChannelSession(input: $input) {
                    OK
                }
            }
        `;
        const variables = { input: { SessionID: sessionID, Reason: reason ?? 'user-disconnect' } };
        const data = await GraphQLDataProvider.ExecuteGQL(mutation, variables);
        return (data?.EndChannelSession as EndSessionResult) ?? { OK: false };
    }

    /**
     * Subscribe to outbound audio frames for a session.
     *
     * Delegates to `GraphQLDataProvider.Instance.subscribe(...)` which:
     *   - Reuses the same auth as Explorer (Bearer token in `connectionParams`)
     *   - Handles JWT refresh + reconnect on token expiry
     *   - Pools the WebSocket across other subscriptions (no per-widget socket)
     *
     * Returns an Observable<VoiceAudioFrame>; subscribe with `.subscribe(...)`
     * and unsubscribe on teardown.
     */
    /**
     * Subscribe to transcript events for a session. Emits user finals,
     * incremental assistant text deltas (the same chars the TTS is speaking),
     * and a final `agent-response` event carrying actionable command chips.
     *
     * Shares the same WebSocket as `SubscribeToAudio`; no extra connection.
     */
    public SubscribeToTranscript(sessionID: string): Observable<VoiceTranscriptEvent> {
        const subscription = `
            subscription Transcript($sid: String!) {
                ChannelTranscript(SessionID: $sid) {
                    SessionID
                    Kind
                    Text
                    IsFinal
                    ActionableCommands
                    ResponseForm
                    CallID
                    ToolName
                    Label
                    Status
                    Detail
                }
            }
        `;
        return GraphQLDataProvider.Instance.subscribe(subscription, { sid: sessionID }).pipe(
            map((data: unknown) => {
                const payload = (data as { ChannelTranscript?: VoiceTranscriptEvent } | null)
                    ?.ChannelTranscript;
                if (!payload) {
                    throw new Error('ChannelTranscript subscription emitted an empty event');
                }
                return payload;
            })
        );
    }

    public SubscribeToAudio(sessionID: string): Observable<VoiceAudioFrame> {
        const subscription = `
            subscription Audio($sid: String!) {
                ChannelAudioOut(SessionID: $sid) {
                    DataBase64
                    SampleRateHz
                    ChannelCount
                    MediaType
                }
            }
        `;
        return GraphQLDataProvider.Instance.subscribe(subscription, { sid: sessionID }).pipe(
            map((data: unknown) => {
                // graphql-ws yields `{ ChannelAudioOut: { ... } }` here (the
                // outer `data:` envelope is unwrapped by GraphQLDataProvider).
                const payload = (data as { ChannelAudioOut?: VoiceAudioFrame } | null)?.ChannelAudioOut;
                if (!payload) {
                    throw new Error('ChannelAudioOut subscription emitted an empty frame');
                }
                return payload;
            })
        );
    }
}
