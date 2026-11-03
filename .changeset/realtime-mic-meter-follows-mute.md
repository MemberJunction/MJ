---
"@memberjunction/ai-realtime-client": patch
---

Realtime mic meter follows the mic mute: the meter reads a clone of each mic track, so it now copies each mic track's enabled flag onto its clone and reads silence while the mic is muted. A meter built while muted (mic replaced during mute) resumes after unmute.
