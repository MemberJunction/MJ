/**
 * @fileoverview Angular host's bridge from {@link RealtimeSessionService} to
 * `@memberjunction/conversations-runtime`'s framework-agnostic
 * `SessionsObserver`.
 *
 * **Role.** Implements `ISessionsAdapter` (defined in conversations-runtime) by
 * subscribing to the voice service's three lifecycle observables —
 * `SessionStarted$`, `ActiveChannels$` (diffed for channel open/close),
 * `SessionEnded$` — and emitting a single discriminated-union stream the
 * runtime re-broadcasts as `ConversationsRuntime.Instance.Sessions.SessionLifecycle$`.
 *
 * **Why not subscribe to `RealtimeSessionService` from the runtime directly?**
 * The runtime is pure TypeScript and must remain Angular-free so non-Angular
 * consumers (React, Vue, Node workers) can use it. This adapter is the
 * Angular-specific code that bridges Angular DI's voice service into the
 * framework-agnostic adapter contract.
 *
 * **Multi-source-ready.** Today this is a 1:1 bridge for `RealtimeSessionService`.
 * A future Angular host that also has a video-session service would either
 * extend this adapter with `merge(voice.SessionLifecycle$, video.SessionLifecycle$)`
 * or register a sibling adapter — the runtime contract doesn't change.
 *
 * @module @memberjunction/ng-conversations
 */

import { Observable, Subject, Subscription, pairwise, startWith } from 'rxjs';
import type {
    ISessionsAdapter,
    SessionLifecycleEvent,
} from '@memberjunction/conversations-runtime';
import { RealtimeSessionService } from './realtime-session.service';

/**
 * Bridges `RealtimeSessionService`'s native lifecycle observables to the generic
 * `SessionLifecycleEvent` shape the runtime expects.
 *
 * **Lifecycle.** Construct once at host bootstrap (see
 * `ConversationsRuntimeBootstrap`), pass to
 * `ConversationsRuntime.Instance.UseSessionsAdapter(...)`, and the runtime owns
 * subscription/teardown via `SessionsObserver`. The adapter itself holds the
 * subscriptions to the voice service and exposes them merged into one stream.
 *
 * Call {@link Dispose} when tearing down the host (typically only in tests —
 * production hosts run for the lifetime of the page).
 */
export class RealtimeSessionsAdapter implements ISessionsAdapter {
    public readonly SessionLifecycle$: Observable<SessionLifecycleEvent>;

    private readonly _events$ = new Subject<SessionLifecycleEvent>();
    private readonly _subs: Subscription[] = [];

    constructor(private readonly voice: RealtimeSessionService) {
        this.SessionLifecycle$ = this._events$.asObservable();
        this.wireUp();
    }

    /**
     * Tear down all subscriptions to the voice service and complete the
     * lifecycle stream. Safe to call multiple times.
     */
    public Dispose(): void {
        for (const sub of this._subs) {
            sub.unsubscribe();
        }
        this._subs.length = 0;
        this._events$.complete();
    }

    private wireUp(): void {
        // session-started — bridge RealtimeSessionService.SessionStarted$ verbatim.
        // That service emits ONLY after both agentSessionId is set AND the
        // realtime client is connected, so we don't need any correlation here.
        //
        // We ALSO synthesize session-channel:open events for each initial
        // channel listed in channelNames. Reason: RealtimeSessionService's
        // StartVoiceSession calls startChannels() (which emits to
        // ActiveChannels$) BEFORE mintSession() resolves and sets
        // agentSessionId. By the time our ActiveChannels$ diff handler runs for
        // that first emission, CurrentAgentSessionId is still null and the
        // event is skipped (correctly — we can't attribute it to a session
        // yet). The result without this synthesis would be asymmetric — initial
        // channels never get an open event, even though they get a close event
        // during teardown. Emitting opens from SessionStarted$ closes the gap.
        this._subs.push(
            this.voice.SessionStarted$.subscribe((started) => {
                this._events$.next({
                    kind: 'session-started',
                    sessionId: started.sessionId,
                    channelKinds: started.channelNames,
                });
                for (const channelName of started.channelNames) {
                    this._events$.next({
                        kind: 'session-channel',
                        sessionId: started.sessionId,
                        channelKind: channelName,
                        state: 'open',
                    });
                }
            })
        );

        // session-channel (mid-session additions + removals) — diff
        // ActiveChannels$ to surface DYNAMIC channel changes during a live
        // session. The service emits the FULL channel array each time (or []
        // on teardown); we compare consecutive emissions to figure out which
        // channels were added vs removed.
        //
        // INITIAL channel-open events at session start are intentionally NOT
        // produced by this diff path — they're synthesized from SessionStarted$
        // above (see the timing rationale there). Channel CLOSES at teardown
        // DO flow through this path because agentSessionId is still set when
        // disposeChannels() emits [] to ActiveChannels$ (teardown nulls it
        // afterwards).
        //
        // `startWith([])` seeds pairwise so it can emit on the first real value
        // — needed so the initial-emission case still goes through the diff
        // logic (where the null-sessionId guard catches it).
        this._subs.push(
            this.voice.ActiveChannels$
                .pipe(startWith([] as ReturnType<() => readonly { ChannelName: string }[]>), pairwise())
                .subscribe(([prev, curr]) => {
                    const sessionId = this.voice.CurrentAgentSessionId;
                    // No active session id means we can't meaningfully attribute the
                    // channel event. Two cases land here:
                    //   1. Initial emission during startChannels() — sessionId not set yet;
                    //      initial opens are handled by SessionStarted$ above.
                    //   2. The brief post-teardown window after agentSessionId is nulled.
                    if (!sessionId) {
                        return;
                    }
                    const prevNames = new Set(prev.map(c => c.ChannelName));
                    const currNames = new Set(curr.map(c => c.ChannelName));

                    for (const name of currNames) {
                        if (!prevNames.has(name)) {
                            this._events$.next({
                                kind: 'session-channel',
                                sessionId,
                                channelKind: name,
                                state: 'open',
                            });
                        }
                    }
                    for (const name of prevNames) {
                        if (!currNames.has(name)) {
                            this._events$.next({
                                kind: 'session-channel',
                                sessionId,
                                channelKind: name,
                                state: 'closed',
                            });
                        }
                    }
                })
        );

        // session-ended — bridge RealtimeSessionService.SessionEnded$ verbatim
        // (the service narrows the reason union to what's actually
        // distinguishable client-side; the runtime widens to include 'unknown'
        // for adapters that can't tell, which we don't need here).
        this._subs.push(
            this.voice.SessionEnded$.subscribe((ended) => {
                this._events$.next({
                    kind: 'session-ended',
                    sessionId: ended.sessionId,
                    reason: ended.reason,
                });
            })
        );
    }
}
