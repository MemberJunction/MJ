# Realtime Core ↔ Host Convergence

**Status:** **Phase 1 + Phase 2 SHIPPED** (2026-06-19) · Phase 3 (per-host UX tools + video) future. Author: pairing session with Amith.

**Phase 1 done:** one shared producer `RealtimeClientSessionService.PrepareRealtimeSessionParams` (identity via the single `BuildRealtimeAgentFraming`, the full precedence cascade incl. the target layer, tools, voice, memory); the LiveKit **bridge consumes it** (`BaseAgent.StartBridgeRealtimeSession` — no more bridge-local prep); the completion-loop frames as the target via the same helper; the override input unified via `BuildRealtimeOverridesJson`; native chat gained the target precedence layer.

**Phase 2 done (this session):** the long-lived bridged-session RUNTIME now matches the other topologies. `RealtimeClientSessionService.WireBridgeRealtimeSession` wires the bridge's `session.OnToolCall` to the SAME `ExecuteRelayedTool` the browser uses — so `invoke-target-agent` runs the target via `AgentRunner`, nested + tracked, with barge-in cancel + paused-run resume for free — and creates the co-agent observability run (AIAgentRun + PromptRun + step), **finalized once** via a finalize-wrapped `session.Close()` (+ `OnClose` for drops). The engine now closes the realtime session on teardown (was leaked). `wireBridgeToolFallback` is gone. **Multi-agent meeting turn-taking MVP also shipped** — see [`multi-agent-meeting-turn-taking.md`](multi-agent-meeting-turn-taking.md). All realtime suites green (ai-agents 1369; bridge-server 94; OpenAI 68; LiveKitRoomServer 17) + new drift tests. Live LiveKit test pending (Amith).

**Phase 3 next (future, additive):** per-host UX tools via the ExtraTools seam; LiveKit audio → video. Optional `RealtimeClientSessionService` → `RealtimeCoAgentSessionService` rename. Cross-session **floor control** (one-speaker-at-a-time) for meetings — the documented follow-up to the turn-taking MVP.

---
**Original plan (2026-06-19).** Author: pairing session with Amith.
**Goal:** One source of truth for the realtime co-agent. Every host environment — native realtime chat, LiveKit, and future Zoom / Teams / GoToMeeting / Webex — **consumes** the same core. The agent is the *same agent* everywhere (identity, personality, voice, the ability to do real work, session tracking). Only **media transport** and **host-specific UX tools** vary.

Cross-refs: [REALTIME_CO_AGENTS_GUIDE](../../guides/REALTIME_CO_AGENTS_GUIDE.md), [REALTIME_BRIDGES_GUIDE](../../guides/REALTIME_BRIDGES_GUIDE.md), [ai-agent-sessions](../ai-agent-sessions.md).

---

## 1. The principle

> Talk to **Marketing Agent Query Builder**, **Sage**, or **Skip** in the native realtime chat, in a LiveKit meeting, or (later) in Zoom/Teams — it is the **same agent**: same identity, same personality, same model/voice, same ability to delegate real work, same Agent Session + run tracking. The *only* things that differ are how audio/video gets in and out, and which UX surface tools that host happens to expose.

This gives us a **value multiplier**: every realtime improvement (a prompt change, a new precedence rule, better memory, a tracking field) lands in **all** hosts at once, and a new host is *just a transport driver*.

---

## 2. The boundary (the whole plan in one table)

| Concern | Layer | Why |
|---|---|---|
| Identity / persona (adopt the **target** agent) | **CORE** | The agent must *be* that agent everywhere. |
| Model + voice selection (the **precedence cascade**) | **CORE** | Same selection rules on every surface. |
| Base system prompt + memory/context | **CORE** | Same brain. |
| **Delegate-to-target** (`invoke-target-agent`) | **CORE** | Under-the-hood tooling, **not UX**. The co-agent can always hand real work to the underlying agent — that's the point of a co-agent. |
| **Session + run tracking** (`AIAgentSession`, `AIAgentRun`, prompt runs) | **CORE** | We always get observability regardless of host. |
| Model session lifecycle (open / drive / finalize) | **CORE** | One lifecycle, three topologies (below). |
| **Media transport** (audio now, video later) | **HOST** | LiveKit ≠ Zoom ≠ Teams ≠ browser WebRTC. |
| **Host UX tools** (whiteboard, remote browser, screen share, …) | **HOST** | Surface-specific. Injected, not baked in. LiveKit's set is "none yet → its own later." |

