---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-artifacts": patch
---

Show all distinct artifacts on a conversation message instead of only the most recently created one — a message that carries both a report and a standalone generated image now renders a card for each. Multiple versions of the same artifact still collapse to the latest. Also halves the inline image/video preview height (280px → 140px) so thumbnails don't dominate the message.
