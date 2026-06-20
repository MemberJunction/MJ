# Realtime Session Lifecycle & Follow-Ups

**Status:** Plan (2026-06-20). Tracks the work remaining after the Phase 1/2 convergence + multi-agent turn-taking MVP. Companion to [`realtime-core-host-convergence.md`](realtime-core-host-convergence.md) and [`multi-agent-meeting-turn-taking.md`](multi-agent-meeting-turn-taking.md).

---

## Shipped just before this plan (the "quick bits")

- **Co-agent observability lands on every surface.** Hardened `createCoAgentRun` (only stamp a non-empty `AgentSessionID`) + threaded the real session id coordinator → factory → prep. Verified live: bridge sessions now create `Realtime Co-Agent` runs with the Demo Loop / Sage delegations nested under them.
- **Correct agent detection in the LiveKit driver.** `IsAgent` was `p.IsLocal` only — so *other* agents in a room read as humans. Now also recognizes the coordinator's `agent-<id>` identity convention. Fixes turn-taking's agent-exclusion **and** the occupancy check below.
- **Auto-leave an emptied room.** `AIBridgeEngine.evaluateRoomOccupancy`: once a human has been seen and the roster drops to agents-only, a 15s grace timer (cancelled on re-join, so a refresh is safe) stops the session via the normal path — which closes the realtime session and **finalizes the co-agent run**. This is the dominant teardown case (user closes the tab) that previously left a `Connected` bridge + `Running` run forever.

---

## 1. Finalize the co-agent run on ALL teardown paths — ✅ SHIPPED (2026-06-20)

The auto-leave + explicit-stop paths finalize the co-agent run via the finalize-wrapped `session.Close()`. Two paths previously marked the bridge `Disconnected` **without** finalizing the run — `ReconcileOrphans` (cross-boot janitor) and the cross-host `markBridgeDisconnected` reap — leaving the co-agent `AIAgentRun` dangling in `Running` forever (the session object is gone, so there's nothing to `Close()`).

**Done via a registered finalizer (logic stays in the core):**
- `AIBridgeEngine.SetSessionRunFinalizer(fn)` + a `BridgeSessionRunFinalizer` type; the engine calls it from `markBridgeDisconnected` — the single funnel **every** teardown path passes through — scoped to the row's `AgentSessionID`.
- The impl, `RealtimeClientSessionService.FinalizeCoAgentRunsBySession`, finds the session's TOP-LEVEL co-agent run (`Status='Running' AND ParentRunID IS NULL`) and finalizes it + its prompt run + step via the existing idempotent `FinalizeCoAgentRun`. `MJ: AI Agent Runs` is transactional (no engine caches it), so a narrow ids-only `RunView` is correct — only reached on the orphan path; the same-process teardown uses in-memory ids (no query).
- Bound at startup in `RealtimeBridgeResolver` (`FinalizeBridgeCoAgentRuns`, next to the session-factory binding). **Idempotent**: a clean same-process teardown already marked the run `Completed`, so the finalizer finds nothing.

## 2. TTL / heartbeat reaper — ✅ SHIPPED (2026-06-20)

`AIBridgeEngine.SweepStaleSessions(now?)` reaps live, same-process sessions that are **idle** past `SESSION_IDLE_TTL_MS` (10 min, no inbound transcript) or over `SESSION_MAX_DURATION_MS` (4 h) — the same-process complement to `ReconcileOrphans` (prior-boot). Each session stamps `ConnectedAtMs`/`LastActivityMs` (in-memory, **no new column**); the reap routes through `StopBridgeSession` using the session's own user/provider, so the co-agent run finalizes (§1). Self-scheduled via `StartStaleSessionSweep()` (called from `HandleStartup`; idempotent; `unref`'d so it never holds the process open) / `StopStaleSessionSweep()`. Covers rosterless transports, a missed leave event, and "the bot joined but nobody came."

## 3. Floor control — one-speaker-at-a-time — ✅ SHIPPED (2026-06-20)

