---
"@memberjunction/lists": patch
"@memberjunction/lists-base": patch
"@memberjunction/ng-list-management": patch
"@memberjunction/core-actions": patch
"@memberjunction/communication-engine": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Refreshable, shareable, taggable Lists with an agent-callable Actions surface.

- New `@memberjunction/lists` core: ListOperations (delta + drop-guard + materialize/refresh/set-op), ListSharing, AudienceResolver.
- `MJ: Lists` lineage fields (SourceViewID, SourceFilterSnapshot, LastRefreshedAt, RefreshMode, UseSnapshot) wired into Refresh-from-source.
- GraphQL: ListOperationsResolver + GraphQLListsClient. New `SendToAudience` in communication-engine.
- 12 new Actions covering materialize / refresh / share / invite / move / compose / resolve-audience / send-to-audience.
- UI: Save-as-List, mixed list+view operands, compose-into-target, Shared With Me tab, invitations + audit-log dialogs, viewer-perspective gating, bulk Move/Copy with delta-confirm, tag chips + filter, list-stats sidebar, audience picker, Communications New Message page, Excel/CSV/JSON column-picker export.
