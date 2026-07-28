---
"@memberjunction/search-engine": minor
---

Make Scoped Search dimensions enforceable so a dimension can carry an access decision rather than being a narrowing convenience any caller — including an LLM writing a tool call — could author. `SearchScope.SearchContextConfig` documented `dimensions[]`, `inheritanceMode` and `strictValidation` but no runtime code read any of it.

A `restricts: true` dimension is now server-derived: a caller-supplied value is discarded, not merged, and the attempt is recorded in provenance. Values are grammar-checked, `freetext` is prohibited in filter positions, and every interpolated value is escaped automatically for its lane's dialect (SQL / OData / JSON / Typesense / path), keyed off the existing `IndexType`. `narrowingOf` is a lattice meet, so a caller may narrow a server bound but never widen it.

A Skill becomes a search principal alongside an Agent, and scope grants gain a time window plus a tenant key. `RequiredMetadataKeys` catches a filter that rendered *partially* — the case no other guard can see, where an optional clause vanishes because its dimension was absent or discarded and the lane silently searches wider than intended. Supersession (`advisory` + ordered rules) composes by subtraction and fails soft, deliberately outside the boundary. `ExplainScope()` reports what a search would be able to reach without running one, and the same structure is written to `SearchExecutionLog.ScopeDecisionJSON`.

Fixes four security bugs, two live on `next`: the result-cache key omitted `ScopeIDs` and `SearchContext` (cross-tenant result leak within the 30s TTL); six provider call sites silently dropped a filter whose rendered value had the wrong shape and then queried unfiltered; a restricting template that rendered to nothing was indistinguishable from one never authored; and `inheritanceMode` was itself declared-and-unread.

Additive throughout — a scope with no declaration behaves exactly as before, and no existing filter template needs an edit.
