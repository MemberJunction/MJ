# Voice Channel Demo — Sage on `voice-cascaded`

Three demo paths against the same agent + channel binding:

- **Quickstart (recommended): MJExplorer** — talk to Sage from inside Explorer with normal MSAL auth. No tokens to paste, no static HTML page. Uses the canonical `<mj-voice-widget>` from `@memberjunction/ng-voice-widget`.
- **Quickstart: standalone HTML page** — type to Sage from `voice-demo.html`, hear Sage reply. Bearer/API-key auth via the form. Use this if you don't want to bring Explorer up.
- **Full cascaded voice (mic input)** — browser mic → LiveKit WebRTC → Deepgram STT → Sage → ElevenLabs TTS → browser speakers. Needs LiveKit + Deepgram + ElevenLabs.

Pick the one that matches what you want to demo.

---

## Quickstart (recommended): MJExplorer

This is the canonical surface — the `<mj-voice-widget>` from `@memberjunction/ng-voice-widget` rendered inside Explorer's tab system. You log in normally (MSAL / Auth0 — whatever your env uses), pick the **Voice Channels** app from the launcher, and you're talking to Sage.

**What you need**
- `AI_VENDOR_API_Key__Eleven_Labs` in MJAPI's `.env` (already present on this branch's standard dev setup), OR the equivalent `AIVendorAPIKey` row in the database.
- The agent-channel-config row that binds Sage → `voice-cascaded` (see Section 3 below — same setup as the full voice path).
- The "Voice Channels" application metadata pushed: `npx mj sync push --dir=metadata --include="applications"`. This creates the Voice Channels app with a single "Voice Demo" nav item bound to the `VoiceDemoResource` driver class.

**Run it**

1. Push the application metadata once: `npx mj sync push --dir=metadata --include="applications"` (from repo root).
2. Start MJAPI: `cd packages/MJAPI && npm run start` (port 4001 in dev).
3. Start MJExplorer: `cd packages/MJExplorer && npm run start` (port 4201 in dev).
4. Open `http://localhost:4201`, sign in.
5. From the app launcher, open **Voice Channels**. The "Voice Demo" tab is the default.
6. Click **Start** (this is the user gesture that unlocks the AudioContext under browser autoplay policy), type a message, press Enter. You should hear Sage's response within a second or two.

The widget reuses the same authenticated GraphQL channel (`GraphQLDataProvider`) Explorer uses for everything else — no separate WebSocket, no separate auth flow.

---

## Quickstart: standalone HTML page (no Explorer)

This is the fastest path. You type into the demo page; the agent's text reply is synthesized by ElevenLabs and streamed back to the browser as PCM audio.

**What you need**
- `AI_VENDOR_API_Key__Eleven_Labs` in MJAPI's `.env` (already present on this branch's standard dev setup), OR the equivalent `AIVendorAPIKey` row in the database.
- An `MJ_SYSTEM_API_KEY` (or a Bearer JWT) to authenticate the demo page's GraphQL calls.
- The agent-channel-config row that binds Sage → `voice-cascaded` (see Section 3 below — same setup as the full voice path).

**What's bypassed**
- No LiveKit, no Deepgram, no microphone capture, no WebRTC. The page sends user text via the `SubmitChannelTextTurn` mutation and receives base64-encoded PCM audio frames over the `ChannelAudioOut` GraphQL subscription.
- The server picks `TextInputAudioOutputTransport` automatically when `StartChannelSession` is called without a `RoomName`.

**Run it**

1. Start MJAPI (`cd packages/MJAPI && npm run start`).
2. Open `http://localhost:4001/voice-demo.html` (MJServer now serves `packages/MJServer/public/` statically — see [`src/index.ts`](../../MJServer/src/index.ts) where `express.static` is wired before the auth middleware so the page loads without a token).
3. Paste your `MJ_SYSTEM_API_KEY` (or Bearer token), type a message, press Enter. You should hear Sage's response within a second or two.

If you only want to demo voice output, stop here — the rest of this doc covers the full mic-input path.

---

## Full cascaded voice (mic input)

This is the original cascaded pipeline: **browser mic → LiveKit → Deepgram STT → Sage (BaseAgent) → ElevenLabs TTS → LiveKit → browser speakers**.

### 1. Prerequisites — third-party accounts

Three external services. Free tiers are sufficient for the demo.

### LiveKit Cloud (WebRTC transport)
1. Sign up at https://livekit.io.
2. Create a project. The dashboard exposes three values:
   - **API Key** (looks like `APIxxxxxxxxxxxx`)
   - **API Secret** (long base64-ish string)
   - **WS URL** (e.g. `wss://your-project.livekit.cloud`)

### Deepgram (streaming STT)
1. Sign up at https://deepgram.com.
2. Console → API Keys → create a key. One key per environment is fine.

### ElevenLabs (streaming TTS)
1. Sign up at https://elevenlabs.io.
2. Profile → API key.
3. Flash v2.5 is on the free tier, but credit usage is metered — keep an eye on quota.

---

## 2. Environment variables

Set these in MJAPI's `.env` (or in your shell before `npm run start`):

```bash
# LiveKit (WebRTC transport — required for voice channels)
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=<your-secret>
LIVEKIT_SERVER_URL=wss://your-project.livekit.cloud

# STT / TTS provider keys
DEEPGRAM_API_KEY=<deepgram-key>
ELEVENLABS_API_KEY=<elevenlabs-key>
```

