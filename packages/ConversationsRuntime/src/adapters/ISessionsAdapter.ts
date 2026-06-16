/**
 * @fileoverview Sessions adapter — boundary between the runtime and the host's
 * realtime sessions infrastructure (PR #2787 — `MJ: AI Agent Sessions` + Channels).
 *
 * The runtime needs to surface session lifecycle events (a Voice / Realtime
 * co-agent session started, a channel within it opened or closed, the session
 * ended) without depending on any specific UI library or session implementation.
 * Hosts implement this adapter to bridge their internal session source
 * (Angular's `RealtimeSessionService` today; future server-bridged voice host,
 * video-only host, etc.) into a single push stream the runtime exposes.
 *
 * Default (when no adapter is registered): {@link NoOpSessionsAdapter} emits
 * nothing. Headless consumers still work — the
 * {@link ../sessions/SessionsObserver.SessionsObserver} sub-component subscribes,
 * sees no events, and the rest of the runtime is unaffected.
 *
 * **Multi-source-capable by design.** An adapter implementation can merge
 * multiple internal services (voice + future video + future server-bridged
 * realtime) into one observable. The runtime never sees the underlying services.
 *
 * **Scope cut — server-only events.** Server-side session closes (janitor
 * sweep / shutdown) that happen while the user's tab is gone do NOT flow
 * through this adapter today. Live-session orchestration only; admin/observability
 * tooling polls the entity for those.
 *
 * @module @memberjunction/conversations-runtime
 */

import { EMPTY, Observable } from 'rxjs';

/**
 * Per-channel state surfaced for `session-channel` events.
 *
 * **Why only two values?** `RealtimeSessionService`'s only channel observable is
 * `ActiveChannels$` (the full plugin set), which fires once on resolve and again
 * with `[]` on teardown. There's no `opening` / `closing` transition observable
 * at the channel-plugin level today. Narrowing here is honest about what's
 * observable; widening later is non-breaking (consumers handling
 * `'open' | 'closed'` still type-check against `'opening' | 'open' | 'closing'
 * | 'closed'`).
 */
export type SessionChannelState = 'open' | 'closed';

/**
 * Why a session ended.
 *
 * **Three values, not four.** The server-side `AIAgentSession.CloseReason`
 * column has four (`Explicit | Janitor | Shutdown | Error`), but only two are
 * distinguishable client-side (`explicit` = user called `EndVoiceSession`;
 * `error` = teardown ran from a catch block). `'unknown'` covers any other
 * client-observable end path. Janitor/shutdown happen out-of-process and never
 * reach the runtime — see the module-level scope cut.
 */
export type SessionEndReason = 'explicit' | 'error' | 'unknown';

/**
 * One lifecycle event surfaced by an {@link ISessionsAdapter}.
 *
 * Mirrors `MJ: AI Agent Sessions` lifecycle at a deliberately generic level —
 * no voice/transcript/model fields — so future channel modalities (video,
 * screen-share, code editor, etc.) emit the same shape.
 */
export type SessionLifecycleEvent =
    | { kind: 'session-started'; sessionId: string; channelKinds: string[] }
    | { kind: 'session-channel'; sessionId: string; channelKind: string; state: SessionChannelState }
    | { kind: 'session-ended'; sessionId: string; reason: SessionEndReason };

/**
 * Boundary the runtime subscribes to for session lifecycle.
 *
 * Hosts supply an implementation that pushes events from their realtime
 * session source — the Angular host's `RealtimeSessionsAdapter` bridges
 * `RealtimeSessionService`'s `SessionStarted$` / `ActiveChannels$` / `SessionEnded$`
 * observables; a Node CLI or React app would write a different implementation.
 *
 * **Single-observable contract.** One `SessionLifecycle$` stream carries all
 * three event kinds (a discriminated union). Subscribers narrow with the `kind`
 * tag.
 *
 * @example Angular host bootstrap
 * ```typescript
 * runtime.UseSessionsAdapter(new RealtimeSessionsAdapter(voiceSessionService));
 * ```
 *
 * @example Multi-source adapter (future)
 * ```typescript
 * // When a future video session service ships, merge it with voice — the
 * // runtime contract doesn't change.
 * class MultiModalSessionsAdapter implements ISessionsAdapter {
 *     public readonly SessionLifecycle$ = merge(
 *         this.voice.SessionLifecycle$,
 *         this.video.SessionLifecycle$,
 *     );
 *     constructor(private voice: RealtimeSessionsAdapter, private video: VideoSessionsAdapter) {}
 * }
 * ```
 */
export interface ISessionsAdapter {
    /**
     * Push stream of session lifecycle events. Subscribers are typically the
     * runtime's `SessionsObserver`, which re-broadcasts to widget consumers
     * via `ConversationsRuntime.Instance.Sessions.SessionLifecycle$`.
     */
    readonly SessionLifecycle$: Observable<SessionLifecycleEvent>;
}

/**
 * Default {@link ISessionsAdapter} for headless / non-Angular consumers. Emits
 * nothing — the runtime's `SessionsObserver` still constructs and exposes its
 * observable; subscribers just never receive events until a real adapter is
 * registered.
 *
 * Existence of this default is a deliberate maintainability call: the runtime
 * is usable out-of-the-box without forcing every consumer to wire up sessions
 * infrastructure they may not have.
 */
export class NoOpSessionsAdapter implements ISessionsAdapter {
    public readonly SessionLifecycle$: Observable<SessionLifecycleEvent> = EMPTY;
}
