---
"@memberjunction/codegen-lib": patch
---

Flip `omitRecurringScriptsFromLog` Zod default to `true`, aligning the schema default with the fallback config. When omitted, `SQLOutput` now safely suppresses recurring reconciler statements (`spDeleteUnneededEntityFields`, `spUpdateExistingEntityFieldsFromSchema`, etc.) from emitted migration scripts so they remain live-CodeGen-only operations and do not prune valid fields on historical migration replays. Added a blocking CI gate (`check-migration-no-prune.mjs`) rejecting versioned migrations containing `spDeleteUnneededEntityFields`.
