---
'@memberjunction/server': patch
'@memberjunction/codegen-lib': patch
---

Fix external-data-source single-record `Load` through the GraphQL transport (Explorer full-record forms).

The generated single-record GraphQL query resolver ran `SELECT * FROM <baseView>` directly, which has no analogue for external-data-source entities — their data is proxied live from a remote system and no MJ view exists — so opening an external record's **full** form in Explorer failed (`InnerLoad returned false`), even though the grid (`RunView`) and the provider-level single-record `Load` already routed externally.

- **`@memberjunction/server`**: new `ResolverBase.LoadExternalRecordByKey` loads an external record by primary key through a `BaseEntity` object, which the data provider dispatches to the external read router (the same path the grid uses), applying the same RLS gate and row post-processing (field decryption / datetime normalization) as the MJ-DB path.
- **`@memberjunction/codegen-lib`**: the single-record resolver template now branches on `ExternalDataSourceID` — external entities call `LoadExternalRecordByKey`, while every MJ-DB entity keeps the identical `SELECT * FROM <baseView>` path (the branch is inert without the feature). Record-access audit logging (`AuditRecordAccess`) is preserved on the external branch.

Verified end-to-end in Explorer against a live PostgreSQL source — the full read-only record form now renders the remote row.
