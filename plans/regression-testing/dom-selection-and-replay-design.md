# DOM Selection and Replay Scripts

**Status:** For review · 2026-09-08 · Branch `CB-DOM-selection-and-replay`

---

## 1. The problem

Every Computer Use test drives a real browser with a vision model in the loop. The
model looks at a screenshot, decides what to click, and the engine clicks it — thirty
or so times per test. That is what makes the tests worth having: they exercise the
real stack the way a person would, and they do not break when a CSS class is renamed.

It is also why the suite costs what it does. A test that passed yesterday, against a
build that changed nothing it touches, pays full model price to rediscover the same
sequence of clicks today. Across a few hundred tests that is most of the suite's
wall-clock time and nearly all of its token spend, spent re-deriving answers we
already had.

## 2. The idea

**The first run compiles. Later runs execute.**

When a test passes, we already know exactly what it did: which element it clicked,
what it typed, where it landed. Distil that into a *replay script* and later runs can
execute it directly through the same browser adapter — no screenshots, no model
calls, browser speed. The model comes back only when replay stops working, which is
precisely when something changed and a fresh derivation is worth paying for.

Two things have to be true for that to work, and they are the two halves of this
design:

1. **A recorded step must name its target well enough to find it again.** That is DOM
   selection (§3).
2. **A replayed run must be able to tell "this still works" from "this looks like it
   works".** That is guards and postconditions (§4).

## 3. DOM selection

### 3.1 Element grounding

Without grounding, the model works in pixels: it reads a screenshot and returns
coordinates. Those coordinates are worthless a day later, and they are worthless to
replay immediately — a recorded click at (412, 208) means nothing once a row shifts.

With grounding on, the engine extracts the page's interactive elements each step and
hands the model an indexed list — role, accessible name, and a selector per element.
The model acts by index (`ClickElement 7`) rather than by coordinate, and the engine
resolves the index to a locator with Playwright's actionability wait.

Grounding is what makes recording possible at all. Every target in a script is derived
from the element the model actually chose, not from where its bounding box happened to
be. This is why the two halves ship together: replay without grounding would record
coordinates, and a script of coordinates is not a script.

### 3.2 Selector resolution

The model writes free-form selectors, and the ones it favours are ambiguous by
construction. `div:has-text("Visible Columns")` matches every ancestor containing that
text. Playwright's action APIs are strict, so a multi-match throws instead of acting:

```
strict mode violation: locator('div:has-text("VISIBLE COLUMNS")') resolved to 14 elements
```

That failure is worse than a lost click. The page does not change, so the loop
detector counts a repeated state and the run ends as `LoopDetected` — a test recorded
as broken when the agent was on exactly the right track.

`resolveActionLocator` narrows a multi-match to one locator before acting. It prefers
visible matches, then takes the smallest by area — for an ancestor chain, the smallest
match is the innermost element, which is the one the model meant — and breaks ties on
document order. Zero or one match returns the locator untouched, so the common path
keeps Playwright's auto-wait semantics exactly. Past fifty matches the selector is junk
rather than merely ambiguous, so it takes the first match instead of forcing a layout
pass per node on the hot path.

A multi-match is a guaranteed throw today, so disambiguating cannot regress any action
that currently works.

## 4. The replay script

### 4.1 What a step carries

Each step records the action, a multi-signal locator, and two guards.

The locator carries three signals at different strengths. `Selector` is primary. `Role`
and `Name` are the heal fallback, re-resolved against a fresh element list when the
selector no longer matches. `BoundingBox` is the weakest, kept only for recordings made
before grounding was on.

Guards are where replay earns its trust. A **precondition** waits for the target to be
attached and visible, and fail-fast is the contract: a target that never appears fails
the step. Replay never proceeds anyway on a missed precondition. A **postcondition**
confirms the step advanced the page the way the recording did; failing one marks the
step diverged and starts the heal ladder.

### 4.2 What the script carries

Beyond the steps, a script holds the identity that decides whether it is still valid —
`AppBuildHash`, `AppVersion`, `GoalHash` — plus the viewport, the declared variable
*names*, and the goal-level postconditions.

