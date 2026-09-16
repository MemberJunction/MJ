# DOM Selection and Replay

How a Computer Use test stops paying a vision model to rediscover the same clicks every run.

---

## The idea in one paragraph

A Computer Use test drives a real browser with a model in the loop, which is what makes it worth having and also what makes it expensive. But a test that passed yesterday against a build that changed nothing it touches will pay full model price to derive the same steps again today. So: **the first run compiles, later runs execute.** A passing run is distilled into a *replay script* — an ordered list of concrete actions — that later runs play back through the same browser adapter with no screenshots and no model calls. The model comes back only when replay stops working, which is exactly when something changed and re-deriving is worth paying for.

Two halves make that possible. **DOM selection** is what lets a run be recorded at all. **Replay** is what executes the recording.

---

## Part 1 — DOM selection (element grounding)

Without grounding, the model looks at a screenshot and emits coordinates: *click (412, 260)*. You cannot record that. A pixel is not a thing; it's where a thing happened to be on one render at one viewport size.

With grounding, the adapter walks the live DOM before each step and hands the model an **indexed list of interactive elements**:

```
[0] button  "Switch application — current: Home"
[1] link    "Data Explorer"
[2] textbox "Search entities..."
...
```

The model then acts by index — *click element 1* — and the recorder can write down the element it actually chose: its role, its accessible name, and a selector. That's a durable identity, and it's what makes a script a script.

The probe (`browser/element-extraction.ts`) is deliberately app-agnostic: standard interactive tags, ARIA roles, and click affordances only. No app-specific selectors. It skips hidden and zero-size elements and stays within (or near) the viewport.

> **It never throws.** A probe failure, an absent page, or a renderer that stops answering all yield an empty list, and grounding degrades to coordinates. The call is bounded by a timeout because `page.evaluate()` is the one Playwright call that ignores `setDefaultTimeout()` — a silent renderer would otherwise hang the run forever.

---

## Part 2 — What a recorded step looks like

Each step in a script is an action plus the conditions that make it safe to replay:

```jsonc
{
  "Instruction": "Open the application switcher",   // why, for humans reading the diff
  "UrlBefore": "http://localhost:4200/",
  "Action": {
    "Method": "click",
    "Target": {
      "Role": "button",                             // heal fallback
      "Name": "Switch application — current: Home", // heal fallback
      "Selector": "xpath=/html/body[1]/...",        // primary
      "Scope": "group:All applications",            // disambiguates twins
      "BoundingBox": { "XMin": 876, ... }           // weakest signal
    }
  },
  "Precondition":  { "WaitForTarget": true, "UrlPattern": "http://localhost:4200/" },
  "Postcondition": { "UrlPattern": "https://…/u/login" }
}
```

- **Precondition** — fail fast. If the target never becomes attached and visible within the bound, the step diverges rather than clicking into the void.
- **Postcondition** — confirm the step actually advanced the page the way it did when recorded. A click that silently does nothing is a divergence, not a success.
- **GoalPostconditions** (on the script, not the step) — deterministic end-state assertions distilled from the passing run. **This is what keeps the tier free**: a replayed run is scored against these, not against a model verdict.

---

## Part 3 — The three tiers

Which tier a run takes is decided per test, from the script it already has (`engine/trace.ts`):

| Tier | When | Cost |
|---|---|---|
| `replay` | recorded build hash **equals** the live build hash — nothing could have moved | zero model calls |
| `replay-with-heal` | build identity differs, or is unavailable (**the common default**) | zero model calls unless a step diverges |
| `llm` | no script yet, or the heal rate crossed its threshold — the UI has drifted past the cache | full price |

If a replay diverges, the run **falls back to the model within the same attempt**. Three deliberate details:

1. The fallback **restarts clean** rather than inheriting the failed replay's memo. Priming a fresh run with another run's partial progress made the agent behave as though work had been done that its context never performed.
2. A replay is **never re-recorded** — that would launder healed selectors into storage without re-deriving them.
3. A test can refuse the fallback with `AllowLLMFallback: false`, taking the divergence as the result. Default is `true`. Turn it off wherever a silent re-derivation would paper over the very regression the test exists to catch.

---

## Part 4 — When a selector goes stale: the heal ladder

