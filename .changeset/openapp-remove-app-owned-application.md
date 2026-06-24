---
"@memberjunction/open-app-engine": patch
---

fix(open-app): remove an app's own Application row on uninstall so reinstall doesn't collide

An Open App's metadata-sync migration registers an `Application` (with a fixed UUID) that groups the app's entities via `ApplicationEntity`. `RemoveAppEntityMetadata` deleted those link rows and the entities, but left the `Application` row orphaned — so a later reinstall's migration re-`INSERT`ed the same fixed UUID and failed with `duplicate key value violates unique constraint "PK_Application_ID"`, breaking the reinstall path (including the Error-state reinstall this PR otherwise enables).

Removal now deletes any Application **wholly owned** by the removed schema (every one of its `ApplicationEntity` links points at an entity being removed). An Application that also groups another app's entities is left intact. The deletion runs **best-effort, after** the atomic metadata-cleanup transaction commits (the link rows are gone, so a wholly-owned Application is childless): if the row still has FK dependents a user added (a Dashboard, role/user assignment, conversation), `Delete()` returns false, the row is left in place — a reinstall reuses it — and a warning is surfaced. A leftover Application is the prior behavior, so this can never fail or regress a removal. +2 unit tests.
