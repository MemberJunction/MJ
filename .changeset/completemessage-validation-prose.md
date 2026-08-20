---
"@memberjunction/core": patch
---

`BaseEntityResult.CompleteMessage` now renders a `ValidationErrorInfo` as its prose instead of as a JSON blob.

The getter mapped its `Errors` array with `err.message || JSON.stringify(err)` — **lowercase** `message` — while MJ's own `ValidationErrorInfo` carries **`Message`**. Every validation error therefore fell through to the JSON fallback, and `CompleteMessage` is what the server hands the client on a failed save (`ResolverBase.CreateRecord`/`UpdateRecord` put it in the `GraphQLError`; `SaveEntityGraphOperation` puts it in `ErrorMessage`). So a carefully-worded refusal written in a subclass's `ValidateAsync()` — or MJ core's own `EntityField.Validate()` — reached the user as `{"Source":"Name","Message":"Name cannot be longer than 50 characters…","Value":"…the entire rejected value…","Type":"Failure"}`.

Both readers are fixed through one shared helper, `BaseEntityResult.ErrorText()` (`Message` → `message` → JSON): the `Errors` array and the single `Error` property, which carried the same lowercase-only assumption. The JSON fallback is kept for a shape with neither field, so nothing that used to say something now says nothing.
