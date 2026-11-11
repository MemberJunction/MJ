---
"@memberjunction/react-linter": minor
---

`MapSQLTypeToJSType` treats a missing type as `'unknown'` instead of throwing. `sqlType` is optional on field and parameter metadata, and a field without one made the `entity-field-access-validation` rule throw "Cannot read properties of undefined (reading 'toLowerCase')", so the rule never checked that component.
