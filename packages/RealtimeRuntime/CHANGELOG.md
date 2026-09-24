# @memberjunction/realtime-runtime

## 6.2.0-edge.0

### Minor Changes

- 7658d68: Mobile app v6: make realtime voice actually resolve on a device, route hosted applications' generic nav items, and scope the new agent-session grants with row-level security.

  **Why `minor`.** The branch adds metadata — two `MJ: Row Level Security Filters` rows and the `UI` role's `MJ: AI Agent Sessions` / `MJ: AI Agent Session Channels` permissions — which becomes a consolidated metadata-sync migration at release.

  **Realtime voice could not have worked on a device.** The React Native WebRTC drivers registered against `OpenAILiveClient` / `OpenAIRealtimeClient`, but `ClassFactory` matches on the registered base class's _name_ and the session runtime resolves against `BaseRealtimeClient` — so the RN drivers were filed in a bucket lookup never reads, the browser driver won, and `new RTCPeerConnection()` threw under Hermes. They now register against `BaseRealtimeClient` under the same provider keys the browser drivers use, `registerGlobals()` from `react-native-webrtc` runs at module load, and a unit test asserts on the resolved _class_ rather than merely that something resolves.

  Two related corrections: the RN drivers now override `createAudioSink()` rather than `attachRemoteAudio()` — the latter is where the base driver installs `pc.ontrack`, so overriding it silently removed the remote stream, its subscribers and the output audio meter — and `'xai'` is no longer advertised as supported. Grok Voice speaks the OpenAI protocol but over a websocket with a client-owned PCM plane, so it would have hit the `AudioContext` crash the provider filter exists to prevent.

  **Session lifecycle.** `RealtimeSessionRuntime` gains three fixes that apply to every host, Explorer included: a start abandoned mid-flight (the user leaves while the mint is in progress) now releases the microphone, the provider connection and the server-side session instead of leaking all three; concurrent teardowns coalesce onto one run instead of racing into two `Disconnect()` calls and two `CloseAgentSession` mutations; and a host that declines the resolved provider now unwinds through the shared teardown, so channel plugins are disposed rather than left published with live tool handlers. `IRealtimeMediaHost` gains an optional `ReleaseMicrophone()` — iOS is put into a record-and-play audio category for a call, and nothing was putting it back. `LastStartError` lets a host tell a denied microphone apart from a provider failure.

  **Agent runs reported failure as success.** `ConversationAgentRunner.processMessage` returns `null` only when no agent resolves; every other failure — a quota rejection, an agent that threw, a transport error — comes back as a well-formed result carrying `success: false`. The mobile send path tested only for `null`, so those turns reported success and left a permanently spinning bubble with no error anywhere in the UI.

  **Attachments were uploaded after the agent had already answered.** Photograph an invoice, ask for the totals, and the agent replied "I don't see an attachment" while the file appeared a second later. `SendMessage` now takes an `onUserMessageSaved` hook that runs in the window between the user's row existing and the run starting.

  **Hosted applications.** Nav items are parsed into a shape derived from the generated `MJApplicationEntity_IDefaultNavItem` rather than a hand-copy, which restores `RecordID` — the field identifying which record a non-`Custom` item opens. Generic resource types now resolve through the same registry as `Custom` ones, keyed by the type name, and this build ships a `Dashboards` surface backed by the same `DashboardView` the Explorer route mounts. Retired applications and deactivated nav items are filtered the way MJ Explorer filters them, and the launcher's ordering now matches `compareUserApplications`.

  **Storage seam corrections.** `MJStorageBlobStore` restores the compensating `DeleteObject` when the `MJ: Files` row fails to save (otherwise a successful upload with a failed row leaves permanently orphaned bytes) and configures `FileStorageEngine` before reading its accounts, so a cold process does not silently fall back to environment-only credentials. `ConversationAttachmentService.DeleteAttachment` now honours the store's return value instead of deleting the row regardless — the anti-orphan guarantee three doc comments promised. The browser store implements `GetDownloadUrl` through `CreateMediaAccessToken`, which is what makes Explorer's new storage-backed attachments readable rather than write-only, and `saveAttachments` accepts the agent whose `InlineStorageThresholdBytes` the decision should honour.

  **Security.** The `UI` role's new read/update permissions on agent sessions and session channels are scoped by two new RLS filters (`UI: Own Agent Sessions`, `UI: Own Agent Session Channels`), matching the pattern the Widget Guest rows already use. Unscoped, any signed-in user could read and modify another user's sessions.

  The sample application no longer sets `DefaultForNewUser` — a worked example should not install itself into every deployment's new users — and its screen now handles transport failures rather than showing "Loading…" forever on a dead network.

