---
'@memberjunction/ng-base-forms': patch
'@memberjunction/core': patch
'@memberjunction/ng-core-entity-forms': patch
---

Forms detach their transaction group from every record once it is submitted, so deleting or saving one of those records later in the same session is no longer queued into a completed group and silently dropped (e.g. deleting a Template content version that was just saved). `BaseEntity.TransactionGroup` accepts `null`. The Template Editor tracks its contents load state, so a failed or overtaken load is never shown as "no content" (#4754).
