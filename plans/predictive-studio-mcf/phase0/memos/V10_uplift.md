# V10 — Uplift / Persuadables (the flagship business claim)

**Verdict: PASS** — the "who is worth contacting" claim, demonstrated on planted causal ground truth. The single most business-persuasive artifact in Phase 0.

## Hypothesis
On planted treatment-effect data, a T-learner recovers the four marketing segments and uplift-targeting beats risk-targeting on realized net outcome under a fixed contact budget — including declining to contact the sleeping-dogs whom contact actively harms.

## Method
Members carry a planted segment (learnable from features) with known no-contact conversion p0 and contacted conversion p1:

| segment | p0 | p1 | uplift |
|---|---|---|---|
| persuadable | 0.10 | 0.62 | **+0.52** (the money) |
| sure-thing | 0.82 | 0.86 | ~0 (converts anyway) |
| lost-cause | 0.06 | 0.10 | ~0 (won't convert regardless) |
| sleeping-dog | 0.70 | 0.32 | **−0.38** (contact backfires) |

A randomized experiment (T~Bernoulli(0.5)) generates observations; a T-learner fits two **calibrated** classifiers (P(y|treated), P(y|control)); uplift = p1̂ − p0̂. On a holdout where the true p0/p1 are known, three fixed-budget (30%) policies are scored by *realized* net conversions. 5 seeds.

## Result (mean over 5 seeds, `results/v10_uplift.result.json`)

| targeting policy | realized net conversions |
|---|---|
| nobody contacted | 757 |
| contact **everyone** (100% budget) | 852 |
| highest-**risk** (30% budget) | 878 |
| highest-**uplift** (30% budget) | **984** |

- **Uplift-targeting 30% of members (984) beats contacting 100% (852).** Same or fewer dollars, far more conversions — because it spends only where contact changes the outcome.
- **+106 net over risk-targeting (+12%)** at the same budget — risk wastes contacts on lost-causes (high-risk but unmovable); uplift concentrates on persuadables.
- **Segment recovery 90%** (chance = 25%) — the T-learner correctly identifies who is which.
- **Sleeping-dogs contacted by the uplift policy: 2 of ~540** (0.4%) — it correctly declines to contact the members whom outreach would push *away*.

## Reading
This is the business case in one table: the same outreach budget, pointed by uplift instead of risk (or sprayed at everyone), produces materially more renewals — and stops actively harming the sleeping-dogs a risk model is blind to (a risk model sees only "likely to lapse," never "will react badly to contact"). Calibration (V6) is a hard prerequisite here — uplift is a *difference of probabilities*, so uncalibrated scores would make the segments meaningless; the two experiments are linked.

## What it does for the plan
Validates the uplift components and the headline "who is worth contacting" claim with numbers, on causal ground truth — the artifact that turns the business pitch from assertion into demonstration. It also shows the composition story working end-to-end for real value: two calibrated base models composed into a segmentation nobody could read off a single score.

## Caveat
Planted, clean treatment effects and a randomized-assignment assumption. Real intervention data is observational and confounded — uplift on real data needs the treatment/exposure history the plan flags as a data-assembly problem (Data Scout's job), and positivity/overlap checks. The mechanism is validated; the data prerequisite is real and named.

## Reproduce
`./run.sh v10_uplift` — seeds 91–95, calibrated T-learner. Raw records in `results/v10_uplift.result.json`.
