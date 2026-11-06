---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/search-engine": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/core-actions": minor
"@memberjunction/server": minor
"@memberjunction/integration-test-suite": minor
---

Semantic graph runtime review fixes: every graph node is checked as the caller and every audience reader at the hop it is reached (row-level security applies; no Owner bypass), query permission uses `UserCanRun().canRun`, edge approval requires `Graph: Approve Edges` and fails closed, unknown or inactive graphs return nothing, `GraphEngine` loads lazily and caches stored edges for Preload graphs only, per-step reads are bounded and ordered, and the graph search lane ranks by hop-attenuated RRF. Ships the "MJ Canon" graph and its metadata providers, the `Graph: Approve Edges` authorization, the `Semantic Graph` search provider and the `Get Graph Context` action metadata, and registers the graph expansion service at MJAPI startup.
