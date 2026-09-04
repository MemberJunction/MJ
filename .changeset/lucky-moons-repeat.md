---
"@memberjunction/sqlserver-dataprovider": patch
---

Keep the `UserCache` export alive for published consumers.

`UserCache` moved to `@memberjunction/generic-database-provider` so `Refresh` could be
dialect-neutral, but the old export was removed outright — a breaking change for anything already
importing it from `@memberjunction/sqlserver-dataprovider`. Re-exported here and marked
`@deprecated`, pointing at the new home.

The failure mode is quiet, which is why it went unnoticed: an Open App whose server package imports
the missing symbol throws a SyntaxError during bootstrap, MJAPI carries on starting, and the only
visible symptom is that the app is absent.
