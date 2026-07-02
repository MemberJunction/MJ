---
"@memberjunction/ng-conversations": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/core-entities": patch
---

Prevent AI agent runs from bleeding into other conversations when swapping conversations early after sending: agent-lifecycle events now carry the captured ConversationID so the chat-area drops events from a backgrounded conversation, pending-message auto-send is pinned to its target conversation, intent-check start/complete are guarded symmetrically, the shared agent runner tracks in-flight runs with a refcount, and new-conversation creation no longer produces a duplicate sidebar row.
