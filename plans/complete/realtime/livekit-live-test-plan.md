# LiveKit Two-Way Agent — Live Test Plan

The LiveKit bridge is **code-complete** for two-way audio (agent + people talking in one room). Everything
below is **runtime setup + verification** — no more code is required for the happy path. Work top-to-bottom;
each tier builds on the last so a failure localizes itself.

## 0. What's wired (so you know what you're testing)

```
human ⇄ mj-livekit-room (Explorer tab)  ─┐
                                          ├─► LiveKit room (SFU)
agent  ⇄ LiveKitBridge ⇄ AIBridgeEngine ─┘        ▲
          │ SetSdkFactory(BindLiveKitNative())     │ @livekit/rtc-node
          │ NativeModuleSpecifier → ai-bridge-livekit-native ─┘
          │
   IRealtimeSession  ◄── CreateBridgeRealtimeSession (resolves agent → realtime model → StartSession)
                          bound onto LiveKitAgentRoomCoordinator by RealtimeBridgeResolver
```

Entry point: the **`StartLiveKitAgentRoomSession`** GraphQL mutation (`RealtimeBridgeResolver`) — starts the
agent bot in a room AND returns a client token so you can join the same room.

## 1. Prerequisites

- [ ] **LiveKit server** — LiveKit Cloud free tier (fastest) or self-hosted. Get the **ws URL**, **API key**,
      **API secret**.
- [ ] **Env on the MJAPI host:**
  - `LIVEKIT_URL` (e.g. `wss://your-proj.livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
  - (optional) `LIVEKIT_NATIVE_MODULE` — only to override the default native client (see Tier 4 / Gemini).
- [ ] **Native room client on the agent host:** `npm install @livekit/rtc-node` (a native addon, Node ≥ 18).
      The default `NativeModuleSpecifier` (`@memberjunction/ai-bridge-livekit-native`) loads it.
- [ ] **An Active `Realtime` AI model** in metadata with a vendor whose `DriverClass` has a resolvable API
      key (xAI Grok Voice / Gemini Live / Inworld). Confirm `GetAIAPIKey(driverClass)` resolves on the host.
- [ ] **The `MJ: AI Bridge Providers` row for `LiveKitBridge` is `Active`** (it is, by seed).

## 2. Tier 1 — unit layer (no server; sanity)

```bash
cd packages/AI/RealtimeBridge/Providers/LiveKitNative && npm run test     # 14 — native room client vs fake rtc-node
cd packages/AI/Agents && npx vitest run bridge-realtime-session-factory   # 7  — the factory
cd packages/LiveKitRoomServer && npm run test                             # 16 — coordinator (incl. NativeModuleSpecifier)
```
All green = the wiring is internally consistent before you touch a real server.

## 3. Tier 2 — human↔human (proves LiveKit + token minting, already shippable)

1. Start MJAPI + MJExplorer with the LiveKit env set.
2. Open the **LiveKit room** Explorer tab (`mj-livekit-room`), join a room from **two** browser tabs.
3. Confirm: both see each other, audio works, chat works, roster updates.

✅ This isolates "is LiveKit + my creds + the UI healthy?" from anything agent-related.

## 4. Tier 3 — the agent talks (the headline test)

1. Trigger **`StartLiveKitAgentRoomSession`** (GraphQL) with `{ AgentID, RoomName }` (or `AgentName`). It
   returns a `ClientToken` + `RoomName` + `ServerUrl`.
2. Join that **same room** as a human via the `mj-livekit-room` tab (use the returned token, or mint one
   with `MintLiveKitClientToken`).
3. **Speak to the agent by name** (e.g. "Hey Sage, …" — Passive turn-taking only responds when addressed via
   the `TurnMatcher` built from the agent name/aliases). Confirm:
   - [ ] the **agent bot appears** in the participant roster,
   - [ ] you **hear the agent answer back** in the room,
   - [ ] the agent **hears you** (its replies are relevant to what you said).

## 5. If something's off — localize fast

| Symptom | Likely cause | Fix |
|---|---|---|
| `StartLiveKitAgentRoomSession` errors "no realtime-session factory bound" | resolver module not loaded | ensure MJAPI built the schema (the binding is a module-load side effect in `RealtimeBridgeResolver`) |
| Errors "No usable Realtime model resolved" | no Active `Realtime` model / vendor / API key | add/activate a Realtime model + vendor with a resolvable key |
| Errors "load the native LiveKit module" / "could not load '@livekit/rtc-node'" | addon not installed on agent host | `npm install @livekit/rtc-node` there |
| Bot joins, **silent both ways** | token/room mismatch, or model not emitting | check the bot + human are in the SAME room; confirm the model streams audio (try a known-good model) |
| **Audio is chipmunk / garbled** | **sample-rate mismatch** (NOT a logic bug) | default is 24 kHz; for **Gemini Live** set `LIVEKIT_NATIVE_MODULE` to a one-liner `export default CreateLiveKitRtcNodeModule({ InboundSampleRate: 16000 })` |
| Agent never speaks though it hears | Passive turn-taking not addressed | say the agent's **name**, or start the session with `TurnMode: 'Active'` |

## 6. De-risk trick (separate media from model)

If Tier 3 misbehaves and you can't tell whether it's the **media path** or the **model**: temporarily bind a
**stub `IRealtimeSession`** (echo `SendInput` → `OnOutput`, or play canned PCM) via
`LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(async () => stubSession)`. If you then hear the echo
in the room, the LiveKit media path is good and the issue is the model session — debug them one at a time.

## 7. What this unblocks

The realtime-session factory (`CreateBridgeRealtimeSession`) and the `NativeModuleSpecifier` pattern are
**generic**. Teams (ACS) and Zoom reuse the **same** factory — they only need their own native media client
+ a `StartBridgeSession` harness call. So a green LiveKit live test de-risks the entire bridge program.
