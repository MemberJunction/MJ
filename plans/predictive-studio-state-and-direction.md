# Predictive Studio — where it is, where to take it

*A state-of-play read against the code, not against the plan. September 2026.*

---

## Summary

**Phase 1 (train models) is done. Phase 2 (make models reach everywhere) is done. Phase 3 has
started.** That is the finding that should drive the roadmap: the obvious next step — "finish the
plan" — is exhausted, and the interesting work is no longer about models at all.

| | | |
|---|---|---|
| **Phase 1** | Train models on client data | Shipped |
| **Phase 2** | The same scorer plumbed into every MJ surface | Shipped |
| **Phase 3** | What a model *leaves behind*, plumbed into every MJ surface | Signals, findings and the capability diagnosis shipped |

Phase 3 is the thesis in [predictive-studio-signal-layer.md](predictive-studio-signal-layer.md).

---

## Where it is now

### Scale

| Package | Files | LOC |
|---|---|---|
| Core (pure contracts, browser-safe) | 16 | 3,744 |
| Engine (server) | 97 | 18,831 |
| Sidecar (Python, tabular) | 16 | 3,895 |
| ForecastSidecar (Python, TimesFM) | 7 | 499 |

Engine modules: `actions`, `agent`, `components`, `experiment`, `feature-assembly`,
`feature-pipelines`, `maintenance`, `operations`, `scheduling`, `scoring`, `statistics`, `stories`,
`training`.

### Phase 1 — the model factory. Shipped.

- Algorithm catalog (logistic, ridge, random forest, XGBoost, LightGBM, MLP) plus two added by this
  programme: a **glass-box rubric** (trainable *and* exactly explainable per record) and an **HMM**
  for sequence problems.
- FeatureAssembly with a leakage guard, point-in-time (as-of) assembly, and a single code path
  shared by train / materialise / on-demand scoring — the train-serve skew guarantee.
- Experiment engine, locked holdout, trust grading, promotion gate, maintenance/drift.
- Model Development Agent with a statistics pre-pass and an architecture gate.

### Phase 2 — reach. Shipped bar one.

Checked against the code, not the plan:

| Item | What it does | Status |
|---|---|---|
| **PS2-1** | `'ML Model'` work type registered at startup, so a Record Process can score a population and write a column | **Built** — `scoring/startup-register.ts` |
| **PS2-2** | Promoting a model generates a per-model Action, *"Score with &lt;Model&gt; v&lt;n&gt;"* | **Built** — fires in `promote-model.gate.ts`; observed live |
| **PS2-3** | `RunQuery` enrichment — a query's rows come back with a prediction column appended | **Built** — the enricher runs, `QueryResolver` accepts `Enrichment`, `GraphQLDataProvider` sends it, and a Query now carries a *saved* `DefaultEnrichment` the resolver applies when the caller supplies none. Remaining: the Query Builder control and Skip's context |
| **PS2-4** | `utilities.ml.listModels()` / `.score()` on every interactive component | **Built** — `SimpleMLTools` in `InteractiveComponents/src/shared.ts`, now also `.listSignals()` / `.computeSignal()` |
| **PS2-5** | Agents discover models via the generated Actions | **Built**, via PS2-2 |
| **PS2-6** | Bind a model to write a column on a schedule | **Built** — `createScheduledModelScoring` |

**Every Phase 2 item is built**, PS2-3 included: a Query can now declare "this should include
renewal risk" and every caller of it gets the column, with a runtime argument still winning. What
is left there is surfacing, not plumbing — a Query Builder control and a line in Skip's context.

### The Architect seam — found and closed

A study of the four original pillars against the code found the component system complete and the
agent designing with it **blindfolded**: the Architect had no data sources, so it named component
types from memory, and it could never propose reusing a trained part because it was never shown one.
Underneath that, `ComponentMaterializer` wrote every root component `IsTrained: true` with no
`ArtifactFileID`, so the frozen-reuse loader would have refused every candidate anyway — reuse had
never actually been reachable, and `SourceComponentID` was set on 0 of 43 instances.

Both are fixed: three data sources (`COMPONENT_TREE`, `COMPONENT_SLOTS`, `REUSABLE_COMPONENTS`), the
three component actions on the agent, prompt guidance on when reuse earns its complexity, and the
root component now carrying the artifact that is its own fitted state.

