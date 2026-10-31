---
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities": minor
---

CodeGen entity class output: generated validators compare UUID fields with `UUIDsEqual` instead of `===`/`!==` (an emit-time rewrite, so cached validators are fixed too, and a new rule in the check-constraint parser prompt) (#3984); one `Validate*` method per CHECK constraint when two stored validator rows share its source, with a warning naming the dropped rows (#5834); value-list values are escaped in the generated TypeScript union, `z.literal`, doc comments and `describe()` text, so a backslash, quote or backtick no longer breaks the build (#5952). `minor` because the prompt template under `metadata/` changes.
