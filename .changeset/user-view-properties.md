---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/integration-test-suite": patch
---

Properties on user views (#4789, A14): a view can declare named, typed inputs, each of which adds one predicate on a field when a run gives it a value or it has a default. A property whose `AllowOverride` is false can be set only by server code. A view without properties runs, saves and caches exactly as before.

- `@memberjunction/core`: `RunViewParams.Properties` (values a client may set) and `RunViewParams.ServerProperties` (server only; added to `SERVER_ONLY_RUN_VIEW_PARAMS`, so the REST view routes strip it). New `viewProperties` module: `ValidateUserViewProperties` (save-time checks), `ResolveViewPropertyValues` (value from server values, then client values, then the default; refuses unknown names, a client value for a locked property, a wrong type, and a required property with no value, each naming the property) and `BuildViewPropertyFilter` (typed literals through the platform dialect; `IN` takes a list). Both properties maps are part of the result-cache fingerprint and of `RunViewParams.Equals`. In the browser a run carrying properties is never merged with other callers' runs, never cached locally, and never sent through the cache-check transport (which carries dynamic runs only). `IsPropertyValueOfType` is exported from the context-token module.
- `@memberjunction/core-entities`: `MJUserViewEntityExtended.Validate()` checks the view's `Properties`.
- `@memberjunction/generic-database-provider`: a stored view's property predicates are ANDed after the view's own clause and `ExtraFilter`, screened, and field-security checked; row-level security applies on top unchanged. Before the cache lookup the provider works out the values (token defaults with the context user and the run's `TimeZone`, UTC when none), so the server cache keys on what the run uses; a run it would refuse skips the cache and is refused with its message.
- `@memberjunction/server`: `RunViewByIDInput`, `RunViewByNameInput` and `RunViewGenericInput` accept `Properties` (JSON). No input accepts `ServerProperties`. `RunViewByID` / `RunViewByName` now return the provider's `ErrorMessage`.
- `@memberjunction/graphql-dataprovider`: sends `Properties` on stored-view runs; throws for `Properties` on a dynamic run or any `ServerProperties`.
- `@memberjunction/ng-entity-viewer`: a view with properties is run by its ID with the new `Properties` input, for every view type, paging, the count and the export; a read-only chip row lists each property (a locked one reads "set by server") and shows a refusal. The view config panel gets a Properties tab (add, edit and remove properties: name, type, description, default as a fixed value or a token with an offset, required, allow override, target field and operator), and the workspace saves them onto the view.
- `@memberjunction/integration-test-suite`: IT121, `view-properties-client` (VP1–VP5, client transport).