**Precedence cascade (CORE, identical on every host):**
```
runtime override  >  target agent's TypeConfiguration  >  co-agent config  >  agent-type default
```
(deep-merge, per-key higher layer wins — same `RealtimeCoAgentConfig` JSON shape end to end.)

---

## 3. The three topologies of the ONE core

All three share the core (prep + delegate-to-target + tracking). They differ only in **who drives the session** and **the transport**:

| Topology | Who runs the model | Who drives | Transport | Used by |
|---|---|---|---|---|
| **Client-direct** | Browser | Browser (server VAD) | WebRTC, browser-owned | Native realtime chat |
| **Server completion-loop** | Server | `RealtimeSessionRunner.Run()` to completion | none (programmatic) | Programmatic realtime agent runs |
| **Server long-lived (bridged)** | Server | Host media + turn-taking, lives until host ends | `BaseRealtimeBridge` driver | LiveKit (now), Zoom/Teams/Webex (future) |

The bug we're fixing: the **bridged** topology re-implemented the core (prep) and never wired delegate-to-target or tracking.

---

## 4. Current state (what each path does today)

| Capability | Client-direct (`RealtimeClientSessionService`) | Completion-loop (`executeRealtimeSession`) | **Bridge (`StartBridgeRealtimeSession`)** |
|---|---|---|---|
| Target identity in prompt | ✅ `buildCompanionSystemPrompt` | ✅ (via runner deps) | ❌ frames as the **co-agent** (the "everyone is Sage" bug) |
| Model+voice precedence | ⚠️ runtime > co-agent (**no target layer**) | ⚠️ same gap | ⚠️ runtime > target > co-agent (the *only* place with the target layer — but divergent code) |
| Delegate-to-target | ✅ relayed `ExecuteRelayedTool` | ✅ runner | ❌ **not wired** |
| Session + run tracking | ✅ `createCoAgentObservabilityRun` / `FinalizeCoAgentRun` | ✅ `finalizeRealtimeRun` | ❌ **none** |
| Prep source | `buildSessionParams` | `buildRealtimeSessionDeps` | **own** `buildRealtimeSessionParams` (the drift) |

So: identity + precedence are genuine **drift bugs in the core**; delegate-to-target + tracking are **missing on the bridge** (core capabilities that simply were never wired there). Audio-only and "no UX tools" on LiveKit are **intended scope**, not defects.

---

## 5. Target architecture

