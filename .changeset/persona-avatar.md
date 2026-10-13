---
"@memberjunction/ai-agents": patch
---

A realtime session now asks for a live avatar when the voiced agent's video setting is on (`realtime.video.enabled`) and a face resolves: `realtime.video.avatarId` when it names a Video persona binding the model supports on the vendor, else the voiced agent's persona (its default first), else the co-agent's. The model's own first persona is never used, so an agent with no persona gets no face. The avatar persona's voice on the same vendor becomes the session's voice, unless a voice was picked in this call. The session params carry the request (`Avatar`), and the mint log names the avatar or the reason there is none. Whether the session can render it is the driver's call; on the Gemini Developer API it stays audio. New: `ResolveRealtimeAvatar`.
