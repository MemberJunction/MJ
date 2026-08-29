# @memberjunction/ai-elevenlabs

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 5ecfdb4: Realtime voice agents can now **speak first**.

  Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).
  - **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
  - **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
  - **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.
  - **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto _whichever_ driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

  Drivers without a provider-native opening utterance ignore the key and open silently, as before.

### Patch Changes

- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [de343b5]
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/ai@6.1.0-edge.1
- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- 24b22c9: Carry a per-session **voice** on ElevenLabs realtime sessions: `RealtimeSessionParams.Config.voice` is now sent as the `tts.voice_id` conversation-config override, on both the client-direct mint and the server-bridged initiation frame.

  The driver could already carry a per-session system prompt but not a voice, so a consumer modelling a persona could express who the agent _is_ but not what they _sound like_ — every session on an agent shared one voice, and changing it meant one dashboard-managed agent per persona. `voice` is the driver-neutral key AssemblyAI and Inworld already read, so it reaches the driver unchanged from the effective config as `realtime.voice.providers.elevenlabs.voice`.

  Enabling the override on the managed agent is not sufficient on its own: ElevenLabs drops any override the agent has not allowed, and the ensure flow's drift check only tested the _prompt_ override — so an agent provisioned by an earlier version matched on tools and was never re-PATCHed, leaving `tts.voiceId` disabled and the voice silently dropped on every existing deployment. The drift check now requires the whole override set, so those agents are repaired on next use. A test drives every override the driver writes and asserts each one, alone, triggers that repair — so adding a future override without teaching the drift check about it fails the build rather than shipping the same silent gap again.

  Sessions with no configured voice are byte-for-byte unchanged. Blank and non-string values are ignored rather than sent, since an empty `voice_id` would fail the whole session. Fixes #3374.

  Smoke-testing the above against a live ElevenLabs account surfaced two further defects in the managed-agent ensure flow, both pre-existing and both fixed here:

  **The tool-set fingerprint never matched the remote, so every session re-PATCHed the agent.** `ToolSetFingerprint` compared a raw `JSON.stringify`, but the platform returns schema keys in its own order _and_ materializes its own defaults into the stored form (`dynamic_variable: ""`, `is_omitted: false`, `required: []`, `isSystemProvided: false`, `constantValue: ""`), making the stored schema a superset of what was sent. The fingerprint now sorts object keys and drops empty/default entries on both sides. Arrays keep their order, since an `enum` or `required` list is data rather than a set. Deliberate, documented loss of sensitivity: a field flipping between `false`/`""`/`[]` and absent no longer counts as drift; any meaningful value change still does.

  **Find-by-name could fork a duplicate managed agent.** ElevenLabs' agent search is eventually consistent, so an agent created moments earlier — by this process or a concurrent one — is briefly invisible. A single miss made the ensure flow conclude the agent did not exist and create a second one competing for the same name forever (observed live, twice). Lookups are now retried up to a bounded `MAX_AGENT_LOOKUP_ATTEMPTS`, and when duplicates _do_ already exist the oldest is adopted deterministically so every process and session converges on the same agent instead of PATCHing them alternately.

  **Two sessions opening at once could fork a duplicate agent within a single process.** The ensure cache stored the _resolved_ agent id, so it was only populated once the whole find-create round-trip finished — two concurrent sessions for the same not-yet-provisioned name both missed the cache, both found nothing, and both created. It now caches the _in-flight_ ensure, so the second caller joins the first instead of racing it, and a rejected ensure is evicted rather than replaying one transient REST failure to every later session for the life of the process. This closes the intra-process half of the fork above; genuinely simultaneous _cross-process_ cold starts can still create duplicates, which the oldest-wins adoption above then converges.

  Two API notes, both on seams the driver owns end to end: `ElevenLabsRealtimeSession.SendInitiation` now takes the wire-shaped overrides object rather than the system-prompt string, so the client-direct and server-bridged paths build it in one place and cannot drift (the class is documented as driver-constructed and never instantiated by consumers). `ElevenLabsRealtime.PromptOverrideEnabled` is deprecated in favour of `OverridesSatisfied` — it reports on one override and so cannot answer whether an agent is current.
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/ai@6.0.0
- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/ai@5.51.0
- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [c221553]
- Updated dependencies [0ba33b3]
  - @memberjunction/ai@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [b52ffa8]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [15e3017]
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [c20723a]
  - @memberjunction/ai@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ai@5.47.0
- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ai@5.46.0
- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- 8c8b658: Realtime UX wave 2 — the progressive-disclosure console (pure-audio-first overlay with the breathing hero orb, disclosure levels 0–4 ratcheted per-user via UserInfoEngine, gear density escape hatch, unified app-bar, fused composer dock; content never flips the console open — the one auto-reveal is a channel's first agent activity, finished artifacts arrive as glowing unfocused tabs, Activity tab pinned last); audio-reactive call visuals (BaseRealtimeClient GetAudioActivity capability — per-direction RMS + 9-bin spectrum metered on all four drivers via a shared RealtimePcmPlayback master-gain tap / WebRTC stream analysers — driving the hero + app-bar orbs and a true-spectrum EQ through a zero-CD rAF loop, with turn-state fallback). Whiteboard: OneNote-style PAGES (v2 JSON with tolerant v1 migration, AddPage/SwitchPage/RenamePage agent tools, page strip with inline rename + right-click Rename/Delete/New-page context menus, agent-authored page garnish), multi-select (marquee, shift-click, single-undo group drag/delete), hold-to-zoom, multi-page HTML/SVG export, shared active-page note on all item tools, UUIDsEqual compliance. ElevenLabs: tool-schema sanitizer (non-string enums + leaf descriptions, fingerprint-stable) and the absorbed-tool-result voice nudge. Conversations: shared auto-naming helper + race-free realtime naming lifecycle on SessionStarted$, slide-panel splitter rework, angular-split dependency removed. Plus integration-test script groundwork (server/client/runquery cache suites) and cache-layer fixes carried on this branch.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [15b743b]
- Updated dependencies [1568bae]
  - @memberjunction/ai@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/ai@5.40.1
- @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/ai@5.40.0
- @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [30f598d]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/ai@5.37.0
- @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/ai@5.36.0
- @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/ai@5.34.1
- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [389d356]
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
  - @memberjunction/global@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/ai@5.32.0
- @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ai@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/ai@5.30.0
- @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/ai@5.29.0
- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/ai@5.28.0
- @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/ai@5.26.0
- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/ai@5.25.0
- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/ai@5.24.0
- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/ai@5.21.0
- @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/ai@5.20.0
- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ai@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/ai@5.17.0
- @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/ai@5.16.0
- @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- c3e8b94: metadata updates and migration

### Patch Changes

- Updated dependencies [c3e8b94]
  - @memberjunction/ai@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/ai@5.14.0
- @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/ai@5.12.0
- @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/ai@5.11.0
- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/ai@5.10.0
- @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/ai@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/ai@5.8.0
- @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
  - @memberjunction/ai@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/ai@5.6.0
- @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/ai@5.4.0
- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/ai@5.3.0
- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- @memberjunction/ai@5.2.0
- @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/ai@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- @memberjunction/ai@4.4.0
- @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/ai@4.3.0
- @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- @memberjunction/ai@4.1.0
- @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ai@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- @memberjunction/ai@3.4.0
- @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ai@3.3.0
- @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- @memberjunction/ai@3.2.0
- @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- @memberjunction/ai@2.133.0
- @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- @memberjunction/ai@2.132.0
- @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- @memberjunction/ai@2.131.0
- @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai@2.130.1
- @memberjunction/global@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- Updated dependencies [83ae347]
  - @memberjunction/ai@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [fbae243]
- Updated dependencies [c7e38aa]
  - @memberjunction/global@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- @memberjunction/ai@2.128.0
- @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
  - @memberjunction/global@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- @memberjunction/ai@2.126.0
- @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- @memberjunction/ai@2.125.0
- @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- @memberjunction/ai@2.124.0
- @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ai@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- @memberjunction/ai@2.122.2
- @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- @memberjunction/ai@2.122.0
- @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
  - @memberjunction/ai@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- @memberjunction/ai@2.120.0
- @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- @memberjunction/ai@2.119.0
- @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- @memberjunction/ai@2.118.0
- @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- @memberjunction/ai@2.117.0
- @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [a8d5592]
  - @memberjunction/global@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ai@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/ai@2.113.2
- @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/ai@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/ai@2.110.0
- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/ai@2.109.0
- @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/ai@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [9b67e0c]
  - @memberjunction/ai@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0
  - @memberjunction/ai@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [addf572]
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/ai@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- @memberjunction/ai@2.100.0
- @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- @memberjunction/ai@2.99.0
- @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/ai@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- @memberjunction/ai@2.96.0
- @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- @memberjunction/ai@2.95.0
- @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/ai@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- @memberjunction/ai@2.93.0
- @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- @memberjunction/ai@2.92.0
- @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- @memberjunction/ai@2.91.0
- @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- @memberjunction/ai@2.90.0
- @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/ai@2.89.0
- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/ai@2.88.0
- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/ai@2.87.0
- @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/ai@2.86.0
- @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [a96c1a7]
  - @memberjunction/ai@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- @memberjunction/ai@2.84.0
- @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- @memberjunction/ai@2.83.0
- @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/ai@2.82.0
- @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- @memberjunction/ai@2.81.0
- @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- @memberjunction/ai@2.80.0
- @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
  - @memberjunction/ai@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- @memberjunction/ai@2.77.0
- @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- @memberjunction/ai@2.76.0
- @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/ai@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- @memberjunction/ai@2.74.0
- @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [eebfb9a]
  - @memberjunction/ai@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/ai@2.72.0
- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai@2.70.0

## 2.69.1

### Patch Changes

- @memberjunction/ai@2.69.1
- @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/global@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Patch Changes

- @memberjunction/ai@2.68.0
- @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ai@2.66.0
- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/ai@2.64.0
- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/ai@2.63.0
- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/ai@2.61.0
- @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- @memberjunction/ai@2.60.0
- @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [db88416]
  - @memberjunction/ai@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/global@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/ai@2.56.0
- @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- @memberjunction/ai@2.54.0
- @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- @memberjunction/ai@2.53.0
- @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/ai@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
  - @memberjunction/ai@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [62cf1b6]
  - @memberjunction/global@2.49.0
  - @memberjunction/ai@2.49.0

## 2.48.0

### Patch Changes

- @memberjunction/ai@2.48.0
- @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/ai@2.47.0
- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/global@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [fbc30dc]
  - @memberjunction/ai@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- @memberjunction/ai@2.43.0
- @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
  - @memberjunction/ai@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- Updated dependencies [b6ce661]
  - @memberjunction/ai@2.40.0
  - @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [f73ea0e]
  - @memberjunction/ai@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/ai@2.38.0
- @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ai@2.37.1
- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/ai@2.37.0
- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [d9defc9]
- Updated dependencies [577cc6a]
  - @memberjunction/ai@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0

## 2.35.1

### Patch Changes

- @memberjunction/ai@2.35.1
- @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- 364f754: expanded functionality for elevenlabs & heygen + implement openai TTS
  - @memberjunction/ai@2.35.0
  - @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ai@2.34.2
- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ai@2.34.1
- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/ai@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- efafd0e: Readme documentation, courtesy of Claude
- Updated dependencies [efafd0e]
  - @memberjunction/ai@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ai@2.32.2
- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ai@2.32.1
- @memberjunction/global@2.32.1

## 2.32.0

### Minor Changes

- 186702d: Added AI Models for HeyGen/ElevenLabs

### Patch Changes

- @memberjunction/ai@2.32.0
- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/ai@2.31.0
- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/global@2.30.0
  - @memberjunction/ai@2.30.0

## 2.29.2

### Patch Changes

- @memberjunction/ai@2.29.2
- @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- @memberjunction/ai@2.28.0
- @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ai@2.27.1
- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [b4d3cbc]
  - @memberjunction/ai@2.27.0
  - @memberjunction/global@2.27.0
