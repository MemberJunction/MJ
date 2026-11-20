---
"@memberjunction/ng-ui-components": patch
---

`mj-dropdown` follows the combobox pattern: the listbox holds only options, options have ids and the highlighted one is the active descendant, the filter box is described and controls the listbox, and closing clears the filter (`FilterChange('')`) and returns focus to the field. `mj-slide-panel` is a named modal dialog that moves focus in, keeps Tab inside, returns focus on close and is inert while closed. The dialog focus code moved to a shared helper.
