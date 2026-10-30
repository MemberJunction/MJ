---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-base-forms": patch
---

Memory-leak audit round 20: cap the hidden message-input composers kept mounted per visited conversation in the chat area (LRU, 10) while preserving composers with active agent turns, unsent attachments, or live voice calls and scoping voice teardown to the owning conversation; bound the record preview-popover summary cache and record-links dependency cache with provider-scoped `MJLruCache` keys.
