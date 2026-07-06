# Grok Voice Layering — Adoption Plan

**Status:** PLANNED (no code changes yet — this document is the deliverable of the study phase)
**Branch:** `claude/architrave-voice-layering-84p1kx`
**Companion docs:** [`guides/REALTIME_CO_AGENTS_GUIDE.md`](../../guides/REALTIME_CO_AGENTS_GUIDE.md), [`guides/REALTIME_BRIDGES_GUIDE.md`](../../guides/REALTIME_BRIDGES_GUIDE.md), [`plans/realtime/realtime-bridges-architecture.md`](realtime-bridges-architecture.md)

---

## 1. Executive summary

xAI's Grok Voice offering (the [x.ai/voice](https://x.ai/voice) Voice Agent Builder page + the [Voice Agent API docs](https://docs.x.ai/developers/model-capabilities/audio/voice-agent)) is built on a **layered architecture** that separates concerns MJ's realtime stack also separates — in most cases more richly than xAI does. We already have the fifth realtime driver (`GrokRealtime`, `packages/AI/Providers/xAI/src/models/xaiRealtime.ts`) speaking the OpenAI-Realtime-compatible protocol against `wss://api.x.ai/v1/realtime`.

The study found that **the concepts are already incorporated but the Grok-specific wiring is incomplete**: the voice layer (xAI's 80+ voices + cloned custom `voice_id`s) cannot reach the Grok driver through our effective-config cascade today, for three independent, individually small reasons. Beyond the wiring, xAI's stack surfaces four ideas worth adopting as first-class cascade layers or roadmap tracks: **provider-native server-side tools** (web_search / x_search / file_search / hosted MCP), **declarative conversational guardrails**, **provider-terminated SIP telephony**, and **call-audio "listen back"**.

This plan defines seven workstreams, ordered by value-for-effort. WS1 (voice wiring) and WS3 (guardrails) are small and high-leverage; WS2 (native tools) is medium with real security design; WS4–WS7 are conventions, roadmap notes, and housekeeping.

| WS | Title | Size | Risk | Depends on |
|---|---|---|---|---|
| WS1 | Wire the voice layer to the Grok driver (3 fixes) | S | Low | — |
| WS2 | Provider-native tool pass-through | M | Medium (security design) | WS1 (shares config plumbing) |
| WS3 | Declarative conversational guardrails cascade layer | S | Low | — |
| WS4 | Call-playbook prompt conventions | XS (docs/metadata) | None | — |
| WS5 | Grok-terminated SIP telephony (bridges roadmap note) | XS (docs) → M (later) | — | — |
| WS6 | Call-audio listen-back | L (separate track) | High (privacy/retention) | — |
| WS7 | Docs + metadata housekeeping (guide matrix, PowerRank, STT default) | XS | None | WS1 |

---

## 2. Background: what xAI's layering actually is

Two distinct layering ideas, verified from the printed x.ai/voice page and the API docs:

### 2.1 The persona layers — voice ⊥ personality

Grok deliberately separates *how the agent sounds* from *how it behaves*:

- **Voice persona (sound)** — a `voice` field in the realtime session config: 80+ built-in voices (Ara, Eve, Leo, Rex, Sal, Gork, …) in 25+ languages, **plus cloned custom voices** (`POST https://api.x.ai/v1/custom-voices`, reference clip ≤ 120 s, two-stage speaker verification, returns a `voice_id` usable in both TTS and Voice Agent APIs at no price premium).
- **Personality / behavior** — the `instructions` (system prompt) layer: consumer Grok ships named personality modes (Storyteller, Meditation, Argumentative, …); the Builder ships a markdown "playbook" convention with staged sections (`## GREETING` → `## RESOLVE` → `## WRAP UP`).

Any voice composes with any personality. **MJ already encodes exactly this split** in `RealtimeVoiceConfig` (`packages/AI/Agents/src/realtime/realtime-coagent-config.ts`): `voice.default` (tone / speakingStyle → the prompt-side "Voice & manner" section via `BuildVoiceMannerSection`) is the behavior layer; `voice.providers.<provider>` (opaque per-driver bag carrying the provider-native voice id) is the sound layer.

### 2.2 The product-stack layers (Voice Agent Builder)

One unified speech-to-speech model (`grok-voice-think-fast-1.0` / `grok-voice-latest` — no STT→LLM→TTS stitching; in-house VAD, tokenizer, audio models; sub-second; $0.05/min flat, voices included; #1 on τ-voice Bench above Gemini 3.1 Flash Live and GPT Realtime 1.5) with capability layers stacked on top:

| xAI layer | Mechanism | MJ equivalent today |
|---|---|---|
| Playbook | Markdown staged instructions | Co-agent + target prompts; no staged-call convention |
| Knowledge base | `file_search` / collections server-side tool | Knowledge Hub reachable only via target-agent delegation |
| Tools + MCP | `web_search`, `x_search`, `file_search`, **hosted remote MCP**, custom function tools — provider-executed | Actions/MCP via `RealtimeToolBroker`; function tools only on the socket |
| Guardrails | Declarative per-agent rules ("No PII") | Authorizations gate session *control*; no conversational-guardrail layer |
| Voices | `voice` session field; 80+ voices + cloning | `voice.providers.<provider>` bag — **not wired to Grok** (§3) |
| Telephony | Provider-side SIP; DTMF buffered → text input; +$0.01/min provisioned number | `RealtimeBridge` seam (we carry media; Twilio/Vonage planned) |
| Live preview | Browser session | Explorer voice overlay (shipped) |
| Listen back | Full-call audio playback, per-tool-call segmented | Text transcripts only (`Conversation Details` + session observability) |
| Templates | Builder wizard presets | Seeded agent metadata + pairing rows |

### 2.3 Positioning vs ElevenLabs Agents (why this matters architecturally)

Feature-for-feature, Grok Voice Agents is the ElevenLabs Agents playbook. The difference underneath is load-bearing **for our driver architecture**:

- **ElevenLabs** = orchestrated cascade (STT → your-choice LLM → TTS) around a **pre-provisioned server-side agent object** → our driver carries `ensureAgent()` lifecycle machinery, cannot re-declare tools mid-session, finals-only transcripts, the barge-in correction quirk.
- **Grok** = one unified speech-to-speech model with **pure per-session config** — no server-side object, mutable `session.update`, ephemeral client secrets, delta transcripts, per-response usage.

In our four-provider capability-matrix terms, Grok sits in the *OpenAI column's shape* while offering the *ElevenLabs platform features*. Practically: every platform layer (voices, cloning, native tools, SIP) is reachable through plain session config — exactly what our effective-config cascade and the opaque per-driver `Config` bag were designed to carry. No managed-object code needed.

---

## 3. Current state — verified in code

Facts below were read directly from source on this branch (commit `3b90f98c4`).

### 3.1 What already works

- **Server driver** `xAIRealtime` (`@RegisterClass(BaseRealtimeModel, 'GrokRealtime')`, `packages/AI/Providers/xAI/src/models/xaiRealtime.ts`): reuses the `openai` SDK's realtime WebSocket with `baseURL = https://api.x.ai/v1`; server-bridged sessions send explicit `server_vad` + `create_response` + `interrupt_response` and opt into user input transcription (`whisper-1`); `SupportsClientDirect = true` with client-secret minting via the OpenAI-compatible `/v1/realtime/client_secrets`.
- **Client driver** `xaiRealtimeClient` (`packages/AI/RealtimeClient/src/drivers/xaiRealtimeClient.ts`, ClassFactory key `'xai'`): model-on-URL endpoint, subprotocol auth, fixed 24 kHz PCM16, and — critically for WS1 — **applies the server-authored `config.SessionConfig` verbatim via `session.update` as the first frame** after socket open (obligation #7/#8).
- **The voice cascade machinery** is fully general: `ResolveEffectiveRealtimeConfig` merges type-default → co-agent → target → app → runtime-override; `buildSessionConfigBag` (`realtime-client-session-service.ts:1681`) merges the matched `voice.providers.<provider>` settings UNDER the caller's runtime `Config` bag and passes it as `RealtimeSessionParams.Config`; `BuildVoiceMannerSection` renders the persona into the companion system prompt (`buildCompanionSystemPrompt`, `realtime-client-session-service.ts:1734`).

### 3.2 The three wiring gaps (why Grok voices are unreachable today)

**Gap A — the server driver drops the `Config` bag at mint (client-direct).**
`xAIRealtime.CreateClientSession` builds the minted session from `model` / `instructions` / `tools` / `audio.input` only. `params.Config` is never folded in, and no `voice` field is ever set. Since the client driver applies `SessionConfig` verbatim, folding the bag into the mint is sufficient to deliver voice client-direct — the plumbing on both sides already exists. (The OpenAI driver has the same known TODO; the server-bridged path does *not* have this gap — `sendSessionUpdate` spreads `...config` after the defaults.)

**Gap B — the provider-key skew breaks `GetProviderVoiceSettings` matching.**
`GetProviderVoiceSettings` (`realtime-coagent-config.ts:781`) matches `voice.providers` keys against a single identifier by normalized prefix (`driverClass.startsWith(key)`). Every earlier pair aligns (`OpenAIRealtime`↔`openai`, `GeminiRealtime`↔`gemini`, `ElevenLabsRealtime`↔`elevenlabs`, `AssemblyAIRealtime`↔`assemblyai`). Grok is the first skewed pair: **DriverClass `GrokRealtime` vs client Provider key `'xai'`**. Server-side call sites pass the DriverClass (so only a `grok` key matches); the natural/canonical config key is `xai` (matching the Provider string and xAI's brand). Neither key satisfies both sides; config authors would have to duplicate the block.

**Gap C — the runtime voice picker hardcodes `providers.openai`.**
Both copies of the override-envelope builder pin a user's voice pick under the `openai` key: `BuildRealtimeOverridesJson` (`packages/AI/Agents/src/realtime/realtime-coagent-config.ts:860`, used by server-bridged hosts) and `BuildRealtimeConfigOverridesJson` (`packages/Angular/Generic/conversations/src/lib/services/realtime-pairing.ts:227`, used by the native picker in `message-input.component.ts:552`). Each carries the comment "add providers here when others ship realtime voices" — Grok has now shipped exactly that. A Grok voice picked at runtime would land under the wrong key and be silently ignored.

**Adjacent observation:** the resolver surfaces `EffectiveConfigJson` on `StartRealtimeClientSessionResult` (`RealtimeClientSessionResolver.ts:1592`) precisely so client drivers *could* apply provider voice settings browser-side — but nothing in the browser consumes it yet. Fixing Gap A server-side (fold-at-mint) is the better path for OpenAI-compatible providers because the client secret then *bakes in* the voice (tamper-proof), and `EffectiveConfigJson` remains available for providers whose mint API can't carry it.

### 3.3 Other confirmed deltas

- `guides/REALTIME_CO_AGENTS_GUIDE.md`'s four-provider capability matrix **predates the Grok driver** — `grok`/`xai` appears nowhere in the guide.
- The driver's input-transcription default mirrors OpenAI's `whisper-1` name; xAI now ships `grok-stt`. The value is already overridable via the `Config` bag, so this is a verify-and-maybe-flip-default, not a design change.
- Only function tools (`type: 'function'`) are ever emitted by `mapRealtimeTools` — xAI's provider-executed tools (`web_search`, `x_search`, `file_search`, remote MCP) are unreachable (WS2).

---

## 4. WS1 — Wire the voice layer to the Grok driver

**Goal:** a voice configured at ANY cascade layer (`voice.providers.xai: { voice: "eve" }` — or a cloned `voice_id`) reaches the Grok model on both topologies, and the native picker can select Grok voices.

### 4.1 Fix A — fold the `Config` bag into the client-direct mint

In `xAIRealtime.CreateClientSession`:

1. Build the session defaults exactly as today (`type`, `model`, `instructions`, `tools`, `audio.input` transcription + turn detection).
2. Deep-merge `params.Config` over the defaults (same "config bag wins per key" semantics `sendSessionUpdate` already implements with its spread) before minting the client secret.
3. The merged session is what gets minted AND echoed as `SessionConfig` — the browser driver's verbatim `session.update` then carries the voice, and the client secret bakes it in (tamper-proof, mirroring the OpenAI mint-lock property documented in the guide §3).

**Field-placement note (verify against the live API before implementing):** xAI's docs examples show `voice` as a session-level field in `session.update`; the OpenAI GA `RealtimeSessionCreateRequest` type places it at `audio.output.voice`. The driver should accept the pact key `voice` in the bag and place it wherever the live xAI API actually honors it (likely both are accepted given the compat posture — test with a real key). Whichever placement wins, the rest of the bag continues to spread verbatim (it is an opaque pact; the driver must not filter it).

**Do the same for the OpenAI driver** (its `CreateClientSession` has the identical documented TODO). Same shape, same test pattern; closes the "client-direct reach" caveat in the guide §4.

### 4.2 Fix B — teach the matcher both identities

Change `GetProviderVoiceSettings(config, driverClassOrProvider)` to accept `string | string[]` (candidate identifiers). Matching runs the existing normalized-prefix rule against **every candidate**; longest matching key across all candidates wins. Then:

- `buildSessionConfigBag` passes `[driverClass, providerKey]`. The provider key is knowable server-side: add a virtual `get ProviderKey(): string` to `BaseRealtimeModel` (default: derived from DriverClass by stripping the `Realtime` suffix and lowercasing — correct for all four existing drivers) overridden by `xAIRealtime` to return `'xai'`. This also removes the implicit duplication where each driver hand-stamps its `Provider` string in `CreateClientSession` — that method can return `this.ProviderKey`.
- Result: `providers.xai` (canonical), `providers.grok`, and `providers.grokrealtime` all match the Grok driver; existing keys keep matching byte-for-byte (pure widening, no behavior change for aligned pairs).
- Update the canonical `ConfigSchema` example in the `realtime-coagent-config.ts` header comment and the Realtime agent type's seeded `ConfigSchema` to show the `xai` key.

### 4.3 Fix C — provider-aware override builders + picker voices

1. Add an optional `provider` parameter (default `'openai'` — byte-for-byte back-compat) to **both** `BuildRealtimeOverridesJson` (server) and `BuildRealtimeConfigOverridesJson` (ng-conversations). The envelope becomes `{"realtime":{"voice":{"providers":{"<provider>":{"voice":"<v>"}}}}}`.
2. The native picker resolves the provider key from the selected realtime model's vendor `DriverClass` (available in the browser's cached model metadata; normalize with the same rule as §4.2 so the picker and the matcher can never disagree).
3. Voice options per provider: extend the picker's voice list source so Grok models offer the documented named voices (`ara`, `eve`, `leo`, `rex`, `sal`, `gork`) **plus a free-text entry for custom/cloned `voice_id`s** (xAI returns opaque ids like `nlbqfwie`; we cannot enumerate a tenant's cloned voices without a management API call, so free-text is the honest v1). Voice lists should be data, not code, where possible — a `voices` array on the vendor/model metadata row is the natural home; hardcode as a fallback constant only if metadata plumbing is out of scope for the first cut.

### 4.4 Tests (WS1)

- `packages/AI/Providers/xAI/src/__tests__/xaiRealtime.test.ts`: `CreateClientSession` folds `Config` (voice reaches minted session + echoed `SessionConfig`); bag keys win over defaults; absent bag ⇒ byte-for-byte current mint.
- `realtime-coagent-config` unit tests: multi-candidate matching (xai / grok / grokrealtime), longest-key-wins across candidates, existing single-string call sites unchanged.
- `realtime-pairing.test.ts` + server twin: provider-parameterized envelopes; default stays `openai`.
- `RealtimeClientSessionResolver.test.ts`: end-to-end — config with `providers.xai` + resolved Grok vendor ⇒ voice lands in `RealtimeSessionParams.Config`.
- The convergence drift test (`__tests__/realtime-convergence-drift.test.ts`) must stay green — prep remains the single producer.

---

## 5. WS2 — Provider-native tool pass-through

**Goal:** let a deployment give a voiced agent xAI's provider-executed tools — `web_search`, `x_search`, `file_search` (collections), **hosted remote MCP** — via metadata, with zero client code.

### 5.1 Design

- Extend `RealtimeCoAgentConfig` with `realtime.tools.native?: JSONObjectLike[]` — an array of provider-native tool entries passed **verbatim** (opaque, like the voice bags). Normalized tolerantly in `ParseRealtimeTypeConfiguration` (non-arrays contribute nothing).
- At session build (both topologies — the one shared prep), matched native entries are appended to `session.tools` **after** the mapped function tools. Drivers opt in: xAI first; OpenAI's realtime surface has comparable native tools and can follow. Drivers that don't understand an entry drop it with a log (never fatal).
- Keying mirrors the voice bags: `realtime.tools.providers.<provider>.native: [...]` so a config can carry different native tool sets for different resolved providers. (Decide final shape at implementation; the flat `tools.native` variant is simpler if we accept that native entries are inherently provider-specific and mismatched entries are dropped.)

### 5.2 Security & observability constraints (hard requirements)

1. **Metadata-only by default.** Native tools execute provider-side, bypassing `RealtimeToolBroker`, our tool observability, and `CanRun`-style gates. They must be configurable at the type / co-agent / target / app layers only. If accepted via runtime override at all, gate behind the existing `Realtime: Advanced Session Controls` authorization (fail-closed).
2. **No secrets in metadata.** Remote-MCP entries carry server URLs and auth. Values must support env-resolution placeholders (or reference the vendor credential path) — never literal tokens in `TypeConfiguration` / seeded metadata.
3. **Prompt disclosure.** When native tools are attached, append a one-line system-prompt note (like "Voice & manner") so the model knows those capabilities exist — provider-native tools are otherwise invisible to our prompt assembly.
4. **Transcript fidelity.** Verify what events xAI emits for native-tool execution (whether they surface as conversation items) and ensure the transcript relay doesn't misclassify them; document findings in the guide's capability matrix.

### 5.3 Tests

Unit: normalization, cascade merge, driver append-verbatim, unknown-entry drop. Integration (deterministic tier): config-shape round-trip through prep; live-model tier (gated `RUN_AGENT_TESTS=1`): a real `web_search` call on a Grok session.

---

## 6. WS3 — Declarative conversational guardrails cascade layer

**Goal:** first-class, per-layer behavioral rules ("Never read back stored payment details", "No medical advice") that ride the effective-config cascade and render into the companion system prompt — provider-agnostic, so one rule set covers OpenAI, Gemini, ElevenLabs, AssemblyAI, and Grok.

### 6.1 Design

- `realtime.guardrails?: string[]` on `RealtimeCoAgentConfig`; normalized tolerantly (strings only, trimmed, de-duplicated, per-rule length cap ~500 chars, total cap ~4,000 chars — logged truncation, never a failed start).
- **Merge semantics: UNION-ACCUMULATE across layers, not replace.** This is the deliberate exception (precedent: `allowedAgents`): a type-level or app-level guardrail must not be strippable by a higher layer (especially not by a runtime override). De-dup on normalized text.
- Rendered by a new `BuildGuardrailsSection(config)` (sibling of `BuildVoiceMannerSection`) as a `Hard rules:` block appended in `buildCompanionSystemPrompt` right after "Voice & manner" — automatically identical on both topologies because prep is the single producer.
- **Honest framing:** these are prompt-level guardrails (steering, not enforcement). Document clearly that hard enforcement of data-egress rules belongs in tool design / RLS / permissions — the guardrail layer is defense-in-depth and UX, the same posture xAI's "No PII" guardrail actually has.

### 6.2 Tests

Normalization + union-across-layers (runtime override cannot remove a lower-layer rule) + rendering + caps; resolver test proving the section appears in the built prompt; convergence drift test extended to cover the new section (both hosts identical).

---

## 7. WS4 — Call-playbook prompt conventions (docs + metadata only)

xAI's Builder formalizes staged call structure (`## GREETING` → `## RESOLVE` → `## WRAP UP`). For MJ this is a **convention, not a schema change**:

- Add a "Call playbooks" section to `guides/REALTIME_CO_AGENTS_GUIDE.md`: recommend staged-markdown structure for voiced **target** agents' prompts (the target-identity layer), with a worked example.
- Optionally seed one example playbook prompt template under `metadata/prompts/` (e.g. a support-call skeleton) referenced from the guide.
- Explicitly NOT: a new config key, a new entity, or Flow-agent coupling. If staged-call *enforcement* is ever wanted, that's a Flow-agent-fronted-by-co-agent design discussion, out of scope here.

---

## 8. WS5 — Grok-terminated SIP telephony (bridges roadmap note)

xAI terminates PSTN/PBX calls **provider-side** (SIP directly into the realtime session; DTMF arrives as buffered text; +$0.01/min provisioned number). That is a different topology from our `RealtimeBridge` seam, where MJ carries the media (Zoom/LiveKit shipped; Twilio/Vonage planned):

- For Grok-backed sessions, a "telephony bridge" could be a **thin SIP-configuration driver** — no media plane in MJ at all. Massive effort reduction vs a Twilio media bridge, at the cost of provider lock-in for that path and reduced media-plane control (no MJ-side recording, which interacts with WS6).
- **Action now:** add this as an explicit option to [`plans/realtime/realtime-bridges-architecture.md`](realtime-bridges-architecture.md) with the open design questions: session lifecycle ownership (who creates the `AIAgentSession` when a call arrives at xAI?), inbound-call → MJ webhook/notification path, observability parity, and how `CloseReason` semantics map to call termination.
- No implementation in this plan's scope.

---

## 9. WS6 — Call-audio "listen back" (separate planned track)

The only xAI layer with no MJ counterpart at any fidelity: we persist text transcripts, xAI persists **replayable call audio, segmented per tool call**.

Sketch (to be expanded into its own plan before any build):

- **Capture seam:** both PCM directions already transit our code — client-direct in the shared browser audio plane (`packages/AI/RealtimeClient/src/audio/`), server-bridged in `IRealtimeSession.SendInput` / `OnOutput`. A recording tap at those seams covers all five drivers except OpenAI-WebRTC client-direct (media never leaves the RTCPeerConnection — needs a `MediaRecorder`/insertable-streams tap; feasibility check required).
- **Storage:** chunked upload to MJ artifact storage, linked to the `AIAgentSession` (and per-turn offsets aligned to transcript rows for the segmented-playback UX).
- **Governance first:** recording consent, retention windows, per-deployment enable flag (default OFF), and access control (who may replay) — align with [`plans/realtime/livekit-recording-governance.md`](livekit-recording-governance.md), which already covers adjacent ground for LiveKit.
- **Playback UX:** sessions dashboard row → audio player with transcript-synced seek.

Deliverable inside this plan: none beyond this sketch. Next step when prioritized: a dedicated `plans/realtime/call-audio-listen-back.md`.

---

## 10. WS7 — Docs + metadata housekeeping

1. **Guide matrix fifth column.** Add Grok (`'xai'` / `GrokRealtime`) to the capability matrix in `guides/REALTIME_CO_AGENTS_GUIDE.md` §2: WebSocket client transport; client-secret mint (full config baked in, OpenAI-shaped); deltas + finals both roles; emulated `SendContextNote` (system-item injection); native-ish `RequestSpokenUpdate` (`response.create` + instructions, skip-on-collision); wire-level cancel; idempotent `RegisterTools` via `session.update`; per-response usage from `response.done.usage`; no server-side managed object; fixed 24 kHz PCM16.
2. **`PowerRank` review.** Grok Voice Think Fast 1.0 tops τ-voice Bench above the two models we seed (`Gemini 3.1 Flash Live`, `GPT Realtime 2`). Once WS1 lands (voice parity), revisit the Grok model row's `PowerRank` in `metadata/ai-models/` so default resolution reflects capability. Deployment-visible change — flag in release notes.
3. **Input-transcription default.** Verify whether xAI's realtime `audio.input.transcription.model` accepts/prefers `grok-stt` over the mirrored `whisper-1`; flip the driver constant if confirmed (already overridable via the `Config` bag either way).
4. **README updates** for `packages/AI/Providers/xAI` and `packages/AI/RealtimeClient` reflecting new voice/native-tool config reach.

---

## 11. Sequencing, effort, and rollout

```
WS1 (voice wiring)  ──►  WS7 (matrix/PowerRank/docs)
WS3 (guardrails)    ──►  guide section
WS2 (native tools)  — after WS1 (shares bag/prep plumbing + provider-key work)
WS4 (playbooks)     — anytime, docs-only
WS5 (SIP note)      — anytime, docs-only
WS6 (listen-back)   — own plan first; not started here
```

- **PR 1:** WS1 + WS7(1)(4) — driver fold-at-mint (xAI + OpenAI), matcher multi-candidate + `ProviderKey`, provider-aware override builders + picker voices, guide matrix column, READMEs. All unit suites + `npm run test:integration` deterministic tier.
- **PR 2:** WS3 — guardrails layer + guide section.
- **PR 3:** WS2 — native tools (needs the security review checklist in §5.2 signed off first).
- **PR 4+:** WS4/WS5 docs; WS7(2)(3) metadata after live verification; WS6 plan doc.

### Compatibility guarantees

- Every change is additive; absent config keys reproduce today's behavior byte-for-byte (existing tests pin this).
- The matcher change is a pure widening (aligned provider pairs unaffected).
- Override-builder `provider` parameter defaults to `'openai'`.
- No migrations required for WS1/WS3/WS4; WS2 requires only the Realtime agent type's seeded `ConfigSchema` update (metadata push, not SQL).

---

## 12. Open questions

1. **Exact `voice` field placement** on xAI's session object (top-level vs `audio.output.voice`) — resolve with a live-key test before WS1 merges (integration live tier, `RUN_AGENT_TESTS=1`).
2. **Voice list as metadata vs constant** (§4.3.3) — preference: metadata on the vendor/model row; confirm the picker's data path supports it without a resolver change.
3. **WS2 config shape** — flat `tools.native` vs provider-keyed `tools.providers.<p>.native` (§5.1).
4. **Custom-voice management** — do we want an MJ surface for creating/listing cloned voices (`POST /v1/custom-voices`), or is "paste your voice_id" sufficient indefinitely? (Leaning: out of scope until a deployment asks.)
5. **WebRTC recording feasibility** for WS6's OpenAI client-direct path.

---

## 13. Sources

- [x.ai/voice — Voice Agent Builder page](https://x.ai/voice) (read in full from user-provided print-to-PDF, 2026-07-06)
- [Voice Agent API docs](https://docs.x.ai/developers/model-capabilities/audio/voice-agent) · [Voice Overview](https://docs.x.ai/developers/model-capabilities/audio/voice) · [SIP Phone Calls](https://docs.x.ai/developers/model-capabilities/audio/voice-agent/sip) · [Custom Voices](https://docs.x.ai/developers/model-capabilities/audio/custom-voices)
- [Grok Voice Agent API announcement](https://x.ai/news/grok-voice-agent-api) · [Voice Agent Builder announcement](https://x.ai/news/grok-voice-agent-builder) · [Custom Voices announcement](https://x.ai/news/grok-custom-voices)
- [liteLLM xAI realtime](https://docs.litellm.ai/docs/providers/xai_realtime) · [LiveKit xAI plugin](https://docs.livekit.io/agents/models/realtime/plugins/xai/) · [xai-cookbook telephony examples](https://github.com/xai-org/xai-cookbook/tree/main/voice-examples/agent/telephony)

*(Note: `x.ai` and `docs.x.ai` are blocked by this workspace's network policy; page content was verified via the printed PDF and search extraction.)*
