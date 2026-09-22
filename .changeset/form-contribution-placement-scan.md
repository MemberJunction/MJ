---
"@memberjunction/ng-base-forms": patch
"@memberjunction/interactive-component-types": patch
---

The placement dialog offers only positions a form actually has.

An unknown slot set meant "offer all five", which included `top-area` — a slot no form
emits, so choosing it sent the panel to the bottom of the form under a label saying the
opposite. The unknown case now falls back to `GENERATED_FORM_CONTRIBUTION_SLOTS`, the shape
CodeGen produces, which is right for every generated form and excludes that slot. A form
that can be read is still read rather than assumed.

`FormContributionSpec.slot` is optional. Placement is the user's choice, made in the apply
dialog against the form in front of them, and the dialog already ignored what a generated
spec proposed — so a required field only invited specs to disagree with what the user sees.
`getDeclaredFormContribution` still resolves a concrete slot, returned as
`NormalizedFormContributionSpec`, so nothing downstream of normalization changes.
