---
"@memberjunction/ai-realtime-client": patch
---

Adds `VideoPlayout` to `@memberjunction/ai-realtime-client/media`: it plays fragmented MP4 that arrives in pieces, such as a Gemini Live avatar, through Media Source Extensions (`ManagedMediaSource` on iOS Safari). Its `Source` is an element `MediaVideoSource` for `AttachVideoSource`; the element is not muted because the avatar's voice is in the video. `EndOfTurn` lets a turn play to its true end, `Flush` stops the voice at once for a barge-in, the next turn resumes where playback stopped, played media is trimmed so long sessions stay within the browser's buffer, and `IsPlaying` says whether the agent is audibly speaking.
