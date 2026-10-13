---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/mobile-app": patch
---

A picked voice's avatar now shows only when the voiced agent's own video setting is on, so a pick no longer turns on billed avatar video by itself. The runtime override can't turn `realtime.video.enabled` on in `ResolveEffectiveRealtimeConfig` (it can still turn it off), and both override builders (`BuildRealtimeOverridesJson`, `BuildRealtimeConfigOverridesJson`) send the pick as `realtime.video.avatarId` alone. A call that picked an avatar while the setting is off is audio only with the new reason `video-off` (`RealtimeAvatarUnavailableReason`, `ResolveRealtimeAvatar`'s `AvatarPicked`), which stands whatever the model renders; the call and mobile notices say "Audio only: this agent's avatar isn't turned on". An older client reads the reason as unknown and says "Audio only: the avatar can't be shown in this call".
