---
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Regenerate the server class-registration manifests to include `MJDataContextItemEntityServer`, which #5266 added without regenerating them. Until this lands, `next`'s Build job fails "Committed class-registration manifests are STALE".
