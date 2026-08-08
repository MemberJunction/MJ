---
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
---

fix(core): post-merge review fixes for entity companions / related-record collections / unified transaction scope (PR #3585)

- Settle the entity-transaction scope on every `_InnerSave`/`_InnerDelete` exit path (clean-chain save, provider `Delete()` returning false, provider `Save()` returning falsy data)
- Run composite graph saves through the in-flight save debounce; refuse TransactionGroup + companion graphs loudly
- Skip read-only collections in `Validate`/`ValidateAsync`/`Serialize` — a projection contributes no validation, no FK stamping and no wire payload
- Guard `BaseEntity.LoadRelatedRecords` against wiping staged children (unsaved parent / loaded / dirty collections) and escape the parent key in its filter
- Skip clean, already-persisted children at save-plan level so header-only edits stay on the single-row path (`IgnoreDirtyState` still forces a full write-out)
- Label remote graph CREATEs as `create` (result history + `save` event subtype)
- Await `LoadFromData` in `copyRecords`, clone `Date` values into copies
- Enforce lazy ⇒ cache ⇒ read-only at declaration time; accurate lazy-miss diagnostic; new non-throwing `TryItems()` probe for display-tier code
- SQL Server: recover from doomed-transaction savepoint rollback failures (full rollback + state reset); report real nesting via `CurrentTransactionDepth`; detect out-of-order scope settlement on shared providers
- `RunInEntityTransaction` preserves the original error when rollback also fails
