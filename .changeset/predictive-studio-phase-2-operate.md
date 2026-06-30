---
"@memberjunction/predictive-studio": patch
"@memberjunction/ng-dashboards": patch
---

Predictive Studio — Operate flow hardening + score-time train/serve skew fix

**`@memberjunction/predictive-studio`** — Fix a silent train/serve skew in the FeatureAssembly score path. On-demand / scheduled scoring receives its records from an upstream Record-Set-Processing scope that may load them with a narrow field projection, dropping virtual/denormalized feature columns (e.g. a value-list field joined into the entity view but absent from the base table). The model trained on those columns, so their absence at score time silently degraded every prediction toward a constant. `FeatureAssemblyExecutor.assemble()` now re-reads any *absent* required feature column from the **same entity view the training path reads** (keyed by primary key; columns already present are untouched, so training / full-load paths incur no extra read), and **hard-fails** if a required column is still absent — converting a silent "Succeeded with degenerate output" into a clear `Failed` run that bubbles to the run history and UI. The guardrail also protects training (a pipeline declaring a column the view doesn't expose now fails loudly up front). Covered by new unit tests (hydration, hard-fail, train/serve parity) and an integration assertion that on-demand predictions vary across a multi-type scope.

**`@memberjunction/ng-dashboards`** — Predictive Studio: (1) "Models in Production" tab now reloads the selected model's run history + scoring bindings after the Operate dialog runs / schedules / binds a model, so a just-created run appears immediately (the reactive model stream refreshes deploy state but not the on-demand run list); (2) the Home recent-activity feed no longer crashes when a scoring run or model event arrives with a missing/invalid timestamp (it falls back gracefully instead of throwing); (3) Operate dialog summary grammar + a stale idle-state caption.
