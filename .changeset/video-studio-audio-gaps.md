---
"@memberjunction/core": minor
"@memberjunction/video-studio-core": minor
"@memberjunction/video-studio": minor
"@memberjunction/video-studio-render-worker": minor
---

Video Studio audio and timing: the render worker now builds the soundtrack from a mix plan (music ducked about -7.5 dB under every narration line, honoring `MusicDuck`/`MusicSwell` cues), normalizes loudness with two-pass `loudnorm` (-14 LUFS, -1.5 dBTP, LRA 11, configurable), and runs deterministic audio checks before the critic (loudness, true peak, clipping, narration-to-music ratio, unexplained pauses inside a narration line, missing audio). Adds opt-in procedural audio (synthesized Whoosh/Click/Tick/Impact/Chime/Riser effects and a synthesized music bed, disclosed as synthesized), brand-kit pronunciation rules plus built-in defaults (`A.I.` → `AI`) applied before TTS with captions unchanged, word-anchored composition timing via `mj/narration-cues.js` and `window.mjCue`, per-line `PauseBeforeSeconds`/`PauseAfterSeconds`, and configurable parallel HyperFrames capture workers (`videoStudio.render.workers`, `VIDEO_STUDIO_RENDER_WORKERS`).
