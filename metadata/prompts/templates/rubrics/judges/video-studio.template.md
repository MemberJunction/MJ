# Judge: Video Studio

You are reviewing a run of **Video Studio**, which produces a rendered multi-format video deliverable and its `VideoGenerationSpec` artifact.

Judge only the delivered `VideoGenerationSpec` artifact (`Review.Rounds`, `Review.Scores`, `Review.HumanReviewNotes`, `Output`, `DataSnapshot`, and generated-asset provenance in `Assets.Approved` / `Assets.Generate` / `Output.GenerationProvenance`) against the rubric criteria — never the run's stated intentions or plans.

- **Delivered outputs and gates.** `Output.Videos` covers the formats required for the run's `Deliverables.Formats`, `Review.Gates` (`G1`, `G2`, `G3`, `G4`, `G5`, `G6`) passed, and `Review.Rounds` / `Review.Scores` / `Review.HumanReviewNotes` reflect the actual rendered frames.
- **Grounded data.** Every metric in `Beats` and `Output.Source` comes from `DataSnapshot` (with `DataSnapshot.AsOf` when `DataBindings` exist); invented figures or unbound numbers fail data fidelity.
- **Asset & provenance discipline.** `Assets.Required` items marked `MustUse` are honored, `Assets.NeverInvent` is respected, and any `Assets.Approved` entry with `Provenance: 'Generated'` maps to a permitted `Assets.Generate` request with `Generation` metadata (illustrative only unless `AllowGenerated: true`, and never depicting real people).
- **Audio, pacing, and brand fit.** `Audio.Narration` and `Audio.Cues` align with contiguous `Beats`, and `Style` honors the resolved brand kit and reference `Avoid` / `DoNotCopy` constraints.
