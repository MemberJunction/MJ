---
"@memberjunction/codegen-lib": patch
---

CodeGen no longer ticks green when zero system integrity checks ran.

`runCodeGen` consumes `RunIntegrityChecks`'s results and fails the run on a failure — that landed
separately. It still had two outcomes where there are three: an **empty** result array satisfies
"no failures" and so printed the same success tick as a real pass. `RunIntegrityChecks(conn, true)`
runs only the checks whose `Enabled` is true, so it returns `[]` whenever
`integrityChecks.enabled` or `integrityChecks.entityFieldsSequenceCheck` is false — which is the
obvious way to quiet a check that is failing. A green tick over nothing measured is the same defect
as discarding the results, one line further along.

- New `SystemIntegrityBase.ClassifyResults()` returns `none-ran` / `passed` / `failed`. It is pure
  and unit-tested, so the distinction is pinned somewhere that does not require booting the
  pipeline — the previous inline version could not be tested at all.
- `none-ran` warns and writes a `reporter.note` (it is not a failure: disabling the checks is a
  legitimate, deliberate configuration).
- A failure now names the failing checks in the spinner line instead of counting them, and the
  success line reports how many checks actually ran.

No `failOnError`-style opt-out is offered: a failing integrity check reports `EntityField` Sequence
drift, which corrupts the column ordering `spCreate`/`spUpdate` depend on, so there is no state of
the world in which the finding should be reported and the run still green. A test pins the absence
of that knob, because adding one in good faith would silently stop every existing repo from failing.
