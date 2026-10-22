---
"@memberjunction/predictive-studio-sidecar": minor
"@memberjunction/predictive-studio-core": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-core-entity-forms": minor
---

Add the Predictive Studio planted-truth test suite (`packages/AI/PredictiveStudio/TruthSuite`) and Phase-0 containment safeguards: uncapped default row reads for training and filter-scoped scoring, lifecycle status gates and dry-run isolation for model scoring, calibrated risk bands and non-causal driver copy across UI and prompt templates, single-threaded deterministic training and honest out-of-sample validation metrics (`kfold`/`holdout`), refusal of no-effect `AsOfStrategy` configurations, withholding of non-origin-split time-series forecasts, majority-class baseline enforcement on imbalanced classifiers, and explicit deactivation of un-wired experiment sessions and maintenance jobs.

Note: Pre-existing models trained with locked holdout explicitly disabled (`LockedHoldoutFraction = 0`) or graded on accuracy alone (without `AUC` or a recorded `BaselineAccuracy`) will display as unmeasured until retrained.
