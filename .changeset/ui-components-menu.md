---
"@memberjunction/ng-ui-components": patch
---

New `mj-menu`: an action menu opened from any element with `[mjMenuTriggerFor]`, with `mj-menu-item` (an optional `Icon`, `Disabled`, and a `Triggered` output) and `mj-menu-divider`. It is built on the CDK menu, so the trigger carries `aria-haspopup`, `aria-expanded` and `aria-controls`; the arrow keys, Home, End and typeahead move between items; Enter or Space runs one; and Escape or a click outside closes the menu and returns focus to the trigger. Styles use design tokens only and match the dropdown's panel. Name the menu with `AriaLabel` or `AriaLabelledBy`; an unnamed menu warns in dev mode, like the package's other controls.
