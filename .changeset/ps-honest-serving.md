---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/feature-pipelines": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/predictive-studio-core": minor
"@memberjunction/predictive-studio-sidecar": minor
"@memberjunction/react-runtime": minor
"@memberjunction/record-set-processor": minor
"@memberjunction/record-set-processor-base": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/sql-parser": minor
---

Honest serving for Predictive Studio: models reach production only through one lifecycle gate (`PredictiveStudio.PromoteModel` takes a `transition`), artifacts are stored durably with a verified SHA-256, every scoring call is a recorded `MJ: ML Scoring Runs` row, predictions are effective-dated `MJ: Feature Values` rows served by `MJ: Latest Feature Values` behind a view authorization, and published models are monitored on real outcomes with automatic rollback.

Deploy impact (one-time, on the first runs after upgrade):
- The registry job re-verifies each `Published` model trained by the previous release's trainer on its stored gate record; one that does not re-verify becomes `Unevaluated` and stops serving (scoring refused `model-not-published` until a retrain publishes through the gate). Older models without a `Delivery` that are `Draft`, `Validated` or `Published` become `Unevaluated`; the one that served each pipeline keeps serving, flagged, until its pipeline is retrained under a protocol. Expect a burst of training compute: auto-train processes retrain on their next run and the registry job retrains at most 3 other pipelines per run; schedules of non-auto-train Record Processes bound to a non-serving demoted model are disabled until re-evaluation publishes.
- The registry job copies legacy artifacts into file storage, 50 models per run, until none is `unverified`.
- Duplicate `(PipelineID, Version)` model rows are renumbered (the old number kept in `Lineage`).
- Existing scoring bindings are migrated (pipeline from their model, feature name from the pipeline name, their column kept as the optional copy); the "View Model Predictions" authorization (granted to Developer and Integration) is set on the daily prediction sweep's first run — until then their predictions are visible to no one through Feature Values. Grant it to the roles that should see predictions.
- `MJ: Feature Values` and `MJ: Latest Feature Values` carry a row-level security filter on every role's read permission; pipeline and human values are unaffected.
- Score Record Set returns `Success = false` for refusals and for runs with any failed record; direct `MJ: ML Models.Status` writes are refused (`status-changed-outside-gate`).
- Breaking: the promotion API (`targetStatus`/`signOff` → `transition`/`signOffId`), the "Promote ML Model" Action's inputs and result codes, the binding's `MLModelID`/`MaterializedResultID`/`'Materialized'` mode, and 217 `@deprecated` aliases are removed with no compatibility shim (see the PR description's list).
