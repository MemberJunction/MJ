---
"@memberjunction/metadata-sync": patch
"@memberjunction/integration-test-suite": patch
---

`mj sync validate` and `mj sync push` accept a later folder that sets a record's field again, on purpose, when that folder lists the field in `overrides` in its `.mj-sync.json`: `"overrides": [{ "folder": "<earlier folder>", "fields": ["Status"] }]`. Validation reports the declaration if the folder is not an earlier entity folder under the metadata root or a field is not on the entity. A conflict between two folders now names `overrides` as a fix. The `metadata-sync-push` integration bundle gains MSP11–MSP12.
