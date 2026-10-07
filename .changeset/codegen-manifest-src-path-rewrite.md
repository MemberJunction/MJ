---
"@memberjunction/codegen-lib": patch
---

fix(codegen-lib): the class-registration manifest scanner resolved a package's `types: ./src/index.ts` entry by replacing the first `/src/` in the absolute path. On a checkout that itself lives under a `src` folder that rewrote a parent directory, the scanner fell back to parsing the raw `.ts` entry, and every class reached through `export * from` was silently dropped from the generated manifest — so a locally regenerated manifest disagreed with CI's. The rewrite now applies only to the package-relative `src/` segment.
