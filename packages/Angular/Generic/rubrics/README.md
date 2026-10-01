# @memberjunction/ng-rubrics

Presentational widgets for a rubric draft, an evaluation, and a finished result. They take the tree as inputs and emit changes. They do not save, publish, or navigate. Scoring and the preview call `RubricScoring` from `@memberjunction/rubrics-base`.

- `mj-rubric-builder` edits a draft tree, shows each node's share of its group, and previews sample answers.
- `mj-rubric-scoring-form` records a level or N/A, enforces required rationale and evidence, and emits every change so the host can autosave. Digits select a level. N marks not applicable. Submit stays disabled until the form is complete.
- `mj-rubric-result` shows the score on the version's display range, the band, completeness, and a bar per criterion. It does not edit.
