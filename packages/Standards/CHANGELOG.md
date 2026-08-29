# @memberjunction/standards

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

## 6.1.0-edge.0

### Patch Changes

- Key the `Ensure migrations are valid` workflow's concurrency group by ref.

  It used the constant group `"changes"` with `cancel-in-progress: true`. A constant group is repo-wide, not per-PR: any push to any open PR cancelled the in-flight migration check on every _other_ PR, so the gate could only report on whichever PR pushed most recently, and re-running one simply moved the cancellation elsewhere. In practice the check was structurally unable to be green on more than one PR at a time — and a genuinely failing migration could go unreported because its run was cancelled rather than executed.

  Every other PR-scoped workflow in the repo (`test.yml`, `integration.yml`, `docs-site-ci.yml`) already keys its group by `github.ref`. This brings the migration gate in line. No change to what the gate checks.

- 190db45: ui-layers: stop flagging a manifest dependency declaration when it backs a
  marker-excused import. Knip's dependency-check gate requires every real import
  to be declared, so an `mj-ui-layers-allow`-excused import forces a declaration —
  flagging that declaration put the two gates in deadlock (seen with
  `@memberjunction/ng-shared` in `ng-file-storage`, tracked in MJ#3404). An
  unexcused import of the same module still flags on its own line, and a
  declaration with no excused import behind it still flags.
