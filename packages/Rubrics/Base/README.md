# @memberjunction/rubrics-base

UI-safe scoring and version classification for rubrics. Pure functions: no database and no Angular. The server and the author preview both call this package. Neither one keeps a second copy of the math.

> **Start with the [Rubrics Guide](../../../guides/RUBRICS_GUIDE.md)** — the model, the five common tasks, tests, agents, and adopting rubrics in an application. This README is the package reference.


## Scoring

`RubricScoring.Compute` scores a version snapshot and its answers. A levels answer uses the level's normalized value. A numeric answer maps the raw value across the scale's minimum and maximum, and inverts that when lower is better. A Percentage scale is a numeric scale named Percentage, or any numeric scale whose minimum is 0 and maximum is 100.

The outcome is the first match:

1. **Incomplete** when completeness is below the version minimum.
2. **NotApplicableFailure** when a not-applicable answer used Fail the evaluation.
3. **Incomplete** when the overall score is null.
4. **GateFailed** when a non-advisory gate is unanswered or below its gate minimum. The minimum is 0 when the criterion does not set one.
5. **Passed** or **BelowThreshold** when a pass threshold is set.
6. **Scored** otherwise.

`Passed` is true only for Passed. It is null for Scored, and for Incomplete when the version has no threshold and no gate. Comparisons use the score rounded to six decimal places.

## Versions

`RubricVersionDiff.Diff` compares a draft with the version it was cloned from. The bump says whether scores stay comparable.

- **Major** — a non-advisory node was added or removed, or a scoring field on a non-advisory node changed, or `IsAdvisory` flipped, or the version's not-applicable policy changed, or a scale used by a non-advisory node changed its type, range, step, direction, or a level's value. A node that is advisory on both sides does not make those scoring-field edits Major.
- **Minor** — the pass threshold or minimum completeness changed, a band was added or removed or its range or tone changed, or an advisory node's scoring fields changed, or evidence or rationale became required.
- **Patch** — wording, sequence, and the display range. Bands match by label. A renamed label on the same band is Patch.

`HighestNonDraftVersion` is the highest Published or Retired version. A Draft is not a base. The first publish, with no such base, is 1.0.0. The author may request a higher bump and may not request a lower one. A draft identical to its base cannot be published.

`SnapshotFromRows` builds the snapshot those functions score. `EvidenceJson` turns plain text into a quote list and leaves an evidence array as JSON.

`BandFor` names the band for a 0..1 score. `WeightShares` is each node's percent of its non-advisory siblings. `DraftProblems` names a tree that cannot be published. `Frozen` is true when a published version uses the scale. The author widgets call these. They do not keep a second copy.

## CLI

This package does not talk to the database. The commands that do are:

```
mj rubric list
mj rubric show <rubric>[@version]
mj rubric diff <rubric> <version> <version>
mj rubric validate <file>
mj rubric evaluate --rubric <rubric> --entity <name> --record <id> [--evaluator <name>]
mj test run --rubric <rubric>[@version]
mj test suite --rubric <rubric>[@version]
mj test promote-criteria <test>
```

`mj rubric evaluate` defaults to LLM, which is stored as AIPrompt. None of these commands publish a version. `mj test promote-criteria` copies a test's inline judge criteria onto a Draft rubric and sets `Test.RubricID`. `@memberjunction/rubrics` is the server package that runs an evaluation.
