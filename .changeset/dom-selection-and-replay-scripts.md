---
"@memberjunction/computer-use": minor
"@memberjunction/computer-use-engine": minor
"@memberjunction/testing-engine-base": minor
"@memberjunction/testing-engine": minor
"@memberjunction/core-entities": minor
---

DOM-grounded selection and replay scripts for Computer Use tests.

A Computer Use test currently pays full vision-model price on every run, re-deriving
the same sequence of clicks against a build that changed nothing it touches. This makes
the first passing run *compile* a replay script that later runs *execute* through the
same browser adapter — no screenshots, no model calls — with the model returning only
when replay stops working, which is exactly when a fresh derivation is worth paying for.

**DOM selection.** Element grounding hands the model an indexed list of the page's
interactive elements (role, accessible name, selector) so it acts by index instead of by
coordinate; a recorded target is then the element the model actually chose rather than
where its bounding box happened to be. `resolveActionLocator` narrows an ambiguous
selector to a single locator before acting — preferring visible matches, then the
smallest by area, which for a `:has-text()` ancestor chain is the element the model
meant. A multi-match is a guaranteed strict-mode throw today (and worse than a lost
click: the page does not change, so the loop detector ends the run as `LoopDetected`), so
disambiguating cannot regress any action that currently works.

**Replay.** Each step carries a multi-signal locator (selector primary; role + name as
the heal fallback), a fail-fast precondition, and a postcondition that confirms the step
advanced the page the way the recording did. Scripts are keyed by build hash, app
version, and goal hash: an exact build match replays with no healing expected, any
mismatch replays with healing, and a changed goal falls back to the model. Variable
*values* are never stored — recording tokenizes them to `%name%` and replay substitutes
fresh values — so a script holds no credentials and stays valid when the values change.
A replayed run is scored by deterministic goal postconditions distilled from the passing
run, not by a model verdict, which is what keeps the tier free.

**Storage.** Scripts live in the test row, at `Configuration.TestJSONScript` on
`MJ: Tests`. That column already exists, so there is **no migration** — this registers
JSONType metadata on it (`ITestConfiguration`, alongside the ~20 JSONType columns already
registered this way) and CodeGen emits a typed `ConfigurationObject` accessor. Reads are
free because the TestingEngine already caches the entity. `ITestConfiguration` declares
only framework-level properties over an index signature, so each driver's own
configuration passes through untouched and a future framework option is an interface edit
rather than a migration. The script shape necessarily exists twice — once as
`ComputerUseTrace`, once as the JSONType, because CodeGen emits the definition into
`core-entities`, which sits below the engine package — so `script-store.ts` asserts
assignability in both directions and `tsc` fails the build if either side drifts.

**Fallback.** A diverged replay falls back to the model within the same attempt and a
green fallback overwrites the script. The fallback restarts clean rather than inheriting
the failed replay's memo, and a replay is never re-recorded (that would launder healed
selectors into storage without re-deriving them). A test can refuse the pathway with
`Configuration.AllowLLMFallback: false`, which makes a divergence the result instead —
the right setting wherever a silent re-derivation would paper over the regression the
test exists to catch. Defaults to `true`.

Also adds `tier` and `ReplayTelemetry` (healed/diverged counts) to the testing-framework
result types, so drift is visible per attempt and survives a green fallback. Design doc:
`plans/regression-testing/dom-selection-and-replay-design.md`.
