---
"@memberjunction/integration-test-suite": patch
---

`realtime-deterministic.RD13` and `RD18` turn avatar video on the way a deployment does: through the voiced agent's own `TypeConfiguration`, on a tagged fixture agent each check creates and deletes, since the runtime override can no longer turn `realtime.video.enabled` on. RD13 also checks the new rule: with the agent's setting off, an override of `enabled: true` asks for no avatar, and one that also picks the avatar says why (`video-off`).
