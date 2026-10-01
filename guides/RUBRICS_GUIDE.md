# Rubrics

A rubric is a named set of criteria used to score a record. The criteria can nest. Each leaf is answered on a shared scale. A version is published before anyone is scored against it, and a published version does not change. A later draft can, and publishing that draft assigns the next version number from how the scores would change.

Evaluations are separate from the rubric. A person, an agent, or a deterministic rule fills in a draft and submits it. The stored score is the result of `RubricScoring`. Consensus is computed when you read it, from the submitted evaluations of one subject on one major version.

## Scoring

Leaves on a levels scale score the level's normalized value, a number from 0 to 1. Numeric leaves map the raw value across the scale's min and max, and invert that when lower is better.

A group combines its included children by a weighted mean, a minimum, or a maximum. An advisory criterion is shown and is not part of the rollup. A gate that falls short fails the evaluation even when the weighted score is high.

Not-applicable answers follow the criterion's policy, or the version's policy when the criterion does not set one:

- **Exclude and redistribute** drops the leaf and spreads its weight across its siblings.
- **Count as zero** keeps the leaf in the rollup at 0.
- **Fail the evaluation** makes the outcome Not Applicable Failure.
- **Not allowed** refuses the answer.

The outcome is chosen in this order: completeness below the minimum, a not-applicable failure, an unanswered applicable leaf, a failed gate, a score below the pass threshold, and otherwise Scored when there is no threshold. `Passed` is true only for Passed.

Scores are rounded to six decimal places. The same answers on the same scoring hash produce the same score. The widgets do not implement a second copy of this math. The author preview and the server submit both call `RubricScoring`.

## Versions

A rubric has at most one draft. Publishing is what assigns numbers.

| Bump | When |
|---|---|
| Initial | The first publish. It becomes 1.0.0. |
| Major | A non-advisory criterion was added or removed, or its key, parent, type, weight, scale, advisory flag, gate, not-applicable policy, rollup, or evaluator config changed. Scores from the new major are not comparable with the previous major. |
| Minor | The pass threshold, completeness minimum, bands, or required rationale and evidence changed. |
| Patch | Wording only: names, guidance, instructions, anchors, and display range. |

An author may request a higher bump, not a lower one. A draft that is identical to the version it was based on cannot be published.

Published and retired versions are frozen. The database rejects a change with errors 51101 through 51110. The only status move on a published version is between Published and Retired. A submitted evaluation can be superseded by a newer one or withdrawn. It cannot be edited or deleted.

## The three screens

`@memberjunction/ng-rubrics` is presentational. The host loads the records and saves what the widgets emit.

- **Author** (`mj-rubric-builder`). Add a criterion, set weights, and see each node's share of its group. Advisory nodes are left out of that share. The panel lists problems that would block publish: a duplicate key, a leaf with no scale, a gate with no minimum. Sample answers preview through `RubricScoring`. The widget does not publish.
- **Answer** (`mj-rubric-scoring-form`). Each leaf shows its levels. A digit selects that level. N marks the leaf not applicable and clears the level. Required rationale and evidence block submit. Every change is emitted so the host can save the draft.
- **Result** (`mj-rubric-result`). Read only. The normalized score is mapped onto the version's display range, the band is the range that contains the score, and each criterion is a bar. Nothing in the result edits the evaluation.

## Worked examples

Each example is one published rubric and two evaluations of it. Scores are the `RubricScoring` result for those answers. The levels scale below is Meets = 1, Partial = 0.5, Miss = 0, unless an example names a different scale.

### Agent evaluation

| Key | Weight | Scale | Gate |
|---|---|---|---|
| accuracy | 1 | Meets / Partial / Miss | minimum 0.6 |
| sourcing | 1 | Meets / Partial / Miss | no |
| completeness | 1 | Meets / Partial / Miss | no |

Pass threshold 0.6.

| Evaluation | Answers | Score | Outcome |
|---|---|---|---|
| AI judge | accuracy Partial, sourcing Meets, completeness Meets | 0.833333 | GateFailed |
| Human reviewer | all three Meets | 1 | Passed |

