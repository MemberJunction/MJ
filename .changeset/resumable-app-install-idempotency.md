---
"@memberjunction/core": minor
"@memberjunction/open-app-engine": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-core-entity-forms": patch
---

Make `mj app` install/upgrade/uninstall resumable and idempotent. The install orchestrator now records its last-completed step (new `OpenApp.LastCompletedStep` column) so a crashed or interrupted run picks up where it left off instead of re-running already-applied steps, and mutex guards prevent concurrent install/upgrade/uninstall operations against the same app from racing each other.