**Note on credential storage.** MJ's preferred place for provider API keys is `AIModel.APIKey` / `AIVendorAPIKey` in the database. The driver classes (`DeepgramAudioGenerator`, `ElevenLabsAudioGenerator`) read from there first and fall back to env vars for dev convenience. Set both during the demo so you don't have to guess which path is firing — once it works, you can remove the env-var fallback.

LiveKit credentials are env-only today (see `ChannelSessionResolver.readLiveKitConfig` — adding a `liveKit` block to `mj.config.cjs` is a small follow-up).

---

## 3. One-time setup

Assumes migrations have already been applied and CodeGen has run on this branch (which is the case for `claude/voice-agents-integration-5T8cA`).

```bash
# Push the agent-channel-config row that binds Sage → voice-cascaded.
# This row sets ConfigJSON to point at Deepgram Nova-3 + ElevenLabs Flash v2.5.
npx mj sync push --dir=metadata --include="agent-channel-configs"

# Build everything (or at minimum: MJServer + MJAPI + AgentChannelRuntime).
npm run build
```

The bound config lives at `metadata/agent-channel-configs/.agent-channel-configs.json` — edit it if you want a different agent, different STT/TTS models, or a different voice profile.

---

## 4. Run it

```bash
# Start MJAPI in the foreground (or as a background task).
cd packages/MJAPI && npm run start
```

MJAPI listens on the port set by `GRAPHQL_PORT` in `packages/MJAPI/.env` (default in this branch: **4001**).

**Static-file serving for the demo page.** MJAPI now serves `packages/MJServer/public/` statically (see `express.static` in `MJServer/src/index.ts`), so just open `http://localhost:4001/voice-demo.html`. The current `voice-demo.html` is the text-in / voice-out page — for the full mic-input flow you'd swap in or fork a LiveKit-using page.

In the page:
1. Confirm **MJAPI GraphQL URL** matches your server (default `http://localhost:4001/`).
2. Paste an **MJ API Key** (`MJ_SYSTEM_API_KEY` from your `.env`) or a Bearer token. The page auto-detects: strings starting with `eyJ` are sent as `Authorization: Bearer …`, anything else as `x-mj-api-key`.
3. The Sage agent ID is pre-filled.
4. Click **Start Conversation**. The browser will prompt for mic permission. Speak.

To end: click **Stop**, or close the tab (the page calls `EndChannelSession` via `sendBeacon`).

---

## 5. Known limitations

These are documented in the plan and tracked for follow-up — they don't block the demo, but they shape what you'll see/hear:

- **SileroVAD is a skeleton.** The bound config uses `EnergyVAD` instead. Energy-based VAD is functional but coarse; noisy environments will produce false endpoints.
- **TTS receives the full agent response after `BaseAgent.Execute()` returns**, not token-streamed. So time-to-first-audio is bounded by the LLM's full response time, not its first token. Token-level streaming requires plumbing `onStreaming` through `AIPromptRunner` (Phase 1.5).
- **Filler-word timer is per-turn, not per-tool-call.** If Sage calls a slow tool mid-turn the user won't hear "checking now" until the next turn boundary.
- **`WebRTCTransport.SendControlEvent` is a no-op.** Out-of-band control signals (e.g., barge-in interrupts via data channel) aren't wired yet; barge-in relies on VAD-driven turn detection on the agent side.
- **Transcripts are not pushed to the client yet.** The demo page has a transcript area but it only fills if you wire a GraphQL subscription or LiveKit `DataReceived` message — neither is sent server-side today.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `LiveKit is not configured` from the server | env vars missing | Set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_SERVER_URL` and restart MJAPI |
| `No engine registered for DriverClass='CascadedChannelEngine'` | `@memberjunction/ai-agent-channel-runtime` not loaded by MJAPI | Confirm it's in MJServer's `dependencies` and that `npm run build` succeeded |
| Token mutation 401 | wrong/expired auth | Refresh the bearer token or check `MJ_SYSTEM_API_KEY` matches `.env` |
| Room connects but no agent audio | server-side run failed before publishing | Tail MJAPI logs for `[ChannelSession]` / `[CascadedChannelEngine]` errors — usually a Deepgram/ElevenLabs auth issue |
| `WebSocket connect failed` to LiveKit | `LIVEKIT_SERVER_URL` missing `wss://` prefix | Use the full `wss://your-project.livekit.cloud` URL, not the dashboard hostname |
| Mic permission denied | browser blocked the page | Use `http://` or `https://`, not `file://`, on Chrome 119+ |
| `AI Agent Channel Config ... is not Active` | metadata push failed or status got flipped | Re-run `npx mj sync push --dir=metadata --include="agent-channel-configs"` |

---

## 7. What's in the binding

The row pushed by `metadata/agent-channel-configs/.agent-channel-configs.json` shapes the runtime:

```json
{
  "Kind": "voice-cascaded",
  "STT":          { "AIModelID": "<Deepgram Nova-3>",    "LanguageCode": "en-US", "Partials": true },
  "TTS":          { "AIModelID": "<ElevenLabs Flash v2.5>", "FirstChunkBudgetMs": 150 },
  "VAD":          { "DriverClass": "EnergyVAD", "Sensitivity": 0.5 },
  "TurnDetector": { "DriverClass": "SilenceTurnDetector" },
  "LatencyBudgetMs": 900,
  "BargeIn": true,
  "FillerPolicy": { "ThresholdMs": 500, "Phrases": ["one moment", "let me look that up", "checking now"] }
}
```

Edit and re-push to swap models, change the latency budget, or tune VAD sensitivity. `AIVoiceProfileID` is left null — the runtime will fall back to the TTS provider's default voice.