Two further gaps followed from the same audit and are also closed:

**Finer-grained reuse.** The sidecar reported only *that* a composed node was fitted, never its
state, so only whole models could ever be reused. Each fitted node now returns its own serialized
estimator and the materializer stores it, giving the sub-component an `ArtifactFileID` of its own.

**A model pool that spans primitive → specific.** Three business-case archetypes (RFM Rubric,
Retention Risk Rubric, Member Journey HMM) sit under their primitives, keeping the parent's driver
and narrowing its schema. They encode structure and direction rather than invented weights, and two
seed tests keep them honest: a `DefaultSpec` must satisfy its own schema, and an archetype must
narrow rather than rename.

**Banks worth inheriting.** 29 → 50 property rows, each placed at the height where it is genuinely
true of everything below; the partition lint stays at zero findings. XGBoost now inherits four gates
and five hyperparameters; the Glass-Box Rubric inherits six preprocessing ops and a
`requires-direction-per-input` gate.

**The decision path was broken too.** The architecture gate declares `compose` executable, but
`modelingPlanToPipelineConfig` never carried the `ComposedGraph` onto the pipeline and
`createTrainingPipeline` had no field for it — so an approved compose decision trained a bare
single-algorithm model under a plan that recorded a composed one, with nothing downstream able to
tell. Fixed, with a refusal rather than a fallback when a compose decision carries no graph.

**Proven end to end** (`ps-compose-reuse-proof.ts`): a Stacking Wrapper over a forest and a linear
model trains through the ordinary pipeline path, all three sub-components are written as rows
carrying their own artifacts, and a second model then freezes one of them by `ReuseInstanceID` —
recording where it came from and marking itself as not having fitted it. `SourceComponentID` went
from 0 of 43 to a real value. Finally an `ArchitectureSpec` with a `compose` decision goes through
the real gate and the deterministic builder and comes out as a trained model whose pipeline carries
the composition the decision named. The rig proves the MECHANISM on a deliberately thin feature set;
the models it trains are weak (holdout AUC ≈ 0.5) and are not evidence about model quality.

**And the decision itself is now LLM-authored** (`ps-architect-decision-proof.ts`). The real Architect
sub-agent — its prompt, its newly-attached data sources — runs on measured statistics and its output
goes through the real gate and the real builder. Across two scenarios it chose `commit` (naming
interpretability, correctly, when the goal asked for an explanation) and `defer` (naming a noisy
signal with two admissible families). Both validated, named only component types that exist, passed
the gate, and produced a model matching the decision.

Tracing that path also found `reify` broken in the same way `compose` had been: the gate validated
`ReifiedUnderComponentTypeRef` and nothing consulted it at execution, so a reify could train a family
the decision never named. Fixed, and `defer`/`reify` now return a note saying the race they asked for
was built as a single leading candidate.

One reliability observation worth keeping: across runs the Architect occasionally returns without
writing its `Architecture` slice at all. It is intermittent, not deterministic, and the rig fails
rather than hides it.

It chose neither `compose` nor `reify` — and a measured experiment says that is **correct**, not
timid.

`test_composition_earns_it.py` builds a target with deliberately mixed structure and compares a
linear model, a forest, and a stack of both on one split:

| Structure | linear | forest | stack |
|---|---|---|---|
| smooth trend + asymmetric threshold corners | 0.7000 | 0.6384 | 0.6909 |
| smooth trend + **pure XOR** | 0.5343 | 0.8834 | **0.8835** |

On the clean construction the families diverge as far as they can — the linear model is at chance,
the forest reads the XOR easily — and the stack ties the forest to four decimal places. A tree
ensemble already spans both smooth and interaction structure, so stacking a linear model onto it adds
a view the forest never needed.

**So the gap is not the Architect's judgment; it is the model pool.** Composition earns its
complexity when families have genuinely NON-OVERLAPPING capability, and random-forest-versus-logistic
is not that pair — one is close to a superset of the other. What would change the answer: a sequence
model beside a tabular one, a frozen component that already knows a sub-problem, or a structure whose
value is variance reduction rather than combining views. Until the pool contains such a pair, an
Architect that never composes is reading the evidence correctly.

