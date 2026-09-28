---
"@memberjunction/ng-entity-viewer": patch
---

Grid exports now carry the columns the grid shows, and "Send Message" is offered only for entities that support communication.

- `EntityDataGridComponent.GetExportColumns()` (now public) reads the rendered AG Grid columns: on-screen order, visible columns only, on-screen headers, entity field spelling. It used to read the host-declared `Columns`, so a grid drawn from a saved grid state, or with a column the user had dragged, exported a different column set in a different order. The row-number and width-filler columns are left out. Columns no longer carry grid pixel widths, which Excel read as characters; Excel auto-fits them instead.
- The workspace toolbar's Export uses the active renderer's columns through the new optional `IViewRenderer.GetExportColumns()` (implemented by the grid renderer, exposed as `EntityViewerComponent.GetExportColumns()`). For view types without a column layout it falls back to the view's saved columns, now sorted by `orderIndex`, headed by the user's rename, and matched to entity fields regardless of case. Settings for fields that no longer exist, and fields the user is denied read access to, are dropped, as the grid drops them.
- "Send Message", in the toolbar and in the overflow menu, now shows only when the entity has an active Entity Communication Message Type (read from the `CommunicationEngineBase` instance for the grid's provider). Before, the overflow item appeared on every entity whenever a row was selected. Nothing in `ng-entity-viewer` handles `CommunicationRequested` yet, so hosts that show the button still own the dialog.
- The grid's entity-action auto-load also reads `EntityActionEngineBase` for the grid's provider instead of the global singleton.
