---
"@memberjunction/communication-ms-graph": patch
---

`MSGraphProvider.GetMessages` sends `ContextData.Expand` as the request's `$expand`, so a caller can read extended properties (for example reply headers and sensitivity) with the messages in one request. Without it, the request is unchanged.
