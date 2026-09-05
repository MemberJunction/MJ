---
"@memberjunction/ng-base-forms": patch
---

Forms: the section rail now refreshes when Edit mode or Show Empty Fields changes.

A panel whose fields are all blank gets the `mj-panel-empty` host class in read-only mode, and `domPanelSnapshots()` deliberately skips those panels so the rail doesn't advertise an empty section. The panel itself recomputes live, but `scheduleChromeResolve()` only ran on structural changes (content children, slot remounts, chrome rules, section reorder) — never when field visibility changed. So once a section dropped out of the rail while read-only, switching to Edit brought the panel back but left its nav entry missing until something else forced a resolve.

`MjRecordFormContainerComponent` now watches the effective Edit-mode and Show-Empty-Fields values in `ngDoCheck` and re-resolves the rail when either flips. Watching the values rather than hooking `OnEditModeChange` matters because the toolbar is not the only writer: `SaveRecord()` and `CancelEdit()` call `EndEditMode()` straight on the form component and never reach that handler, so a save used to leave the reverse staleness behind. The existing resolve is already debounced through a zero-delay timer, so a change to both flags in one tick still costs one resolve.
