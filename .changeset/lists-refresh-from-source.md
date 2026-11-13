---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/lists-base": minor
"@memberjunction/lists": minor
"@memberjunction/core-actions": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/ng-list-management": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/testing-integration": minor
"@memberjunction/integration-test-suite": minor
---

Lists: refresh from a saved view or query, safely and on a schedule.

- Queries and User Views store a `DefinitionFingerprint` on every save. A list stores the fingerprint of the source it was linked against (`SourceFingerprint`); a refresh whose source changed since then applies nothing, returns `SOURCE_CHANGED` and pauses the list's routine until the owner approves the change (`ApproveListSource`). Approving, and linking a source, fill the list straight away.
- A list can refresh from a saved query (`SourceQueryID`, `SourceQueryParameters`, `SourceQueryKeyField`).
- "Refresh automatically" (`List.AutoRefresh`) creates a User Routine that runs "Refresh List From Source" on the Lists app's default schedule (application settings `Lists.Refresh.DefaultCron` and `Lists.Refresh.DefaultTimezone`). Only the list's owner can link a source or turn it on.
- New list operations `PreviewRefreshFromSource` / `ApplyRefreshPreview` (GraphQL `PreviewListRefresh` / `ApplyListRefresh`) preview a refresh from any source before applying it. Each refresh that changes a list writes a "List Refreshed" audit row; source changes and approvals write their own.
- The List form gains a Source & refresh card, a source-change review with a SQL or filter diff from Record Changes, a link-source dialog and a Refresh history section. The Lists app gains refresh status on the browse page and a Refreshes page.
- New deterministic integration test IT174 (`list-refresh` bundle, LR1–LR7) covers the fingerprint stamp, fill on link, the routine's lifecycle, a stopped refresh on a changed source, and approval.
