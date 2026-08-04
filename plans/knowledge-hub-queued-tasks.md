# Knowledge Hub — queued follow-up tasks (do in order, after current PR)

Captured 2026-06-07. These are explicitly queued by Amith to do AFTER the current
taxonomy-hierarchy + IA-split work is merged. Do not lose.

## 1. P6 — ViewType Plug-in Architecture (NEXT)
Full detailed design saved separately in **`plans/p6-viewtype-plugin-design-from-amith.md`**.
Process: review → update `plans/knowledge-hub-unified-plan.md` Phase 6 → ask questions →
investigate + propose ONLY the "filtered-view → cluster subset (fast, vector-DB-provider-
independent)" item first → finalize with Amith → then build.

## 2. Duplicates tab progress is broken ("flashy") — AFTER P6
Amith's report (verbatim):
> the Duplicates tab isn't working I want you to dig into this. Right now I just ran dupe for
> AI Models and the UI is "flashy" so the status on top shows analyzing/querying/and no %
> completion and keeps flahins back and forth and never completses. At times it shows 100%
> complete and then goes back to 0 and then back to 100 and then I see 1%, 2%, and so on, but
> it doesn't seem to work. Dig into that - this is a new task for back end of when you are done
> with other work.

Symptoms to investigate:
- Run Detection for an entity (AI Models) → top status flickers between "Analyzing"/"Querying"
  with no stable % ; progress jumps 0 → 100 → 0 → 1% → 2% … ; never reaches a completed state.
- Likely a progress-subscription issue in the Duplicates resource component
  (`packages/Angular/Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.ts`)
  — the `subscribeToPipelineProgress` / `finishDetection` path (it reuses the pipeline-progress
  subscription with the DuplicateRun ID). Possibly: multiple/duplicate subscriptions, conflicting
  progress events from a shared PipelineProgress channel, idle-timer resetting, or the detection
  job emitting non-monotonic percentages. Also check the server-side duplicate-detection job's
  progress emission (does it report determinate progress at all?).
- Goal: stable, monotonic progress to completion (or an indeterminate spinner if the job can't
  report %), and a clean terminal state. Tie into the global Activity indicator (P3) too.
