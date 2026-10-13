---
"@memberjunction/ai": patch
"@memberjunction/ai-gemini": patch
---

A realtime session can ask for a live avatar: `RealtimeSessionParams.Avatar` (`RealtimeAvatarSettings`, with the same tuning names as a persona's avatar settings). The Gemini driver renders it only where the model and endpoint can (Gemini Enterprise with `gemini-3.8-live`): video output, the avatar's name, and a 2 Mbps video bitrate, and the minted session config then carries an `avatar` block (encoding, and whether the video carries the voice). Anywhere else the session stays audio-only and logs one line with the reason (`RealtimeAvatarUnavailableReason`): the Developer API, a server-side (bridged) session, a custom avatar, or no avatar id. A VIDEO modality or `avatarConfig` from the config bag is removed. `GeminiRealtime` gains two protected extension points for the Enterprise driver: `Endpoint` and `BuildConnectConfig`. Nothing sets an avatar request yet.
