---
"@memberjunction/codegen-lib": patch
---

Large-schema CodeGen efficiency (PostgreSQL): route `executeSQLFileViaShell` / `regenerateBaseView` / `executeEntityPhased` through a pooled client instead of opening a fresh `new pg.Client()` per entity (~2,000 connection handshakes on a 2k-table install; far worse over a network-attached Aurora). Also applies the codegen `statement_timeout` GUC the ad-hoc clients lacked.
