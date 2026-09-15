---
"@memberjunction/ng-entity-viewer": patch
---

Fix `mj-entity-data-grid` rendering **zero columns** when a stale grid state names none of the current entity's fields (MemberJunction/MJ#4244). One `<mj-entity-viewer>` rebound from entity A to entity B carried A's `columnSettings` into B's grid; `buildAgColumnDefsFromGridState()` drops every setting whose field the entity lacks, and `buildAgColumnDefs()` took the resulting empty array as the answer — so the grid loaded its rows and reported the right row count while rendering no header and no cells, with no error and no console warning. A grid-state result of zero columns is now treated as *no usable state* and falls through to the column model and then to generation from entity metadata, the same floor `generateAgColumnDefs()` already applies to an entity with no `DefaultInView` fields. A state that matches at least one field is still honoured in full, so a saved view's column order and visibility continue to win.
