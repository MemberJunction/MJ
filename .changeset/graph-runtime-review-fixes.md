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
"@memberjunction/content-pipeline": minor
---

Semantic graph runtime review fixes: every graph node is checked as the caller and every audience reader at the hop it is reached (row-level security applies; no Owner bypass), query permission uses `UserCanRun().canRun`, edge approval requires `Graph: Approve Edges` and fails closed, unknown or inactive graphs return nothing, `GraphEngine` loads lazily and caches stored edges for Preload graphs only, per-step reads are bounded and ordered, and the graph search lane ranks by hop-attenuated RRF. Ships the "MJ Canon" graph and its metadata providers, the `Graph: Approve Edges` authorization, the `Semantic Graph` search provider and the `Get Graph Context` action metadata, and registers the graph expansion service at MJAPI startup. The Content Pipeline Graph stage keeps auto-approving the Inferred edges its content source's GraphOverlay policy approves, through a server operation scope API callers cannot enter; every other edge that starts Approved, of any origin, requires `Graph: Approve Edges`. Graph seeds pass the same caller-and-audience check as expanded nodes; only Approved concepts seed or appear unless proposed content is asked for; node labels, edge text and concept matches use only fields every principal may read; editing, demoting or deleting an Approved edge needs the authorization and the review stamp is server-written; Preload graph edges load lazily and reload per graph.
