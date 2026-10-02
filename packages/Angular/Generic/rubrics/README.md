# @memberjunction/ng-rubrics

Presentational widgets for a rubric draft, an evaluation, and a finished result. They take the tree as inputs and emit changes. They do not save, publish, or navigate. Scoring and the preview call `RubricScoring` from `@memberjunction/rubrics-base`.

- `mj-rubric-builder` edits a draft tree, shows each node's share of its group, and previews sample answers.
- `mj-rubric-scoring-form` records a level or N/A, enforces required rationale and evidence, and emits every change so the host can autosave. Digits select a level. N marks not applicable. Submit stays disabled until the form is complete.
- `mj-rubric-result` shows the score on the version's display range, the band, completeness, and a bar per criterion. It does not edit.
- `mj-rubric-publish-dialog` shows the computed bump, each change's reason, and the higher bumps an author may request. Confirm emits. The widget does not publish.
- `mj-rubric-version-diff` puts the base on the left and the draft on the right, one row per key.
- `mj-rubric-comparison-matrix` is evaluators across and criteria down. Cells that disagree are marked. The grid shows the human mean, the AI mean, and the self mean. A withdrawn column stays on the grid and stays out of those means. Cohort figures stay hidden while the viewer's evaluation is Draft.
- Record editors and hosts bind one version, criterion, scale level, band, or category. They load through the metadata provider the form passes in. They do not navigate.
