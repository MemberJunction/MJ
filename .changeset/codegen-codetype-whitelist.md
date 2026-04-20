---
"@memberjunction/codegen-lib": patch
---

fix(codegen): whitelist LLM-supplied codeType against CK_EntityField_CodeType

Advanced Generation's Form Layout + Virtual Entity Decoration prompts occasionally return `codeType` values outside the six the DB's `CK_EntityField_CodeType` CHECK constraint allows (`CSS`, `HTML`, `JavaScript`, `SQL`, `TypeScript`, `Other`) — e.g. `Python`, `Markdown`, `javascript` (wrong case). Because `applyFieldCategories` batches every field's UPDATE for an entity into one execution, a single bad value previously aborted the entire batch, losing all the AI-assigned categories, display names, and extended types for that entity.

Adds a runtime whitelist (`sanitizeCodeType`) at the single point where `CodeType` is written. Out-of-enum values are coerced to `Other` and logged so prompt drift stays visible instead of silently failing at the DB. Both the regular entity pipeline and the VE decoration pipeline converge on `applyFieldCategories`, so one choke point covers both paths.

Also tightens the `CodeGen: Form Layout Generation` and `CodeGen: Virtual Entity Field Decoration` prompt templates with an explicit case-sensitive strict-enum directive and an explicit fallback-to-`Other` rule for any other language.
