---
"@memberjunction/codegen-lib": patch
---

CodeGen's system integrity checks can now actually fail.

`runCodeGen` called `SystemIntegrityBase.RunIntegrityChecks()`, discarded the returned
`IntegrityCheckResult[]`, and printed a success tick unconditionally — so a run that had just logged
`Integrity check FAILED: entityFieldsSequenceCheck` went on to report `success: true, errors: []`.
A nightly drift-gate run has carried exactly that, on green, for weeks.

The results are now consumed: failures are reported as failures (no success tick, each failing check
named with its message), and `integrityChecks.failOnError` decides whether they stop the run.

`failOnError` defaults to `false` because the `MJ: Entities` Sequence drift these checks report is
live on `next` today; flipping it in the same change would red every CodeGen run before anyone could
act on the finding. Honest reporting is not gated on it. Flip the default once that drift is
resolved — that is the last step of this fix, and a test pins the default so it stays a deliberate
act rather than a tidy-up.
