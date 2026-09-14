---
"@memberjunction/codegen-lib": patch
---

Removed the unused `integrityChecks.failOnError` config key.

A failing CodeGen system integrity check already fails the run unconditionally: `runCodeGen`
consumes `RunIntegrityChecks`'s results, sets `pipelineSuccess = false`, and records each failure to
the run reporter and `commandFailures`. `failOnError` was written against the older code that
discarded those results, and nothing reads it — a config key whose default would decide whether a
repo silently stops failing is worse than no key at all.

No opt-out replaces it: these checks report `EntityField` Sequence drift, which corrupts the column
ordering `spCreate`/`spUpdate` depend on, so there is no state of the world in which the finding
should be reported and the run still green. Turning the checks off with `integrityChecks.enabled`
remains the supported way to opt out. A test pins the absence of the knob.
