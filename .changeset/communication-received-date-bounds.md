---
"@memberjunction/communication-types": patch
"@memberjunction/communication-ms-graph": patch
"@memberjunction/communication-gmail": patch
---

feat(communication): `GetMessagesParams.ReceivedAfter` / `ReceivedBefore` push inclusive date bounds down to providers that support them (MS Graph, Gmail). Providers declare support via `MessageRetrieval` and report what they applied in `GetMessagesResult.AppliedFilters`. Also fixes both providers silently discarding `UnreadOnly` when `ContextData.Filter` / `ContextData.query` was also supplied.
