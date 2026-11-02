---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
---

Record forms on a phone (<= 768px). The section rail is a single horizontal pill strip; the More folder opens as a searchable bottom sheet instead of inlining every section, and the active More section shows as one chip. The form toolbar auto-hides behind an [Edit | ...] pill in Read Mode, with per-entity and global "pin toolbar open" preferences stored in `UserInfoEngine` (`mj.form.toolbar.visibility`); desktop keeps the full toolbar. An entity with a custom view mounts its standard form at phone width with no switch strip, without changing the user's chosen mode. Related-grid toolbars stay on one row and empty states are no longer clipped. `FormChromeCoordinator.Apply` keeps a More child active across a re-resolve instead of snapping back to the first group.
