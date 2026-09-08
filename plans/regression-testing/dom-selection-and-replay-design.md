# DOM Selection and Replay Scripts

**Status:** For review · 2026-09-08 · Branch `CB-DOM-selection-and-replay`

Feedback welcome on anything here, but §7 lists the questions I most want answered.

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

**A script lives in the test row, in `Configuration.TestJSONScript`.**

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
const script = test.ConfigurationObject?.TestJSONScript;   // fully typed, lazily parsed
```

The interface lives at `metadata/entities/JSONType-interfaces/ITestConfiguration.ts`
and is registered by a metadata push, the same way `MJ: Entities.Configuration` and
about twenty other JSONType columns already are.

`Configuration` is shared by every test type, so `ITestConfiguration` declares only the
framework-level properties — `TestJSONScript` and `AllowLLMFallback` — over an index
signature that carries each driver's own configuration through untouched. Adding a
framework-level option later is an edit to that interface plus `mj sync push`, never a
migration.

**Keeping the type honest.** The script shape exists twice: once as `ComputerUseTrace`
in `@memberjunction/computer-use`, once as `ITestJSONScript` in the JSONType. It has to,
because CodeGen emits the JSONType definition verbatim into `@memberjunction/core-entities`,
which sits below the engine package and can name nothing from it. Duplication kept in
step by discipline always drifts, so `script-store.ts` — the one package that depends on
both — asserts assignability in both directions:

```ts
const _scriptSatisfiesTrace: ComputerUseTrace = {} as MJTestEntity_ITestJSONScript;
const _traceSatisfiesScript: MJTestEntity_ITestJSONScript = {} as ComputerUseTrace;
```

Rename a field on either side and the build fails. `tsc` keeps them in step so nobody
has to remember to.

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

### 6.1 What we gave up

Committed scripts made UI drift a reviewable PR diff, and a promotion step is where a
human saw it. Writing to the row removes that.

What replaces it is telemetry, not review. Every replayed run reports healed and
diverged step counts, and those survive a green fallback — the drift signal is attached
to the attempt, not to the verdict. A merge that changes the UI shows up as a suite-wide
spike in healing rather than as a diff. That is a weaker signal in kind, but a
continuous one, and it does not depend on anyone reading a generated JSON file
carefully.

I think this is the right trade. It is also the part of this design I am least sure
about — see §7.

### 6.2 The push trade

`mj sync push` writes `Configuration` wholesale from the test metadata files, so a push
resets every stored script. This is deliberate rather than overlooked: a script is a
regenerable cache, and the cost of a reset is that the next run pays for one
agent-driven pass per test to re-record.

That cost is real. After a metadata push, the suite runs at full model price once. The
alternative — teaching push to preserve a database-written key inside a JSON column —
is new machinery with its own merge semantics, and it buys back one expensive run.

## 7. Questions I want feedback on

1. **Is telemetry enough to replace the review gate (§6.1)?** If a UI change quietly
   rewrites forty scripts and every test stays green, do we want to have seen that? A
   middle option exists — record into a pending slot and promote deliberately — at the
   cost of a human step in the loop.
2. **Is the push reset (§6.2) acceptable, or should push preserve scripts?** The answer
   depends on how often the test metadata actually gets pushed, which I do not know.
3. **Should `AllowLLMFallback` be one flag or two?** It currently governs both "run the
   agent" and "overwrite the script". Separating them would allow "re-derive but do not
   ratify". I have not seen a case that needs it, so it is one flag.
4. **Is `TestJSONScript` the right name?** Inside a test's configuration, `Test` is
   redundant and `JSON` is implied. `ReplayScript` reads better to me. Easy to change
   now, tedious later.

## 8. Status

Landed on this branch, with unit tests, against `origin/next`:

| Area | Files |
|---|---|
| DOM selection | `browser/selector-resolution.ts`, `browser/element-extraction.ts`, `browser/page-perception.ts` |
| Script record/replay | `types/trace.ts`, `engine/trace.ts`, `engine/replay.ts`, `ComputerUseEngine.Replay` |
| Storage | `metadata/entities/JSONType-interfaces/ITestConfiguration.ts`, `test-driver/script-store.ts` |
| Driver | tier dispatch and write-back in `ComputerUseTestDriver` |
| Reporting | `tier` and `ReplayTelemetry` on the testing-framework result types |

Not built, and out of scope here: minting `APP_BUILD_HASH` (the engine treats an empty
string correctly — it simply always takes `replay-with-heal`), the heal-rate ledger that
would feed the demote rule, and the canary lane that re-derives a sample through the
full model path to check that replay verdicts have not drifted from judge verdicts.
