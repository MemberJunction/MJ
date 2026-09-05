---
'@memberjunction/predictive-studio': minor
'@memberjunction/interactive-component-types': minor
'@memberjunction/ng-react': minor
'@memberjunction/core-entities-server': minor
'@memberjunction/ng-dashboards': minor
---

Predictive Studio: make signals callable, not just browsable

A signal — one proven measure a model was built from — used to be bound to the exact context it was
born in: this entity, this foreign key, this window. Its *meaning* is general; its *binding* was not,
which limited reuse to model-building.

Meaning and binding are now separate. The aggregate and its time window travel with the signal; the
entity and columns are defaults a caller may substitute, so a measure proven on members computes over
donors, registrants or volunteers. Substitutions are validated against real metadata first, so a
mistyped field is refused by name rather than returning a column of nulls that reads as a real answer.

- `resolveSignal` / `SignalComputer` / `SignalCatalog` in `@memberjunction/predictive-studio`.
  Computation runs through the same `FeatureAssemblyExecutor` training uses, so the number a report
  shows and the number a model trained on cannot diverge.
- Two new Actions: **`Compute Signal`** (one measure, one population, no model) and **`List Signals`**
  (the catalogue, searchable in plain English, each entry flagged whether it can be re-bound).
- `SimpleMLTools` gains optional `listSignals()` and `computeSignal()`, implemented for interactive
  components in `@memberjunction/ng-react` — additive, so existing implementations are unaffected.
- `ReuseSearchRequest` gains an optional `OfKind` filter, applied before ranking.

**Findings as first-class records.** A new `MJ: ML Findings` entity records what each model
*learned* — a plain statement, magnitude and unit, direction, measurement date, population size and
the out-of-sample metric behind it — written at promotion time and **superseded rather than
updated**, so the record shows a business lever moving instead of only its latest value.

No LLM touches any number: every figure comes from the model's own measured importance and locked
holdout, so findings are written even when story tagging is off. The guards are the substance —
a direction is claimed only when the importance map proves it is signed (tree importances are
unsigned, so inferring one would fabricate a causal-sounding claim on every tree model), a magnitude
without its unit is refused, and an input measured and found *not* to matter is recorded so nobody
re-tests it.

`Find Relevant Findings` searches them by meaning and takes an evidence floor, so an agent
recommending an action can demand `Tested Intervention` and get an empty answer rather than an
association dressed up as advice.

**The capability diagnosis.** `Assess Capability Coverage` takes an organization's own strategic plan
and reports what it can currently measure, what it has actually learned, and where neither is true —
on two axes, because *measurable but not yet studied* needs a study and *known but not instrumented*
needs instrumentation.

The notable part is what the build had to correct. Thresholding embedding similarity was implemented,
measured against the live corpus, and rejected: an objective about a **parking structure lease**
scored a higher relative prominence (z = 2.14) than one about member engagement (z = 1.80), and every
margin between best and second-best was ~0.005. No absolute threshold or z-score separates coverage
from vocabulary overlap on that data. So similarity shortlists and a judge decides against the
candidates' own prose, choosing only among candidates retrieval found; the structural half of each
verdict is enforced in code over every judge, so the two axes cannot be collapsed. With no prompt
runner wired, objectives return `Undetermined` *with their shortlists* rather than a fabricated
verdict.

Objective chunking is deterministic (no LLM), so the same document always yields the same objectives
and the same shortlists.

**An answer-shaped front door.** A new **Ask** view on the Predictions door takes a question in plain
English and returns what the organization can measure and what it has already learned, as two
separate blocks — they answer different questions and lead to different work. A second mode takes a
pasted strategic plan and diagnoses every objective in it.

The object model's vocabulary stays in the object model: `As-Of Recency` renders as "how long since
it last happened", and a finding's evidence type renders as "Observed — the two move together"
versus "Tested — we changed something and measured the effect", because only the second supports
acting on it. The empty state is narrated rather than blank, since "nothing found" almost always
means "nothing has been described that way yet" rather than "this cannot be measured".

**The Architect can now see the component model it designs with.** The component system was fully
built — 68 types, slots, composition in the sidecar, frozen reuse end to end — and the sub-agent
choosing the architecture was shown none of it. It had no data sources, so it named
`ComponentTypeRef`s from memory and could never propose a reuse because it did not know what
existed.

Closed with three `RunView` data sources on the Architect (`COMPONENT_TREE`, `COMPONENT_SLOTS`,
`REUSABLE_COMPONENTS`), the three component actions on the Model Development Agent, and prompt
guidance covering when reuse earns its complexity and the two honest limits (an invented id fails at
artifact load; a frozen child that saw overlapping rows flatters the holdout).

Also fixes the reason reuse could never have worked: `ComponentMaterializer` wrote the root component
with `IsTrained: true` but never recorded an `ArtifactFileID`, so the frozen-reuse loader correctly
refused every candidate. The root's fitted state IS the model's artifact, and it is now recorded as
such — which is what makes "combine existing models under a Bagging primitive" reachable at all. The
`REUSABLE_COMPONENTS` filter requires a loadable artifact, so nothing is ever offered that would fail
after a decision was built around it.

**Finer-grained reuse, and banks worth inheriting.** Two gaps the pillar audit surfaced, both closed:

