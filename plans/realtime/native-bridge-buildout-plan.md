# Realtime Bridge — Native Media Buildout Plan

**Status:** the MJ-side adapter + wiring layer is merged on branch `realtime-bridge-native-sdk-bindings`
(native SDK bindings for all 10 providers + `BridgeNativeSdkRegistry` + engine auto-binding). This doc is
the forward plan for the **platform-specific native media clients** and the **session-start harness** — the
two pieces that turn the bindings into live, talking agents.

Audience: a developer picking this up. Read the
[Realtime Bridges Guide](../../guides/REALTIME_BRIDGES_GUIDE.md) first.

---

## 0. Mental model — what's done vs. what each build adds

The bridge stack, top to bottom:

| Layer | State |
|---|---|
| Engine (`StartBridgeSession`, transport seam, turn-taking) | ✅ merged |
| Drivers (`TeamsBridge`, `ZoomBridge`, …) + per-provider seam (`ITeamsMeetingSdk`, …) | ✅ merged |
| **Native bindings** (`TeamsNativeMeetingSdk`, …) — the adapter that drives two-way media *given a real client* | ✅ this branch (tested vs. **fake** modules) |
| **Registry + engine auto-binding** (`BridgeNativeSdkRegistry`, `BindSdk` override) | ✅ this branch |
| **Real native media client** (ACS / Zoom raw-data / Meet Media / …) | 🔴 **the work below** |
| **Session-start harness** (`StartSession → StartBridgeSession`) | 🔴 **build once, §1** |

Every binding loads its real client lazily behind `NativeModuleSpecifier` (a config value). A binding's
expected native surface is the structural `NativeMeetingModule` / `NativeCallModule` interface declared in
its `*-native-*-sdk.ts`. **A "native build" = implement a module satisfying that surface for the real
platform, then point `NativeModuleSpecifier` at it.** Expect to adjust the structural contract slightly when
it meets the real SDK — the MJ-facing side (seam, engine, transport) does not move.

The unified path (the design invariant — do not fork it): every provider funnels through the **same**
`IRealtimeSession` (`@memberjunction/ai-core` `baseRealtime.ts`) and the **same** transport seam
(`bridge.OnMedia → IRealtimeSession.SendInput`, `IRealtimeSession.OnOutput → bridge.SendMedia`). Telephony
and meetings already share it. A new platform is "just a native client + a row."

---

## 1. The session-start harness (build FIRST — provider-agnostic, reused by all)

Today nothing outside the bridge package calls `StartBridgeSession`, and the engine deliberately does NOT
construct the realtime model session. Build a small server-side entrypoint **once**; every provider reuses it.

**Deliverable:** a server-side service (and a dev-only resolver/Action to trigger it) that, given
`{ agentId | agentSessionId, providerName, address, turnConfig, configuration }`:

1. Resolves the provider row (`AIBridgeEngine.Instance.ProviderByDriverClass(...)` / by name) and the agent.
2. Opens the realtime model session:
   `const session = await model.StartSession({ systemPrompt, voice, tools, ... })`
   where `model` is a `BaseRealtimeModel` driver resolved via ClassFactory + metadata (Gemini / xAI /
   Inworld already ship). `session` is the `IRealtimeSession`.
3. Calls
   `AIBridgeEngine.Instance.StartBridgeSession({ AgentSessionID, Provider, RealtimeSession: session, Address, TurnMode, TurnMatcher, ContextUser, MetadataProvider, Configuration })`.
   - `TurnMatcher` is **required** for Passive turn-taking — build a `RegexAddressedMatcher` from the agent
     name + aliases, or the agent never speaks.
   - The SDK factory binds **automatically** (registry); pass `BindSdk` only to override (e.g. Zoom RTMS).
4. Returns the `ActiveBridgeSession` handle; wire `StopBridgeSession` on teardown.

**De-risking trick:** ship a trivial **stub `IRealtimeSession`** (echo input→output, or play canned PCM)
behind a flag. It validates the *bridge/platform media path* end-to-end before a real model is involved, so
you debug "does audio flow through Teams?" separately from "does the model behave?".

**Where it lives:** `@memberjunction/ai-agents` owns the model lifecycle (per the guide), so the harness
service belongs there or in a thin server module that depends on it + `@memberjunction/ai-bridge-server`.

---

## 2. Microsoft Teams via ACS — the FIRST real two-way build

**Why first:** free **M365 Developer Program** tenant (full E5 sandbox), two-way media supported with **no
special entitlement wait** (unlike Zoom raw-data), and **no Windows/C++** if you use ACS (not the legacy
Graph media bot).

