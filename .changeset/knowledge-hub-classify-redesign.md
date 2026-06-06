---
"@memberjunction/clustering-engine": minor
"@memberjunction/content-autotagging": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-clustering": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-entity-viewer": minor
"@memberjunction/ng-explorer-app": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-explorer-modules": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/tag-engine": minor
"@memberjunction/tag-engine-base": minor
---

Knowledge Hub Classify redesign

- **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
- **View-type plugin foundation**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors (additive, with safe fallback).
- **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
- **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
- **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
- **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
- **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
- **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.
