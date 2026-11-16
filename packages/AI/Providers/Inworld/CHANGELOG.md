# @memberjunction/ai-inworld

## 6.3.0-edge.0

### Minor Changes

- 755b210: Realtime long-call reconnect fixes from the final review of #6462.
  - Security: a relay session (Vertex, HuggingFace) now persists only routing fields on its `MJ: AI Agent Sessions` row, so its owner, including a `Widget Guest`, can no longer read the system prompt, tools or initial context the relay keeps from the browser. A relay refresh that reaches an MJAPI instance without the in-memory snapshot is refused with a clear error instead of minting from the persisted copy. A direct session's persisted copy drops the duplicate provider config.
  - A credential refresh re-authorizes the agent the session was minted for, from server-written state, not from the editable `Config.targetAgentID`.
  - A failed planned move that goes back to the old connection now mints at most one credential per reconnect cycle, so a provider outage during the soft window no longer exhausts the per-session mint limit.
  - A loss of the old connection while the call waits on it, or while an attempt is in flight, goes to the running reconnect at once: input is held from that moment, Gemini no longer ends the call, and OpenAI-protocol drivers no longer go back to a dead transport.
  - The wait on the old connection follows a goAway, a shrinking connection limit and early timers; a host state handler that throws while the call goes back no longer wedges the cycle.
  - A credential that a refresh replaced after the attempt connected still gets its move before it expires (Gemini).
  - OpenAI Live reports `listening` again after a move; HuggingFace keeps the call when its old socket closes during a move; Gemini holds a reply owed to speech held during a failed attempt.
  - Server sessions (OpenAI family, OpenAI Live, ElevenLabs, AssemblyAI, Inworld) hold a tool result sent during a reconnect and deliver it once on the new connection. The server OpenAI session keeps user turns in order and no longer merges two utterances, keeps frames that arrive with `session.created` on a reconnect, and no longer leaves an unhandled rejection when it discards a connecting socket.
  - Overlapping `CloseSession` calls are shared on the normalized session ID, and the runtime skips its page-close beacon only after its own close succeeded.

- 28cec7d: Generic long-call reconnects, token refresh, and conversation continuity across all realtime voice/video providers (#6460):
  - **4-Layer ModelConfiguration & Timing Cascade (`@memberjunction/ai`, `@memberjunction/ai-engine-base`, `@memberjunction/ai-agents`):** Add `ConnectionMaxSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, and `TrustNativeResumption` to `RealtimeConfigurationSettings` (`IAIConfiguration.ts` and `modelConfiguration.ts`), propagate them through `REALTIME_SHARED_CONFIG_KEYS`, `ScrubRealtimeSharedConfigKeys`, `ExtractRealtimeTimingConfig`, `ResolveRealtimeTiming`, and `GetModelCatalogSessionSettings`, and seed realtime models (`Gemini 3.8 Live`, `Gemini 3.8 Live Extended Thinking`, `Gemini 3.1 Flash Live`, `Grok Voice` family, `GPT Realtime` family, `GPT-Live 1`, `ElevenLabs Agents`, `Eleven Realtime`) in `.ai-models.json`.
  - **Shared Conversation Memory & Reconnect Controller (`@memberjunction/ai`):** Promote `RealtimeConversationMemory`, `RenderRealtimeMemorySeed`, `RenderRealtimeMemorySeedAsContextNote`, `RenderLateToolResultNote`, `ResumePreamble`, and the unified I/O-free `RealtimeReconnectController` into `@memberjunction/ai` so every server and browser realtime driver shares bounded FIFO turn/tool memory (`MaxSeedChars = 24,000`), soft/hard connection-duration timers, credential refresh scheduling, per-attempt abort signals, native-to-seed fallback, and rapid-reconnect circuit-breaking (`reconnect-loop-breaker`).
  - **Server-Side Orchestration, Protected Session Snapshot & Relay Continuity (`@memberjunction/ai`, `@memberjunction/core-entities-server`, `@memberjunction/ai-agents`, `@memberjunction/server`):** Add `CallDurationSeconds`, `SessionMaxSeconds`, `ReconnectBufferSeconds`, `TrustsNativeResumption`, proactive timer orchestration, and `ReconnectSession` on `BaseRealtimeModel` / `BaseRealtimeSession`; persist `realtimeMintSnapshot` on `MJ: AI Agent Sessions.Config_` behind `RunWithTrustedSessionConfigWrites` (`PROTECTED_SESSION_CONFIG_KEYS`); add `RealtimeProxyRegistry.Instance.ExtendRelaySession` and timer rescheduling in `RealtimeRelayTunnel` so relayed calls survive past the 30-minute relay lease; seed `RealtimeSessionRunner`'s re-opened session from `RealtimeConversationMemory` (`InitialContext`); clear Gemini's uncompressed-video connection limit when the last bridged video source ends (`@memberjunction/ai-bridge-server`); add rate-limited `RefreshRealtimeClientSessionToken` in `RealtimeClientSessionResolver`.
  - **Browser Runtime, Client Drivers & Continuous Recording (`@memberjunction/ai-realtime-client`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`):** Add `ApplySessionConfigTiming`, proactive timer arming on `'listening'`, `ScheduleCredentialRefresh`, and `Reconnect(context)` across `BaseRealtimeClient` and all client/server drivers (`Gemini`, `Vertex`, `OpenAI`, `OpenAI Live`, `xAI`, `ElevenLabs`, `Eleven`, `AssemblyAI`, `Inworld`, `HuggingFace`); wire `SetTokenRefreshCallback` in `RealtimeSessionRuntime`; update `RealtimeAudioRecorder.AttachRemoteStream` so WebRTC reconnects rebind replacement remote audio streams into a single continuous recording file without gaps.

