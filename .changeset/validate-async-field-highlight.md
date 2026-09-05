---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-base-forms": patch
---

A save refused by a server-side `ValidateAsync()` now highlights the offending field(s) in the form — red border plus the inline message — exactly as a synchronous `Validate()` refusal does, instead of only toasting. `ResolverBase` write refusals carry `extensions.validationErrors` (and `SaveEntityGraphOperation` a `ValidationErrors` output) beside the unchanged message; `GraphQLDataProvider` rehydrates them into `LatestResult.Errors`; `BaseFormComponent` publishes both refusal kinds through one path; `mj-form-field` keeps a server-reported error visible on a field the user had already edited until they edit it again. Errors with no field source stay toast-only.