### Built by this programme, beyond the original plan

- **A typed component model** — 68 catalogue entries in an inheritance tree, machine-checked, so a
  model is a graph of named parts rather than a blob. Properties inherit; children may narrow.
- **Stories** — on publish, one LLM call writes a description of the model *and of each of its
  parts*, from facts that were computed and handed to it.
- **Search by meaning** — every story is embedded; typing *"tells a real zero apart from missing
  data"* returns the part that does that. Live in the Components panel.
- **Forecasting** — TimesFM behind a second Python sidecar, usable as an ordinary feature, so a
  foundation model's value is judged by the same holdout comparison as any other input.
- **A callable signal layer** — meaning separated from binding, so a measure proven inside one model
  computes over any population; two Actions and two `utilities.ml` methods make it reachable from
  agents, dashboards and chat.
- **A findings ledger** — what each model *learned*, as dated rows carrying magnitude, evidence type
  and the out-of-sample metric behind them, superseded rather than overwritten, and searchable by
  meaning.
- **The capability diagnosis** — a client's own strategy document in, an honest read of what they
  can measure and have learned out, with retrieval shortlisting and a judge deciding.

---

## What is weak

Naming these plainly, because they shape the direction more than the feature list does.

**~~The UI is data-scientist-shaped.~~** *Fixed at the front door.* The analyst panels still expose
the object model — correctly, for the person building a model. What was missing was a surface for
everyone else, who arrives with a question rather than an object to inspect. **Ask** is that
surface: a question in plain English comes back as *what you can measure* and *what you've learned*,
side by side, and a pasted document comes back diagnosed objective by objective. Nothing on it says
"component", "vector" or "instance".

**~~Signals are trapped in the model that produced them.~~** *Fixed.* A part was bound to the exact
context it was born in — this entity, this foreign key, this window. Meaning and binding are now
separate: the aggregate and its window travel with the signal, the entity and columns are defaults a
caller may substitute. `List Signals` and `Compute Signal` make the catalogue callable rather than
merely browsable, from an agent, a dashboard component, or a Query.

**~~Findings are not stored.~~** *Fixed.* A model learns that one input matters three times more
than another, and that fact is now a dated `MJ: ML Findings` row rather than a sentence inside an
artefact that the next retrain overwrites. Findings are **superseded, never updated**, so the record
shows a lever moving instead of only where it ended up.

**Value still scales with model count.** Everything shipped assumes you have models. The pitch
"build lots of models and it gets good" is exactly the pitch that stalls after two.

---

## Where to take it

### 1. Let a Query carry a saved enrichment

The transport works; nobody can reach it. Give `MJ: Queries` a saved enrichment (which model, which
output column), have the resolver apply it when the caller supplies none, expose it in the Query
Builder, and teach Skip that the option exists. Every existing report then becomes forward-looking
by annotation rather than by rewrite.

*Small, additive, and the cheapest real win on this list.*

### 2. Separate a signal's meaning from its binding

The load-bearing change. Let the binding become a parameter while the meaning stays fixed, and the
same proven measure works on donors, registrants or volunteers. This is the difference between a
library you can browse and one you can **call** — and every item below depends on it.

*The single highest-leverage build.*

### 3. Store findings as first-class records

Magnitude, date, evidence, and epistemic status (observed association vs. tested intervention — an
agent will flatten the two unless the record distinguishes them). This is what agents cite, what
accumulates into institutional memory, and what eventually shows a business lever shifting over
years.

### 4. Make the surface answer-shaped, not model-shaped

Lead with the question, not the object model. Retire "component" from anything a customer reads.
The model-builder's view stays — it just stops being the front door.

### 5. The capability diagnosis

Point it at a client's own strategy document and report what they can and cannot currently measure.
Not a feature demo — a diagnosis of their organisation, produced in a minute, where every gap is the
next piece of work. Depends on 2 and 3 being real.

---

## What to build

Sized against the code as it stands. Schema cost matters more than code cost here — a new entity
means a migration, a PostgreSQL twin, and a CodeGen pass before any TypeScript can reference it.

### A — Saved query enrichment

*Depends on: nothing. Schema: additive.*

