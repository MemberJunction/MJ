---
"@memberjunction/ai-agents": minor
"@memberjunction/storage": patch
"@memberjunction/server": patch
---

A failed upload reports the driver's real cause instead of "Storage upload failed."

A realtime recording upload surfaced to the client as `{"Success":false,"FileID":null,"ErrorMessage":"Storage upload failed."}` while the actual cause was Google's, and was actionable: *"Service Accounts do not have storage quota. Leverage shared drives instead."* Four layers each discarded it — the Drive driver's catch reduced the SDK error to a bare `console.error` and `return false`; `FileStorageEngine.UploadFile` threw a path-only generic; `storeRealtimeRecording` logged and then returned `string | null`, so the reason it had just logged could not leave; and the resolver reported the generic. The layer people see is the fourth; the information died at the first.

**`PutObject`'s `Promise<boolean>` contract is deliberately untouched.** `FileStorageBase` documents boolean-means-success and every driver implements it, so making it throw would break every driver and caller. Every `return false` / `return true` in the driver is byte-for-byte what it was — this is only about not *erasing* the cause on the way up.

The Drive driver gains `describeGoogleApiError`, which extracts named fields (`code`, `message`, `errors[].reason`, `errors[].message`, `response.data.error.message`) — an allowlist rather than a dump, because MJStorage ships `rawErrorLogging.guard.test.ts` forbidding drivers from logging a vendor error wholesale. The four catches that rethrow a generic now append the cause, matching the precedent already in that file at `CreatePreAuthDownloadUrl`.

**Breaking for direct callers of `storeRealtimeRecording`** (hence minor on `@memberjunction/ai-agents`): it returns `{ FileID, ErrorMessage }` rather than `string | null`. A caller that used the returned id directly now reads `.FileID`; the null check becomes a check on `FileID`, with `ErrorMessage` carrying the reason that was previously unreachable.
