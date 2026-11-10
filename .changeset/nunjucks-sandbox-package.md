---
"@memberjunction/nunjucks-sandbox": patch
"@memberjunction/templates": patch
"@memberjunction/query-processor": patch
"@memberjunction/search-engine": patch
"@memberjunction/query-gen": patch
"@memberjunction/db-auto-doc": patch
"@memberjunction/core-actions": patch
---

The nunjucks sandbox moved from `@memberjunction/templates` to the new `@memberjunction/nunjucks-sandbox` package. The Data Mapper action, the query processor, scope templates, QueryGen and DBAutoDoc now build their environments with its `CreateSandboxedEnvironment()`, so they are sandboxed whether or not the template engine was loaded, and a canary (`AssertNunjucksSandboxIsEffective`) throws if a template can still reach the `Function` constructor. `HardenNunjucksRuntime`, `AssertTemplateTreeIsSafe` and `TemplateSandboxError` are now imported from `@memberjunction/nunjucks-sandbox`, not `@memberjunction/templates`. Every package pins `nunjucks` to exactly 3.2.4.
