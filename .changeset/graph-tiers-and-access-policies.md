---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/content-pipeline-base": minor
"@memberjunction/content-pipeline": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
---

Semantic graph authority tiers are now fully metadata-driven, and the graph engine accepts pluggable access policies (minor: adds three `MJ: Graph Types` columns).

- `MJ: Graph Types` gains `DefaultAuthorityTierID`, `DefaultConceptTaxonomyMode` and `DefaultGroundingMode`. The Graph stage reads the target graph's real type and fills in what a content source leaves unset from it; `IsCanon` comes from the graph type, never from a configured type name. Seeded types keep their previous behaviour, and Network graphs now default to `Constrained` as documented.
- Authority tier precedence comes only from `MJ: Graph Authority Tiers` rows: `AuthorityTierPrecedence` is removed and `GetAuthorityTierRank` requires the tier rows. A source may name its tier by ID (`AuthorityTierID`) or name; a name that matches no active tier fails the stage. A source with no tier is unranked instead of silently `Reference`. The `IContentSourceGraphOverlayConfig` keys `Enabled`, `DefaultAuthorityTier` and `DefaultAuthorityTierID` are honoured.
- `GraphEngine` runs `BaseGraphNodeAccessPolicy` (per entity, `Extend` or `Replace`) and `BaseGraphEdgeAccessPolicy` (per edge type) registrations. Policies only narrow, run once per entity per viewer, and fail closed when they throw or cannot be created.
- Built-in provenance policies: a content item, its chunks and the concepts synthesized from them are visible only to someone who can read the source record. An `Approved` concept in a Canon graph stays visible to anyone who can read concepts.
- Edge type names are compared ignoring case and whitespace when filtering edges and when finding an edge access policy, matching how the content pipeline resolves them on write, so an edge cannot skip its policy because its name is spaced differently. Providers that name no edge type fall back to `RelatedTo`, the seeded type. `IsCanonGraph` decides from the graph type's `IsCanon` flag only, no longer from a graph named "MJ Canon".
- The seeded edge type `Broader Than` (inverse `Narrower Than`) is renamed `BroaderThan` (inverse `NarrowerThan`), so every seeded edge type name is CamelCase. The row keeps its ID, and the content pipeline now writes the CamelCase name.
