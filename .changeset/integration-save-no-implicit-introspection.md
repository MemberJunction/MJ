---
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
---

Stop running a live source introspection inside `CompanyIntegration.Save()`

`MJCompanyIntegrationEntityServer` no longer overrides `Save()` to fire
`IntegrationConnectorCreationPipeline` on an `IsActive false→true` transition.
That hook made an unbounded scan of the customer's source a side effect of
writing a row — it ran for any writer of that transition, inside the caller's
HTTP request, and on the create path it ran before the credential had been
tested.

Discovery is now something a caller asks for:

- `IntegrationCreateConnection` creates the row inactive and activates it only
  after the credential test, so the scan can never run against a password that
  is about to be rejected and rolled back.
- `IntegrationReactivateConnection` gains a `runSchemaRefresh` argument
  (default `true`, matching the previous behaviour) so the refresh is visible
  in the API and can be declined.
- `runSchemaRefreshPipeline` now takes the `IntegrationEngine` maintenance lock,
  which the other pipeline call sites already held, and supplies the
  SoftPKClassifier LLM callback the save hook used to provide.

`MJCompanyIntegrationEntityServer.RunSchemaRefreshPipeline()` is public for
callers that want the old behaviour explicitly.
