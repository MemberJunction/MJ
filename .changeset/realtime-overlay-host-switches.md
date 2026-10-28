---
"@memberjunction/ng-conversations": patch
---

Realtime overlay: every host switch now reaches its control. New `AllowTyping` input (also implied by `AllowTextReveal=false`) removes every road to the typed composer; `ShowEnd`, `ShowCaptionsControl` and `ShowDevLinks` are honoured by the composer, banner, thread, surface tabs and focus pill; captions over the agent's video and the narration line respect `AllowTextReveal`; a forced console with no text allowed shows the orb. `AutoHideControls` is a deprecated no-op. Dead resolver outputs `showComposer`, `connecting`, `autoHideControls` are removed and a test now fails if a resolved output is never read. Fixes #6101.
