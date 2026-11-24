---
"@memberjunction/integration-test-suite": patch
"@memberjunction/ai-agents": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/task-graph": patch
---

Parallelize SQL Pipeline Matrix (`IT143`/`IT145`/`IT146`) scenario execution with bounded concurrency and in-flight oracle coalescing, and opt verified pure-JS test packages (`ai-agents`, `generic-database-provider`, `codegen-lib`, `task-graph`) into Vitest `pool: 'threads'`.
