---
"@memberjunction/core": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-resource-permissions": patch
"@memberjunction/ng-user-routines": patch
---

Business-user vocabulary: surface the user's own domain nouns instead of platform jargon on the default data-browsing surfaces.

- `EntityInfo.DisplayNamePlural` (`@memberjunction/core`): a business-friendly plural of the entity's display name ("Contacts", "Companies", "Addresses"), derived from `DisplayNameOrName` via the existing `GeneratePluralName` helper, so a per-deployment `DisplayName` override ("Member") flows through as "Members". Display-only; never a lookup key. Unit-tested.
- Entity viewer, grid, and cards empty states now say "No Contacts yet" / "No Contacts to display" instead of "No records found" / "No data to display", falling back to the generic copy when no entity is in scope.
- Data Explorer: the word "entity" is translated out of the default data-browsing app (search placeholder, loading text, counts, filter pill, empty states, recent section). Bindings, CSS classes, and agent-tool contracts are untouched.
- Sharing Center: section headings show friendly labels ("Dashboards", "Files", "Rules") via a display-only label map. The underlying `DomainName` stays as-is because it is the lookup key that drives Revoke, audit mapping, and icon selection. Unmapped custom domains have a trailing " Permissions" stripped.
- User Routines: softened the editor loading text.

Ported from #3043 (the runtime, no-migration half). The stored `Entity.DisplayNamePlural` column, its CodeGen completion, and the non-English plural seam are tracked separately.
