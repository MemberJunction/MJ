---
"@memberjunction/ng-base-forms": patch
---

A panel standing in for fields renders once, inside the group, not twice.

A field claim is hosted by the section drawing its fields. It still carries a slot,
because every registration does, so `<mj-form-panel-slot>` — which selects by slot alone
— mounted the same panel a second time at the bottom of the form. The slot host now skips
a registration that names fields.

The rail did the same thing one layer up: it filed such a contribution as an item in its
own right, lifting it out of the group it was visibly sitting in. It now inherits the rail
item of the section drawing its fields, which is the rule a section claim already followed.

A claim whose fields the form draws none of has no section to render in, and so renders
nowhere — a worse silence than a misplaced panel. The container reports that case on the
console, separately from the existing unmatched-`replacesSectionKey` diagnostic, which
describes a panel that still appears.
