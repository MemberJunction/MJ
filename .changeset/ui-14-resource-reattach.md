---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-ai-test-harness": patch
---

Cached Explorer tabs can refresh on reattach: `BaseResourceComponent` gains `OnReattached()`, `WatchEntities()` and `OnStaleOnReattach()`, and the Knowledge Hub configuration reloads its credential list when a credential changed while the tab was cached. The form overlay and the test-harness window dock now ask for a render after async changes.
