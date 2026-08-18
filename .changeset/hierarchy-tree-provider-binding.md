---
"@memberjunction/ng-hierarchy-tree": patch
---

Honour the multi-provider contract: `HierarchyTreeComponent` now extends `BaseAngularComponent` and resolves metadata through `ProviderToUse` / `RunView.FromMetadataProvider(...)` instead of constructing `new Metadata()` and `new RunView()`, which bind the global provider. Behaviour is unchanged for single-provider callers, since `ProviderToUse` falls back to `Metadata.Provider` when no `Provider` input is supplied.
