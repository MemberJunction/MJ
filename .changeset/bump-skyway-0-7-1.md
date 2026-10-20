---
"@memberjunction/cli": patch
"@memberjunction/open-app-engine": patch
---

Use Skyway 0.7.1. Migration errors now keep the real cause: when a failed batch had already aborted its transaction (a timeout or severe error), the follow-up rollback's "Transaction has been aborted" no longer replaces the batch's own error, and driver errors keep their full detail (message number, procedure and line, earlier errors in the batch). Skyway 0.7.0 also lets a migration opt out of its transaction with a Flyway-style `<file>.sql.conf` containing `executeInTransaction=false`; migrations without one behave as before.
