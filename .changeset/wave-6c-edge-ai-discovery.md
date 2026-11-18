---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/server": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
---

Add Wave 6C client-side Edge AI agent pre-discovery and client-only semantic Cmd+K Omnibox:

- **Shared Lazy WASM Edge AI Worker (`@memberjunction/ng-conversations`, `@memberjunction/ng-explorer-app`)**: Pre-bundles quantized `Xenova/bge-small-en-v1.5` (`q8`) and `Xenova/ms-marco-MiniLM-L-6-v2` (`q8`) into `assets/edge-ai.worker.js` (`device: 'wasm'`, `dtype: 'q8'`) with zero initial bundle overhead, per-user/session `SimpleVectorService` `'float32'` catalog caching, strict query deadlines, and a circuit-breaker fallback — shipped directly in `@memberjunction/ng-conversations` / `@memberjunction/ng-explorer-app` assets with zero host-app boilerplate.
- **Stage 6C.1 Edge Agent Pre-Discovery (`@memberjunction/ai-core-plus`, `@memberjunction/conversations-runtime`, `@memberjunction/ai-agents`, `@memberjunction/server`)**: Computes an untrusted advisory `EdgePreDiscoveryHint` (top-5 candidates + `logit >= -2.0` confidence gate). Server remains guard of truth, verifying `AIAgentPermissionHelper.HasPermission`, `AllowedAgentIDs`, and `IsRunnable` / `IsDirectlyDiscoverable` at both GraphQL ingress (`RunAIAgentResolver`) and `BaseAgent.InjectDecisionDiscovery`, discarding unauthorized/unknown IDs silently and falling back cleanly to `SearchEntity` / server `Jev` / `Sage`.
- **Stage 6C.2 Client-Only Semantic Omnibox (`@memberjunction/ng-explorer-core`)**: Adds `OmnibarSemanticIndexService` backed by `'float32'` `SimpleVectorService` and the shared `bge-small-en-v1.5` worker over browser-resident metadata (Entities, Saved Views, Dashboards, Apps/Navigation, Agents) for sub-15ms offline semantic matching with zero `PreviewSearch` GraphQL calls when offline and graceful fallback when cold/unavailable.
