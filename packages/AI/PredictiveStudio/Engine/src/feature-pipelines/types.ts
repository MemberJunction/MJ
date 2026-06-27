/**
 * @module feature-pipelines/types
 *
 * Shared contracts for Feature Pipeline discovery + monitoring (SP6). A Feature
 * Pipeline is a categorized `MJ: Record Processes` row (no dedicated entity), so
 * these are projection types over the cached Record Process + Process Run entities
 * — NOT a new persistence shape.
 */

/**
 * Name of the seeded `MJ: Record Process Categories` row that marks a Record
 * Process as a Feature Pipeline. Authored in
 * `metadata/record-process-categories/.record-process-categories.json` and pushed
 * with `mj sync`. The engine matches the denormalized `Category` view field on a
 * Record Process against this name (case-insensitive).
 */
export const FEATURE_PIPELINE_CATEGORY_NAME = 'Feature Pipeline' as const;

/**
 * Normalized last-run status for a Feature Pipeline, derived from the most recent
 * `MJ: Process Runs` header. `'Never'` means the pipeline has no recorded run.
 * `Pending` / `Paused` collapse into `'Running'` for display.
 */
export type FeaturePipelineRunStatus = 'Never' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';

/**
 * UI-/agent-facing summary of one Feature Pipeline: what it is, what entity it
 * writes to, which attribute it produces, and how recently it ran. Built purely
 * from the cached Record Process + Process Run entities by
 * `FeaturePipelineEngine.GetPipelineSummaries()`.
 */
export interface FeaturePipelineSummary {
  /** The underlying `MJ: Record Processes` id (also the `RunFeaturePipeline` `featurePipelineID`). */
  ID: string;
  /** Display name of the pipeline (the Record Process name). */
  Name: string;
  /** Optional description. */
  Description: string | null;
  /** Record Process lifecycle status: `Active` / `Disabled` / `Draft`. */
  Status: 'Active' | 'Disabled' | 'Draft';
  /** The work the pipeline performs per record. Feature pipelines use Infer / Action / Agent. */
  WorkType: 'Action' | 'Agent' | 'FieldRules' | 'Infer';
  /** Id of the entity whose records the pipeline derives features for. */
  TargetEntityID: string;
  /** Display name of the target entity (denormalized from the Record Process view). */
  TargetEntity: string;
  /**
   * Best-effort attribute the pipeline writes back, parsed from the Record
   * Process `OutputMapping`. `null` when the mapping shape isn't recognized.
   */
  OutputAttribute: string | null;
  /** Whether the pipeline can be run on demand (the "Run" button is enabled). */
  OnDemandEnabled: boolean;
  /** Whether the pipeline runs on a cron schedule. */
  ScheduleEnabled: boolean;
  /** Timestamp of the most recent run (start time, falling back to end time), or null. */
  LastRunAt: Date | null;
  /** Normalized status of the most recent run. */
  LastRunStatus: FeaturePipelineRunStatus;
  /** Id of the most recent `MJ: Process Runs` row, or null if never run. */
  LastRunProcessRunID: string | null;
  /** Records processed in the most recent run, or null. */
  LastRunProcessed: number | null;
  /** Records whose features were written in the most recent run, or null. */
  LastRunSuccess: number | null;
  /** Records that errored in the most recent run, or null. */
  LastRunErrors: number | null;
}
