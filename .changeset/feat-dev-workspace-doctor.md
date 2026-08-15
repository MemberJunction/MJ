---
"@memberjunction/cli": patch
---

New `mj dev workspace doctor`: a read-only health check for a generated cross-repo workspace that prints PASS/WARN/FAIL/SKIP per check and exits non-zero on any failure — including a one-copy census of the parent package store that fails when more than one version of `@angular/core`, `@angular/common`, `@angular/compiler`, `rxjs`, `zone.js`, `@memberjunction/core` or `@memberjunction/global` is installed.
