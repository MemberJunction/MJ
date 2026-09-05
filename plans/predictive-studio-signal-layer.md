# What a model leaves behind

**Predictive Studio — direction note**

Predictive Studio was built to train models on your data and hand back a score. That works. But a
trained model is the *perishable* part of the exercise — it gets retrained, replaced, retired. What
it leaves behind is durable, reusable across the platform, and worth more than the score it came
with.

---

## Where it started: a model factory

Point it at an entity, pick a target, train. You get a model, an honest out-of-sample grade, and a
score you can write back. That is table stakes, and every ML platform on the market stops there.

Stopping there also means the value scales with the number of models you build — which is slow,
expensive, and the reason most of these projects stall after two.

---

## The shift: one model, many assets

Training a model produces far more than a model. Every input it used is a **signal** — a named,
tested, executable measurement bound to real tables, real join paths and a real time window. Every
weight it learned is a **finding** about the business. Every input that failed is a result worth
keeping.

| From one model | Count | What it is |
|---|---|---|
| A score | 1 | The prediction itself, attachable to any query result |
| **Signals** | 8–11 | Each input, independently reusable — and most of them aren't predictions at all, just measurements people want |
| **Findings** | 8–11 | What the data taught us, with a magnitude and a date. These outlive the model that found them |
| **Negative results** | ≥1 | Inputs tested and found not to matter — normally discarded, and normally re-tested by the next person |

Measured on our own run: five models produced **forty-two** reusable signals, each carrying its own
description and its own evidence.

> **The payout starts at the first model, not the hundredth.**

> A model is a question someone already asked. A signal is an answer you can reuse for the questions
> nobody has asked yet.

---

## Two kinds of knowledge

### Signals — what we can do

> *"Whether there is any activity on record at all — so a real zero isn't confused with missing data."*

Executable. Bound to actual fields. Proven to contribute on data it had never seen. Callable by
anything on the platform.

### Findings — what we've learned

> *"Committee membership is associated with 31% lower lapse risk — measured 2026, out-of-sample."*

Model-independent. Carries a magnitude, a date, and its **epistemic status**, so an agent can cite it
without quietly turning a correlation into a cause.

Accumulated over years, the second kind becomes something no organisation currently has: a
searchable body of everything it has empirically learned about its members. Not documents *about*
it — dated, measured, validated facts.

---

## The point: who consumes this

Models are the producer. The value is in who eats. Today each of these invents its own definition of
"engagement" and they quietly disagree — which is how a board ends up with two numbers for one
question.

| Consumer | What it looks like | Status |
|---|---|---|
| **Reports** | Every existing report is retrospective. Attach a signal and the same query becomes forward-looking, with no rewrite. *"Top 50 members by dues"* becomes *"top 50 by dues, with renewal risk and projected engagement."* | Runs today; not yet *savable* on a query |
| **Chat & Skip** | Forward-looking questions answered without anyone building anything. *"Which of our top donors are at risk?"* is a normal query plus a prediction column. | Runs today; Skip does not know the option exists |
| **Dashboards (Component Studio)** | Every interactive component gets `utilities.ml.listModels()` / `.score()` for predictions, and now `.listSignals()` / `.computeSignal()` for measures. A panel can ask *"what can we measure about engagement?"* in plain English and compute the answer over its own population — without naming a table. | Built |
| **Fact-checking** | A claim on a board slide traces to the signal that produced it and the evidence behind it. *"Slide 7 says engagement is up — nothing here measures engagement that way."* | Findings + signals searchable; the document pass is to build |
| **Agents** | Assemble an answer from proven signals mid-conversation, instead of writing SQL and hoping. `List Signals` and `Compute Signal` are ordinary Actions, so an agent discovers them the way it discovers everything else; the type system means a composition either validates or is rejected. | Built |
| **Alerts** | Runs without anyone remembering to look. *"Tell me when a chapter's health signal turns."* | To build |
| **Fact-checking (documents)** | The same pass, aimed at a claim rather than an objective. | Foundation built |
| **Documents** | Paste a strategic plan or a funder report; get back what the organisation can and cannot currently evidence. Every gap is the next piece of work. | Built |
| **Other models** | The next model starts from signals that already proved themselves, rather than from a blank sheet. | Built |

*"One wire away" means the capability exists and is not yet reachable by clients. "To build" means
designed, not written.*

---

## Evidence: what is actually running

| Figure | What it is |
|---|---|
| **42** | signals carrying a written description and a searchable meaning |
| **68** | catalogue entries, machine-checked for consistency — zero findings |
| **0.9950 → 0.5392** | a model that looked perfect in tuning and was a coin flip on held-out data — caught, graded, and locked |
| **+0.19** | out-of-sample gain from point-in-time features, measured not asserted |

Search by meaning works end to end today: typing *"tells a real zero apart from missing data"*
returns the signal that does exactly that — no table name, column name or jargon involved.
Predictions can already be appended to any query result; that path simply isn't exposed to clients
yet.

---

## Next, ordered by leverage

### 1. Expose prediction-enrichment to clients

The plumbing is finished end to end — the enricher runs, the resolver accepts it, the client sends
it. What is missing is that a Query cannot *store* an enrichment, so a report author cannot declare
it and an agent cannot discover it. Built and unreachable is functionally the same as missing.

*Small and additive: a saved annotation, a Query Builder control, and telling Skip it exists.*

### 2. Make signals re-bindable — **done**

A signal was tied to the context it was born in. The meaning now stays fixed while the binding is a
parameter, so the same proven measure works on donors, registrants or volunteers. Two Actions make
it callable: `List Signals` (what can we measure, searchable in plain English) and `Compute Signal`
(one measure, one population, no model). Both are on `utilities.ml` for components.

Measured on the live demo database: **34 signals**, 30 of them re-bindable; searching *"how long ago
someone last engaged with us"* returns the recency measure at 0.742, no column name involved;
computing it over 50 members returns 37 non-zero values through the same assembly path the model
trained on. A substituted field that does not exist is **refused by name** rather than returned as a
column of zeros.

*Load-bearing for everything below — and now in place.*

### 3. Store findings as first-class records — **done**

`MJ: ML Findings` carries magnitude, date, population, the out-of-sample metric behind the claim,
and its **epistemic status** — because an agent asked *"what drives renewal?"* will otherwise flatten
*"members on a committee renew more often"* into *"putting members on a committee makes them
renew"*, two claims separated by an entire research programme. Findings are superseded, never
updated, so the record shows a lever moving. `Find Relevant Findings` searches them by meaning and
takes an evidence floor, so a recommendation can demand a tested intervention and accept nothing
rather than dress up a correlation.

Written at promotion from measured importance and locked-holdout metrics — **no LLM touches any
number**. Measured live: 5 findings from one model, all searchable, none over-claiming.

*Compounds quietly, pays out for a decade — and has started.*

### 4. The capability diagnosis — **done**

Paste a client's own strategic plan and get back what they can currently **measure**, what they have
actually **learned**, and where neither is true. Two axes, not one, because *"measurable but not yet
studied"* needs a study and *"known but not instrumented"* needs instrumentation.

The build corrected the design. Thresholding semantic similarity — the obvious approach — was
measured and rejected: on the live corpus an objective about a **parking structure lease** scored a
higher relative match than one about member engagement, and every margin was ~0.005. Similarity
shortlists; a judge decides against the candidates' own prose. It caught what the numbers could not:
*"the shortlist shares only the word 'renewal' with this objective; no candidate measures the
parking structure or its lease."*

*The first-meeting artefact.*

---

*Figures are from a live run against a demo dataset: five trained models, real held-out evaluation,
real embeddings.*
