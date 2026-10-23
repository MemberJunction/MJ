---
"@memberjunction/predictive-studio-sidecar": minor
"@memberjunction/predictive-studio-core": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-core-entity-forms": minor
---

Add the Predictive Studio planted-truth test suite (`packages/AI/PredictiveStudio/TruthSuite`: the datasets and the harness that loads and scores them) and Phase-0 containment safeguards. The containment gates are MJ Tests run with `mj test suite "Predictive Studio Gates — Containment"`. Containment fixes: uncapped default row reads for training and filter-scoped scoring, lifecycle status gates and dry-run isolation for model scoring, typed refusal codes the gates assert on, a feature-importance kind that decides which model drivers may be shown, calibrated risk bands and non-causal driver copy across UI and prompt templates, seeded, reproducible training (a fixed random state; the truth-suite sidecar also pins one thread for its determinism gate) and honest out-of-sample validation metrics (`kfold`/`holdout`), refusal of no-effect `AsOfStrategy` configurations, withholding of non-origin-split time-series forecasts, majority-class baseline enforcement on imbalanced classifiers, and disabling the Run Experiment Session action and the maintenance job, which nothing runs yet.

Note: Pre-existing models trained with locked holdout explicitly disabled (`LockedHoldoutFraction = 0`) or graded on accuracy alone (without `AUC` or a recorded `BaselineAccuracy`) will display as unmeasured until retrained. Existing models' global driver lists stay hidden until retrained, because a model with no stored feature-importance kind has its drivers hidden.