- Give `MJ: Queries` a saved enrichment (model + output column). A nullable JSON column is the
  cheapest form; a child entity is the right one if a query should ever carry more than one.
- `QueryResolver` applies the saved enrichment when the caller supplies none — the runtime argument
  stays and wins, so nothing existing changes behaviour.
- A control in the Query Builder to attach a model to a query.
- Put it in Skip's context so it knows the option exists.

**Outcome:** every existing report becomes forward-looking by annotation instead of by rewrite.
**Roughly 2–3 days.**

### B — Separate a signal's meaning from its binding — **BUILT**

*Depended on: nothing. Schema: none, as expected.*

Today a signal's spec mixes what it *means* (a count, over a 90-day rolling window) with what it is
*attached to* (Activities, `MemberID`, `ActivityDate`). Split them:

- `resolveSignal(driverClass, spec, outputColumn, override?)` → an executable feature spec, pure and
  provider-free. Existing bindings became **defaults**; a caller may substitute an entity, a foreign
  key, a date field, a value field. The window travels with the meaning, not the binding.
- The override is validated against real metadata *before* computing, so a mistyped field is refused
  by name — *"The foreign key 'NoSuchColumn' does not exist on 'Activities'"* — rather than producing
  a column of nulls that reads as "nobody had any activity".
- `SignalComputer` runs one signal over a population through the **same** `FeatureAssemblyExecutor`
  training uses, so the number a report shows and the number the model trained on cannot diverge.
- Two Actions, so it is discoverable rather than merely present: **`Compute Signal`** (signal +
  population in, values out) and **`List Signals`** (the catalogue, searchable in plain English,
  each entry flagged `Rebindable`).
- Both on `utilities.ml` — `computeSignal` and `listSignals` — alongside the existing `score`.

**Proven live:** 34 signals in the demo database, 30 re-bindable; *"how long ago someone last engaged
with us"* returns the recency measure at 0.742 similarity with no column name involved; computing it
over 50 members yields 37 non-zero values; a bad binding is refused by name.

**Outcome:** a measure proven on members works on donors, registrants or volunteers — a library you
can call rather than browse. C and E now have the foundation they leaned on.

### C — Findings as first-class records — **BUILT**

*Depended on: nothing. Schema: one new entity, as expected.*

- `MJ: ML Findings` (22 columns): the model and signal it came from, a plain statement, magnitude
  and unit, direction, **evidence type**, measurement date, population size, the out-of-sample metric
  behind it, plus `Story` / `StoryVector` so findings are searchable by meaning exactly as signals
  are. `SupersededByID` + `Status` make the history a chain rather than an overwrite.
- Written at promote time next to where stories are written — but **deliberately independent of the
  LLM**. Every number comes from the model's own measured importance and locked-holdout metrics, so
  findings are still written when story tagging is off or failed. The story only supplies prose.
- The guards against over-claiming are the substance here: a direction is claimed **only when the
  importance map proves it is signed** (tree importances are unsigned, so inferring "Increases"
  would fabricate a causal-sounding claim on every tree model); "out-of-sample" is claimed only when
  the metrics came from the locked holdout; a magnitude without its unit is refused; and an input
  measured and found *not* to matter is recorded rather than dropped, so nobody re-tests it.
- A `Find Relevant Findings` action with an **evidence floor**, so an agent recommending an action
  can demand `Tested Intervention` and get an empty answer rather than an association dressed up as
  advice — and the empty answer says that absence means *nothing has been measured*, not that the
  claim is false.

**Proven live:** 5 findings written from a real promoted model, every magnitude carrying its unit,
every out-of-sample claim naming its holdout metric, nothing claiming a direction the numbers cannot
support, re-running superseding rather than duplicating, and all 5 searchable by meaning through the
action an agent uses.

**Outcome:** the durable output of modelling stops being overwritten at every retrain, and agents
get something citable.

### D — Make the surface answer-shaped — **BUILT**

*Depended on: nothing. Schema: none, as expected.*

- **Ask** (`ps-ask`) sits on the *Predictions* door as a peer of the catalogue, not buried in the
  analyst workbench — someone who arrives with *"why do members lapse?"* should not have to cross
  into Studio and learn the word "component" to get an answer.
