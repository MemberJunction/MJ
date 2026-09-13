---
"@memberjunction/ng-conversations": patch
---

Internal: memoise the `/` skill picker's `@agent` chip lookup.

`pickerTargetAgentId` is bound in `mj-message-input`'s template on a default-change-detection component and walked the editor DOM (`getMentionChipsData()` → `querySelectorAll('.mention-chip')`) on every change-detection cycle. It now reads a memo invalidated from `messageText`'s setter — the one point every chip change passes through, including programmatic writes (a restored draft, a post-send reset, a host assigning `messageText` directly) which rebuild or empty the chip DOM via `ngModel.writeValue` without emitting `valueChange`. `messageText` becomes a get/set pair; it is read-compatible and has no two-way `ngModel` binding. No behaviour change.
