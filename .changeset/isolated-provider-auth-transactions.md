---
"@memberjunction/server": patch
---

Transactions opened outside a GraphQL request no longer run on the shared `Metadata.Provider`. A provider's ambient transaction is per instance, so a transaction there nested into every concurrent caller's, and one left open swallowed every later global-provider write (scheduled jobs, REST extensions, agent logging) until the process restarted. New-user creation, magic-link provisioning and SyncData's delete-with-filter now each run on their own provider over the shared pool, via the new exported `CreateIsolatedProvider()`, the global provider's existing `CreateIndependentInstance()`. SyncData's delete-with-filter also loads its rows from that provider, so each `Delete()` actually runs inside the transaction.
