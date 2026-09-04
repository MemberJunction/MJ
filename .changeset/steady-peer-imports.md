---
"@memberjunction/codegen-lib": patch
"@memberjunction/core": patch
---

Add `entityImportPackages` so CodeGen imports peer entity classes (embeds and related-record collections) from the npm package that owns them, instead of self-importing string `entityPackageName`. Unmapped foreign schemas fail the run.
