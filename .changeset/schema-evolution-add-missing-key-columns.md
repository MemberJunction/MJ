---
"@memberjunction/integration-schema-builder": patch
---

A schema refresh now adds a key column that is missing from an existing integration table. When a connector upgrade adds a field to an object's key (for example `id` to `id + newsletter_id`), the column is added as nullable, because the rows already stored have no value for it. Before, the refresh skipped it with no warning but still wrote the new key to `additionalSchemaInfo`, so the key named a column that did not exist and the sync wrote the values to `__mj_integration_CustomOverflow`. A type change on an existing key column is still only a warning.
