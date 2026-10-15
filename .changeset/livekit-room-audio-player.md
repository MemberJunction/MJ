---
"@memberjunction/livekit-room-server": patch
---

Adds `RoomAudioPlayer`, a server-side primitive that joins a LiveKit room as a publish-only bot and plays hold music into it.

- **Sources:** an `MJ: Files` row, an https URL (SSRF-safe fetch, 20 s timeout, 25 MB cap; http is refused), caller PCM, or a built-in procedurally generated comfort tone.
- **Formats:** WAV (integer PCM 8/16/24/32-bit, float 32/64-bit, any channel count, downmixed) and MP3 (via the WebAssembly `mpg123-decoder`), up to 15 minutes. Other formats are refused by name.
- **Playback:** resampled to 48 kHz and paced in 20 ms frames about 150 ms ahead of real time, so the native client's queue stays bounded. Supports loop, pause/resume, and `Announce`, which ducks the music under a clip.
- **Lifecycle:** a registry (`GetActive`, `StopAllInRoom`). A playback stops itself when the server drops its bot, and a verified `room_finished` webhook stops a room's playbacks.
- **Text announcements** go through the `IRoomSpeechSynthesizer` port. No synthesizer is installed by default; a host opts in with `SetSpeechSynthesizer(new MJRoomSpeechSynthesizer({ Voice }))`, which uses `AITextToSpeechRunner`.
- **Native module specifier:** the agent coordinator and the player now resolve it through one shared function, `ResolveLiveKitNativeModuleSpecifier`. The coordinator's behavior is unchanged.
- **New dependencies:** `@memberjunction/storage`, `@memberjunction/network-utils`, `@memberjunction/ai-prompts` and `mpg123-decoder`.
