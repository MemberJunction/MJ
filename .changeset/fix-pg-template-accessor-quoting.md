---
"@memberjunction/server": patch
---

fix(postgres): repair template/component accessor corruption from the old SQL Server -> PostgreSQL converter

PG-only forward migration un-quoting dotted accessors (`field."Name"` -> `field.Name`) inside Nunjucks prompt templates (`__mj.TemplateContent.TemplateText`) and component specs (`__mj.Component.Specification/TechnicalDesign/FunctionalRequirements/Description`), where the old converter wrongly quoted string-literal content. Fixes Nunjucks rendering (advanced generation) and JS component specs on Postgres; SQL Server unaffected. Confined to those text columns.
