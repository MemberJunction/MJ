/**
 * @fileoverview Stub observability surface for AI Agent Sessions & Channels.
 *
 * This is a **no-op placeholder** until PR #2787 (`plans/ai-agent-sessions.md`) lands.
 * That PR introduces:
 * - `BaseRealtimeModel` — modality-agnostic, streaming, full-duplex, tool-calling model
 *   primitive (Gemini Live, GPT Realtime, etc.).
 * - A new `Realtime` agent type + generic Voice Co-Agent that acts as the live voice for
 *   any existing agent, delegating real work back to it.
 * - Sessions & Channels infrastructure — long-lived Sessions wrap multiple `AIAgentRun`s
 *   of a real-time interaction; pluggable, *interactive* Channels (voice, whiteboard,
 *   text, …) are bidirectional surfaces the agent perceives and acts on.
 *
 * **What this stub does today:** nothing. It exists so the runtime API is stable and
 * widget consumers can already subscribe to session-related observables without code
 * changes once PR #2787 lands.
 *
 * **What gets wired in once PR #2787 merges:** the observer subscribes to the Sessions
 * infrastructure's public API, surfaces lifecycle (`session-started`, `session-channel`,
 * `session-ended`) through `SessionLifecycle$`, and the widget's existing `SessionStarted`
 * / `SessionChannelStateChanged` / `SessionEnded` `@Output()`s start firing automatically.
 *
 * @module @memberjunction/conversations-runtime
 */

import { Observable, Subject } from 'rxjs';

/** A single Session lifecycle event surfaced by the observer. */
export type SessionLifecycleEvent =
    | { kind: 'session-started'; sessionId: string; channelKinds: string[] }
    | { kind: 'session-channel'; sessionId: string; channelKind: string; state: SessionChannelState }
    | { kind: 'session-ended'; sessionId: string; reason: string };

/** Channel state transitions surfaced for `session-channel` events. */
export type SessionChannelState = 'opening' | 'open' | 'closing' | 'closed';

/**
 * Observes Sessions/Channels lifecycle from PR #2787 and surfaces it as RxJS events.
 *
 * **Stub today.** The observable exists and is wired into the runtime, but never emits
 * until PR #2787 lands and the wiring is completed.
 *
 * Usually accessed via `ConversationsRuntime.Instance.Sessions`.
 */
export class SessionsObserver {
    /**
     * Stream of Session lifecycle events. Consumers (e.g., the widget's `SessionStarted` /
     * `SessionChannelStateChanged` / `SessionEnded` `@Output()` plumbing) subscribe here.
     *
     * **Stub:** never emits until PR #2787's wiring is completed in a follow-up.
     */
    public readonly SessionLifecycle$: Observable<SessionLifecycleEvent>;

    private readonly _lifecycle$ = new Subject<SessionLifecycleEvent>();

    constructor() {
        this.SessionLifecycle$ = this._lifecycle$.asObservable();
    }

    /**
     * Whether this observer is wired against PR #2787's Sessions infrastructure.
     *
     * **Today: always `false`** (stub). Once the follow-up PR wires the observer in,
     * this returns `true` after `Config()` (or equivalent) completes.
     */
    public get IsWired(): boolean {
        return false;
    }

    /**
     * Tear down any subscriptions to the Sessions infrastructure. No-op today; the wiring
     * PR will add the real cleanup. Safe to call regardless of wiring state.
     */
    public Dispose(): void {
        this._lifecycle$.complete();
    }
}