Addressed-gating stops the *spiral*; floor control stops two **addressed** agents talking over each other. Wired `MultiAgentRoomCoordinator` into the engine's `Speak` path: every bridged session `RegisterRoomParticipant`s on connect (keyed on `RoomKey` = external connection id) and `Unregister`s on teardown — so a 1-member room's floor is always free (no-op) and a 2+-member room takes turns. In meeting mode the `Speak` decision does `TakeFloor` first → denied ⇒ stay silent; granted ⇒ `RequestSpokenUpdate` + `armFloorHold` (a `FLOOR_MAX_HOLD_MS`=20s safety release). The floor releases on the agent's own final assistant transcript, the safety timer, or teardown. Facilitator override comes free from the coordinator.

## 4. Gemini meeting mode — ✅ SHIPPED (2026-06-20), subclass-only · ⚠️ needs live validation

Done **entirely in `geminiRealtime.ts`** — zero core changes (the audit confirmed `BaseRealtimeModel` carries no vendor logic; the neutral `Config.disableAutoResponse` flows generically). `buildConnectConfig` now **strips** the neutral flag (it was being `Object.assign`'d raw before — a latent bug) and, when set, configures `realtimeInputConfig.automaticActivityDetection.disabled = true`. Because Gemini Live has **no** clean "detect-but-don't-respond" lever like OpenAI's `create_response=false`, the session drives turns manually: `SendInput` lazily opens an `activityStart` window, and `RequestSpokenUpdate` commits it with `activityEnd` (the bridge is the sole trigger). 1:1 calls are byte-for-byte unchanged.

> **Report-back (the §4 ask):** the seam fully supports this with no core changes — but Gemini's manual-activity path is meatier than OpenAI's one flag, and the exact multi-speaker turn-boundary behavior (one accumulating window vs. per-speaker) **needs live validation against the current Gemini Live API** before we trust it in a busy room. Unit-tested at the send-shape level; not yet live-tested.

## 5. Bridge transcript persistence — ✅ SHIPPED as a UNIFIED ROOM TRANSCRIPT (2026-06-20)

**Answer to the question below:** yes — there's now a *unified* room transcript (not N per-agent copies). It reuses `MJ: Conversations` + `MJ: Conversation Details` (ground-truth study confirmed they're the right shape, and `AIAgentRun` *already* links `ConversationID`/`ConversationDetailID` natively).

