---
'@memberjunction/ng-base-forms': patch
---

Scope `LoadFormChromeRules`' read to the provider it was handed.

The function resolves `md = provider ?? Metadata.Provider` and checks the entity is in that provider's metadata — then ran the actual query through `new RunView()`, which binds the **global** provider. In a multi-provider app that validated against the caller's provider and read from a different one, so a form could be handed another environment's chrome rules, or none, depending on which provider happened to be global at the time. The `provider` parameter was effectively decorative for the read.

Now `RunView.FromMetadataProvider(md)`, so the check and the read use one provider. Single-provider apps are unaffected — there `md` *is* the global provider.

This also clears the repo's `ui-layers` adopted-standard error, which had been failing the `adopted standards` gate on every PR that merged `next`.
