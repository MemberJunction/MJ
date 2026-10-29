---
"@memberjunction/react-linter": patch
---

A semantic validator can now opt in to checking a prop the parent does not pass, by overriding `EvaluatesAbsentProp` to return `true`. It is then also called for a missing prop, with `context.PropertyPresent === false` and `context.propertyValue === undefined`, except when the element spreads props. Validators that do not opt in behave as before and run only for passed props.