**Approach:** **Azure Communication Services (ACS) Call Automation** + **bidirectional media streaming**.
ACS joins the Teams meeting via Teams interop and streams **PCM in/out over a WebSocket** — language-agnostic,
Node-friendly. This is the real implementation of the `NativeMeetingModule` that `TeamsNativeMeetingSdk`
already expects.

### Build steps

1. **Azure + tenant setup (one-time):**
   - Create a free M365 Developer Program tenant (E5 sandbox).
   - Create an ACS resource; get the connection string + endpoint.
   - Enable Teams interop / grant the Graph + ACS permissions for a bot to join Teams meetings (app
     registration + admin consent in the dev tenant).
2. **Public media endpoint:** a WebSocket server reachable by ACS (ngrok for local). ACS connects here for
   bidirectional media streaming.
3. **Implement `TeamsAcsMeetingModule`** (a new package or `Providers/Teams/native/`), satisfying the
   binding's `NativeMeetingModule` surface (`createClient(options) → NativeMeetingClient`):
   - `join(args)`: ACS Call Automation **Connect/Join** to the Teams meeting join URL; start bidirectional
     media streaming pointed at your WebSocket.
   - **Inbound** (hearing): ACS media-streaming frames (PCM, base64 in a JSON envelope) → `onAudioFrame`
     (map to `NativeAudioFrame`). Teams interop is mixed-audio (no per-participant diarization over ACS) —
     so the diarization label is coarse; use the Call Automation participant events for the roster.
   - **Outbound** (voice): `sendAudioFrame(pcm)` → send an ACS outbound-audio media-streaming message.
   - **Controls:** mute / remove participant / hangup via Call Automation REST.
   - **Lifecycle:** participant-joined/left + `CallDisconnected` from Call Automation event callbacks →
     `onParticipantJoin/Leave`, `onMeetingEnded`.
4. **Reconcile the contract:** adjust `TeamsNativeMeetingSdk`'s expected native shape to ACS's real fields
   (PCM framing, base64 envelope, participant id shape). Keep the seam (`ITeamsMeetingSdk`) stable.
5. **Audio format:** ACS media streaming is **16 kHz mono PCM** (verify against current ACS docs). The
   realtime model may use 16 k or 24 k — **resample** in the module/binding if they differ. This is the most
   common source of "garbled audio" bugs.
6. **Config wiring:** feed ACS connection string + endpoint + the Teams meeting join URL into the bridge
   session `Configuration` (resolved upstream via the MJ credential system — never inline). Set
   `NativeModuleSpecifier` to the ACS module. `readNativeConfig` in the Teams binding picks them up.
7. **Live test:** dev tenant + a test Teams meeting; ngrok; trigger the §1 harness ("agent, join <url>");
   admit the bot from the lobby; talk to it.

### Gotchas
- Bot lands in the **lobby** — auto-admit policy or a human admits it.
- Teams interop **licensing/permissions** in the tenant must be correct (this is the fiddly part).
- **Barge-in / interruption:** when a human talks over the agent, stop outbound audio — wire the realtime
  model's interruption signal to a `sendAudioFrame` flush.
- **Jitter buffering / latency** on the media WebSocket.
- Confirm the current **GA status** of ACS bidirectional media streaming for Teams interop.

---

## 3. Zoom — two tracks

### Track A — RTMS hearing + chat response (cheap, interesting, NO entitlement) — do this in parallel with Teams
The receive-only RTMS binding (`ZoomRtmsMeetingSdk`) already exists. Add an **outbound text** path so the
agent answers in chat — the "listen by voice, respond by text" pattern.

- **Wire the response as an agent tool/Action** (`post_results(text)`), so it stays on the normal
  tool-calling path, not a bridge special-case.
