---
"@memberjunction/core": patch
"@memberjunction/ng-entity-permissions": patch
---

Stop deep-cloning the metadata graph for providers that reuse the global provider's metadata (#3083). The reuse fast path (`ignoreExistingMetadata: false` — MJServer's per-request providers) now builds a per-instance AllMetadata shell whose arrays reference the global provider's immutable-post-Config graph, instead of re-instantiating every EntityInfo/EntityFieldInfo/etc. (~1s of synchronous, event-loop-blocking constructor work per provider on a ~600-entity install, twice per GraphQL request — and the blocking made concurrent requests inflate each other). CurrentUser stays per-instance, so RLS fallback semantics are unchanged. Reuse-path providers also now build their entity lookup maps (EntityByName/EntityByID were silently falling back to linear scans), and the fast path requires the global provider to actually have entities loaded (an unconfigured global no longer donates an empty graph). Also fixes entity-permissions' entity selector mutating the provider's live Entities array via in-place sort. Callers must treat provider metadata arrays as read-only — copy before sorting/mutating.
