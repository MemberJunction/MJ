---
"@memberjunction/core-entities": patch
---

Stop `UserInfoEngine`'s debounced settings flush from raising a process-level unhandled rejection.

`SetSettingDebounced` arms a 500ms timer whose callback called `FlushPendingSettings()` fire-and-forget — unawaited, with no `.catch()` — so any rejection from that flush escaped as an `unhandledRejection` rather than something a caller could handle. The rejection itself came from `SetSetting`, which read `md.CurrentUser?.ID` off `this.ProviderToUse`: the optional chain guarded `CurrentUser` but not the provider, and `ProviderToUse` resolves to `this._provider || Metadata.Provider`, which is `undefined` when no provider is configured or when one has been torn down while the timer was still armed.

Two changes: `SetSetting` now guards the provider itself (`md?.CurrentUser?.ID`), degrading to its existing "No user context available" path instead of throwing; and the debounce timer attaches a `.catch()` so no failure on that path — from this cause or any future one — can reach the process as an unhandled rejection.

Impact was mostly felt in CI, where a timer firing after a test environment was torn down failed the whole run with every assertion green: `Test Files 8 passed (8) / Tests 57 passed (57) / Errors 1 error`. Because it depends on where the 500ms timer lands relative to teardown, it was intermittent and reproduced on `next` itself — the same commit failed one scheduled run and passed the next.