A single **Realtime Co-Agent Session core** (today's `RealtimeClientSessionService`, to be renamed — the "Client" in the name is the last lie about it being client-only) owns:

1. **`prepareSessionParams(input)`** — resolve co-agent → effective config **with the full cascade incl. the target layer** → model → `buildCompanionSystemPrompt` (target identity) → stable tool set (always incl. `invoke-target-agent`) → voice → memory. Pure: input → `RealtimeSessionParams`. **No side effects.**
2. **Session openers** (thin, one per topology), all consuming the *same* `RealtimeSessionParams`:
   - `PrepareClientSession` → `CreateClientSession` (mint token; browser runs).
   - `PrepareServerSession` (**new**) → `StartSession` (server runs; returned to a bridge).
3. **Delegate-to-target + tracking** wired into the server long-lived path so a bridged session can do real work and shows up as an Agent Session + run — exactly like the other two topologies.

**Host adapters** (`BaseRealtimeBridge` drivers: LiveKit, Zoom, Teams, …) provide **only**:
- media transport (audio now, video later), and
- optional **host UX tools** injected via the *existing* `RealtimeSessionRunnerDeps.ExtraTools` / `ExecuteTool` seam (LiveKit injects none today).

Nothing host-specific leaks into the core; nothing core gets re-implemented in a host.

---

## 6. Phased execution

### Phase 1 — Converge the CORE **prep** (identity + precedence) — *lowest risk, fixes the two visible bugs*
- Extend the core's effective-config resolution to layer the **target agent's** `TypeConfiguration` (cascade above) — benefits client-direct too (it gains the missing target layer).
- Unify the runtime-override **input**: client-direct's `ConfigOverridesJson` and the bridge's `params.data.realtimeModelID/realtimeVoice` both funnel into the one override slot.
- Expose `prepareSessionParams(input)` publicly on the core.
- `StartBridgeRealtimeSession` adapts `ExecuteAgentParams` → core input → calls `prepareSessionParams` → `StartSession`. **Delete** `buildRealtimeSessionParams`, `assembleRealtimeContext`, `resolveTargetRealtimeConfig`, the inline framing, and the bridge-local model/cascade helpers.
- **Outcome:** LiveKit agents join as the right agent, in the right voice; precedence identical on every surface; audio-only unchanged.

### Phase 2 — Converge the CORE **runtime** (delegate-to-target + session/run tracking) on the long-lived path
- Add `PrepareServerSession` that opens via `StartSession` **and** wires `invoke-target-agent` (reusing `delegateToTarget`) + creates the `AIAgentSession`/`AIAgentRun`/prompt run, finalized on session end.
- Bridge consumes `PrepareServerSession`; ensure **single-create** (no double observability with any existing bridge wiring).
- **Multi-agent meeting turn-taking** rides on this same long-lived runtime — the "hear-always, speak-when-addressed" model (disable blind auto-response → policy-gated `RequestSpokenUpdate` → addressing/floor-control gate). Full design: **[`multi-agent-meeting-turn-taking.md`](multi-agent-meeting-turn-taking.md)**. This is what fixes "agents spiral / talk over each other / pick up the wrong conversation" while still letting them hear the whole meeting and talk to each other when appropriate.
- **Outcome:** bridged agents can do real work, are tracked, and behave like meeting participants (listen to everything, speak selectively) — identical to the other topologies, regardless of host.

### Phase 3 — Host capabilities (per-host, additive, future)
- LiveKit: audio → **video**.
- Per-host UX tools injected via the deps seam (each host its own set). No core change.

> Phase 1 alone resolves the two issues raised (identity + precedence). Phases 1+2 together make "Agent Session + runs + delegate-to-target, always, regardless of host" true. Phase 3 is ongoing host enablement.

---

## 7. Drift-protection contract (tests + rules — must ship with Phase 1)

**The rule:** there is exactly **one** producer of realtime identity, precedence, prompt, and tool-set. A host MUST NOT build its own. Reviewers reject any host-local re-implementation of prep.

**Unit tests (new, guard against regression):**
1. **Identity parity** — for the same logical input, `prepareSessionParams` frames first-person as the **target** (not the co-agent), on every topology entry point. Assert the co-agent name does **not** appear as the speaker identity when a target is set.
2. **Precedence parity** — table-driven: for each `(runtime override, target config, co-agent config)` combination, both the client-direct and the bridge entry points resolve the **same** model + voice. This is the anti-drift workhorse.
3. **Tool-set invariant** — `invoke-target-agent` is **always** present in the core tool set, independent of host ExtraTools.
4. **One-producer guard** — a test (or lint/grep check documented here) asserting no host package builds a realtime system prompt or resolves realtime model/voice itself.

**Docs to update with Phase 1:**
- `REALTIME_CO_AGENTS_GUIDE.md` — add the **core-vs-host boundary** section (the §2 table) and the "one producer of prep" rule.
- `REALTIME_BRIDGES_GUIDE.md` — state explicitly that a bridge is **media transport + optional host tools only**, and consumes the core session; link the boundary.

---

## 8. Decisions (locked) & open items

**Locked (this session):**
- Session/run tracking is **CORE**, universal across hosts.
- Delegate-to-target is **CORE**, always present (not UX, not host-opt-in).
- Identity + precedence are **CORE**, one producer.
- Media transport + UX tools are **HOST**, injected.
- LiveKit current scope: audio (→ video later), no host UX tools yet — and that's fine.

**Open / to confirm during build:**
- Rename `RealtimeClientSessionService` → e.g. `RealtimeCoAgentSessionService` now (Phase 1) or after, to minimize churn vs. clarity.
- Long-lived server session lifecycle: confirm the cleanest place for the bridged-session orchestration (a long-lived sibling to the completion-loop runner vs. extending the runner with a "don't run to completion" mode) — decided at the start of Phase 2.
- Exact single-create reconciliation for observability if any latent bridge run wiring exists.
