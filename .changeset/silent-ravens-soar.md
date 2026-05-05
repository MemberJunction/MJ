---
"@memberjunction/generic-database-provider": patch
---

Fix silent NVARCHAR(4000) truncation in `_escapeFlywaySyntaxInStrings` that corrupted component Specifications with many `${…}` template-literal expressions on Flyway apply. Interleave `CAST(N'' AS NVARCHAR(MAX))` between every split so the concat chain inherits NVARCHAR(MAX) precedence and the full literal value survives.
