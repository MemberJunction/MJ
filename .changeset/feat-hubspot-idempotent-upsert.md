---
"@memberjunction/integration-engine": patch
"@memberjunction/integration-connectors": patch
---

Add an idempotent `Upsert` verb to integration connectors, implemented for HubSpot contacts.

**Engine** (`integration-engine`): a new CRUD verb alongside Create/Update/Delete — a `SupportsUpsert` capability getter and a default-throwing `Upsert(ctx)` on `BaseIntegrationConnector`, a new `UpsertRecordContext` type (carries `Attributes` plus an optional `IDProperty` override of the upsert key), and an optional `UpsertKey` field on `IntegrationObjectInfo` so objects can declare their natural unique business key. Purely additive: existing connectors inherit the throwing default, `UpsertKey` is optional, and the action-generator verb set is unchanged (no auto-generated Upsert action).

**HubSpot** (`integration-connectors`): `HubSpotConnector` overrides `Upsert` for contacts. This defines an error out of existence — a search-then-create sequence has a window in which a concurrent writer can create the same email-keyed contact, yielding `409 Contact already exists`; rather than catch and special-case that 409, `Upsert` issues a single idempotent call to `POST /crm/v3/objects/<object>/batch/upsert` with a batch of one (`idProperty`/`id` per input, `id` = the upsert-key value), which creates-on-missing and updates-on-existing without a 409, removing the race window entirely. The `idProperty` defaults from the object's `UpsertKey` metadata (`email` for contacts) and is overridable per call. It uses the write-verb error pattern: it never trusts a bare 2xx (a batch envelope reporting `numErrors`, a non-`COMPLETE` status, empty `results`, or a result with no object id all surface as `Success:false`), and a missing key/value fails with a 400 before any API call.

Note: the single-record `PATCH /crm/v3/objects/contacts/{email}?idProperty=email` was verified live to NOT create-on-missing (404), so the batch/upsert-of-one is the correct single-call idempotent path; the documented multi-input batch caveats (whole-batch 409, no partial upserts) do not apply at size one.
