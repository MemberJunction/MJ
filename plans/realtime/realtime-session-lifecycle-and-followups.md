# Realtime Session Lifecycle & Follow-Ups

**Status:** Active roadmap — last updated **2026-06-21**. This is the canonical "what's shipped / what's next" doc for the realtime co-agent + Meet work. The foundational plans it grew out of are now **complete** and archived under [`../complete/realtime/`](../complete/realtime/) — notably [`realtime-core-host-convergence.md`](../complete/realtime/realtime-core-host-convergence.md) (Phase 1+2) and [`multi-agent-meeting-turn-taking.md`](../complete/realtime/multi-agent-meeting-turn-taking.md) (the 2a turn-taking MVP, since superseded by the free-for-all decision below).

> **Where things live now:** this folder ([`plans/realtime/`](.)) holds only **forward-looking** realtime plans; everything shipped moved to [`../complete/realtime/`](../complete/realtime/). See [`README.md`](README.md) for the index.

---

## 🧭 Strategic decision (2026-06-21): free-for-all by default, moderator dormant

We trialled putting an **LLM "turn moderator"** in front of multi-agent rooms (a fast prompt that routes each turn to specific agents). **Decision: it's the wrong long-term bet** — it compounds a dumb-fast-LLM's routing errors on top of lossy STT, and the realtime models themselves are getting good enough at multi-party turn-taking that an external router will soon be dead weight.

**So the default is now _free-for-all_:** every agent hears the whole room and self-organizes via provider VAD + auto-response + universal barge-in. The moderator is **kept wired but OFF by default** (`MJ_REALTIME_MODERATOR_MODE=on` to enable) for controlled scenarios (webinars, large rooms, weaker models). All the moderator infra (the `RealtimeTurnModerator` prompt-run router, floor pre-staging, lookback) stays in the tree, dormant.

