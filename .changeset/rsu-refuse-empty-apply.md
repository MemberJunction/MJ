---
"@memberjunction/server": patch
---

An apply whose selected objects produce no tables now fails instead of running RSU on nothing.

`buildTargetConfigs` already drops a selected object that is not in the source schema, has no fields or has no primary key, and logs each drop — but every execution path then built and ran a migration anyway. With nothing accepted that migration was a header-only file, and every step after it was green: RSU wrote the file, opened and merged the PR, ran CodeGen, Explorer redeployed, and the sync "completed" over zero entity maps. Seen 2026-10-29 on a PropFuel connection — three selections requested, three dropped as `notInSchema`, three empty `RSU_` migrations committed, no entities.

`IntegrationApplySchema`, the connector build behind `IntegrationApplySchemaBatch`, `IntegrationApplyAll` and `IntegrationApplyAllBatch`, and `IntegrationSchemaEvolution` now throw `NO_TARGET_TABLES` when none of the selected objects produced a target table. The error names the requested objects (up to five, then a count) and why each was dropped. The existing `catch` turns it into `Success: false`. In the two batch mutations it fails only that connector. Schema evolution's error says what it had already committed: the refreshed catalog, and the removed objects' maps disabled. `IntegrationSchemaPreview` is not gated, because an empty preview is an honest answer.

`IntegrationApplySchema` now matches selected names case-insensitively, as `buildSchemaForConnector` already did. Before, a selection whose casing differed from the stored name selected nothing.

Empty migration SQL is still valid. A re-apply whose tables already exist, with no column changes, produces none, and still has entity maps to create, unselected maps to disable and a sync to start.
