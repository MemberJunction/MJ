# Audit — Join Zoom/Teams & Screen-share the Browser into a Meeting: testing readiness

*Date: 2026-06-13. Audits whether (a) an agent can join a Zoom/Teams meeting and (b) the Remote
Browser can be screen-shared into a meeting "like a person sharing their desktop", and what each
needs to become live-testable.*

## TL;DR

| Capability | Testable today? | Blocker(s) |
|---|---|---|
| **Remote Browser channel** (agent drives a browser in-app, user watches in Explorer) | ✅ **Yes** | — (just shipped; SelfHost local Chrome, no account) |
| **Agent joins a Zoom meeting (hears it)** | ❌ No | No app entry point; bridge not loaded/wired; Zoom RTMS receive needs creds + API `VERIFY` |
| **Agent joins a Teams meeting** | ❌ No | All of the above + **Teams has no real SDK binding (Fake only)** |
| **Agent speaks INTO a Zoom/Teams meeting** | ❌ No | **Outbound media** — RTMS is receive-only; needs the Zoom **Meeting SDK** (native) / a real Teams binding |
| **Screen-share the browser INTO a meeting** | ❌ No | All of "join" + outbound media + the **RB→bridge ScreenOut wiring is absent** |

The in-app Remote Browser channel is ready to test now. The **meeting-bridge** side is a library with
**no runtime entry point** and **no outbound-media binding** — neither "join" nor "screen-share" is
wirable to a live test without building the integration below.

## What exists vs. what's missing

### The bridge subsystem is built but **not invocable**
`AIBridgeEngine.StartBridgeSession(...)` (the full join + transport seam) is implemented and
unit-tested, but it is **never called** from any resolver, action, scheduled job, or session flow.
There is no "send Sage to this Zoom meeting" entry point in the running server. Confirmed:
- `StartBridgeSession` has zero callers outside `ai-bridge-engine.ts` + tests.
- `AIBridgeEngine` is not referenced anywhere in `MJServer` or `ai-agents`.
- Bridge provider packages (`ai-bridge-zoom`, `-teams`, …) are not imported by the server, so their
  `@RegisterClass` drivers never register — the ClassFactory couldn't resolve `ZoomBridge` even if
  `StartBridgeSession` were called. (`LoadXBridge()` is only each package's own tree-shaking self-call.)

This is the "runner-layer wiring around an agent's generation" the bridge plan explicitly documented
as **pending** (see `realtime-bridges-architecture.md` Phase 7 note).

### Media bindings
- **Zoom** — a real **RTMS** receive binding shipped (`ZoomRtmsMeetingSdk`): the agent can *hear* a
  meeting (per-participant, diarized). **RTMS is receive-only** — it cannot send the agent's voice or
  a screen share *into* the meeting. Needs a Zoom app + RTMS entitlement + webhook wiring + creds, and
  the `@zoom/rtms` API points are marked `// VERIFY` (not live-checked here).
- **Teams** — **Fake SDK only**. No real binding exists.
- **LiveKit** — the one **self-hostable, outbound-capable** transport (full SFU: the bot can publish
  audio/video/**screen** tracks). But it is also Fake-bound (`SetSdkFactory` "bind the real LiveKit
  SDK"), and still needs the entry-point + session integration.

### Remote Browser → meeting screen-share is unconnected
`RemoteBrowserEngine.PipeScreencastToTrack(sessionId, sink)` exists and emits encoded frames to a
**sink** — but **nothing provides that sink from a bridge's `ScreenOut` track**. The connective tissue
(`screencast frame → bridge.SendMedia(ScreenOut, frame)`) is not written. And even once written, it
only does something live when (a) the bridge is invocable and (b) the transport supports **outbound**
video/screen (LiveKit yes; Zoom only via Meeting SDK; Teams via a real binding).

## What it takes to make each testable

**To test "agent joins + hears a Zoom meeting" (receive-only):**
1. A runtime **entry point** — a resolver/action "StartBridgeSession(agentSessionID, providerName, joinAddress)" that calls `AIBridgeEngine.StartBridgeSession`, plus wiring the `bridge.OnMedia → IRealtimeSession.SendInput` to a live realtime session (the deferred runner-layer integration).
2. **Load** the Zoom bridge provider in the realtime infra (like the Remote Browser channel is loaded) + `BindZoomRtms()`.
3. A Zoom app with **RTMS** + the webhook (`meeting.rtms_started`) feeding connection params; verify the `@zoom/rtms` API assumptions.
   → Result: one-way (agent listens). Speaking back needs the Meeting SDK.

**To test "agent screen-shares the browser into a meeting":**
1. Everything above, but with an **outbound-capable** transport. The self-hostable choice is **LiveKit**: bind the real `livekit-server-sdk`, join a room as a bot, publish a screen track.
2. The **RB→ScreenOut wiring**: pipe `PipeScreencastToTrack`'s frames into the bridge's `ScreenOut` `SendMedia` for that session.
3. The agent's Remote Browser session + the LiveKit bridge session share the `AIAgentSession`; the user joins the LiveKit room and sees the agent's browser shared.
   → For **Zoom/Teams** specifically, this additionally requires the **Zoom Meeting SDK** (native C++/Linux bot, raw-data/virtual-cam entitlement) or a third-party meeting-bot service for Zoom, and a real Teams (Graph cloud-communications) media binding — each a substantial, separately-credentialed effort.

## Recommendation

- **Now:** test the **Remote Browser channel** in-app (the cool part is ready — local Chrome, no account).
- **Next, smallest real meeting test:** the **LiveKit** path — self-hostable, outbound-capable, no per-vendor entitlement — is the cleanest way to prove "agent screen-shares the browser into a room" end-to-end. It still needs the bridge entry-point + session integration + the real LiveKit binding + the RB→ScreenOut wiring.
- **Zoom/Teams meetings specifically** are a larger, externally-gated track: Zoom hearing works via RTMS (with an app + entitlement); Zoom *participation* (speak/share) needs the Meeting SDK; Teams needs a real binding. Scope these deliberately — they are not a quick wiring task.
