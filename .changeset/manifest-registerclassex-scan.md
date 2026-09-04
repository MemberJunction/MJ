---
"@memberjunction/codegen-lib": patch
---

`mj codegen manifest`: recognize `@RegisterClassEx` alongside `@RegisterClass`. Both AST scan paths (TypeScript source and compiled `__decorate` output) matched the decorator identifier literally, so every options-bag registration was silently absent from the generated manifest — and from the coverage audit built on the same scan, which therefore could not report the gap either (#3944). Both paths now test set membership and share one key extractor handling either argument shape (positional string literal, or the options bag's `key`). `EntityNameScanner.classifyParentContext` gets the same treatment, plus a case for the options bag's `key` property, scoped to a register decorator's own options object. Regenerating MJ's manifests adds 25 previously invisible `BaseFormPanel` contributions from `@memberjunction/ng-core-entity-forms` and removes none.
