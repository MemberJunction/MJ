---
"@memberjunction/core-entities": minor
---

`ConversationEngine.LoadConversations(…, forceRefresh: true)` now passes `BypassCache: true` on its RunView, so a forced reload actually reaches the server.

Without it, an identical RunView issued within the provider's dedup-linger window (5s) returned the previous result and no request went out. A host that forces a reload because the server-side answer changed — a request header or session state the query text does not carry, such as a per-request conversation scope — got the stale list back. Non-forced loads are unchanged.
