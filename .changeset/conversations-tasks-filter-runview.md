---
"@memberjunction/ng-conversations": patch
---

The conversations Tasks tab and task search now read the conversation and message IDs they filter by with their own RunView instead of a subquery over the Conversations and Conversation Details views. The server's clause screen refuses such a subquery for a user whose read of those entities is row-filtered (for example the Widget Guest role, or a row filter a customer adds), so the Tasks tab and task search failed for those users. The Tasks tab rebuilds the filter on every load and refresh, so a task linked to a message created after the workspace opened appears on the next refresh.
