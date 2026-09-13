---
"@memberjunction/core": patch
"@memberjunction/server": patch
---

`BaseEntityResult.CompleteMessage` now renders a `ValidationErrorInfo` as its prose instead of as a JSON blob.

The getter mapped its `Errors` array with `err.message || JSON.stringify(err)` — **lowercase** `message` — while MJ's own `ValidationErrorInfo` carries **`Message`**. Every validation error therefore fell through to the JSON fallback, and `CompleteMessage` is what the server hands the client on a failed save (`ResolverBase`'s write-refusal throws put it in the `GraphQLError`; `SaveEntityGraphOperation` puts it in `ErrorMessage`). So a carefully-worded refusal written in a subclass's `ValidateAsync()` — or MJ core's own `EntityField.Validate()` — reached the user as `{"Source":"Name","Message":"Name cannot be longer than 50 characters…","Value":"…the entire rejected value…","Type":"Failure"}`.

Both readers are fixed through one shared helper, `BaseEntityResult.ErrorText()` (`Message` → `message` → JSON): the `Errors` array and the single `Error` property, which carried the same lowercase-only assumption. The JSON fallback is kept for a shape with neither field, so nothing that used to say something now says nothing.

A second, independent half of the same user-visible failure is fixed alongside it: only `ResolverBase.CreateRecord` read `CompleteMessage`. `UpdateRecord` and `DeleteRecord` read the bare `Message`, which a validation refusal leaves `null` — so the `?? 'Unknown error'` fallback fired and the reason was discarded entirely. The same rule on the same entity therefore explained itself on a create and said "Unknown error" on an update. Both now read `CompleteMessage`, which is a strict superset of `Message` and still yields `undefined` when there is nothing to say, so the fallback still fires rather than showing a blank error.
