---
"@memberjunction/ai-realtime-client": patch
---

Adds `MediaVideoSource` and `AttachVideoSource` to `@memberjunction/ai-realtime-client/media`. A video source is either a live `MediaStream` (shown muted and inline: its audio plays elsewhere) or a player that owns the `<video>` element itself, such as avatar playout. `AttachVideoSource` shows either in an element and returns a detach function that never stops the source's tracks and leaves the element alone once another source has taken it.
