---
"@memberjunction/core-entities": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-core": patch
---

Fix collection sharing end-to-end: run the share-create authorization gate against the entity's provider with the caller as contextUser (it previously rejected every share server-side), surface the real block reason instead of "Unknown error creating record", open shared collections from the Sharing Center via the Collections nav item, and polish the shared-indicator UI (badge sizing/styling, Shared chip, owner name resolution and truncation). Includes share-affordance gating for legacy null-OwnerID collections and regression tests for the create gate.
