---
"@memberjunction/ai-agents": patch
---

Vertex AI now takes a Gemini 3.8 Live co-agent session only when the session will show an avatar (the video setting is on and the session can show one), or when it is the only keyed vendor. `RealtimeClientSessionService.resolveVendorAndInstantiate` takes a `showsAvatar` flag, threaded from `resolveModelForSession` through the runtime pick, the configured `modelPreference` and the default walk: when the highest-Priority keyed vendor renders avatars and the session won't show one, another keyed vendor that renders none is taken (the Gemini Developer API), and the other way round. Audio-only calls, phone calls and apps without agent video so stay off Vertex AI's relay cap and activity-only turn coverage when the Google key is set. The agent-run path (`BaseAgent.executeRealtimeSession`) still takes the highest-Priority keyed vendor.
