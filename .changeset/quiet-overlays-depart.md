---
"@memberjunction/ng-conversations": patch
---

Remove the dead RealtimeCallOverlayComponent — the pre-progressive-console call overlay deleted in Realtime wave 2 was silently resurrected by the voice→realtime rename merge (rename-vs-delete); nothing instantiates it, no ClassFactory registration, no manifest impact.