The AI judge's weighted score is above the pass threshold. Accuracy is 0.5, under the gate, so the outcome is GateFailed. The human review clears the gate and passes.

### Peer review

| Key | Weight | Scale |
|---|---|---|
| argument | 1 | Meets / Partial / Miss |
| evidence | 1 | Meets / Partial / Miss |

| Evaluation | Status | Answers | Score | Outcome |
|---|---|---|---|---|
| Reviewer A | Submitted | both Meets | 1 | Scored |
| Reviewer B | Submitted | argument Meets, evidence Partial | 0.75 | Scored |
| Reviewer C | Withdrawn | both Miss | 0 | Scored, then withdrawn |

The cohort mean is the mean of the submitted scores, `(1 + 0.75) / 2 = 0.875`. Reviewer C's 0 is not in that mean.

### Awards

| Key | Weight | Scale | Gate |
|---|---|---|---|
| eligible | 1 | Met = 1 / Not met = 0 | minimum 1 |
| craft | 2 | Meets / Partial / Miss | no |
| originality | 1 | Meets / Partial / Miss | no |

Pass threshold 0.6.

| Evaluation | Answers | Score | Outcome |
|---|---|---|---|
| Entry north | eligible Met, craft Meets, originality Partial | 0.875 | Passed |
| Entry south | eligible Not met, craft Meets, originality Meets | 0.75 | GateFailed |

South's weighted score is high. The eligibility gate is 0, so the entry is out. Ranking inside the category uses the cohort mean of the entries that were scored, not the gated-out row's score as a rank.

### Procurement

| Key | Parent | Weight | Scale | Policy |
|---|---|---|---|---|
| security | | 1 | group | |
| delivery | | 1 | group | |
| encryption | security | 1 | Compliant = 1 / Partial = 0.5 / Non-compliant = 0 | NotAllowed |
| schedule | delivery | 1 | Meets / Partial / Miss | Exclude and redistribute |

| Evaluation | Evaluator | Answers | Score | Outcome |
|---|---|---|---|---|
| Vendor packet | Self | encryption Compliant, schedule Meets | 1 | Scored |
| Buyer | Human | encryption Partial, schedule Meets | 0.75 | Scored |

The vendor cannot mark encryption not applicable. The Self score is reported beside the cohort and is not inside the cohort mean. The buyer's 0.75 is the cohort mean when it is the only non-self submitted score.

### Accreditation

| Key | Parent | Weight | Required |
|---|---|---|---|
| standard-1 | | 1 | group |
| records | standard-1 | 1 | evidence required |
| faculty | standard-1 | 1 | evidence required |

Scale for both leaves: Met = 1 / Not met = 0.

| Evaluation | Evaluator | Answers | Score | Outcome |
|---|---|---|---|---|
| Self-study | Self | both Met, each with a file citation | 1 | Scored |
| Visiting team | Human | records Met, faculty Not met, each with a citation | 0.5 | Scored |

An answer with no citation cannot be submitted. The team's 0.5 is the cohort mean. The self-study stays visible and is not inside that mean.

### Hiring

| Key | Weight | Scale |
|---|---|---|
| structure | 1 | 1 = 0, 2 = 0.25, 3 = 0.5, 4 = 0.75, 5 = 1, each level anchored |
| evidence | 1 | the same 1–5 anchors |

| Evaluation | Evaluator | Answers | Score | Outcome |
|---|---|---|---|---|
| Interviewer | Human | structure 4, evidence 4 | 0.75 | Scored |
| Transcript | AI | structure 5, evidence 3 | 0.75 | Scored |

Both use the same major, so the comparison is 0.75 against 0.75, not a mix with an older rubric. The anchors are what the interviewer reads while choosing the level.

## Shipped agent rubrics

Seven rubrics ship as Published 1.0.0 on Meets / Partial / Miss, with pass threshold 0.7 and a gate minimum of 0.6. Partial fails that gate. They are Research answer, Query answer, Generated code, Schema proposal, Catalog contract, Picture from the data, and Duplicate decision. The examples in this guide stay Draft and stay unbound. A test that already has an `llm-judge` oracle keeps that judge. The agent's Evaluation rubric is not added beside it.
