---
"@memberjunction/core": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-tasks": patch
---

Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
