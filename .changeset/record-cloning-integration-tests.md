---
"@memberjunction/testing-integration": patch
"@memberjunction/integration-test-suite": patch
---

Add the `record-cloning` integration bundle (`IT95 - Record Cloning`, client transport): RC1 to RC9 from the record cloning plan (user, prompt and action clones, dry run, authorization refusal, rollback, provenance, stale plan hash, Record Change annotation) plus RC10 to RC12, read-only plans against the live database (unlisted relationships skipped, company integrations and encrypted values kept out of a scheduled job plan, and the user settings exclusions). `IntegrationCheckContext` gains a `RecordCloningFixture`.
