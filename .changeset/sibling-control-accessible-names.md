---
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-test-utils": patch
---

Give `mj-combobox`, `mj-switch`, `mj-numeric-input`, `mj-datepicker` and `mj-page-search` the
accessible-name inputs `mj-dropdown` already had (`AriaLabel`, `AriaLabelledBy`, `AriaDescribedBy`,
`InputId`), from a shared `MJNamedControlBase`. A control with no accessible name announces as its
role and state alone, which fails WCAG 2.1 4.1.2. The name reaches each control's secondary pieces
too — the combobox's toggle and clear buttons, the datepicker's toggle and calendar grid, the
dropdown's filter box — so a form full of them no longer presents a row of identical unnamed
controls. Unset inputs render no attribute at all, since an empty `aria-label` overrides every other
naming source.

`mj-combobox` additionally moves `role="combobox"` and its state attributes onto the `<input>`,
where focus actually lands, and gains `aria-activedescendant` so the arrow-key highlight is
announced rather than being a CSS class alone.

A new dev-mode `warnIfUnnamed` guard warns once per control that renders with no accessible name,
alongside the existing `mjButton` and `mjClickable` guards, and is a no-op in production.
