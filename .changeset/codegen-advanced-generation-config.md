---
"@memberjunction/codegen-lib": patch
---

CodeGen: one default advanced-generation feature list shared by the config schema and `DEFAULT_CODEGEN_CONFIG`, without the feature names no code reads (`DefaultInViewFields`, `EntityFieldDescriptions`, `FormTabs`); a warning for each configured feature name CodeGen does not know (#5822). Smart-field identification now logs when the AI picks an entity's name field or when no field wins, and warns once per run with the number of entities skipped while the AI credential circuit was open (part of #3608).