- **Where the text lands:**
  - **Zoom Team Chat (REST API)** — trivial: OAuth scopes, **no bot, no entitlement, no native build**.
    Results post to a channel/DM beside the call. *Do this first.*
  - **In-meeting chat panel** — nicer UX, needs a **Meeting SDK bot participant** (chat does **not** need
    the raw-data entitlement, so it's lighter than two-way audio — but still a C++/Linux Meeting SDK bot).
- Deployment: wire the `meeting.rtms_started` webhook (verify signature) → feed connection params into the
  session `Configuration` → start via the §1 harness with `BindSdk` set to `BindZoomRtms()` for input.

### Track B — full two-way (native Zoom Meeting SDK, gated)
- **Start the Zoom raw-data entitlement request NOW** (raw audio **receive** + **send**/virtual-mic) — it's
  ISV-approved, slow (days–weeks). It gates everything below.
- Build `ZoomNativeMeetingModule` (N-API addon **or** C++ sidecar) over the **Zoom Meeting SDK for Linux**,
  satisfying the `NativeMeetingModule` surface `ZoomNativeMeetingSdk` already expects. Sidecar recommended
  (the C++ SDK has its own threads/event loop/crash modes; isolate it).
- Auth is a Meeting SDK **JWT signature** (SDK Key/Secret), not the RTMS webhook.

---

## 4. Google Meet — receive + chat now, two-way later

- Use the **Meet Media API** (developer preview): real-time media access to a Meet conference (Google Cloud
  project, OAuth, Workspace). Build `GoogleMeetMediaModule` over its reference client, satisfying the
  binding surface.
- **Caveat:** audio **injection** into Meet is the weakest of the majors right now — receive is solid, send
  is limited/preview. Until the send path matures, run the **Zoom-Track-A pattern** here too (hear by voice,
  respond in chat). Re-evaluate two-way as the Meet Media API GA's.
- The Meet **Add-ons SDK** is for in-Meet web add-ons (side panel), **not** a server media bot — don't
  confuse the two.

---

## 5. Slack — messaging only; no voice path today

**Slack huddles have no public media/bot API.** Huddle audio runs on Amazon Chime internally but is not
exposed, so there is **no way to join a huddle as a media bot or inject audio**. The Slack binding is built
as scaffolding, but its live media path is **blocked on Slack**, not on us.

- **Realistic Slack play:** messaging-only — the agent reads/responds in channels/threads via the Slack
  Web API (the asymmetric pattern, but *both* directions are text). Useful, but it's not a bridge/voice use
  case — treat it as a chat surface, not a realtime bridge.
- **Action:** deprioritize Slack for voice. Keep the binding; revisit only if Slack ships a huddle media API.

---

## 6. The CPaaS providers — lightest builds (no entitlements, Node SDKs)

These have **Node** SDKs, so the "native module" is a thin TS adapter (no C++):

- **LiveKit** — best **internal proving ground**. Build `LiveKitNativeModule` over the LiveKit server SDK
  (`@livekit/rtc-node`) / Agents framework. Pair with the **Agents Playground** (prebuilt UI — zero
  frontend) to talk to the agent with no approvals. Use this to validate the whole stack + the §1 harness
  before the gated platforms. NB: LiveKit is its **own** room, not a Zoom/Teams connector.
- **Twilio (telephony)** — `TwilioNativeCallModule` over **Media Streams** (WebSocket PCM). Easiest live
  telephony test: a Twilio number + ngrok. The binding (`TwilioNativeCallSdk`) is ready.
- **Vonage** — Voice API WebSocket media. **RingCentral** — RingCX/Voice media stream. Both Node-friendly;
  bindings ready.

---

## 7. Webex — enterprise, later

Real-time media via the Webex SDK / embedded-apps SDK; enterprise-gated but documented. Build
`WebexMediaModule` over the SDK satisfying the binding surface. Lower priority than Teams/Zoom unless a
customer drives it.

---

## 8. Recommended sequence

1. **§1 harness** + **LiveKit** (`LiveKitNativeModule` + Agents Playground) — prove the talking agent + the
   shared `IRealtimeSession` end-to-end, no approvals. Fast.
2. **Teams via ACS** (§2) — first real meeting platform, free sandbox, two-way, no entitlement wait.
3. **Zoom Track A** (§3) — RTMS hear + Team Chat respond, in parallel; **kick off the raw-data entitlement
   request (Track B) early** so it unblocks later.
4. **Twilio** (§6) — easy live telephony proof.
5. **Google Meet** (§4, receive+chat), **Webex** (§7), **Vonage/RingCentral** — as demand dictates.
6. **Slack** — messaging-only; not a voice target.

## 9. Per-provider recipe (the repeatable checklist)

1. Implement the real native module satisfying the binding's `NativeMeetingModule` / `NativeCallModule`.
2. Reconcile the structural contract with the real SDK (tweak the binding's expected native shape; keep the
   seam stable).
3. Wire credentials/config into session `Configuration` (upstream-resolved); set `NativeModuleSpecifier`.
4. Reuse the §1 harness; supply a `TurnMatcher`.
5. Flip the provider's `MJ: AI Bridge Providers` row to `Active` (most already are) and live-test.
