---
"@memberjunction/codegen-lib": patch
---

Fix manifest generator to detect @RegisterClass in npm packages that only ship dist/ by falling back to scanning compiled JS files for __decorate patterns
