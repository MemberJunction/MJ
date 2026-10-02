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
 * and shared with every other host, including the React Native app. This class supplies the two
 * things that are genuinely Angular/browser: the `@Injectable` shell that lets components inject
 * it, and the browser's media host.
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
    }
}
