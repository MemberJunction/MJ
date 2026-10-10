---
"@memberjunction/storage": patch
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
"@memberjunction/search-engine": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Storage permissions: close the gaps a review found around `StorageAccessEvaluator`. The rules, in one place:

- **Account gate everywhere.** Every path that acts on a storage account for a user asks `StorageAccessEvaluator` first — the GraphQL storage routes, and now the File Storage core actions (Get Download URL, Get Object, Get File Content, Get Metadata, List Objects, Search Storage Files, Object/Directory Exists need `Read`; Get Upload URL, Copy, Move, Delete Object, Create/Delete Directory need `Write`), `List Storage Accounts` (lists only accounts the caller may read) and `BaseFileHandlerAction` (`Write` on the account a save lands in; reads go through the file-ID gate). These actions are reachable by any user through `RunAction` and by any agent. An unknown account name and a refused account return the same `ACCESS_DENIED` result. Zero permission rows on an account still means open (the current product rule, unchanged).
- **File-ID routes gate the account the row resolves to.** `FileStorageEngine.ResolveFileObject` (new) resolves an `MJ: Files` row's provider to its account, requires the caller's access on it, and applies the tracked-file rule to the row's object. `DownloadUrl`, `GetFileContents`, `CreateMediaAccessToken`, `DeleteFile` and the `UpdateFile` rename (`Write`), `ArtifactFileDownloadUrl`, the conversation-attachment blob store, the agent file handler and `ReadRealtimeRecordingFile` use it, so a row whose `ProviderKey`/`Name` aliases another row's object is refused.
- **Tracked-file rule.** An object backing an `MJ: Files` row may be read, signed, listed, returned by search, overwritten, moved, copied or deleted only when the caller can read that row (the minimum for a write; `CanWrite` is still required). Applied to the Get Object / Get File Content / Get Metadata / Get Download URL / Get Upload URL / Copy / Move / Delete Object actions, `CreatePreAuthDownloadUrl`/`CreatePreAuthUploadUrl`, `DeleteStorageObject`, `MoveStorageObject` and `CopyStorageObject` (source and destination), `CopyObjectBetweenAccounts` (both ends), `UploadFile` (before `PutObject`), and as a filter on `ListStorageObjects`, `SearchAcrossAccounts`, the List Objects / Search Storage Files actions and `SearchEngine`'s storage hits.
- **Key canonicalization.** Client and stored keys go through one canonicalizer, `FileStorageBase.NormalizeObjectKey` (default: trim, collapse repeated `/`, strip leading/trailing `/`; S3 overrides it to strip its key prefix the way it addresses keys), and are compared case-insensitively (`LOWER(...)` in SQL). Keys with a `.`/`..` segment, a backslash, a percent-encoded `/`, `\`, `.` or control character, or a raw control character are refused outright.
- **No truncation.** Every evaluator read sets `IgnoreMaxRows`, so the entity row cap can no longer drop an account's rows (which read as "zero rows → open") or a tracked file's row; lookups are batched.
- **Azure pre-authenticated URLs** are blob-scoped service SAS tokens (`r` to download, `cw` to upload) instead of account-wide SAS tokens; expiry is unchanged (10 minutes).
- **`MJ: Files` storage location is server-owned on existing rows.** `MJFileEntityServer` refuses a save that changes `ProviderID` or `ProviderKey` on an existing row (including `ReplayOnly`) unless trusted server code sets `AllowStorageLocationChange` (registered in both server-bootstrap class manifests). A new row may still carry a client-chosen `ProviderKey` (Explorer's direct-upload path registers its upload that way); the routes' gate above is what makes such a row harmless.
- **Search details.** `SearchAcrossAccounts` reports accounts in request order and withholds `totalMatches`/`nextPageToken` once hits are dropped; under an `Audience` storage hits are dropped (re-checked for the caller only; per-reader storage checks are a follow-up). `ListStorageObjects` reads the typed `Configuration` property.

Also fixed: the `List Storage Providers` action could never run. Its class was registered as `List Storage Accounts`, which no metadata row names; it is now registered under the shipped action's `DriverClass`, `List Storage Providers`.
