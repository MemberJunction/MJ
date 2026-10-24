---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-base-forms": patch
---

Memory-leak audit round 20: cap the hidden message-input composers kept mounted per visited conversation in the chat area (LRU, 10), and bound the record preview-popover summary cache and record-links dependency cache with `MJLruCache`.
