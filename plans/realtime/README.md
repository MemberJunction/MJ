# Realtime Co-Agent & Meet — Plans Index

This folder holds the **forward-looking** realtime plans. Everything that has shipped has been moved to [`../complete/realtime/`](../complete/realtime/) so this folder stays a clean "what to do next."

_Last curated: 2026-06-21._

---

## 👉 Start here

**[`realtime-session-lifecycle-and-followups.md`](realtime-session-lifecycle-and-followups.md)** is the canonical **current-state + next-steps** roadmap. It tracks what's shipped and what's left, in priority order.

### Current state, in one paragraph
The realtime co-agent stack (1:1 voice + server-bridged meetings) is shipped and live-tested on LiveKit. Multi-agent rooms run **free-for-all** (every agent hears the room and self-organizes via VAD + auto-response + barge-in); an optional LLM **turn moderator** exists but is **OFF by default** (`MJ_REALTIME_MODERATOR_MODE=on`). The Meet app has a landing (new/join/history), Zoom-style **End vs. Leave**, server-side room teardown, a diarization-aware cost-leak fix (no stranded billable sessions), and verbose-gated diagnostics.

### The #1 open problem
**Free-for-all degrades at 3+ agents** — agents transcribe each other and spiral into echo/farewell loops. The intended fix is a **diarized peer-echo damper** (don't auto-respond to a turn whose speaker is another `agent-…`), NOT the moderator/router. See "Next steps → 1" in the roadmap.

---

## Active plans in this folder

| Doc | What it is |
|---|---|
| [`realtime-session-lifecycle-and-followups.md`](realtime-session-lifecycle-and-followups.md) | **The roadmap.** Shipped log + prioritized next steps. |
| [`realtime-bridges-architecture.md`](realtime-bridges-architecture.md) | Master bridge architecture (Zoom/Teams/Webex/telephony). Phase 0/1 shipped, Phase 2+ planned. |
| [`multi-party-and-meeting-bridge.md`](multi-party-and-meeting-bridge.md) | Proposal: meeting platforms as the shared media plane (future). |
| [`native-marketplace-apps.md`](native-marketplace-apps.md) | Phase 9 design — per-platform marketplace shims (future, no engine code). |
| [`livekit-recording-governance.md`](livekit-recording-governance.md) | Governed recording roadmap (basic control shipped; governance future). |
| [`gemini-meeting-live-test-runbook.md`](gemini-meeting-live-test-runbook.md) | Runbook for the pending Gemini meeting-mode live validation (Next steps → 2). |
| [`resources-channel/`](resources-channel/) | Design proposal: a realtime "Resources" channel + multi-channel layout (no code). |
| [`mockups/`](mockups/) | UX mockups (design assets). |

## Shipped (archived under `../complete/realtime/`)

- `realtime-core-host-convergence.md` — Phase 1+2: one shared session producer + the long-lived bridged-session runtime.
- `multi-agent-meeting-turn-taking.md` — the 2a "hear everything, speak when addressed" MVP (**superseded** by the free-for-all decision).
- `native-bridge-buildout-plan.md` — LiveKit native media buildout (code-complete + live-tested).
- `livekit-live-test-plan.md`, `livekit-room-testing.md`, `bridge-and-screenshare-testing-audit.md` — test plans/runbooks (executed).
- `computer-use-remote-browser-blend.md` — goal-driven browser control (implemented).

## Reference guides (not plans)

The durable architecture docs live in [`/guides/`](../../guides/): `REALTIME_CO_AGENTS_GUIDE.md`, `REALTIME_BRIDGES_GUIDE.md`, `REMOTE_BROWSER_GUIDE.md`, `CONVERSATIONS_UX_STACK_GUIDE.md`.