*A trained sub-component can now be reused on its own.* The sidecar reported only *that* a composed
node was fitted, never its state, so only whole models were reusable. Each fitted node now returns
its own serialized estimator (`TrainedComponentState.artifact_b64`), and the materializer stores it
so the sub-component gets an `ArtifactFileID` of its own. A stacking final estimator round-trips and
predicts with no reference to its parent. Three cases deliberately return nothing rather than
something misleading: a frozen child (its bytes belong to the component it was loaded from), an
unfitted template (bagging exposes its base spec, not the individual bags), and anything that fails
to serialize — absent means "not independently reusable", never "look at the parent".

*The inheritance tree now carries enough to be worth resolving.* 21 new property rows take the
banks from 29 to 50, placed at the height where each is genuinely true of everything below — the
lint that enforces the principled partition stays at zero findings. XGBoost now inherits 4 gates and
5 hyperparameters; the Glass-Box Rubric inherits 6 preprocessing ops and a
`requires-direction-per-input` gate, because a hand-weighted rubric with no declared direction is
arithmetic without meaning.

Also fixes a stale seed test: the `forecast` input driver resolves through the separate
ForecastSidecar, and the driver mirror was never updated when TimesFM landed.

Verified end to end on live data: a composed model's three sub-components are each written with
their own artifact, and a second model freezes one of them by `ReuseInstanceID`, recording the
provenance and marking itself as not having fitted it.

**An architecture decision now actually reaches the model it authorized.** `modelingPlanToPipelineConfig`
never carried the Architect's `ComposedGraph` onto the pipeline, and `createTrainingPipeline` had no
field for it — so the architecture gate declared a `compose` decision EXECUTABLE and the builder then
trained a bare single-algorithm model while the plan, the leaderboard and the model row all recorded a
composed one. Nothing downstream could tell the difference.

The graph is now carried (an experiment's own graph wins over the plan-level one, since the
combination search proposes per candidate), and a `compose` decision that describes no composition is
**refused** rather than quietly falling back to the named algorithm.

Verified with the real Architect sub-agent: its decisions validate, name only component types that
exist in the tree, pass the architecture gate, and reach a model that matches the decision.

**Business-case model archetypes.** Three new Model leaves take the tree from primitive-only toward
the primitive→specific range: **RFM Rubric** and **Retention Risk Rubric** (under Glass-Box Rubric)
and **Member Journey HMM** (under Hidden Markov Model). Each keeps its parent's driver — it runs on
the same engine — and narrows its parent's `SpecSchema`, so it constrains what an instance may be
rather than being a rename.

They encode STRUCTURE and DIRECTION, not fabricated magnitudes: RFM fixes the three roles and gives
equal starting weights (a stated starting point, not a claim about anyone's data), while its
missing-data policies differ per role because an unknown recency is unknown but no purchases really
is zero. Retention Risk fixes the inversion (high = more risk) and defaults every input to
NeutralMidpoint, because a member nobody has heard from is unknown risk rather than safe — scoring
them safe is how the quiet ones get missed. Member Journey HMM bounds its state count to 3–6 and
allows naming them, since a twelve-state fit may score better and cannot be discussed.

Two new seed tests guard them: every `DefaultSpec` must satisfy its own `SpecSchema` (a violation is
otherwise invisible until someone instantiates the type), and every archetype must genuinely narrow
a primitive rather than rename it.

**A reify decision now builds what it reified.** `ReifiedUnderComponentTypeRef` was validated by the
schema and by the architecture gate and then **never consulted at execution** — the builder picked
the highest-priority experiment regardless, so a plan recording "these are all variations of
<parent>" could train a family the decision never named. `chooseExperiment` now selects among the
candidates the Architect actually reified, and refuses when no experiment matches any of them.

**And a race-shaped decision says what it left unbuilt.** `defer` and `reify` both mean *race these
and compare*, which a single-model builder cannot do; it builds the leading candidate, which is
right, and now returns a `decisionNote` saying so. Unsaid, the model reads as the decision's outcome
when it is only its first step.

**The Architect is now forced, and a silent no-op is visible.** It was reached only by LLM routing,
so a build could proceed having never consulted it — and when it WAS consulted it intermittently
returned without writing its `Architecture` slice. Both failures produced the same plan shape, which
the gate read as *predating the Architect* and executed as though no decision was ever intended.

The orchestrator now forces it once the statistics exist and before any build, with the same
user-message stamp the statistics pass uses (no re-fire within a turn, a retry on a fresh message).
And `ModelingPlanSpec.ArchitectureAttempted` separates the two meanings of an absent decision: a
legacy plan still executes exactly as before, while a plan where the Architect ran and wrote nothing
is **refused** — building it would train a model no decision selected.

**Measured whether composing earns its complexity.** `test_composition_earns_it.py` builds a target
with mixed structure (a smooth trend plus a pure XOR) and compares a linear model, a forest, and a
stack of both on one split. The families diverge as far as they can — 0.534 vs 0.883 holdout AUC —
and the stack ties the forest at 0.8835. A tree ensemble already spans both smooth and interaction
structure, so stacking a linear model onto it adds a view the forest never needed.

The test asserts that near-tie rather than an aspiration, and says in as many words what a future
failure would mean: the model pool has gained genuinely complementary families and the Architect's
compose guidance should be revisited.
