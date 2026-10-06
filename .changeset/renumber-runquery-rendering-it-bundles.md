---
"@memberjunction/integration-test-suite": patch
---

Renumber the RunQuery rendering integration bundles from IT99/IT100 to IT102/IT103. #5040 and #4830 both claimed IT99 and IT100, which failed the bundle-numbering and bundle-count guards on `next`. The PostgreSQL migration lane now runs the matrix bundle under its new name.
