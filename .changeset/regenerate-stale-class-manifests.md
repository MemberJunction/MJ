---
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Regenerate the class-registration manifests so they include the per-connection integration catalog entities (`MJCompanyIntegrationObjectEntity`, `MJCompanyIntegrationObjectFieldEntity`) and the local dev auth providers (`MJLocalDevProvider`, `LocalDevProvider`). Without them those classes can be tree-shaken out of bootstrapped apps, and `next`'s manifest freshness check fails.
