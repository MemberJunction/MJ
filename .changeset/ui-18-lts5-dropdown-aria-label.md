---
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-explorer-core": patch
---

Backport to 5.x: `mj-dropdown` gains `AriaLabel`, `AriaLabelledBy`, `InputId` and `AriaDescribedBy` (applied to the trigger and the popup listbox, and composed into the filter box's name), points `aria-controls` at its listbox while open, and leaves the tab order when disabled. The filter box placeholder reads "Filter..." instead of "Search...". The shell's global search dropdown is named "Search in" (#4337).
