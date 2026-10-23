---
"@memberjunction/core": minor
---

`BaseEntity` gains a delete-validation seam — `ValidateDelete()` and `ValidateDeleteAsync()` — so a delete can be refused **with a reason** (MJ #3971).

`Save()` has had one since forever: return a `ValidationResult`, let the framework decide, get field-named errors in front of the user. `Delete()` had nothing — no `ValidateDelete`, no `CanDelete`, no vetoable `before_delete`, no `PreDeleteHook`. The only way to refuse a delete with an explanation was to override `Delete()` itself and return `false`, which throws the explanation away (a `boolean` has nowhere to put "this template is referenced by 5 signed contracts"), covers only callers that reach that subclass's method, and gives no ordering guarantee relative to permissions, events or the companion delete graph. Applications had reimplemented the pattern once per entity, each slightly differently.

The new methods are called from `_InnerDelete` in the slot `Validate()` occupies in `_InnerSave`: **after** `CheckPermissions` (a user without delete rights still gets a permission error, not a validation message) and **before** any provider work or the `delete_started` event. A refusal is recorded with both `Errors` (field-named, `Source` intact) and `Message` — which is what makes it visible, since `ResolverBase.DeleteRecord` and MJ's own Explorer delete callers already surface `LatestResult?.Message` and previously showed "Unknown error".

Two details worth knowing:

- **The async half turns on by being overridden**, decided by the *same* policy the save seam uses. `DefaultSkipAsyncValidation` now governs both seams through one shared helper, so an entity states its async-validation policy once rather than once per verb: an explicit `SkipAsyncValidation` option wins, then an explicit override of that getter (either value), and only when nobody stated a policy is it inferred from whether the async validator was overridden. That flag never suppresses the synchronous half — an opt-out of expensive rules must not become a way to delete a row the entity said could not be deleted.
- **A companion delete plan is validated whole, up front.** Children are deleted first (they hold the foreign keys), so a refusal discovered at the root's turn would already have removed them — and on a client provider there is no transaction to undo that. Plan nodes are flagged so no rule, or its query, runs twice.

Purely additive: entities that override neither method behave exactly as before.
