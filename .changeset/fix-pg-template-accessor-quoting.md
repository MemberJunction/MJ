---
"@memberjunction/server": patch
---

fix(postgres): repair template/component accessor corruption from the old SQL Server -> PostgreSQL converter

PG-only forward migration that un-quotes dotted accessors (`field."Name"` -> `field.Name`) inside Nunjucks prompt templates (`__mj.TemplateContent.TemplateText`) and interactive component specs (`__mj.Component.Specification/TechnicalDesign/FunctionalRequirements/Description`). The old converter wrongly applied bracket-identifier quoting to string-literal content, breaking Nunjucks rendering (advanced-generation prompts) and JS component specs on Postgres. SQL Server is unaffected (it runs migrations un-converted). Confined to those text columns; identifier columns and columns that legitimately store PG-quoted SQL are left untouched.
