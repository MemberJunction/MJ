---
"@memberjunction/integration-schema-builder": patch
---

A schema refresh now adds a key column that is missing from an existing integration table. When a connector upgrade adds a field to an object's key (for example `id` to `id + newsletter_id`), the column is added as nullable, because the rows already stored have no value for it. A sync cannot match those rows, so the refresh warns that the object's rows and record maps must be cleared and the object fully re-synced (6.2 and later do this automatically). Before, the refresh skipped the column with no warning but still wrote the new key to `additionalSchemaInfo`, so the key named a column that did not exist and the sync wrote the values to `__mj_integration_CustomOverflow`. A type change on an existing key column is still only a warning, and that check now compares only the SQL type, so a key column added as nullable is not reported as changed on every later refresh.
