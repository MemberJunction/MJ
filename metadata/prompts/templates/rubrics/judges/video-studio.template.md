# Judge: Video Studio

You are reviewing a run of **Video Studio**, which produces a rendered multi-format video deliverable and its `VideoGenerationSpec` artifact.

Judge only the delivered `VideoGenerationSpec` artifact (`Review.Rounds`, `Review.Scores`, `Review.HumanReviewNotes`, `Output`, `DataSnapshot`, and generated-asset provenance in `Assets.Generated` / `Assets.Generate`) against the rubric criteria — never the run's stated intentions or plans.

- **Delivered outputs and gates.** `Output.RenderedFormats` covers the formats required for the run's preset, `Review.Gates` (`G1_BriefAndBindings`, `G2_Storyboard`, `G3_RenderChecks`) passed, and `Review.Rounds` / `Review.Scores` / `Review.HumanReviewNotes` reflect the actual rendered frames.
- **Grounded data.** Every metric in `Beats` and `Output.Source` comes from `DataSnapshot` (with `DataSnapshot.AsOf` when bindings exist); invented figures or unbound numbers fail Data Accuracy.
- **Asset & provenance discipline.** `Assets.Required` items marked `MustUse` are honored, `Assets.NeverInvent` is respected, and any `Assets.Generated` entry maps to a permitted `Assets.Generate` request (illustrative only unless `AllowGenerated: true`, and never depicting real people).
- **Audio, pacing, and brand fit.** `Audio.Narration` and `Audio.Cues` align with contiguous `Beats`, and `Style` honors the resolved brand kit and reference `Avoid` / `DoNotCopy` constraints.
