import { Injectable } from '@angular/core';
import { RealtimeSessionRuntime } from '@memberjunction/realtime-runtime';
import {
    LoadAssemblyAIRealtimeClient,
    LoadElevenLabsRealtimeClient,
    LoadGeminiRealtimeClient,
    LoadHuggingFaceRealtimeClient,
    LoadOpenAILiveClient,
    LoadOpenAIRealtimeClient,
    LoadxAIRealtimeClient,
} from '@memberjunction/ai-realtime-client';
import { BrowserRealtimeMediaHost } from './browser-realtime-media-host';

// Tree-shaking prevention: client drivers are resolved dynamically through the ClassFactory (by
// the server-reported Provider key), so these static calls are what keep their @RegisterClass side
// effects from being eliminated by the bundler.
//
// NOTE: the interactive-channel plugins (resolved dynamically from the `MJ: AI Agent Channels`
// registry by ClientPluginClass key) get the same treatment, but their Load calls live in
// `conversations.module.ts` — plugins carry Angular surface COMPONENTS, and this service stays
// component-free.
LoadOpenAIRealtimeClient();
LoadOpenAILiveClient();
LoadGeminiRealtimeClient();
LoadElevenLabsRealtimeClient();
LoadAssemblyAIRealtimeClient();
LoadxAIRealtimeClient();
LoadHuggingFaceRealtimeClient();

/**
 * Angular host for MemberJunction's realtime co-agent sessions.
 *
 * All orchestration — mint, driver resolution, transcripts, tool relay, delegation narration,
 * channel lifecycle, usage relay, teardown — lives in
 * {@link RealtimeSessionRuntime} (`@memberjunction/realtime-runtime`), which is framework-agnostic
 * and shared with every other host, including the React Native app. This class supplies the three
 * things that are genuinely Angular/browser: the `@Injectable` shell that lets components inject
 * it, the browser's media host, and the page-lifecycle wiring that sends the recording's terminal
 * request when the tab is hidden or unloaded (#5294).
 *
 * Consumers are unaffected by that split — the injectable token, class name, and public surface
 * are unchanged. Types that used to be declared in this file (`RealtimeCaption`,
 * `RealtimeConnectionState`, `RealtimeSessionRunOptions`, …) now come from
 * `@memberjunction/realtime-runtime`; import them from there directly, since MJ does not
 * re-export across package boundaries.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeSessionService extends RealtimeSessionRuntime {
    constructor() {
        super(new BrowserRealtimeMediaHost());
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            this.WireRecordingTerminalTriggers(window, document);
        }
    }

    /**
     * Sends the recording terminal (tail shard + counts, as a keepalive request) when the page is
     * going away: on `pagehide`, and when the page becomes hidden — the last event a mobile browser
     * reliably fires before it may discard a backgrounded tab without any unload event. Both handlers
     * only call the runtime's synchronous {@link RealtimeSessionRuntime.SendRecordingTerminal}, which
     * does no IndexedDB work and no encoding: there is no time for either while a page is unloading.
     * It does nothing when no call is recording, and repeating it is safe (a sent tail is sealed, so a
     * call that continues after the tab comes back sends its later shards at new indexes).
     *
     * There is deliberately no `beforeunload` prompt any more: shards already on the server plus the
     * terminal make closing the tab safe, and a `beforeunload` listener blocks the back/forward cache.
     *
     * The service is a root singleton, so these listeners live exactly as long as the app and are
     * never removed.
     *
     * @param page the page-lifecycle event target (`window`)
     * @param visibility the visibility source (`document`)
     */
    protected WireRecordingTerminalTriggers(page: PageHideEventTarget, visibility: VisibilityEventSource): void {
        page.addEventListener('pagehide', () => this.SendRecordingTerminal({ Final: true }));
        visibility.addEventListener('visibilitychange', () => {
            if (visibility.visibilityState === 'hidden') {
                // Not final: the user may come back and the call go on, so the server only stamps the
                // counts and assembles after its grace period instead of rewriting the recording now.
                this.SendRecordingTerminal({ Final: false });
            }
        });
    }
}

/** The slice of `window` the terminal wiring needs; `window` itself satisfies it. */
export interface PageHideEventTarget {
    // case-violation-ok-legacy-back-compat: mirrors the DOM EventTarget API so `window` itself satisfies this interface
    addEventListener(type: 'pagehide', listener: () => void): void;
}

/** The slice of `document` the terminal wiring needs; `document` itself satisfies it. */
export interface VisibilityEventSource {
    // case-violation-ok-legacy-back-compat: mirrors the DOM Document API so `document` itself satisfies this interface
    readonly visibilityState: DocumentVisibilityState;
    // case-violation-ok-legacy-back-compat: mirrors the DOM EventTarget API so `document` itself satisfies this interface
    addEventListener(type: 'visibilitychange', listener: () => void): void;
}
