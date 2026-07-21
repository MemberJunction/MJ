---
"@memberjunction/integration-test-suite": patch
---

Add the required `repository` block to `@memberjunction/integration-test-suite`. The `validate-package-repository.sh` CI gate requires every `@memberjunction/*` package to declare `repository.url` for npm sigstore provenance; this package shipped without it and was failing the build and publish workflows.
