---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-explorer-core": patch
---

A compiled form panel renders at the slot it registered for.

`BaseFormPanel.DisplayOrder` derives the panel's flex order from the registration it was
mounted from, which the slot host now assigns as `RegistrationMetadata`. A panel standing in
for a section takes that section's place instead, so replacing something does not also move
it to the bottom.

The twenty-one hand-written panels that build their own `mj-collapsible-panel` pass it as
`[Order]`. Without it the form has no order for a key that is not one of its sections, falls
back to the section count, and draws every such panel last however early its slot sits in the
document. `InteractiveFormPanelComponent` now inherits the same getter rather than computing
its own.