Variable values are never stored. Recording replaces each resolved value with a
`%name%` token, and replay substitutes fresh values back in. A script therefore holds
no credentials and no run-specific data, and stays valid when the values change.

### 4.3 Deciding the tier

| Condition | Tier | Why |
|---|---|---|
| No script | `llm` | Nothing to replay |
| Goal text changed | `llm` | The script answers a question the test no longer asks |
| Heal rate over threshold | `llm` | The UI has drifted past what healing can absorb |
| Exact `AppBuildHash` match | `replay` | Nothing changed; expect no healing |
| Anything else | `replay-with-heal` | Safe default |

`AppBuildHash` is an opaque string the caller supplies and the engine only ever
compares. Unknown identity falls to `replay-with-heal`, which is the right default:
slightly more work, never wrong.

### 4.4 Scoring a replayed run

A replayed run cannot be graded by a model — that would reintroduce the cost we just
removed. Instead, recording distils the passing run's end state into goal-level
postconditions: a URL pattern, an element that must be present, an element that must
be absent. Replay executes those. They are free, deterministic, and more trustworthy
than a confidence float.

Only judge-approved, oracle-green runs produce them, so a bad verdict cannot become a
permanent assertion.

## 5. Where scripts live

**A script lives in the test row, in `Configuration.ReplayScript`.**

An earlier draft committed scripts to the repository as `T042.trace.json` files,
reasoning that they are compiled artifacts like snapshot files and belong in git where
a diff is reviewable. That was wrong for a simpler reason than the argument was
sophisticated: a script is a *generated artifact of a test*, and it belongs with the
test. Keeping it in the row means it travels with the test, arrives already in the
TestingEngine's cache, and cannot drift away from what it describes. No mount, no
promotion step, no second store to keep in sync.

`Configuration` already exists on `MJ: Tests` as `NVARCHAR(MAX) NULL`, so **there is no
migration**. What this branch adds is JSONType metadata on the existing column, so
CodeGen emits a typed accessor:

```ts
const script = test.ConfigurationObject?.ReplayScript;   // fully typed, lazily parsed
```

The interface lives at `metadata/entities/JSONType-interfaces/ITestConfiguration.ts`
and is registered by a metadata push, the same way `MJ: Entities.Configuration` and
about twenty other JSONType columns already are.

`Configuration` is shared by every test type, so `ITestConfiguration` declares only the
framework-level properties — `ReplayScript` and `AllowLLMFallback` — over an index
signature that carries each driver's own configuration through untouched. Adding a
framework-level option later is an edit to that interface plus `mj sync push`, never a
migration.

**Keeping the type honest.** The script shape exists twice: once as `ComputerUseTrace`
in `@memberjunction/computer-use`, once as `IReplayScript` in the JSONType. It has to,
because CodeGen emits the JSONType definition verbatim into `@memberjunction/core-entities`,
which sits below the engine package and can name nothing from it.

The failure mode is quiet. Add a field to `ComputerUseTrace` and forget the JSONType, and
everything still compiles and every runtime test still passes: the recorder writes the
field, the column stores it, and `ConfigurationObject` hands it back as a property
TypeScript insists does not exist.

This repo has an established answer for that, from `MJ: Entity Fields`'
related-record-collection work — a `*.test-d.ts` file of vitest `expectTypeOf`
assertions, checked by tsc through `typecheck` in `vitest.config.ts`. So
`__tests__/script-store.test-d.ts` asserts the two types field-for-field, in both
directions:

```ts
expectTypeOf<MJTestEntity_IReplayScript>().toEqualTypeOf<ComputerUseTrace>();
```

Two things about that were checked rather than assumed, because both have bitten this
repo before. The assertions are **not vacuous** — the MJCoreEntities precedent found its
own typecheck program empty and every assertion passing for free, so this one was
confirmed to fail on injected drift (a renamed field, a widened type, and a required
field made optional, each failing three of the six). And required-vs-optional drift is
caught only because this package sets `strict: true`; the comparable Zod-based check on
`IRuntimeActionConfiguration` documents that it *cannot* assert type equivalence for
exactly this reason, its package building without `strictNullChecks`.

