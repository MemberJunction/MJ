---
"@memberjunction/core": minor
---

Guard every fixed-GUID create in the shipped v6.1.x Metadata_Sync migrations, so an upgrade no longer fails on a primary-key violation when `mj sync push` ran before migrating (#4503). A row that is already correct is left correct; one carrying stale content from an older push is converged to the release's. Adds a CI gate that fails an unguarded fixed-GUID create, and an integration job covering the migrate → push → migrate sequence the existing job's ordering could never reach.
