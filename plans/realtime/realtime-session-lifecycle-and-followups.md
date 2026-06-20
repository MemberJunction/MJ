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

## 2. TTL / heartbeat reaper *(robustness backstop)*

`evaluateRoomOccupancy` only covers **roster-capable** providers (LiveKit/Zoom/Teams with diarization) and assumes `OnParticipantChange` fires reliably. Add a periodic host-scheduled sweep (sibling to `CalendarWatcher.Sweep`) that stops bridges which are `Connected` but stale:

- no roster change / no media / `LastActiveAt` older than a TTL, **and**
- (for rosterless transports — telephony) a max-session-duration cap.

Covers: rosterless providers, a missed leave event, and "the bot joined a scheduled meeting but nobody ever came." Reuses the §1 finalizer.

## 3. Floor control — one-speaker-at-a-time *(functional, from the turn-taking MVP)*

Addressed-gating stops the *spiral*; floor control stops two **addressed** agents talking over each other. The `MultiAgentRoomCoordinator` already has `CanTakeFloor` / `TakeFloor` / `ReleaseFloor` — wire them into the engine's `Speak` path:

- Before `RequestSpokenUpdate`: `CanTakeFloor` → if denied, stay silent (or queue).
- On speak: `TakeFloor`; release on the agent's final assistant transcript (or a short post-speech timeout).
- Needs the room roster registered with the coordinator (`RegisterRoomParticipant` on join / `Unregister` on leave) — keyed on the room (external connection id), set by the LiveKit coordinator.

## 4. Gemini meeting mode *(functional)*

Only OpenAI's auto-response is actually disabled (`turn_detection.create_response=false`). Gemini currently relies on the prompt alone. Wire Gemini Live's native control: `realtimeInputConfig.automaticActivityDetection.disabled = true` + send manual `activityStart`/`activityEnd` (or drive `RequestSpokenUpdate` as the sole trigger). Honor the same neutral `Config.disableAutoResponse` flag the bridge already sets.

## 5. Bridge transcript persistence *(observability parity)*

The bridge path creates the co-agent `AIPromptRun` but does **not** persist the voice transcript onto it (native chat does). Wire `session.OnTranscript` → append to the prompt run's `Messages` (debounced/serialized like the completion-loop's `PersistTranscript`). Without it, bridged sessions can't be reviewed after the fact. Finalize-time flush on teardown.

## 6. First-agent retroactive re-gating *(polish)*

When a room becomes multi-agent, the **first** agent stays 1:1 (auto-response on, answers freely) — it isn't re-gated. To make the *whole* room meeting-mode, the coordinator must reconfigure the already-running first agent: a live `session.update` disabling auto-response + swapping its matcher to `RegexAddressedMatcher`. Needs a "reconfigure turn mode" method on the live session/bridge.

## 7. Smarter turn-taking gate (L1 / L2)

From the turn-taking doc: L0 (name-addressing) ships today. L1 = a lightweight "is this in my lane / should I jump in?" relevance judgment on silence windows; L2 = delegate to the model's own multi-party turn-taking as it matures. The gate is already an interface — swap implementations.

## 8. Phase 3 + misc

- **Per-host UX tools** via the `ExtraTools` seam (whiteboard / remote browser on LiveKit), then **audio → video**.
- **Configurable grace window** for auto-leave (currently a 15s const) + flicker hardening if needed.
- Optional `RealtimeClientSessionService` → `RealtimeCoAgentSessionService` rename (the "Client" is now a misnomer — it serves the bridge too).

---

## Suggested sequencing

1. **§1 (finalize on all teardown paths)** — small, pure correctness; pairs naturally with the auto-leave just shipped.
2. **§3 (floor control)** — the next real multi-agent functional gain.
3. **§4 (Gemini meeting mode)** — so the Gemini↔GPT cross-talk gets the same gating discipline.
4. **§5 (transcript persistence)** — makes everything debuggable.
5. **§2 (TTL reaper)**, then **§6–§8** as polish / future.
