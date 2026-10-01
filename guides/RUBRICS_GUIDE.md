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

### Agent evaluation

A research agent is scored on accuracy, sourcing, and completeness. Accuracy is a gate: below 0.6 the run fails even if the other leaves are strong. An AI judge and a human reviewer each submit an evaluation of the same agent run. Their scores stay comparable only while they use the same major version. A calibration set of at least 20 subjects is what makes agreement statistics meaningful.

### Peer review

Three reviewers score one submission. Each reviewer's evaluation is the submission's subject, and the review round is the context. Consensus is the mean of the submitted scores on that major. A reviewer who has a conflict withdraws. The withdrawn row stays in the record and is not part of the cohort mean. Blinded reviewers do not see the cohort columns until they have submitted their own evaluation.

### Awards

A panel scores entries in one category on the same published rubric. Ranking within the category uses the cohort mean of those submitted scores. A knockout eligibility criterion is a gate. An entry that fails it is out, regardless of the weighted score on the other criteria.

### Procurement

Requirements nest: a group for security, a group for delivery. Mandatory items use the Compliance scale and Not Allowed for not applicable, so a vendor cannot skip them. The vendor's own response is a Self evaluation. Evaluators then score the same proposal. The Self score is reported beside the cohort and is not inside the cohort mean.

### Accreditation

Standards are groups and criteria are leaves. Evidence is required, so an answer without a citation cannot be submitted. The institution files a Self evaluation. The visiting team files its own evaluation of the same subject. The two stay distinct, and the cohort mean is the team's submitted scores.

### Hiring

A structured interview uses an anchored 1–5 scale. Each level has a descriptor the interviewer can see while they choose. Several interviewers submit human evaluations. An AI evaluation of the transcript uses the same rubric and the same major, so the comparison is the difference between the human mean and the AI score, not a mix of old and new rubric versions.
