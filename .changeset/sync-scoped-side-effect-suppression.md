---
'@memberjunction/core': patch
'@memberjunction/generic-database-provider': patch
'@memberjunction/sqlserver-dataprovider': patch
'@memberjunction/postgresql-dataprovider': patch
'@memberjunction/integration-engine': patch
---

Sync-scoped write-side-effect suppression. Record Changes and geocoding are per-write side effects, but the only way to relieve a high-volume writer of them was turning the entity flags off — which also turns them off for every human and API writer of the same entities, permanently. New `EntitySaveOptions.SkipRecordChanges` / `SkipGeoCoding` (and `EntityDeleteOptions.SkipRecordChanges`) scope the suppression to the individual save: providers omit the audit-row wrap and the geocode side trip for saves that carry the options, and only those. The sync engine sets them on its own writes when the connection asks via `Configuration.writeSideEffects === 'suppressed'` — fail-closed: absent or malformed configuration keeps the side effects on, and a save outside a suppressing sync run can never carry them. Materially identical to flags-off for the sync's writes; invisible to every other writer. The delete option is mirrored onto the GraphQL `DeleteOptionsInput` because the schema-sync gate requires every `EntityDeleteOptions` field to appear there, but it is **not honoured over the wire**: every wire entry point sanitizes it back to false and logs the attempt, because suppressing an audit row is a higher privilege than `entity:delete` — the only authorization a delete mutation performs. That keeps delete at exact parity with save, whose options have no GraphQL input type at all.