**Consequence — the open problem:** free-for-all works cleanly for **≤2 agents** but degrades with **3+** (see Remaining #1). The bet is that smarter models close this gap; the near-term mitigation is a diarized peer-echo damper, not the router.

---

## Shipped just before this plan (the "quick bits")

- **Co-agent observability lands on every surface.** Hardened `createCoAgentRun` (only stamp a non-empty `AgentSessionID`) + threaded the real session id coordinator → factory → prep. Verified live: bridge sessions now create `Realtime Co-Agent` runs with the Demo Loop / Sage delegations nested under them.
- **Correct agent detection in the LiveKit driver.** `IsAgent` was `p.IsLocal` only — so *other* agents in a room read as humans. Now also recognizes the coordinator's `agent-<id>` identity convention. Fixes turn-taking's agent-exclusion **and** the occupancy check below.
- **Auto-leave an emptied room.** `AIBridgeEngine.evaluateRoomOccupancy`: once a human has been seen and the roster drops to agents-only, a 15s grace timer (cancelled on re-join, so a refresh is safe) stops the session via the normal path — which closes the realtime session and **finalizes the co-agent run**. This is the dominant teardown case (user closes the tab) that previously left a `Connected` bridge + `Running` run forever.

---

## Shipped in the 2026-06-21 session (Meet UX + cost-leak + multi-agent + polish)

- **Meet room End vs. Leave (Zoom/Teams-style).** The control-bar red button is a split control: **End meeting for everyone** vs. **Leave meeting**, available on both a freshly-started AND a rejoined room (the old "End" pill on the agents bar was gated by the local roster, so it vanished on join). End-for-all is now a **server-side, by-room-name** teardown — `LiveKitAgentRoomCoordinator.StopAllAgentsInRoom(roomName)` + the `EndLiveKitRoom` mutation + `GraphQLLiveKitClient.EndRoom()` — so a participant who only *joined* (and never tracked bridge ids) can still end it. Generic `livekit-room` stays MJ-agnostic via a `CanEndForAll` input + `EndForAll` output; `mj-livekit-room` does the teardown.
- **Cost-leak fix (the key one).** `dispatchUserTurn` is now **diarization-aware**: an `agent-…` inbound speaker is a peer agent being *overheard*, NOT a human, so it no longer calls `noteHumanPresence()`. An agents-only room can't keep cancelling its own empty-room auto-leave by transcribing its peers → agents stop once the last human leaves. No billable realtime sessions stranded in an empty room. This underpins both **Leave** (you go, the room cleans itself up) and abrupt tab-close.
- **Meet landing + navigation.** New room / Join existing / Past history landing, with a **Back** button on every sub-view (picker, join, history). Any disconnect (`onRoomLeft()`) returns here instead of stranding the user on a dead room. History/Join reuse the Voice Transcripts data layer.
- **Multi-agent turn-taking + the moderator toggle.** Broadcast a room's user turns to every agent's gate (fixes agents whose model can't transcribe in meeting mode); per-room diarized lookback; the pluggable `SetTurnModerator` hook (serialized speaking via the floor, pre-stage, runaway ceiling) — **gated OFF by default** per the free-for-all decision above. Seeded "Realtime: Turn Moderator" prompt (GPT-OSS-120B on Cerebras) sits dormant.
- **Speaking-indicator polish.** 1500 ms speaking-hold debounce in `LiveKitRoomController` (no more flicker when a speaker breathes); spotlight / agent-state / `AgentParticipant` now prefer the *actually-speaking* agent so the indicator names the right one in a multi-agent room.
- **Verbose-gated diagnostics.** All realtime `[diag]` tracing is now dark unless `MJ_VERBOSE=true|1|yes` (shared `RealtimeDiagLog()` in `@memberjunction/ai` for the driver session classes; `LogStatusEx({verboseOnly})` in the engine/moderator/resolver). Preserved for future debugging, silent in normal operation.

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

---

## Status / shipped

**Shipped:** §1 (finalize) · §2 (TTL/idle sweep, now **configurable** via `ConfigureSessionTimings`) · §3 (floor control) · §4 (Gemini meeting mode — *pending live validation*) · §5 (unified room transcript) · §5(b) **per-speaker diarization** · §6 (first-agent re-gating + the **re-gate context note** + speaking-indicator) + the realtime-session **capability surface** · **(2026-06-21)** Meet End/Leave + room-level teardown · diarization-aware cost-leak auto-leave · Meet landing/Back · multi-agent broadcast + dormant moderator toggle · speaking-indicator hold · verbose-gated diagnostics.

**Surfacing (loose end #1) — SHIPPED:**
- **Voice Transcripts dashboard** — a new nav item in the AI Analytics shell (`@memberjunction/ng-dashboards`): a master-detail browser over the meeting-room transcripts, **diarized per speaker** (agent lines → agent name; heard lines → the participant's display name via the `ExternalID` → roster join). `AnalyticsRealtimeTranscriptsComponent` + `realtime-transcripts-data.ts`.
- **Meet-app linkage** — the transcript sink now resolves the **`Meet`** application by name (`ApplicationName: 'Meet'`) and stamps `ApplicationID` on the room conversation, so the rooms are owned by the Meet app (still scoped out of the normal chat list).

**§5(b) diarization — SHIPPED:** the engine tracks `LastInboundSpeaker` from the inbound media frame's `SpeakerLabel` (which the LiveKit/Zoom drivers populate) and attributes each `User` transcript line to that participant — so the room transcript records *who* spoke, not just "a user." Single-speaker-at-a-time approximation; resolving a participant identity to an MJ `UserID` (vs. display name) is the remaining refinement.

---

## ▶️ Next steps (priority order)

### 1. The 3+-agent free-for-all storm (the open problem)
Free-for-all is clean for **≤2 agents** but degrades with **3+**: agents transcribe each other's speech as `'user'` turns → each replies → the replies are overheard and transcribed again → it spirals into echo / farewell loops. (Diagnosed live this session; it's not a crash, it's an N² echo cascade.) The router/moderator is **not** the fix (see the free-for-all decision up top).

**Proposed fix — a diarized peer-echo damper (no router):** an agent should **not auto-respond to a turn whose diarized speaker is another `agent-…`**. We already compute `LastInboundSpeaker` (the §5(b) diarization signal) and already use it for the cost-leak auto-leave — the same signal gates this. An agent still *hears* peers (context accrues, barge-in works), it just won't reflexively answer another bot. This is the smallest change that should make 3+-agent rooms usable without reintroducing the router. Needs design + the where-to-gate decision (`evaluateUserTurnForAgent` / the broadcast fan-out in `dispatchUserTurn`).

### 2. §4 Gemini meeting-mode live validation
Confirm the Gemini manual-activity (`activityStart`/`activityEnd`) turn boundaries against the **live** API in a busy multi-speaker room — unit-tested at send-shape level, not yet live-validated. Runbook: [`gemini-meeting-live-test-runbook.md`](gemini-meeting-live-test-runbook.md).

### 3. Diarization → UserID
Heard participants currently resolve to a **display name**; mapping to an MJ `UserID` needs a per-provider identity resolver (`AIAgentSessionBridgeParticipant.UserID` is unpopulated today).

### 4. Smarter turn-taking gate (was §7) — only if free-for-all + the damper aren't enough
L0 (name-addressing) exists; L1 = a lightweight contextual "is this in my lane?" judgment on silence windows; L2 = delegate to the model's own multi-party turn-taking as it matures. The gate is already an interface. **Note:** the free-for-all bet is that L2 (model-native) arrives before we need L1 — revisit only if the damper proves insufficient. Background in the archived [`multi-agent-meeting-turn-taking.md`](../complete/realtime/multi-agent-meeting-turn-taking.md).

### 5. Phase 3 + misc (was §8)
- **Per-host UX tools** via the `ExtraTools` seam (whiteboard / remote browser on LiveKit), then **audio → video**.
- **Configurable grace window** for auto-leave (currently a 15s const) + flicker hardening if needed.
- Optional `RealtimeClientSessionService` → `RealtimeCoAgentSessionService` rename (the "Client" is now a misnomer — it serves the bridge too; mechanical, its own commit).
- Tests for the new `EndRoom` / `StopAllAgentsInRoom` room-teardown path and the split-leave control.
