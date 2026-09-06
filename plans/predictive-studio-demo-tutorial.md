# Predictive Studio — a demo you can run

**What this shows:** an ML platform whose *output is not a model*. Training produces a score, yes —
but the durable products are **signals** (proven, reusable measurements), **findings** (dated facts
the organisation has learned), and **components** (trained parts other models can pick up). The demo
walks those in the order they build on each other, and ends with the thing most platforms cannot do:
telling you what your organisation *cannot* currently measure.

Everything below runs against real metadata, a real Python sidecar, a real locked holdout, and real
embeddings. Nothing is staged.

---

## 0. Prerequisites

```bash
cd /Users/madhav/Projects/MJ-worktrees/mj-ps-components   # branch: feat/ps-sequence-problem-type
```

| Need | Check | If missing |
|---|---|---|
| SQL Server with the demo schema | `demo.Member` ≈ 5,000 rows, `demo.Activity` ≈ 420,000 | container `sql-mlcomp` on port 1499 |
| Component tree seeded | 71 rows in `__mj.MLComponentType` | `npx mj sync push --dir=metadata` |
| Python sidecar | spawns itself on demand | `cd packages/AI/PredictiveStudio/Sidecar && pnpm run setup:python` |

> **If SQL times out**, the Docker VM is out of memory — not SQL. Check `free -m` *inside* the
> container: when `available` is ~2 GB of 32 GB, SQL collapses its memory target and throws
> error 701. Stop unused containers; capping `max server memory` does not help.

---

## 1. Open with the part nobody else has: the platform tests its own honesty

Most ML demos start by training something. Start here instead — it frames everything after it.

```bash
MJ_INTEGRATION_TEST=1 npx mj test run --name "IT87 - Predictive Studio Cross-Row Consistency"
```

```
→ trained root components carry the model artifact: 20 rows scanned, all consistent
→ stories are embedded: 151 rows scanned, all consistent
→ model ↔ root component round-trips: 11 rows scanned, all consistent
→ composed models carry their graph: 5 rows scanned, all consistent
→ no instances of 20 abstract types: 84 rows scanned, all consistent
→ predictive claims are backed by a holdout number: 38 rows scanned, all consistent
```

The counts grow as the platform is used — running §3 first took *stories embedded* from 123 to 151
and *predictive claims* from 10 to 38. Re-run this afterwards to show the sweep validating output
that did not exist a minute earlier.

**What to say:** this sweeps *every* row the platform has ever written and asks whether the rows
agree with each other — does a component that claims to be trained actually carry the artifact that
makes it loadable; is every stored explanation actually embedded and therefore findable; does a
finding claiming out-of-sample evidence carry the number behind it. It runs in under a second and
needs no model, no LLM and no sidecar.

Note each line reports **how many rows it scanned**. A sweep over an empty table passes trivially, so
every check states its population and prints `VACUOUS` at zero. A green tick here is never free.

> This found two real defects the day it was written — component reuse had been unreachable for the
> entire life of the feature, and every seeded component type was silently unsearchable.

---

## 2. Train a model, and watch what it leaves behind

```bash
PS_INTEGRATION=1 MJ_INTEGRATION_TEST=1 \
  npx mj test run --name "IT88 - Predictive Studio Capability Reachability"
```

```
→ model 1D40FCEB… → root 3B2E44A1… + 2 signal(s)
→ 2/2 signal(s) computed over Members
→ root 3B2E44A1… is trained AND loadable (artifact 22950755…)
→ pipeline B9062B2E… → model 1D40FCEB… → 3 component(s), root round-trips
```

**What to say:** this trained a real model just now, and then asked whether the things the platform
*advertises* actually work against what training produced. The second line is the interesting one —
the model's inputs were computed as standalone measurements, **with no model involved**. That is the
whole thesis in one line: a model is a question someone already asked; a signal is an answer you can
reuse for the questions nobody has asked yet.

It cleans up after itself: teardown leaves zero rows.

> Run it **without** `PS_INTEGRATION=1` to show the honesty property — it reports
> `"status": "Skipped"`, never a pass. A gated run must never look like executed coverage.

---

## 3. The flagship: five acts over one dataset

```bash
npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-demo-stories-showcase.ts
```

| Act | What it proves |
|---|---|
| **I — the tree decides what is possible** | inheritance, provenance, and a lint that says *why* a choice was available |
| **II — four architectures, identical data** | including as-of aggregates and a glass-box rubric |
| **III — an honest leaderboard** | *the act to dwell on — see below* |
| **IV — the model writes its own story** | one LLM call; every number in it was computed and handed to the model |
| **V — reuse by meaning** | find a trained component by *describing* it in English |

### Act III is the demo

Verified output from a live run:

