# Realtime video: build status

**As of:** 2026-10-09.

What the realtime video work has built, what has been checked against real services, and what has not. The design is the build plan "Video in realtime: agent avatars, webcam self-view, screen share, and a shared media stack" (`plans/realtime/video-avatar-and-screen-share.md`, on its own branch). How to add a video-capable provider is §12 of the [Real-Time Co-Agents Guide](../../guides/REALTIME_CO_AGENTS_GUIDE.md#12-adding-a-video-capable-realtime-provider).

## Built

### The shared media stack and user video in

The first part of the work, grouped by area:

| Area | What is built |
|---|---|
| `@memberjunction/ai-realtime-client/media` | A driver-free entry point with a boundary test: the media model types; `LocalMediaController` (camera and microphone, device switching); display capture, including one panel of the page through Element or Region Capture; `FrameSampler` at the negotiated rate with no built-in ceiling; one audio meter for the call and the meeting room; `AttachVideoSource`; `VideoSourceArbiter`, the single writer of inbound video, which tells the model what it sees; the headless media stage and saved layouts; `MediaPreview` for lobbies |
| Contracts | MIME-routed model output in both Gemini parsers (unknown data never plays as audio); `SendInput` honours each frame's kind; `OnRemoteVideo` hands over a `MediaVideoSource`; `AddTrack` / `RemoveTrack` mid-session; the persona JSON types for avatars (`IAIPersonaVendorSettings.Avatar`, `Visual`) |
| `@memberjunction/ng-realtime-media` | The provider-neutral media widgets: tile, stage with picture-in-picture and "Move to…", self-view, share preview, controls with a split Share button, camera check, device menu, move menu; the user's layout saved per user |
| The realtime call | Camera and screen captures on the arbiter; the Camera and Screen Share channels (opened by the agent's ask, started only by the user); channel placement from `UIConfig`; the Avatar channel, which shows the agent's video on the stage; the stall fallback to the orb; the "AI-generated video" label; captions over the video; the "Agent can see" chip and the user's pick of what the agent sees |
| The meeting room | Rendered through `ng-realtime-media` and the shared stage, with mirroring, the share picker and movable tiles; each person's consent for agent vision, recorded by MJAPI |

### The avatar series and the audit fixes

In the order the stack builds them, one change per row:

| Change | What it built |
|---|---|
| An agent watches a meeting | The bot reads the camera or shared screen of people who allow it, one source at a time, at the model's rate, as JPEG; the model is told when a source it saw ends |
| Extended Thinking counts video into its turns | Gemini 3.8 Live Extended Thinking's catalog rows ask for all video in each turn, as Gemini 3.8 Live's do |
| The bot encodes meeting video on its own thread | Frame encoding moved off the thread that hosts the room |
| Live profiles know the endpoint | Gemini Live profiles resolve per endpoint (Developer API or Gemini Enterprise), with what each model renders there |
| The driver asks for an avatar where the endpoint renders one | `RealtimeSessionParams.Avatar`; the Gemini driver grants it on Gemini Enterprise's `gemini-3.8-live` and otherwise runs audio only with one log line and a reason |
| The avatar comes from the persona | A session asks for an avatar when the voiced agent's video setting is on and a persona Video binding resolves |
| The browser client plays the avatar | `VideoPlayout` (Media Source Extensions) in the Gemini client; the voice rule; barge-in, turn ends and resumes applied to the video |
| MJAPI's realtime relay | A ticketed websocket at `/realtime/relay/<ticket>/…` with a provider frame policy between the browser and the provider |
| The Gemini relay policy | The server writes the Live setup; the browser can't change the agent mid-session |
| Gemini Enterprise drivers | `GeminiEnterpriseRealtime` (server, relay mint, Vertex credentials) and `'gemini-enterprise'` (browser) |
| Gemini Enterprise catalog rows | The Vertex AI model-vendor row, the example avatar persona "Ben" (Google's "Ben" preset with the Puck voice), the avatar video price |
| Avatar usage | Generated video seconds in usage, and the avatar's video priced on its own cost line |
| The picker marks avatars | The voice picker lists one voice per persona and marks those that come with a face |
| The avatar notice | A call that can't show its agent's avatar says so once, with the reason |
| The mobile notice | The mobile voice screen shows the same notice |
| Server-side usage | Bridged sessions (meetings, phone calls) store their usage, as browser calls do |
| The bot publishes the avatar | The meeting bot decodes the avatar with ffmpeg and shows it on an `agent-avatar` camera track, timed to the voice |
| The room shows the avatar | The meeting room maps that track to the agent's tile, and shows a notice when the avatar can't be shown |
| One stream to the model in meetings | The bot ranks the sources people allow, shows the model one, and tells it when that changes |
| Avatar settings without a rebuild | `MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS`, `MJ_GEMINI_LIVE_MODEL_ALIASES`, `liveHost` and `liveApiVersion` in the Vertex key, a Google Cloud API key for Gemini Live on Vertex AI, MP4 recognized by its boxes |
| The self-view's Hide is saved | The meeting room saves the user's self-view Hide per user |
| The last frame across a resume | The call keeps the agent's video in place, with its last frame, while the session resumes |
| Bridge frames carry size and key frame | `BridgeMediaFrame.Width`, `Height` and `KeyFrame` |
| The relay transport on the session config | `ClientRealtimeSessionConfig.Transport` and `RelayUrl`; drivers refuse a transport they don't speak |
| The bot's only video out is the avatar | The native room client's publish no-ops removed |
| The modalities gate and the video preference | A model shows an avatar only when its Video/Output row and its endpoint allow it; a co-agent with video on prefers such a model |
| "This panel" in the call | The call's Share menu shares one panel of the page (`mjSharePanel`) |
| "This panel" in the meeting room | The room's screen share goes through `/media` display capture and offers the same menu |
| Typed video frames | `RealtimeVideoFrame` (fMP4, encoded chunk, image) and `IRealtimeSession.OnVideoFrame` |
| The decoder registry | `VideoPlayout` plays chunks (WebCodecs) and images as well as fMP4 |
| The playback clock | Chunk and image video follows the voice's playback clock |
| The conformance kit | `@memberjunction/ai-realtime-client/testing`, run against Gemini (both endpoints), OpenAI and a synthetic raw-frame provider; the driver audit |
| Vertex turn coverage | Gemini Enterprise is sent only the turn coverage it accepts (`audioActivityOnly`) |
| Docs | The guide's §12, the package READMEs, and this page |

## Checked against real services

### Gemini Enterprise (Vertex AI), 2026-10-09

**First, with standalone scripts** (a service-account key for a Google Cloud project, location `us-central1`):

- **Credentials and connection.** The token was minted and the Live socket opened.
- **Turn coverage.** Vertex AI closed the setup with 1007 "Invalid value at 'setup.realtime_input_config.turn_coverage'" for `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`, on both `v1` and `v1beta1`. The driver now sends only `audioActivityOnly` (`TURN_INCLUDES_ONLY_ACTIVITY`) on Gemini Enterprise.
- **Audio.** With `TURN_INCLUDES_ONLY_ACTIVITY`, an audio-only setup completed and the model answered.
- **The avatar.** A session with the "Ben" preset, the Puck voice and `videoBitrateBps` 2,000,000 streamed 201 `video/mp4` parts (1.25 MB); the first came after 3.1 s.
- **Usage.** Three avatar turns on one connection: `usageMetadata` is reported per turn, not as running totals, so MJ's adding of each report is right. Turn 1: prompt 28, response 19,678 (VIDEO 19,608, AUDIO 61, TEXT 9). Turn 2: prompt 104, response 24,862. Turn 3: prompt 204, response 20,719. A short avatar reply is about 20,000 to 25,000 response tokens, nearly all VIDEO.
- **The key.** A `keyFilePath` must be absolute (MJ doesn't expand `~`). The location must be one where Google documents Gemini 3.8 Live (`us-central1`, `us` or `eu`): the key check refused `global`, and the live checks used `us-central1`.

**Then through MJAPI's relay and a browser** (Chrome):

- **The avatar across resumptions.** One avatar call held across 4 moves to a new connection in a row: Vertex AI's own `goAway`, a planned move between turns, a planned move just after a question, and a dropped socket. Vertex AI accepted every resume, and `setupComplete` came 0.37 to 0.53 s after each move. In 6,342 samples of the video, none was black, and the call kept one video element, `MediaSource` and `SourceBuffer` throughout. At each move the last frame held for about 3 s: new video came about 2.5 s after `setupComplete`. The call's avatar tile gives way to the orb after 1 s without a frame (`AGENT_VIDEO_STALL_MS`), so by this timing the orb shows for about 2 s at each move.
- **When Vertex AI moves a connection.** It sent `goAway` about 540 s (about 9 minutes) after a connection opened, with 30 s left on the connection.
- **A 10-minute call.** A 10.6-minute avatar call answered 15 of its 16 questions; one was lost at a move to a new connection (a bug, tracked separately). The usage stored on the call's co-agent prompt run matched what the browser relayed: 617.79 s of avatar video, priced in its cost lines at $0.0731 for tokens and $3.8254 for the avatar video (at the seeded $0.37152 per minute).
- **A meeting.** On hosted LiveKit, MJAPI's bot published the agent's avatar, and a headless participant received it at 704x1280 and 23.9 fps for 149 s, with no gap over 1 s. The agent answered about 2 s after each spoken question.

### Other checks

- **Gemini Developer API, 2026-10-08.** `gemini-3.8-live` refuses `avatarName` and `customizedAvatar`, and returns audio when asked for VIDEO. So Developer API sessions run audio only, with reason `endpoint`.
- **The relay with the Gemini policy.** `@google/genai`'s web build in Vertex mode, through the relay to Google's Developer endpoint: 11 of 11 checks passed. Google's Developer Live endpoint answered 7 of 7 websocket pings on an idle session (28 to 42 ms).
- **A meeting with video in.** A LiveKit Cloud room and Gemini 3.8 Live (Developer API) through MJAPI: an agent watching a synthetic camera described a change asked about at 140 s, so a bridged session with inbound video outlives Google's 2-minute limit for audio plus video.
- **The bot reading video.** Against LiveKit Cloud, watching a 1080p screen with frames encoded on the encode worker kept MJAPI's main-loop delay p99 at 11.8 ms, against 47.2 ms encoding in-process.
- **The bot's source switch.** Against LiveKit Cloud with synthetic cameras: a new speaker's camera showed 2.43 s after they started talking (the 1.5 s onset included).
- **The avatar bot's lip sync.** With ffmpeg 9.0.2 on a recorded fixture, no LiveKit server: each flash showed 0 to 9.3 ms after its beep reached the voice's playout.
- **Playout in Chrome** (headless, through Playwright): MSE, WebCodecs (H.264, VP8) and images played; MSE reopened across turns on one source buffer, including an init sent as `moov` alone; with the playback clock, each frame showed 0 to 19 ms after the voice reached it.
- **Panel capture in Chrome 151:** Element Capture left out a box drawn over the panel; Region Capture included it.

## Not checked yet

- **A move to a new connection in the middle of an answer** (a `goAway` while the agent speaks).
- **Meetings longer than 15 minutes.**
- **Barge-in, lip sync and tool calls during an avatar call through the relay:** the runs above report answers, moves, usage and video delivery, not these.
- **What Google bills,** against what MJ charges: the avatar's video by the second, at $0.37152 per minute (seeded from $1.00 per 1M avatar video tokens at 6,192 tokens per second), and Vertex AI's token prices.
- **Binary relay frames.** The tests send Google's frames to the browser as text; binary frames, which the web SDK reads asynchronously, are untested.
- **Browsers other than Chrome:** Firefox, desktop Safari and iOS Safari for playout; Edge and Chromium 104 to 131 for panel capture.
- **The other voices seeded for Vertex AI** (Charon, Kore, Fenrir, Aoede); the scripted check used Puck, Ben's voice.