SPAs re-render, so an absolute XPath recorded yesterday may match nothing today. Rather than fail immediately, replay re-resolves the target by role + name against a fresh element list (`engine/replay.ts`, `reresolveTarget`):

| Confidence | Situation |
|---|---|
| `0.9` | exactly one element matches role + name |
| `0.75` | several match, but the recorded position picks one out |
| `0.6` | one element matches by name *substring* |
| `0.3` | several match and nothing separates them — **ambiguous** |
| `0` | nothing matches |

A heal is accepted at **≥ 0.6** (`DEFAULT_HEAL_CONFIDENCE_THRESHOLD`). Below that, replay **declines and diverges on purpose** — a confidently wrong click is far worse than a slow re-derivation, because it takes the run somewhere plausible and fails later for a reason that looks unrelated.

### Why `Scope` exists

Role + name is not always a unique identity. The app launcher lists each application **twice** — once in a usage-ordered "Recent applications" grid and once in an alphabetical "All applications" grid. Two elements, same role, same name. The recorded XPath points at whichever grid the app was in that day, and the healer correctly refuses to guess between them.

`Scope` records the nearest labelled ancestor region (`group:All applications`), which tells the twins apart. It's absent on recordings made before regions were captured, so it degrades rather than breaks — and a script has to be re-recorded to gain one.

---

## Part 5 — Where scripts live

A script lives **in the test row**, at `Configuration.ReplayScript` on `MJ: Tests`. There's no migration and no second store: `Configuration` is already `NVARCHAR(MAX)`, this registers JSONType metadata on it, and the TestingEngine already caches `MJ: Tests` — so by the time a driver runs, the script is in memory.

Writes land in one of **two slots**, and the difference matters:

| Slot | When | Effect |
|---|---|---|
| `ReplayScript` | the test's **first** script | takes effect immediately — there's no baseline to diff against, and the run that produced it already passed the judge and every gating oracle |
| `PendingReplayScript` | a script that would **replace** an existing one | waits for a human to review the diff and promote it (`mj test scripts`) |

**Replay only ever executes the promoted slot**, so a UI change can never quietly rewrite a test's definition of correct.

In the repo, a script is externalised to its own file — each test carries `"ReplayScript": "@file:regression/scripts/t042-….json"` — because a 700-line trace inlined into `Configuration` makes the test unreadable and every re-record a giant one-line diff. The database still stores it in the test row; only the repo representation is split.

> `mj sync push` resets both slots. That's deliberate — a script is a regenerable cache — but it does mean the run right after a metadata push pays full model price across the suite.

---

## Part 6 — Variables: scripts hold no credentials

Recording **tokenizes** variable values rather than storing them. A typed password becomes `%authPassword%` in the script, and replay substitutes a fresh value at execution time.

Two consequences, both good: a script is safe to commit, and it stays valid when the value changes.

---

## Reading a run log

These are the lines worth knowing:

| Log line | Meaning |
|---|---|
| `Tier: replay-with-heal — build identity unavailable` | normal default |
| `Replay Completed: all steps hit (N steps, 0 healed, 0 diverged)` | the good case — zero model calls |
| `re-pointed (unique role+name match)` | a selector went stale and the heal ladder fixed it |
| `was NOT re-pointed: 2 elements match role+name — ambiguous (confidence 0.3)` | declined on purpose; likely wants `Scope` |
| `Replay Failed: diverged at step N: postcondition — …` | the step didn't advance the page as recorded |
| `the stored script is stale for this build; restarting clean on the LLM tier` | the fallback, working as designed |

A rising **heal count** across runs is the signal to watch: it means the UI is drifting and the script is being held together by re-resolution. Past a threshold the tier demotes itself to `llm` and re-derives.

---

## Where the code is

| File | Role |
|---|---|
| `browser/element-extraction.ts` | the in-page probe; indexed element list; index-resolved click/type |
| `engine/replay.ts` | `reresolveTarget`, the heal ladder, confidence gating |
| `engine/trace.ts` | recording a passing run; tier decision |
| `engine/verdict.ts` | goal postconditions and checkpoint scoring |
| `test-driver/script-store.ts` | reading/writing the two script slots |

Design rationale and open questions: [`plans/regression-testing/dom-selection-and-replay-design.md`](../../../../plans/regression-testing/dom-selection-and-replay-design.md).
