---
"@memberjunction/server": patch
---

An apply whose selected objects produce no tables now fails instead of running RSU on nothing.

`buildTargetConfigs` already drops a selected object that is not in the source schema, has no fields or has no primary key, and logs each drop — but `IntegrationApplySchema`, `IntegrationStartSync`/`ApplyAll` (`buildSchemaForConnector`) and `IntegrationSchemaEvolution` then built and ran a migration anyway. With nothing accepted that migration was a header-only file, and every step after it was green: RSU wrote the file, opened and merged the PR, ran CodeGen, Explorer redeployed, and the sync "completed" over zero entity maps. Seen 2026-10-29 on a PropFuel connection — three selections requested, three dropped as `notInSchema`, three empty `RSU_` migrations committed, no entities.

The three execution paths call a new `assertTargetConfigs` after `buildTargetConfigs` and throw `NO_TARGET_TABLES` naming the requested objects when none produced a target table. The existing `catch` turns that into `Success: false` on the apply. `IntegrationSchemaPreview` is not gated — an empty preview is an honest answer.

Empty migration SQL is still valid: a re-apply whose tables already exist with no column changes produces none, and still has entity maps to create, unselected maps to disable and a sync to start.