- b9fda3f: Preserve conversation continuity across long-call realtime reconnects and xAI transport drops.
  - Separate replaceable ambient state snapshots (`StateKey`, bounded by `MaxStateChars = 4,000`) and wire-only operational status notes (`Ephemeral: true`) from durable spoken turns and tool calls in `RealtimeConversationMemory`, and pin opening user/assistant turns (`MaxPinnedHeadChars = 2,400`) when middle conversation entries must be evicted on ultra-long calls.
  - Coalesce and delta-diff live `AppContext$` updates in `ClientContextChannel` via `DiffAppContextSnapshot` (sending compact deltas on the wire while storing only the single latest full screen snapshot under `StateKey: 'app-context'`), and tag interactive channel state snapshots (`BaseRealtimeChannelClient`), video-source transitions (`VideoSourceArbiter`), media-kit summaries (`MediaChannelServer`), and delegation/drop narration (`RealtimeDelegationNarrator`, `RealtimeSessionRunner`) with replaceable `StateKey` or `Ephemeral: true`.
  - Default xAI Grok Voice client, server, and model metadata (`Grok Voice`, `Grok Voice Think Fast 2.0`, `Grok Voice 3.0`) to `TrustNativeResumption: false` so every xAI reconnect replays full `RealtimeConversationMemory` instead of relying on lossy `?conversation_id=` resumption; make native-resumption lineage breaks sticky across the session in `RealtimeSessionResumption` and preserve native resumption handles across local offline outages (`IsNetworkOnline`).
  - Propagate `RealtimeContextNoteOptions` across all client and server realtime drivers, fixing AssemblyAI mid-reconnect context loss and multi-reconnect `system_prompt` duplication.

### Patch Changes

- 9c4f458: Realtime drivers apply the normalized `turnDetection` setting where their provider can express it and warn at launch for the settings they cannot: Inworld maps `Eagerness` (semantic VAD) and `Threshold` / `SilenceDurationMs` (server VAD); AssemblyAI maps `Threshold` onto `vad_threshold`; GPT-Live has no turn-detection field and warns for every requested setting.
- Updated dependencies [03bb8b6]
- Updated dependencies [31cc053]
- Updated dependencies [0693b9b]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [755b210]
- Updated dependencies [7eff627]
- Updated dependencies [b5df80e]
- Updated dependencies [28cec7d]
- Updated dependencies [b9fda3f]
- Updated dependencies [9c4f458]
- Updated dependencies [5c4fa7c]
- Updated dependencies [7ace3ee]
- Updated dependencies [07b7840]
- Updated dependencies [d87bb40]
- Updated dependencies [c889b72]
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/ai@6.3.0-edge.0

