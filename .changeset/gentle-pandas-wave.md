---
"@memberjunction/mobile-app": patch
---

Add repository.url to MobileApp package.json to satisfy the validate-package-repository CI gate, which was failing on every PR since the package landed without it
