---
"@memberjunction/core": minor
"@memberjunction/sql-dialect": patch
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/schema-engine": patch
"@memberjunction/react-test-harness": patch
---

Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.
