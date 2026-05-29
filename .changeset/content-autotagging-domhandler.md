---
"@memberjunction/content-autotagging": patch
---

Declare `domhandler` as a direct dependency. `AutotagWebsite.ts` imports the `AnyNode` type from it; previously it was resolving transitively through `cheerio`, which the workspace dependency-check job flagged as a missing dependency.
