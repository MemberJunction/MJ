---
"@memberjunction/server": patch
---

Point the package's `types` entry and a new `types` export condition at the built declarations in `dist/index.d.ts`, so consumers no longer type-check the server's TypeScript sources under their own compiler options.
