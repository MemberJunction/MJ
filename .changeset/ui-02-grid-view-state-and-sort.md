---
"@memberjunction/ng-entity-viewer": patch
---

The entity data grid takes only user sorts (AG Grid's own `sortChanged` events no longer re-sort or save the layout), keeps a view's sort key that has no rendered column, and keeps a view's custom column headers when a resize or sort saves the state. The view workspace highlights a view passed through `SelectedView`, and saving a shared view from the config panel shows the shared-view warning.