```
architecture                                      feat  valid.   holdout   gap      trust
E. As-of engagement + TimesFM forecast · Logistic  11    0.6116   0.6105    +0.0011  Fair
B. Member columns + 90-day as-of engagement · Log  7     0.5798   0.5608    +0.0190  Poor
D. Member columns + as-of engagement · Random For  7     0.9949   0.5451    +0.4498  Poor  ← memorized
A. Member columns only · Logistic Regression       2     0.5274   0.5272    +0.0002  Poor
C. Member columns + as-of engagement · Glass-Box   7     0.5622   0.5203    +0.0420  Poor
```

**Two things to point at.**

**The model that would have shipped.** D tops the validation column at **0.9949** and collapses to
**0.5451** on the locked holdout — a coin flip. It did not learn the pattern, it memorised the rows.
A leaderboard built on the validation split alone would have shipped it as the best model in the
room. The holdout is carved *before* the search and scored exactly once, and the trust grade is
computed from the holdout, never the split.

**The platform argues against itself.** Point-in-time engagement features moved the holdout
0.5272 → 0.5608. It does not call that a win:

> *"+0.0336, ±0.0519 at 2 SE on 1000 holdout rows. That is INSIDE the noise for a holdout this
> size — an honest 'cannot tell', not a win."*

And on the forecast feature (+0.0497), it explains that its own error bar is conservative because
both AUCs were scored on the same rows, then still refuses the claim:

> *"Suggestive, not yet established: the way to settle it is replication, not a louder claim."*

That is the line to end on. Anyone can show a chart where their feature wins. This is a system that
tells you when its own feature **didn't**.

> Note on Act IV: the LLM writes prose, but **no LLM touches any number** — magnitudes come from
> measured importance and locked-holdout metrics. It narrates; it never decides.

---

## 4. Ask a business question without building anything

The measurements are ordinary MJ Actions, so an agent discovers them the way it discovers everything
else. Twelve of them ship:

| Action | What it answers |
|---|---|
| `List Signals` | "what can we measure about engagement?" — searchable in plain English |
| `Compute Signal` | one measure, one population, no model |
| `Find Relevant Findings` | "what have we actually learned about renewal?" — with an evidence floor |
| `Find Reusable Components` | "has anyone already built something that measures this?" |
| `Assess Capability Coverage` | "what does our strategic plan need that we cannot measure?" |
| `Browse ML Component Tree` | what architectures are even available, and why |
| `Train ML Model` / `Run Experiment Session` / `Promote ML Model` | the lifecycle |
| `Score Record Set` / `Schedule Model Scoring` | one-off and recurring scoring |
| `Validate Component Graph` | check a composition before training it |

**Demo line:** *"which of our top donors are at risk?"* is a normal query plus a prediction column —
nobody builds anything.

---

## 5. The closer: what you cannot currently measure

`Assess Capability Coverage` takes an organisation's own strategic plan or board paper and returns,
per objective, what they can **measure**, what they have **learned**, and where neither is true.

Two axes, not one, because *"measurable but not yet studied"* needs a study while *"known but not
instrumented"* needs instrumentation — different work, different budget.

**Why it is a judge and not a similarity score:** thresholding embeddings was tried and measured, and
rejected. On the live corpus an objective about a **parking structure lease** scored a higher relative
match than one about member engagement, with every margin around 0.005. Similarity now only
shortlists; a judge decides against the candidates' own prose, and it catches what the numbers cannot:

> *"the shortlist shares only the word 'renewal' with this objective; no candidate measures the
> parking structure or its lease."*

This is the first-meeting artefact. You walk in, paste their plan, and hand them a gap list — every
gap being the next piece of work.

---

## The punchline

> The payout starts at the first model, not the hundredth.

Measured on the live run above: five models left **39 components carrying a story vector, all 39
approved for reuse** — each an independently reusable part with its own description, its own
evidence, and its own "reuse when" note. You get back a *part you can drop into a new model*, not a
whole model to imitate.

Search them by meaning, with no table, column or class name involved — verified:

| You type | You get back |
|---|---|
| *"tells a real zero apart from missing data"* | `acts_90d__present` · **As-Of Exists** · 0.735 |
| *"how much money someone spent in the run-up to a decision"* | `spend_90d` · **As-Of Sum** · 0.800 |

There are **38 findings** in this database right now, every one carrying the out-of-sample number
behind it — a claim of predictive contribution without its holdout metric is refused, which is what
`IT87` check 6 verifies.

Accumulated over years, the findings become something no organisation currently has: a searchable
body of everything it has empirically learned about its members — not documents *about* it, but
dated, measured, validated facts, each carrying the epistemic status that stops a correlation being
quietly cited as a cause.

---

## Appendix — if something fails mid-demo

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to connect to localhost:1499` | Docker VM out of memory | stop unused containers, restart `sql-mlcomp` |
| `training returned no model` | Python env not set up | `pnpm run setup:python` in the Sidecar package |
| A rig prints `SKIP: no published model` | prerequisite data absent | run §3 first — the rigs depend on data earlier runs leave behind |
| IT88 reports `Skipped` | `PS_INTEGRATION` not set | intentional; set it to `1` |
