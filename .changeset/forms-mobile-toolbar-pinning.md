---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
---

Record forms on a phone (<= 768px). The section rail becomes a single section picker that opens a searchable bottom sheet listing the first-class sections and the More folder's children; the sheet's search is cleared when a row is picked or the sheet is closed. The form toolbar auto-hides behind an [Edit | ...] pill in Read Mode, with per-entity and global "pin toolbar open" preferences stored in `UserInfoEngine` (`mj.form.toolbar.visibility`); hiding the toolbar on one form only unpins that entity, and focus moves between the pill and the toolbar's hide chevron when they swap. Desktop keeps the full toolbar. An entity with a custom view keeps it at phone width, and the standard-form switch moves into the toolbar's View sheet (honouring `ShowFormModeSwitch`) instead of rendering as a strip. Related-grid toolbars stay on one row and empty states are no longer clipped. `FormChromeCoordinator.Apply` keeps a More child active across a re-resolve instead of snapping back to the first group.
