---
"@memberjunction/global": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/scheduling-actions": patch
"@memberjunction/testing-engine": patch
"@memberjunction/integration-engine": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/core-actions": patch
"@memberjunction/database-designer-actions": patch
"@memberjunction/server": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-entity-relationship-diagram": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-flow-editor": patch
"@memberjunction/ng-test-utils": patch
---

Remove nested `UUIDsEqual` scans where both lists grow with the data or the code runs on every render. Fix one cross-database lookup bug.

- **Rubric publish validation could miss advisory parents.** `ValidateRubricTree` looked a raw `parentId` up in a map with normalized keys. On SQL Server (upper-case IDs) the advisory-ancestor walk silently stopped, so a non-advisory criterion under an advisory group was not reported. The map is now a `UUIDMap`.
- **Per-render getters no longer rescan the entity list.** The Entity form's `FormChromeCandidates`, the Data Explorer's `RecentEntities` / `FavoriteEntities` and the storage admin's `FilteredAccountRows` now read cached or once-built indexes.
- **Entity lookups by ID** in the ERD, the get-entity-details and list-entities actions, recent-access and the form builder now use the provider's indexed `EntityByID`. The application dialog uses a once-built index.
- **Other once-built indexes:** tag lookups, permission grantee names, orphaned-conversation owners and flow-editor node moves.
- `createFakeProvider` (`ng-test-utils`) now implements `EntityByID`, like a real provider.
- **New helper:** `GroupByUUID(items, getId?)` in `@memberjunction/global` groups items by a UUID in one pass, each group in input order.
- **Server sites that matched two growing lists:** the user cache (users × user roles), resource-permission deduplication, user/role sync, default-app user applications, scheduled-job statistics, MCP action discovery, REST connector schema introspection and rubric calibration.
- **Offline tools:** CodeGen relationship sync and CHECK-constraint value lists, CodeGen's related-entity form lookups, and `mj artifacts reclassify`.
- **Angular screens that scale with the data:** the AI Agent form's linked prompts and actions, the prompt priority matrix, the Testing explorer, the conversations message cache, the Query Browser tree, the Actions overview and categories, the dashboard browser, list-form bulk remove and credentials bulk actions.

Behaviour is unchanged otherwise, and each site has a test that also passes against the old code.
