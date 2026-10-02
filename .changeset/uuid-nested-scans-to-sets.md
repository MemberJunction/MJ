---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-entity-permissions": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-flow-editor": patch
---

Five nested `UUIDsEqual` scans, each over two lists that grow with the data, now match against a normalized `Set` (or a first-index `Map`) built once. The affected sites are:

- the message placeholder getter
- the user-row role lookup
- the entity-permission fill-in (in Role mode, every entity × every saved row)
- the dashboard drop handlers
- the flow editor's `HighlightPath` and delete-selection

Results, ordering and case-insensitive matching are unchanged. New tests pin each one and pass against the old code as well.
