---
"@memberjunction/core-actions": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/interactive-component-types": patch
---

`Get Form Composition For Entity` answers for the form the caller actually sees.

The full-custom-form gate asked whether an Active `MJ: Entity Form Overrides` row exists.
One does not mean the caller sees that form: a user can pick any of the forms on offer,
the generated one included, and that pick is a per-user setting. So an entity that had
ever had a custom form applied reported itself unreachable for panels, even to a user
looking at the generated form — and the apply dialog refused a placement the form would
have honoured.

It now reads the caller's stored choice and mirrors `FormResolverService.pickActive`: an
explicit pick of the generated form means no custom form renders, a pick of a specific
override wins whatever its status, and with no pick the first Active override applies as
before.

The settings key and the explicit-default sentinel move to
`@memberjunction/interactive-component-types/forms` so the browser and the server read
the same key rather than two copies of it.
