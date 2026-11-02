---
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/integration-test-suite": patch
---

Regenerate the server class-registration manifests so `ServerBootstrap` imports `AutotagUpload` (`@memberjunction/content-autotagging`), which `@RegisterClass` declares but the committed manifest was missing; `next`'s Build failed the manifest freshness gate on every merge without it. Renumber the Chief of Staff integration test from IT138 to IT157, since IT138 was already the Query Extraction test and the suite-sequencing check requires each IT number to belong to one bundle.