### Patch Changes

- 3977917: Extract the realtime co-agent session runtime out of Angular into `@memberjunction/realtime-runtime`, and register the GPT-Live client driver so it survives bundling.

  **Why.** `RealtimeSessionService` was 2,768 lines of client-direct realtime orchestration — mint, driver resolution, transcripts, tool relay, delegation narration, channel lifecycle, usage relay, teardown — living inside `@memberjunction/ng-conversations`. Its own header noted it stays component-free so it "must stay importable in plain-node tests", and the measurement bore that out: its entire Angular surface was `import { Injectable }` plus the decorator, and its entire DOM surface was one `navigator.mediaDevices.getUserMedia` call. But because it shipped in an Angular package, no other host could drive a realtime session without reimplementing it — and a second copy drifts from the first at the next protocol change, which GPT-Live just demonstrated is a frequent event.

  This follows the precedent set by `@memberjunction/conversations-runtime`, whose extraction plan explicitly noted realtime was landing in parallel and would need the same treatment.

  **What moved** into the new pure-TypeScript package: the session runtime (now `RealtimeSessionRuntime`), the channel plugin base class, the delegation-result parser, and the narration template builder.

  **The host seam.** `IRealtimeMediaHost` supplies the two genuinely platform-specific pieces: microphone acquisition (the Real-Time Co-Agents guide already specifies "the host acquires the mic — it owns the permission UX"; that seam simply had never been cut) and optional audio recording. Recording now returns base64 across the seam, so the runtime no longer touches `Blob` or `FileReader` — a browser reaches for `FileReader`, React Native reads a file, a test harness holds bytes in memory, and the orchestration layer should never have been asking.

  **`BaseRealtimeChannelClient`'s only Angular tie** was a type-only `Type<T>` import, used in one method the runtime never calls. It is now an opaque component-class reference that Angular's `Type<T>` satisfies unchanged, with the narrowing done at the single Angular call site that instantiates a component. This is what makes interactive channels authorable from a non-Angular host at all.

  **Bug fixed alongside:** `LoadOpenAILiveClient()` was exported but never called, while every sibling driver's Load function was. Since client drivers resolve dynamically through the ClassFactory, GPT-Live's driver could be tree-shaken out of a production bundle and fail to resolve at runtime while working in dev — the exact failure mode the Load-function convention exists to prevent.

  **No behaviour change for Explorer.** `RealtimeSessionService` keeps its name, injectable token and methods; it is now a thin subclass supplying the browser media host, and Explorer is untouched. `@memberjunction/ng-conversations` does, however, stop _exporting_ the types that moved — `public-api.ts` no longer re-exports `base-realtime-channel-client`, `delegation-result-parser` or `FormatToolName` — so a downstream consumer importing them from there must re-point at `@memberjunction/realtime-runtime`. No in-repo consumer does. The bump stays `patch` because MJ ties changeset level to database impact rather than semver breakage (see `.claude/rules/changesets.md`); the required import change is called out here instead. Verified by the package's existing suites: 108 test files / 1,324 tests green, including all 13 realtime-session suites.

  Types that moved (`RealtimeCaption`, `RealtimeConnectionState`, `RealtimeSessionRunOptions`, `BaseRealtimeChannelClient`, `ParseDelegationResultJson`, …) must now be imported from `@memberjunction/realtime-runtime`, since MJ does not re-export across package boundaries.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [5df9486]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [3977917]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-realtime-client@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
