---
"@memberjunction/search-engine": patch
"@memberjunction/integration-test-suite": patch
---

Search review fixes for bounded scopes and provider trust. Each changes behaviour.

**A content item promoted to its origin record is held to that record's lane bound.** A `MJ: Content Items` hit derived from an entity record is promoted to that record. Promotion used to run once, after cross-scope fusion, after every lane `ExtraFilter` check. So a vector hit on a content item could become a row of a bounded entity (for example `Contacts` bounded by `OrganizationID`) from outside the bound. For a scoped search, promotion now runs per scope, between two lane checks: the content-item hit is checked against a Content Items lane, then the promoted hit against the origin entity's lane. A promoted hit is never exempt, whichever provider found it. Unscoped and global searches still promote after fusion, and nothing is promoted twice.

**A promoted hit is verified, not trusted.** It keeps its `ProviderId` for attribution. The new `SearchResultItem.PromotedFromContentItemID` marks it, and the permission pass then verifies the origin row with `PK IN (...)`. A stale document can name an origin record that no longer exists; that hit is now dropped.

**A provider declares the lane kinds it reads.** New `BaseSearchProvider.ConsumesLaneKinds` (`'ExternalIndex'`, `'Entity'`, `'StorageAccount'`). Every shipped provider sets it. The default is `['ExternalIndex']`, because a third-party provider serves an index of its own `IndexType`. **A custom provider that reads entity or storage lanes must override it, or a scoped search will not call it.** A non-global scope now calls only the listed providers that are configured, available, and have an active lane of a kind they read. A provider whose lane kinds are all empty in a scope is not called, so an older provider that tests `ExternalIndexes?.length` cannot fall back to its default index. `ExplainScope` and the logged scope decision apply the same rule. A `Semantic` (vector) provider row over entity lanes only, as the guide's example used to show, is now reported `Reachable: false` with a diagnostic; before, the dry run said reachable and the search returned nothing. A provider row naming no configured or available provider is reported the same way.

**`ExplainScope` no longer calls a scope reachable when a lane is broken.** A real search refuses on the first unusable lane. The dry run used to mark that lane `Skipped` and still report the scope reachable through its other lanes. A non-global scope with any skipped lane is now `Reachable: false`, with the diagnostic "a real search would be refused".

**The lane `ExtraFilter` exemption is a provider capability.** New `BaseSearchProvider.AppliesLaneExtraFilter`, set only by `EntitySearchProvider`, replaces the `instanceof EntitySearchProvider` check. It and `ResultsAreRowsOfLabelledEntity` are both read from the provider the engine stamped on the result. A subclass inherits both and must override them if it changes `Search`.

**Smaller fixes.**
- The `path` escaper refuses a value that is `..` or `.`, judged after control characters are stripped. A value that only contains `..`, such as `Acme..Inc`, is kept. `/` and `\` are refused as before.
- An unresolvable scope's explanation reports `Entitlement.Source: 'ScopeUnresolvable'` (new `EntitlementSource` type) instead of `'NoGrant'`. `SummarizeExplanation` says the scope was refused, not "legacy scope" or "NONE CONFIGURED".
- A refused search's `MJ: Search Execution Logs` row names the first unresolved scope that has a row, or no scope. Before, it could name a valid scope that was searched beside a missing one.
- `ScopeConstraints` documents the `[]` versus `undefined` contract on each lane field.
