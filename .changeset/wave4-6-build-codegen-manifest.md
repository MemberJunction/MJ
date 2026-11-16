---
"@memberjunction/codegen-lib": patch
---

Wave 4.6 build, CodeGen, and class-registration manifest optimizations: include `peerDependencies` in `@RegisterClass` manifest topological sort, prefer live workspace package directories over nested `node_modules`/`.pnpm` copies during dependency walking, cache `@RegisterClass` AST extraction by `(filePath, mtimeMs, size, isCompiledJS)`, eliminate duplicate SQL/DB generation passes on phased CodeGen providers, preload live base-view definitions/column sets in a single catalog read, and schedule PostgreSQL entity CodeGen across conflict-free 2-hop dependency waves with serialized `42P16` fallback recovery.
