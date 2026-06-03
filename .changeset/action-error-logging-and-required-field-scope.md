---
"@memberjunction/actions": minor
"@memberjunction/metadata-sync": minor
---

fix(actions): surface real action errors instead of swallowing them

`ActionEngine.InternalRunAction`'s catch block called `LogError(message, e)`, but `LogError`'s second positional parameter is `logToFileName` — so the thrown `Error` was consumed as a (non-string) filename and never printed. Every failed action logged only `Error running action <name>:` with no message or stack. It now uses `LogErrorEx({ message, error })` so the real message and stack trace are logged, and the returned result `Message` handles non-`Error` throws.

feat(metadata-sync): only warn about missing required fields for NEW records

The "Required field X is missing" best-practice warning fired for existing records too (e.g. `BaseView` on `MJ: Entities`), even though the value is already persisted in the DB. Since metadata files commonly set only a subset of fields on an update, this produced noise that masked genuine warnings. The validator now threads the record's `primaryKey` presence down to the required-field check and runs it only for new (unsaved) records.
