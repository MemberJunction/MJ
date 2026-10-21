---
"@memberjunction/storage": patch
---

Add `StorageAccessEvaluator`, the one place storage-account permissions are decided. It evaluates `MJ: File Storage Account Permissions` (Everyone / Role / User rows, `CanRead` / `CanWrite`) per call — nothing is snapshotted — reading the rows as the MJ system user and deciding for the calling user. An account with no permission rows stays open to every user (the current product rule, now kept in one named place). It fails closed: an unknown account, a malformed ID, a user without `UserRoles`, no resolvable system user, or a failed permission read all mean "no access", and an unknown account is refused with the same message as a restricted one. It also reports which object keys in an account back an `MJ: Files` row the user cannot read. `FileStorageEngine.GetDriver()` itself is unchanged and still does no user check: callers acting for a user must ask the evaluator first.
