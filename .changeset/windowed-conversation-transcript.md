---
"@memberjunction/ng-conversations": patch
"@memberjunction/core-entities": patch
---

Window the chat transcript: load the latest display page on open, prepend older pages from a top sentinel, and keep the ConversationEngine full-history API unchanged for agents.

Opening a conversation previously ran `GetConversationComplete` for every row, hydrated all of them, and mounted a component per timeline item. It now reads only the newest page. `ConversationEngine.LoadDetailWindow` is additive and pages on `Sequence` (not `AfterKey` — the primary key is a uniqueidentifier, so PK order is not chat order); `LoadConversationDetails` is untouched and still returns complete history, which `GetAgentContextWindow` and the server callers depend on. A window is deliberately never written into `_detailCache`.

Paging is counted in display items rather than rows, so a realtime session still collapses to one card and is never split across pages.
