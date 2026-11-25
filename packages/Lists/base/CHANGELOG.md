# @memberjunction/lists-base

## 6.3.0-edge.1

### Minor Changes

- a9e640a: Lists: refresh from a saved view or query, safely and on a schedule.
  - Queries and User Views store a `DefinitionFingerprint` on every save. A list stores the fingerprint of the source it was linked against (`SourceFingerprint`); a refresh whose source changed since then applies nothing, returns `SOURCE_CHANGED` and pauses the list's routine until the owner approves the change (`ApproveListSource`). Approving, and linking a source, fill the list straight away.
  - A list can refresh from a saved query (`SourceQueryID`, `SourceQueryParameters`, `SourceQueryKeyField`).
  - "Refresh automatically" (`List.AutoRefresh`) creates a User Routine that runs "Refresh List From Source" on the Lists app's default schedule (application settings `Lists.Refresh.DefaultCron` and `Lists.Refresh.DefaultTimezone`). Only the list's owner can link a source or turn it on.
  - `RefreshFromSource` (and so linking, approving and scheduled refreshes) no longer signs a delta token, so it works on a server without `MJ_LIST_DELTA_SECRET`; previews and `ApplyDelta` still need the secret.
  - New list operations `PreviewRefreshFromSource` / `ApplyRefreshPreview` (GraphQL `PreviewListRefresh` / `ApplyListRefresh`) preview a refresh from any source before applying it. Each refresh that changes a list writes a "List Refreshed" audit row; source changes and approvals write their own.
  - The List form gains a Source & refresh card, a source-change review with a SQL or filter diff from Record Changes, a link-source dialog and a Refresh history section. The Lists app gains refresh status on the browse page and a Refreshes page.
  - New deterministic integration test IT175 (`list-refresh` bundle, LR1–LR7) covers the fingerprint stamp, fill on link, the routine's lifecycle, a stopped refresh on a changed source, and approval.

## 6.3.0-edge.0

## 6.2.0

### Minor Changes

- cc36de5: Add Alternate Base Views (MJ Canon Layer 1): allow entities to register governed SQL views (`MJ: Entity Alternate Base Views`) that maintain 100% column parity with the canonical `BaseView` while returning curated row subsets (such as `Active` members or `Open` orders), with full support across `RunView`, `RunViews`, `BaseEngine`, `LocalCacheManager`, `CodeGen` column-parity validation, `QueryEntity.AlternateBaseViewID` lineage extraction, `QueryGen`, `Lists`, `DataContext`, `GetEntityDetails`, and `MJExplorer` Data Explorer / Entity Viewer.

## 6.2.0-edge.8

## 6.2.0-edge.7

## 6.2.0-edge.6

### Minor Changes

- cc36de5: Add Alternate Base Views (MJ Canon Layer 1): allow entities to register governed SQL views (`MJ: Entity Alternate Base Views`) that maintain 100% column parity with the canonical `BaseView` while returning curated row subsets (such as `Active` members or `Open` orders), with full support across `RunView`, `RunViews`, `BaseEngine`, `LocalCacheManager`, `CodeGen` column-parity validation, `QueryEntity.AlternateBaseViewID` lineage extraction, `QueryGen`, `Lists`, `DataContext`, `GetEntityDetails`, and `MJExplorer` Data Explorer / Entity Viewer.

## 6.2.0-edge.5

## 6.2.0-edge.4

## 6.2.0-edge.3

## 6.2.0-edge.2

## 6.2.0-edge.1

## 6.2.0-edge.0

## 6.1.0

## 6.1.0-edge.7

## 6.1.0-edge.6

## 6.1.0-edge.5

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

## 5.49.0

## 5.48.0

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

## 5.43.0

## 5.42.0

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

## 5.38.0

## 5.37.0

## 5.36.0

### Patch Changes

- 91036ee: Refreshable, shareable, taggable Lists with an agent-callable Actions surface.
  - New `@memberjunction/lists` core: ListOperations (delta + drop-guard + materialize/refresh/set-op), ListSharing, AudienceResolver.
  - `MJ: Lists` lineage fields (SourceViewID, SourceFilterSnapshot, LastRefreshedAt, RefreshMode, UseSnapshot) wired into Refresh-from-source.
  - GraphQL: ListOperationsResolver + GraphQLListsClient. New `SendToAudience` in communication-engine.
  - 12 new Actions covering materialize / refresh / share / invite / move / compose / resolve-audience / send-to-audience.
  - UI: Save-as-List, mixed list+view operands, compose-into-target, Shared With Me tab, invitations + audit-log dialogs, viewer-perspective gating, bulk Move/Copy with delta-confirm, tag chips + filter, list-stats sidebar, audience picker, Communications New Message page, Excel/CSV/JSON column-picker export.
