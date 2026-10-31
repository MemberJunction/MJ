---
"@memberjunction/actions-bizapps-accounting": patch
---

Business Central `GetGLEntries` no longer requests or filters on `amount`, which the Business Central API v2.0 `generalLedgerEntry` does not have. It computes `amount` as `debitAmount - creditAmount` and applies `MinAmount` / `MaxAmount` to that value after the read.
