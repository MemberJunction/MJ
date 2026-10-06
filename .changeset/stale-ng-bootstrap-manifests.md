---
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Regenerate the browser class-registration manifests. The committed files listed every class but carried a stale `CLASS_REGISTRATIONS_COUNT` and off-by-one chunk boundaries, which failed the manifest freshness gate on `next`.