**What shipped:**
- **One `MJ: Conversations` per room** — `Type='Meeting Room'`, keyed by `ExternalID = ExternalConnectionId`, `ApplicationScope='Application'` (so it stays **out of the normal chat list** — reusing the existing scope exclusion in `ConversationEngine`, no new filter), tieable to the Meet app via `ApplicationID`.
- **One `MJ: Conversation Details` per final utterance** — `Role='AI'` (the scribe's own speech, attributed via `AgentID`/`AgentSessionID`/`ExternalID`) or `'User'` (everything it heard).
- **Single-scribe election** (`AIBridgeEngine`): exactly one session per room writes the transcript (it hears everyone), so a multi-agent room records **one copy, not N**. Re-elected (handoff) if the scribe leaves a still-occupied room.
- **Generic engine, app-specific binding**: the engine only emits neutral `BridgeTranscriptLine`s via a registered `BridgeTranscriptSink`; the `'Meeting Room'`/scope choices live at the bind site (`RealtimeBridgeResolver`), the persistence in `@memberjunction/ai-agents` (`CreateBridgeRoomTranscriptSink`). Nothing about Conversations/Meet leaks into the engine.
- Tested: engine election/emit/handoff + sink create/reuse/cache/role-mapping.

**Known limitations (documented MVP):**
- **No per-speaker diarization** — `RealtimeTranscript` carries no speaker label, so only the scribe's own speech is agent-attributed; humans + *other* agents are recorded as `'User'`. The common case (1 agent + human) is clean. Finer attribution needs audio-frame-level speaker correlation (follow-up).
- The per-agent `AIPromptRun.Messages` (raw model I/O) is still **not** persisted — out of scope; each agent's run already links into the shared transcript via `ConversationID`/`ConversationDetailID`, so per-agent context exists without duplication.
- Writes are finals-only.

### Original question (answered above):
So each agent would have a copy of this if we had multiple agents in the same chat. I think that is ok, we have archiving to get rid of large chunks of data we don't need. but d we have the concept of a transcript that is unified for the meeting room itself?

## 6. First-agent retroactive re-gating — ✅ SHIPPED (2026-06-20), capability-gated

When a room becomes multi-agent, the agents **already in it** are now re-gated to meeting mode (auto-response off + addressed-only) instead of staying 1:1 — so the whole room takes turns. Built on a new **capability-introspection** surface (the realtime-session analogue of `IBridgeProviderFeatures`), so the container never blind-calls an unsupported method:

- **Core**: `RealtimeSessionCapabilities { CanReconfigureTurnMode }` + optional `IRealtimeSession.Capabilities` getter + optional `Reconfigure(params)`. Both optional → any of the 6 existing drivers that doesn't declare them is treated conservatively (not capable). Additive, non-breaking.
- **OpenAI** declares `CanReconfigureTurnMode: true` and implements `Reconfigure` via a partial `session.update` (its config is runtime-mutable). **Gemini** declares `false` (activity detection is fixed at connect) and **omits** the method.
- **Engine** `ReconfigureSessionToMeeting(bridgeId, matcher)` is **capability-gated**: capable → push `Reconfigure({DisableAutoResponse:true})`, flip `DisableAutoResponse`, rebuild the turn policy with the addressed matcher; incapable → leave it conversational, **no dead call**. Idempotent.
- **Coordinator** re-gates each existing roster agent when a new one joins a multi-agent room.

Net: OpenAI rooms become fully turn-taking the moment a 2nd agent joins; a Gemini agent that started 1:1 stays conversational (honestly, because its provider can't re-gate mid-socket) until that capability lands — at which point it's a one-line flag flip.

### ✅ Speaking-indicator sub-bug — SHIPPED (2026-06-20)
The "who's speaking" spotlight/header didn't show *other* agents even though their tile ring lit up. Root cause: the tile ring uses per-participant `IsSpeaking` (works for server-published agents) while `selectSpotlight`/`selectSplitSpeaker` used only the native `ActiveSpeakerIdentities` list (which omits them). Fixed in `livekit-room-logic.ts` by adding an `IsSpeaking` fallback to both selectors — the native list still wins when populated, the flag catches the agent it misses.

## 7. Smarter turn-taking gate (L1 / L2)

From the turn-taking doc: L0 (name-addressing) ships today. L1 = a lightweight "is this in my lane / should I jump in?" relevance judgment on silence windows; L2 = delegate to the model's own multi-party turn-taking as it matures. The gate is already an interface — swap implementations.

## 8. Phase 3 + misc

- **Per-host UX tools** via the `ExtraTools` seam (whiteboard / remote browser on LiveKit), then **audio → video**.
- **Configurable grace window** for auto-leave (currently a 15s const) + flicker hardening if needed.
- Optional `RealtimeClientSessionService` → `RealtimeCoAgentSessionService` rename (the "Client" is now a misnomer — it serves the bridge too).

---

## Status / remaining

**Shipped:** §1 (finalize on all teardown paths) · §2 (TTL/idle sweep) · §3 (floor control) · §4 (Gemini meeting mode — *pending live validation*) · §5 (unified room transcript) · §6 (first-agent re-gating + the speaking-indicator sub-bug) + the realtime-session **capability surface**.

**Remaining:**
1. **§4 live validation** — confirm the Gemini manual-activity turn boundaries against the live API in a busy room.
2. **§5(b) per-speaker diarization** — so the room transcript attributes each line to its speaker (model transcript has no speaker label; needs audio-frame speaker correlation).
3. **§7 smarter gate** (L1 contextual → L2 model-native), **§8 Phase 3** (per-host UX tools, video), configurable grace window, the `RealtimeClientSessionService` rename.
