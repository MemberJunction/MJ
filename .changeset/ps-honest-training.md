---
"@memberjunction/core": minor
"@memberjunction/predictive-studio-core": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/predictive-studio-sidecar": minor
"@memberjunction/predictive-studio-truth-suite": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/integration-test-suite": minor
---

Predictive Studio decides what a training run ships with a three-outcome gate (the model, a simple baseline, or no
signal), stores that decision with its reason on the run, and renders the trust verdict from it.

- `@memberjunction/predictive-studio-core`: `GateRules` (the gate decision table, proven equal to the reference
  pipeline's and to the sidecar's on seeded cases, plus two guards: a holdout minority class below
  `MinMinorityClassRows` and a binary AUC interval that contains 0.5 never ship) and `GateRecords` (the stored gate
  record, the `gate` member of the `ps-run-results/v2` envelope). `TrustVerdicts.DeriveTrustVerdict` takes
  `{ ValidationResults, Lineage }` and renders the stored gate decision; `TrustGrade`, `TrustModelInput`,
  `MajorityBaselineFinding`, `TrustVerdicts.TrustDots` and the free functions `DeriveTrustVerdict`,
  `deriveTrustVerdict`, `TrustEvidenceLine`, `trustEvidenceLine`, `TrustDots`, `trustDots` are removed.
- `@memberjunction/predictive-studio`: a unit training run refuses a sidecar gate that differs from the TypeScript
  decision (`sidecar-gate-mismatch`), creates the model row from the shipped artifact only (none under `no-signal`),
  and `TrainModelResult.model` is nullable. `IRecordLoader.ResolveAlgorithmIdForDriver` is a new required member.
  `PredictiveStudioBuildOutcome.trustGrade` / `trustOneLiner` are renamed `TrustTitle` / `Headline`;
  `GenerateMarkdownReport` takes `trustTitle` / `headline`; `SingleModelLeaderboard` takes a `TrustComparison | null`.
- `@memberjunction/ng-dashboards`: the business catalog opens only predictions the gate shipped;
  `toBusinessPredictionCard` / `buildBusinessCatalog` (and the PascalCase free functions) → `BusinessPredictions.*`;
  the deprecated lowercase helpers of the Predictive Studio agent context, models and studio resources and
  `buildImprovePrompt` are removed.
- `@memberjunction/predictive-studio-sidecar`, `@memberjunction/predictive-studio-truth-suite`: the gate parity tests
  (`test:gate-parity`, `test:gate-parity-refpipe`).
- `@memberjunction/integration-test-suite`: seven Predictive Studio gate checks (G2.1, G2.2, G2.3, G2.5, G2.7, G2.8,
  G2.22).
- `@memberjunction/core`: listed for the Predictive Studio prompt and agent metadata corrected on this branch.