## 6. The fallback pathway

When replay fails, the run falls back to the model **within the same attempt**, and a
green fallback overwrites the script:

```
load script → decide tier ─┬─ replay ──── passed ──→ done
                           │      └────── diverged ─┬─ AllowLLMFallback = false → report divergence
                           │                        └─ otherwise → run agent → passed → overwrite script
                           └─ llm ─────── passed ──→ record script
```

Three details are deliberate.

**The fallback restarts clean.** It does not inherit the failed replay's memo. A stale
script is a mechanical fact about the build, not an agent attempt, and priming a fresh
run with another run's partial progress made the agent behave as though work had been
done that its own context never performed.

**A replay is never re-recorded.** Only a run that came through the model produces a
script. Re-recording from a replay would launder healed selectors into storage without
anything ever re-deriving them.

**A test can refuse the fallback.** `Configuration.AllowLLMFallback: false` makes a
divergence the result instead of re-deriving the goal. Default is `true`. The flag
matters wherever a silent re-derivation could paper over the regression the test exists
to catch: the agent is good enough to find another route to the goal, and on a pinned
test that is the failure mode, not the feature.

### 6.1 The review gate

A regenerated script does not take effect on its own. It lands in a second slot,
`Configuration.PendingReplayScript`, and replay keeps using the promoted
`ReplayScript` until a human has seen the difference and said yes:

```
mj test scripts                                  # what changed, and how much of it matters
mj test scripts --promote --test "T042 - …"      # ratify one
mj test scripts --discard --test "T042 - …"      # keep the promoted script
```

The listing separates routine churn from real movement. A selector that changed while
role and name held is heal-class drift and is reported as such; a changed target, verb,
URL, or step count means the UI moved, and that is the count the summary leads with.

A test's *first* script skips the gate and goes straight to `ReplayScript`. There is no
baseline to diff it against, and the run that produced it already passed the judge and
every gating oracle — a review with nothing to compare is a rubber stamp.

**What the gate costs.** Between a UI change and its promotion, the affected tests
replay, diverge, and fall back to the agent on every run. They stay green, and they pay
full model price each time. That is the honest price of not letting the suite rewrite
itself: the pending script is a queue, and the cost of ignoring it is measured in
tokens. `mj test scripts` with no arguments is the queue length.

### 6.2 The push trade

`mj sync push` writes `Configuration` wholesale from the test metadata files, so a push
resets both slots. This is deliberate: a script is a regenerable cache, and the cost of
a reset is one agent-driven pass per test to re-record.

The escape hatch, when scripts are worth keeping across a push, is `mj sync pull` —
`Configuration` comes down with the rest of the row, scripts included, and the files
then carry them back up. `excludeFields` and `externalizeFields` on the pull config
shape how much of that lands in the repo. Teaching *push* to preserve a
database-written key inside a JSON column would be new merge machinery buying back what
pull already does.

## 8. Status

Landed on this branch, with unit tests, against `origin/next`:

| Area | Files |
|---|---|
| DOM selection | `browser/selector-resolution.ts`, `browser/element-extraction.ts`, `browser/page-perception.ts` |
| Script record/replay | `types/trace.ts`, `engine/trace.ts`, `engine/replay.ts`, `ComputerUseEngine.Replay` |
| Storage | `metadata/entities/JSONType-interfaces/ITestConfiguration.ts`, `test-driver/script-store.ts`, `__tests__/script-store.test-d.ts` |
| Review gate | `mj test scripts` — `TestingFramework/CLI/src/commands/scripts.ts`, `utils/script-drift.ts` |
| Driver | tier dispatch and write-back in `ComputerUseTestDriver` |
| Reporting | `tier` and `ReplayTelemetry` on the testing-framework result types |

Not built, and out of scope here: minting `APP_BUILD_HASH` (the engine treats an empty
string correctly — it simply always takes `replay-with-heal`), the heal-rate ledger that
would feed the demote rule, and the canary lane that re-derives a sample through the
full model path to check that replay verdicts have not drifted from judge verdicts.