- Two modes, because there are two real ways people arrive: **ask a question** (measures and facts,
  side by side) and **check a document** (a pasted plan, diagnosed objective by objective).
- The object model's vocabulary stays in the object model. `As-Of Recency` renders as *"how long
  since it last happened"*; a finding's evidence type renders as *"Observed — the two move
  together"* versus *"Tested — we changed something and measured the effect"*, because only the
  second supports acting and a reader should not have to know which is which.
- **The empty state carries as much weight as the results.** A blank panel reads as *"we cannot do
  this"* when the true statement is nearly always *"nothing has been described that way yet"* — so
  absence is always narrated, never rendered as silence.
- The tree stays where it belongs: in Studio, for the audience that wants it.

**Outcome:** the model-builder's view stops being the front door.

### E — Capability diagnosis — **BUILT**

*Depended on: B and C. Schema: none, as expected.*

- An `Assess Capability Coverage` action: text in, chunked deterministically per objective, each
  chunk embedded and matched against signal and finding vectors — then **judged**, which is the part
  the plan got wrong and the build had to correct.
- Coverage is reported on **two axes**, because they come apart constantly and each implies
  different work: *measurable but not yet studied* needs a study; *known but not instrumented* needs
  instrumentation. One number for both sends the client to the wrong work.
- Absence is reported as absence of a **description**: every result carries the corpus sizes behind
  it, and a gap says the description may be what is missing rather than the capability.

**The correction that matters.** The planned design — threshold the cosine similarity, call anything
below it a gap — was built, measured against the live corpus, and rejected:

| Objective | best | corpus mean | z(best) |
|---|---|---|---|
| *"increase how recently and often members engage"* | 0.745 | 0.664 | 1.80 |
| *"complete the seismic retrofit of the headquarters"* | 0.638 | 0.565 | 1.73 |
| *"negotiate a renewal of the parking structure lease"* | 0.673 | 0.590 | **2.14** |

The parking lease — which nothing in the catalogue can measure — scored the *highest* relative
prominence of any objective, and its best raw match sat inside the band of genuinely covered ones.
Every margin between best and second-best was ~0.005. No absolute threshold or z-score can be made
to work on that, and tuning one to pass this document would have been wrong on the next client's.

So similarity **shortlists** and a judge **decides**, against the candidates' own prose. The judge
picks only among candidates retrieval found, and the structural half of each verdict — whether a
signal or a finding exists at all — is enforced in code over every judge, so no persuasive sentence
can collapse the two axes. With no judge wired, objectives come back `Undetermined` *with their
shortlists* — an honest "a human should decide" rather than a fabricated verdict.

**Proven live** on a 6-objective association plan against 34 signals and 5 findings: engagement and
non-dues revenue resolved as covered/measurable; both facilities objectives resolved as gaps, with
the judge naming the exact trap the numbers fell into — *"the shortlist shares only the word
'renewal' with this objective; no candidate measures the parking structure or its lease."*
Chunking and retrieval are deterministic and verified identical across runs; verdicts are a
judgment and vary at the margin (4/6 matched), while the Gap boundary held.

**Outcome:** the first-meeting artefact — a diagnosis of the client's organisation in a minute.

### Sequence

**A → B → C → E**, with **D** folded in alongside. **All five are done.** What is left is not on
this list: exercising it on a real client's data, and the consumers the signal-layer note still
marks *to build* — alerts, and the fact-checking pass over a document (which now has its foundation
in the capability diagnosis).

---

## What not to do

**Do not add algorithms.** The design record's own Circle-2 decision — *rigid about algorithms,
flexible about data* — still holds, and nothing in the last year has challenged it. The
differentiation was never algorithmic and adding a seventh model family buys nothing.

**Do not chase GPU training or a bigger sidecar.** Same reason. The tabular sidecar is CPU-only by
design and the forecast sidecar is deliberately separate so torch never lands in the base install.

**Do not build more UI for model authors.** That audience is served. Everyone downstream of them is
not.

---

## The one-line version

Predictive Studio can train a model and put its score everywhere. The next phase is doing the same
for everything else a model produces — the measures it proved, and the facts it learned — because
that is what makes it useful to people who will never build a model, and useful from the *first*
model rather than the hundredth.