## 6.2.0

### Patch Changes

- 5a3de97: The server AssemblyAI, ElevenLabs, Inworld and OpenAI Realtime drivers, and the xAI and Hugging Face drivers built on OpenAI's session, drop a video frame passed to `SendInput` instead of sending its bytes to the model as audio. Each session logs a dropped kind and type once (`console.warn`), not once per frame. `RealtimeDroppedInputReporter` (Core) is the shared reporter.
- 6b0de38: Every realtime driver now declares static `DriverFacts` (such as `ProviderMaxSessionSeconds`), readable before a session exists. A minted `ClientRealtimeSessionConfig` carries `MaxSessionSeconds`, the effective session cap: the smaller of the driver's provider cap and the host's cap, positive integers only. `PrepareClientSession` passes it through unchanged. The MJAPI relay uses the same cap rule (one shared implementation), so a fractional or invalid cap counts as unset. ElevenLabs Agents sends its native max duration only when the host set a cap, and reports `MaxSessionSeconds` only then (without a host cap the agent keeps its own setting, 600 s on a new agent, which the driver does not know); Eleven Realtime reports the same clamped value it puts on the wire. Gemini client-direct sessions now reach their 30-minute cap: Gemini ends a Live connection after about 10 minutes and counts the browser's resume as a new session, so the minted token now opens one connection per 10 minutes of the session cap plus 3 for resumes, until the cap plus 60 s (at most 6 connections and 30 minutes); it was single-use with a 10-minute window, so the first resume was refused and the call ended at about 10 minutes. A shorter host cap gives a shorter-lived token, so the browser's credential never outlasts the session's deadline.
- 35ed7b5: `IRealtimeSession.SendInput` takes one `RealtimeInputFrame` (`Data`, `Kind`, and optional `MimeType` and `TimestampMs`) instead of `(chunk, kind?)`. A realtime driver outside this repo must change its `SendInput` signature, and a caller passes `{ Data: chunk, Kind: 'audio' }`. The bridge engine passes each inbound frame's type and capture time, and `BridgeMediaFrame` gains an optional `MimeType`. The server Gemini Live driver sends a JPEG or PNG video frame as video instead of as audio, sends audio in the PCM format the frame names, and drops a frame it cannot send, reporting each type once. The other drivers behave as before.
- Updated dependencies [0d81c53]
- Updated dependencies [1419ba7]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [a50948e]
- Updated dependencies [2552b1e]
- Updated dependencies [25bb295]
- Updated dependencies [432cb73]
- Updated dependencies [3080e83]
- Updated dependencies [4c6a28b]
- Updated dependencies [c93c0f8]
- Updated dependencies [293c316]
- Updated dependencies [b518dfa]
- Updated dependencies [ecf36eb]
- Updated dependencies [709de1a]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [15a4333]
- Updated dependencies [dfe40a4]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [5da3ad2]
- Updated dependencies [8f370b3]
- Updated dependencies [81aea34]
- Updated dependencies [e1dd673]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [c261eb8]
- Updated dependencies [59e32e0]
- Updated dependencies [ce1a5c3]
- Updated dependencies [4283a82]
- Updated dependencies [914e6ff]
- Updated dependencies [4889fb2]
- Updated dependencies [b87e4ac]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [2274f42]
- Updated dependencies [4c0eaec]
- Updated dependencies [1d43161]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [29b6ec3]
- Updated dependencies [1141164]
- Updated dependencies [230cdad]
- Updated dependencies [8bac4d6]
- Updated dependencies [575bfae]
- Updated dependencies [c018cb9]
- Updated dependencies [80905a1]
- Updated dependencies [4e4c82d]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [22c9074]
- Updated dependencies [6b0de38]
- Updated dependencies [aee2d53]
- Updated dependencies [279b93e]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [4ef13d6]
- Updated dependencies [72dd65c]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [afe9eb4]
- Updated dependencies [4d647e6]
- Updated dependencies [bea2386]
- Updated dependencies [17a4137]
- Updated dependencies [36a3f9e]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [e962151]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
- Updated dependencies [b0b2cc9]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0
  - @memberjunction/global@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [59e32e0]
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/ai@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- 6b0de38: Every realtime driver now declares static `DriverFacts` (such as `ProviderMaxSessionSeconds`), readable before a session exists. A minted `ClientRealtimeSessionConfig` carries `MaxSessionSeconds`, the effective session cap: the smaller of the driver's provider cap and the host's cap, positive integers only. `PrepareClientSession` passes it through unchanged. The MJAPI relay uses the same cap rule (one shared implementation), so a fractional or invalid cap counts as unset. ElevenLabs Agents sends its native max duration only when the host set a cap, and reports `MaxSessionSeconds` only then (without a host cap the agent keeps its own setting, 600 s on a new agent, which the driver does not know); Eleven Realtime reports the same clamped value it puts on the wire. Gemini client-direct sessions now reach their 30-minute cap: Gemini ends a Live connection after about 10 minutes and counts the browser's resume as a new session, so the minted token now opens one connection per 10 minutes of the session cap plus 3 for resumes, until the cap plus 60 s (at most 6 connections and 30 minutes); it was single-use with a 10-minute window, so the first resume was refused and the call ended at about 10 minutes. A shorter host cap gives a shorter-lived token, so the browser's credential never outlasts the session's deadline.
- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [8f370b3]
- Updated dependencies [4283a82]
- Updated dependencies [4c0eaec]
- Updated dependencies [c018cb9]
- Updated dependencies [6b0de38]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/ai@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [4c6a28b]
- Updated dependencies [709de1a]
- Updated dependencies [914e6ff]
- Updated dependencies [1141164]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [3080e83]
- Updated dependencies [81aea34]
- Updated dependencies [2274f42]
- Updated dependencies [230cdad]
- Updated dependencies [4e4c82d]
- Updated dependencies [72dd65c]
- Updated dependencies [17a4137]
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- 5a3de97: The server AssemblyAI, ElevenLabs, Inworld and OpenAI Realtime drivers, and the xAI and Hugging Face drivers built on OpenAI's session, drop a video frame passed to `SendInput` instead of sending its bytes to the model as audio. Each session logs a dropped kind and type once (`console.warn`), not once per frame. `RealtimeDroppedInputReporter` (Core) is the shared reporter.
- 35ed7b5: `IRealtimeSession.SendInput` takes one `RealtimeInputFrame` (`Data`, `Kind`, and optional `MimeType` and `TimestampMs`) instead of `(chunk, kind?)`. A realtime driver outside this repo must change its `SendInput` signature, and a caller passes `{ Data: chunk, Kind: 'audio' }`. The bridge engine passes each inbound frame's type and capture time, and `BridgeMediaFrame` gains an optional `MimeType`. The server Gemini Live driver sends a JPEG or PNG video frame as video instead of as audio, sends audio in the PCM format the frame names, and drops a frame it cannot send, reporting each type once. The other drivers behave as before.
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [8bac4d6]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [22c9074]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [afe9eb4]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [bea2386]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [ce1a5c3]
- Updated dependencies [4d647e6]
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [15a4333]
- Updated dependencies [5da3ad2]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [1d43161]
- Updated dependencies [80905a1]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [b87e4ac]
- Updated dependencies [575bfae]
- Updated dependencies [e962151]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 5ecfdb4: Realtime voice agents can now **speak first**.

  Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).
  - **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
  - **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
  - **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.
  - **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto _whichever_ driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

  Drivers without a provider-native opening utterance ignore the key and open silently, as before.

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [5ecfdb4]
- Updated dependencies [a5f92d2]
- Updated dependencies [ada8784]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [080f4cd]
- Updated dependencies [be0bdb2]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [23c2521]
- Updated dependencies [97cbf5f]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [1bd9674]
- Updated dependencies [7fcdc2d]
  - @memberjunction/global@6.1.0
  - @memberjunction/ai@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [61b5612]
- Updated dependencies [076fa5d]
- Updated dependencies [7fcdc2d]
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [2c826f7]
- Updated dependencies [197fdf8]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [ada8784]
- Updated dependencies [23c2521]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5

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

### Minor Changes

- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [15b743b]
- Updated dependencies [1568bae]
  - @memberjunction/ai@5.41.0
  - @memberjunction/global@5.41.0
