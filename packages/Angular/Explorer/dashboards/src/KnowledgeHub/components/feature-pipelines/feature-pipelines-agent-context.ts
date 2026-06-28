/**
 * @fileoverview Pure, framework-agnostic helpers for the Knowledge Hub
 * **Feature Pipelines** resource component's AI-agent integration.
 *
 * Free of Angular / component dependencies so they can be unit-tested in
 * isolation. The component supplies its `FeaturePipelineSummary[]` snapshot and
 * these helpers shape the deep agent context + resolve agent-supplied pipeline
 * references (by id → name → contains).
 *
 * 🔒 SAFETY: these helpers only PROJECT state and RESOLVE references — no
 * mutation, no side effects.
 */

import { boundNameList, AGENT_CONTEXT_NAME_LIST_CAP } from '../../../shared/agent-tool-validation';
import type { FeaturePipelineSummary, FeaturePipelineRunStatus } from './feature-pipeline.engine';

/**
 * The salient slice of a feature pipeline the agent reasons over. Structurally a
 * subset of {@link FeaturePipelineSummary} so the component can pass its
 * summaries straight in.
 */
export interface FeaturePipelineCandidate {
    ID: string;
    Name: string;
    TargetEntity: string;
    OutputAttribute: string | null;
    Status: 'Active' | 'Disabled' | 'Draft';
    WorkType: 'Action' | 'Agent' | 'FieldRules' | 'Infer';
    LastRunStatus: FeaturePipelineRunStatus;
    OnDemandEnabled: boolean;
}

/**
 * Resolve a pipeline reference the way the agent expresses it — by id (exact,
 * case-insensitive) → name (exact, case-insensitive) → name *contains*
 * (case-insensitive). Pure + deterministic.
 *
 * @returns the matched pipeline, or null on a miss.
 */
export function resolvePipeline<T extends { ID: string; Name: string }>(
    input: string,
    pipelines: readonly T[],
): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) return null;
    const byID = pipelines.find(p => p.ID.toLowerCase() === needle);
    if (byID) return byID;
    const byName = pipelines.find(p => p.Name.toLowerCase() === needle);
    if (byName) return byName;
    return pipelines.find(p => p.Name.toLowerCase().includes(needle)) ?? null;
}

/** Build a tolerant "no pipeline matches" error listing a bounded sample of names. */
export function buildPipelineNotFoundError(input: string, available: readonly string[]): string {
    const sample = boundNameList(available, 10).join(', ');
    const more = available.length > 10 ? ` (+${available.length - 10} more)` : '';
    return `No feature pipeline matches "${input}". Available pipelines: ${sample}${more}.`;
}

/** Component-supplied snapshot for the Feature Pipelines agent context. */
export interface FeaturePipelinesAgentContextInput {
    /** Every pipeline (unfiltered) — drives counts + the bounded name list. */
    AllPipelines: FeaturePipelineSummary[];
    /** Pipelines after the search filter — drives the filtered count. */
    FilteredPipelines: FeaturePipelineSummary[];
    /** The active search query. */
    SearchQuery: string;
    /** Ids of pipelines with a Run currently in flight. */
    RunningIDs: ReadonlySet<string>;
    /** Whether the surface is mid-load. */
    IsLoading: boolean;
}

/** Count pipelines by their normalized last-run status. */
function countByRunStatus(pipelines: readonly FeaturePipelineSummary[], status: FeaturePipelineRunStatus): number {
    return pipelines.filter(p => p.LastRunStatus === status).length;
}

/**
 * Build the agent-visible context for the Feature Pipelines surface. Publishes
 * deep counts (by status, by run-outcome, by work-type), the active search,
 * which pipelines are running, and a **bounded** structured list of the filtered
 * pipelines (name · target entity · output attribute · status · last-run) so the
 * agent can pick one to run or open. A companion truncation flag tells it when
 * the list is capped.
 */
export function buildFeaturePipelinesAgentContext(
    input: FeaturePipelinesAgentContextInput,
): Record<string, unknown> {
    const all = input.AllPipelines;
    const filtered = input.FilteredPipelines;

    const runningNames = all.filter(p => input.RunningIDs.has(p.ID)).map(p => p.Name);

    const ctx: Record<string, unknown> = {
        IsLoading: input.IsLoading,
        PipelineCount: all.length,
        FilteredPipelineCount: filtered.length,
        SearchQuery: input.SearchQuery,

        // By Record-Process status
        ActiveCount: all.filter(p => p.Status === 'Active').length,
        DisabledCount: all.filter(p => p.Status === 'Disabled').length,
        DraftCount: all.filter(p => p.Status === 'Draft').length,

        // By last-run outcome
        NeverRunCount: countByRunStatus(all, 'Never'),
        CompletedCount: countByRunStatus(all, 'Completed'),
        FailedCount: countByRunStatus(all, 'Failed'),
        RunningStatusCount: countByRunStatus(all, 'Running'),

        // In-flight runs (this session)
        RunningCount: runningNames.length,
        RunningPipelineNames: boundNameList(runningNames),

        // Bounded structured view of what's on screen
        VisiblePipelineNames: boundNameList(filtered.map(p => p.Name)),
        Pipelines: filtered.slice(0, AGENT_CONTEXT_NAME_LIST_CAP).map(p => ({
            Name: p.Name,
            TargetEntity: p.TargetEntity,
            OutputAttribute: p.OutputAttribute,
            Status: p.Status,
            WorkType: p.WorkType,
            LastRunStatus: p.LastRunStatus,
        })),
    };

    if (filtered.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        ctx['PipelinesTruncated'] = true;
    }

    return ctx;
}
