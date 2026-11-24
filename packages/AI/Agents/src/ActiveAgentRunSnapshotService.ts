/**
 * @fileoverview Builds a live, point-in-time snapshot of active and recently completed
 * agent runs on a parent conversation for Side Question execution.
 *
 * Queries `MJ: AI Agent Runs` (batched with `MJ: Conversation Branches` on forked threads),
 * descendant sub-agent runs + detail placements, recent `MJ: AI Agent Run Steps`, and
 * `MJ: Tasks` fresh from the database provider (bypassing cache), enriches in-flight runs
 * on the same MJAPI replica with {@link AgentRunWatchdog.ReadLiveRunHint}, and wraps
 * untrusted run/step payloads safely via {@link WrapUntrustedExternalData} after escaping
 * runtime-state tags.
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, LogError, RunView, type RunViewParams, type RunViewResult, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, GroupByUUID, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    ConversationEngine,
    type ConversationBranchRow,
    type MJAIAgentRunEntity,
    type MJAIAgentRunStepEntity,
    type MJTaskEntity,
} from '@memberjunction/core-entities';
import { AgentRunWatchdog } from './agent-run-watchdog';
import { WrapUntrustedExternalData } from './client-tool-results';
import { EscapeRuntimeStateTags } from './runtime-state-fragment';

/** Parameters for {@link ActiveAgentRunSnapshotService.CaptureSnapshot}. */
export interface CaptureActiveRunsSnapshotParams {
    /** Parent conversation ID whose runs should be inspected. */
    ParentConversationID: string;
    /** Optional fork branch ID on the parent conversation (informational header). */
    ParentBranchID?: string | null;
    /** Calling user; queries execute with this user's RLS permissions. */
    ContextUser: UserInfo;
    /** Metadata/database provider to query from (defaults to global provider when omitted). */
    Provider?: IMetadataProvider;
}

interface AgentRunSnapshotRow {
    ID: string;
    AgentID: string;
    Agent: string | null;
    ParentRunID: string | null;
    RootParentRunID: string | null;
    ParentRunIDDepth: number | null;
    Status: MJAIAgentRunEntity['Status'];
    StartedAt: Date | string;
    CompletedAt: Date | string | null;
    ErrorMessage: string | null;
    FinalStep: string | null;
    FinalPayload: string | null;
    ConversationID: string | null;
    ConversationDetailID: string | null;
    TotalPromptIterations: number | null;
}

interface AgentRunStepSnapshotRow {
    ID: string;
    AgentRunID: string;
    StepNumber: number;
    StepType: string;
    StepName: string;
    Status: MJAIAgentRunStepEntity['Status'];
    StartedAt: Date | string;
    CompletedAt: Date | string | null;
    ErrorMessage: string | null;
    OutputData: string | null;
    PayloadAtEnd: string | null;
}

interface TaskSnapshotRow {
    ID: string;
    ParentID: string | null;
    Name: string;
    Status: MJTaskEntity['Status'];
    PercentComplete: number | null;
    AgentRunID: string | null;
    StepType: string | null;
    ErrorMessage: string | null;
}

interface DetailPlacementRow {
    ID: string;
    BranchID: string | null;
    Sequence: number;
}

const AGENT_RUN_SNAPSHOT_FIELDS: string[] = [
    'ID',
    'AgentID',
    'Agent',
    'ParentRunID',
    'RootParentRunID',
    'ParentRunIDDepth',
    'Status',
    'StartedAt',
    'CompletedAt',
    'ErrorMessage',
    'FinalStep',
    'FinalPayload',
    'ConversationID',
    'ConversationDetailID',
    'TotalPromptIterations',
];

const AGENT_RUN_STEP_FIELDS: string[] = [
    'ID',
    'AgentRunID',
    'StepNumber',
    'StepType',
    'StepName',
    'Status',
    'StartedAt',
    'CompletedAt',
    'ErrorMessage',
    'OutputData',
    'PayloadAtEnd',
];

const TASK_SNAPSHOT_FIELDS: string[] = [
    'ID',
    'ParentID',
    'Name',
    'Status',
    'PercentComplete',
    'AgentRunID',
    'StepType',
    'ErrorMessage',
];

const ACTIVE_RUN_STATUSES: ReadonlySet<MJAIAgentRunEntity['Status']> = new Set([
    'Running',
    'Paused',
    'AwaitingFeedback',
]);

/**
 * Captures point-in-time status, step progress, task-graph state, and same-replica
 * scratchpad/step hints for a parent conversation's active and recent agent runs.
 */
export class ActiveAgentRunSnapshotService extends BaseSingleton<ActiveAgentRunSnapshotService> {
    protected constructor() {
        super();
    }

    public static get Instance(): ActiveAgentRunSnapshotService {
        return super.getInstance<ActiveAgentRunSnapshotService>();
    }

    /** Maximum number of parent-conversation runs to include in a snapshot. */
    protected get MaxRunsToInspect(): number {
        return 5;
    }

    /** Maximum number of recent steps shown per run. */
    protected get MaxStepsPerRun(): number {
        return 8;
    }

    /** Character cap per previewed payload/output/live-hint string. */
    protected get MaxStepPreviewChars(): number {
        return 400;
    }

    /** Window (minutes) for including recently completed/failed/cancelled runs alongside active runs. */
    protected get RecentTerminalWindowMinutes(): number {
        return 10;
    }

    /**
     * Captures a formatted markdown snapshot of active and recently finished runs on
     * `ParentConversationID` as of right now. Safe to call concurrently with running agents.
     */
    public async CaptureSnapshot(params: CaptureActiveRunsSnapshotParams): Promise<string> {
        const rv = RunView.FromMetadataProvider(params.Provider);
        const now = Date.now();
        const nowIso = new Date(now).toISOString();

        const primaryLoad = await this.loadPrimaryRunsAndBranches(rv, params);
        if (!primaryLoad.Success) {
            return `Snapshot unavailable at ${nowIso} (unable to read active run records).`;
        }

        const cutoffMs = now - this.RecentTerminalWindowMinutes * 60_000;
        const candidatePrimaryRuns = primaryLoad.Runs
            .filter((r) => this.isRelevantRun(r, cutoffMs))
            .slice(0, this.MaxRunsToInspect);

        if (candidatePrimaryRuns.length === 0) {
            return `Snapshot captured at ${nowIso}: No agent runs are currently running, paused, or completed within the last ${this.RecentTerminalWindowMinutes} minutes on the main conversation.`;
        }

        const { descendants, detailById } = await this.loadDescendantsAndDetailPlacements(
            rv,
            params.ContextUser,
            candidatePrimaryRuns
        );
        const primaryRuns = this.filterRunsByBranchPath(
            candidatePrimaryRuns,
            params.ParentBranchID ?? null,
            detailById,
            primaryLoad.Branches
        );

        if (primaryRuns.length === 0) {
            return `Snapshot captured at ${nowIso}: No agent runs are currently running, paused, or completed within the last ${this.RecentTerminalWindowMinutes} minutes on this branch.`;
        }

        const allRuns = this.mergeDescendantRuns(primaryRuns, descendants);
        const { stepsByRun, tasksByRun } = await this.loadStepsAndTasksBatched(
            rv,
            params.ContextUser,
            allRuns.map((r) => r.ID)
        );

        return this.formatSnapshot(now, nowIso, params, primaryRuns, allRuns, stepsByRun, tasksByRun);
    }

    private async loadPrimaryRunsAndBranches(
        rv: RunView,
        params: CaptureActiveRunsSnapshotParams
    ): Promise<{ Success: boolean; Runs: AgentRunSnapshotRow[]; Branches: ConversationBranchRow[] }> {
        const rootRunsQuery = this.buildRunSnapshotQuery(
            `ConversationID='${EscapeSQLString(params.ParentConversationID)}'`,
            'StartedAt DESC',
            this.MaxRunsToInspect * 2
        );

        if (!params.ParentBranchID) {
            const res = await rv.RunView<AgentRunSnapshotRow>(rootRunsQuery, params.ContextUser);
            if (!res.Success) {
                LogError(`ActiveAgentRunSnapshotService: failed to query runs for ${params.ParentConversationID}: ${res.ErrorMessage}`);
                return { Success: false, Runs: [], Branches: [] };
            }
            return { Success: true, Runs: res.Results ?? [], Branches: [] };
        }

        const branchesQuery: RunViewParams = {
            EntityName: 'MJ: Conversation Branches',
            ExtraFilter: `ConversationID='${EscapeSQLString(params.ParentConversationID)}'`,
            Fields: ['ID', 'ConversationID', 'ParentBranchID', 'ForkFromSequence'],
            BypassCache: true,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        };

        const [runsRes, branchRes] = (await rv.RunViews([rootRunsQuery, branchesQuery], params.ContextUser)) as [
            RunViewResult<AgentRunSnapshotRow> | undefined,
            RunViewResult<ConversationBranchRow> | undefined,
        ];
        if (!runsRes?.Success) {
            LogError(`ActiveAgentRunSnapshotService: failed to query runs for ${params.ParentConversationID}: ${runsRes?.ErrorMessage ?? 'unknown error'}`);
            return { Success: false, Runs: [], Branches: [] };
        }
        return {
            Success: true,
            Runs: runsRes.Results ?? [],
            Branches: branchRes?.Success ? (branchRes.Results ?? []) : [],
        };
    }

    private buildRunSnapshotQuery(extraFilter: string, orderBy: string, maxRows: number): RunViewParams {
        return {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: extraFilter,
            OrderBy: orderBy,
            Fields: AGENT_RUN_SNAPSHOT_FIELDS,
            MaxRows: maxRows,
            BypassCache: true,
            SkipTotalRowCount: true,
            ResultType: 'simple',
        };
    }

    private isRelevantRun(run: AgentRunSnapshotRow, cutoffMs: number): boolean {
        if (ACTIVE_RUN_STATUSES.has(run.Status)) {
            return true;
        }
        const timestamp = this.toEpochMs(run.CompletedAt ?? run.StartedAt);
        return timestamp >= cutoffMs;
    }

    private mergeDescendantRuns(
        primaryRuns: AgentRunSnapshotRow[],
        descendants: AgentRunSnapshotRow[]
    ): AgentRunSnapshotRow[] {
        const primaryIds = new UUIDSet(primaryRuns.map((r) => r.ID));
        const byRunId = new UUIDMap<AgentRunSnapshotRow>();
        for (const run of primaryRuns) {
            byRunId.Set(run.ID, run);
        }
        for (const desc of descendants) {
            const rootOrParent = desc.RootParentRunID ?? desc.ParentRunID;
            if (rootOrParent && primaryIds.Has(rootOrParent) && !byRunId.Has(desc.ID)) {
                byRunId.Set(desc.ID, desc);
            }
        }
        return [...byRunId.Values()];
    }

    private async loadDescendantsAndDetailPlacements(
        rv: RunView,
        contextUser: UserInfo,
        seedRuns: AgentRunSnapshotRow[]
    ): Promise<{
        descendants: AgentRunSnapshotRow[];
        detailById: UUIDMap<DetailPlacementRow>;
    }> {
        const descendants: AgentRunSnapshotRow[] = [];
        const detailById = new UUIDMap<DetailPlacementRow>();
        const seedIn = this.sqlInList(seedRuns.map((r) => r.ID));
        if (!seedIn) {
            return { descendants, detailById };
        }

        const requests: RunViewParams[] = [
            this.buildRunSnapshotQuery(
                `RootParentRunID IN (${seedIn}) OR ParentRunID IN (${seedIn})`,
                'StartedAt ASC',
                this.MaxRunsToInspect * 4
            ),
        ];

        const detailIds = new UUIDSet(
            seedRuns.map((r) => r.ConversationDetailID).filter((id): id is string => Boolean(id))
        );
        const detailIn = detailIds.Size > 0 ? this.sqlInList([...detailIds]) : '';
        if (detailIn) {
            requests.push({
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ID IN (${detailIn})`,
                Fields: ['ID', 'BranchID', 'Sequence'],
                BypassCache: true,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            });
        }

        try {
            const [descRes, detailRes] = (await rv.RunViews(requests, contextUser)) as [
                RunViewResult<AgentRunSnapshotRow> | undefined,
                RunViewResult<DetailPlacementRow> | undefined,
            ];
            if (descRes?.Success && descRes.Results) {
                descendants.push(...descRes.Results);
            }
            if (detailRes?.Success && detailRes.Results) {
                for (const row of detailRes.Results) {
                    detailById.Set(row.ID, row);
                }
            }
        } catch (err: unknown) {
            LogError(`ActiveAgentRunSnapshotService: descendant/detail query failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        return { descendants, detailById };
    }

    private filterRunsByBranchPath(
        runs: AgentRunSnapshotRow[],
        parentBranchId: string | null,
        detailById: UUIDMap<DetailPlacementRow>,
        branches: ConversationBranchRow[]
    ): AgentRunSnapshotRow[] {
        if (detailById.Size === 0) {
            return runs;
        }
        let branchChain: ConversationBranchRow[] | null = null;
        if (parentBranchId && branches.length > 0) {
            try {
                branchChain = ConversationEngine.BuildBranchChain(branches, parentBranchId);
            } catch {
                branchChain = null;
            }
        }

        return runs.filter((run) => {
            if (!run.ConversationDetailID) {
                return true;
            }
            const detail = detailById.Get(run.ConversationDetailID);
            if (!detail) {
                return true;
            }
            if (!parentBranchId) {
                return !detail.BranchID;
            }
            if (!branchChain) {
                return !detail.BranchID || UUIDsEqual(detail.BranchID, parentBranchId);
            }
            return ConversationEngine.IsRowOnBranchPath(
                { BranchID: detail.BranchID, Sequence: detail.Sequence },
                branchChain
            );
        });
    }

    private async loadStepsAndTasksBatched(
        rv: RunView,
        contextUser: UserInfo,
        runIds: string[]
    ): Promise<{
        stepsByRun: UUIDMap<AgentRunStepSnapshotRow[]>;
        tasksByRun: UUIDMap<TaskSnapshotRow[]>;
    }> {
        const stepsByRun = new UUIDMap<AgentRunStepSnapshotRow[]>();
        const tasksByRun = new UUIDMap<TaskSnapshotRow[]>();
        const inList = this.sqlInList(runIds);
        if (!inList) {
            return { stepsByRun, tasksByRun };
        }

        const requests: RunViewParams[] = [
            {
                EntityName: 'MJ: AI Agent Run Steps',
                ExtraFilter: `AgentRunID IN (${inList})`,
                OrderBy: 'StepNumber DESC',
                Fields: AGENT_RUN_STEP_FIELDS,
                MaxRows: runIds.length * this.MaxStepsPerRun,
                BypassCache: true,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `AgentRunID IN (${inList})`,
                OrderBy: 'StartedAt ASC',
                Fields: TASK_SNAPSHOT_FIELDS,
                MaxRows: 25,
                BypassCache: true,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
        ];

        try {
            const [stepsResult, taskResult] = (await rv.RunViews(requests, contextUser)) as [
                RunViewResult<AgentRunStepSnapshotRow> | undefined,
                RunViewResult<TaskSnapshotRow> | undefined,
            ];
            if (stepsResult?.Success && stepsResult.Results) {
                const grouped = GroupByUUID(stepsResult.Results, (s) => s.AgentRunID);
                for (const [runKey, runSteps] of grouped) {
                    stepsByRun.Set(runKey, runSteps.slice(0, this.MaxStepsPerRun));
                }
            }
            if (taskResult?.Success && taskResult.Results) {
                this.indexTasksByRun(taskResult.Results, tasksByRun);
            }
        } catch (err: unknown) {
            LogError(`ActiveAgentRunSnapshotService: batched step/task query failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        return { stepsByRun, tasksByRun };
    }

    private indexTasksByRun(tasks: TaskSnapshotRow[], target: UUIDMap<TaskSnapshotRow[]>): void {
        for (const task of tasks) {
            if (!task.AgentRunID) {
                continue;
            }
            const bucket = target.Get(task.AgentRunID) ?? [];
            bucket.push(task);
            target.Set(task.AgentRunID, bucket);
        }
    }

    private formatSnapshot(
        now: number,
        nowIso: string,
        params: CaptureActiveRunsSnapshotParams,
        primaryRuns: AgentRunSnapshotRow[],
        allRuns: AgentRunSnapshotRow[],
        stepsByRun: UUIDMap<AgentRunStepSnapshotRow[]>,
        tasksByRun: UUIDMap<TaskSnapshotRow[]>
    ): string {
        const lines: string[] = [
            `Live / Recent Main-Thread Agent Runs as of ${nowIso}`,
            params.ParentBranchID
                ? `Scope: Parent conversation ${params.ParentConversationID} (fork ${params.ParentBranchID}).`
                : `Scope: Parent conversation ${params.ParentConversationID} (Main).`,
        ];

        const primaryIdSet = new UUIDSet(primaryRuns.map((r) => r.ID));
        const childrenByParent = GroupByUUID(
            allRuns.filter((r) => r.ParentRunID && !primaryIdSet.Has(r.ID)),
            (r) => r.ParentRunID!
        );

        const orderedPrimary = [...primaryRuns].sort((a, b) => {
            const aActive = ACTIVE_RUN_STATUSES.has(a.Status) ? 0 : 1;
            const bActive = ACTIVE_RUN_STATUSES.has(b.Status) ? 0 : 1;
            return aActive !== bActive ? aActive - bActive : this.toEpochMs(b.StartedAt) - this.toEpochMs(a.StartedAt);
        });

        for (const run of orderedPrimary) {
            this.appendRunBlock(lines, run, now, 0, stepsByRun, tasksByRun, childrenByParent);
        }

        return lines.join('\n');
    }

    private appendRunBlock(
        lines: string[],
        run: AgentRunSnapshotRow,
        now: number,
        depth: number,
        stepsByRun: UUIDMap<AgentRunStepSnapshotRow[]>,
        tasksByRun: UUIDMap<TaskSnapshotRow[]>,
        childrenByParent: UUIDMap<AgentRunSnapshotRow[]>
    ): void {
        const indent = depth === 0 ? '' : '  '.repeat(depth);
        const agentName = EscapeRuntimeStateTags(run.Agent || 'Agent');
        const elapsedSec = this.formatElapsedSeconds(run.StartedAt, run.CompletedAt, now);
        const heading = depth === 0 ? `### ${agentName} [${run.Status}]` : `${indent}- Sub-Agent **${agentName}** [${run.Status}]`;
        lines.push('');
        lines.push(`${heading} (run \`${run.ID}\`, ${elapsedSec}, iterations: ${run.TotalPromptIterations ?? 0}${run.FinalStep ? `, finalStep: ${run.FinalStep}` : ''})`);

        if (run.ErrorMessage) {
            lines.push(`${indent}  - Error: ${this.wrapUntrusted(run.ErrorMessage, 'agent-run-error')}`);
        }
        const liveHint = AgentRunWatchdog.Instance.ReadLiveRunHint(run.ID);
        if (liveHint) {
            lines.push(`${indent}  - In-flight state (this replica): ${this.wrapUntrusted(liveHint, 'agent-run-live-hint')}`);
        }

        this.appendRunTasks(lines, indent, tasksByRun.Get(run.ID) ?? []);
        this.appendRunSteps(lines, indent, stepsByRun.Get(run.ID) ?? [], now);

        if (run.FinalPayload && run.FinalPayload.trim()) {
            lines.push(`${indent}  - Final payload: ${this.wrapUntrusted(run.FinalPayload, 'agent-run-final-payload')}`);
        }

        for (const child of childrenByParent.Get(run.ID) ?? []) {
            this.appendRunBlock(lines, child, now, depth + 1, stepsByRun, tasksByRun, childrenByParent);
        }
    }

    private appendRunTasks(lines: string[], indent: string, tasks: TaskSnapshotRow[]): void {
        if (tasks.length === 0) {
            return;
        }
        lines.push(`${indent}  - Tasks:`);
        for (const task of tasks) {
            const pct = task.PercentComplete != null ? ` (${task.PercentComplete}%)` : '';
            const stepKind = task.StepType ? ` [${task.StepType}]` : '';
            const err = task.ErrorMessage ? ` — error: ${this.truncateAndEscape(task.ErrorMessage)}` : '';
            lines.push(`${indent}    - ${this.truncateAndEscape(task.Name)}${stepKind}: ${task.Status}${pct}${err}`);
        }
    }

    private appendRunSteps(lines: string[], indent: string, rawSteps: AgentRunStepSnapshotRow[], now: number): void {
        if (rawSteps.length === 0) {
            return;
        }
        const steps = [...rawSteps].sort((a, b) => a.StepNumber - b.StepNumber);
        lines.push(`${indent}  - Recent steps:`);
        for (const step of steps) {
            const stepElapsed = this.formatElapsedSeconds(step.StartedAt, step.CompletedAt, now);
            const err = step.ErrorMessage ? ` | error: ${this.truncateAndEscape(step.ErrorMessage)}` : '';
            lines.push(
                `${indent}    - #${step.StepNumber} [${step.StepType}] ${this.truncateAndEscape(step.StepName)} -> ${step.Status} (${stepElapsed})${err}`
            );
            const previewSource = step.OutputData ?? step.PayloadAtEnd;
            if (previewSource && previewSource.trim()) {
                lines.push(`${indent}      preview: ${this.wrapUntrusted(previewSource, 'agent-run-step-output')}`);
            }
        }
    }

    private wrapUntrusted(text: string, source: string): string {
        return WrapUntrustedExternalData(this.truncateAndEscape(text), source, 'Untrusted');
    }

    private truncateAndEscape(raw: string): string {
        const singleLine = raw.replace(/\s+/g, ' ').trim();
        const truncated = singleLine.length > this.MaxStepPreviewChars
            ? `${singleLine.slice(0, this.MaxStepPreviewChars)}...`
            : singleLine;
        return EscapeRuntimeStateTags(truncated);
    }

    private formatElapsedSeconds(start: Date | string, end: Date | string | null, now: number): string {
        const startMs = this.toEpochMs(start);
        const endMs = end ? this.toEpochMs(end) : now;
        if (startMs <= 0) {
            return 'elapsed unknown';
        }
        const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
        return end ? `${seconds}s total` : `${seconds}s elapsed`;
    }

    private toEpochMs(value: Date | string | null | undefined): number {
        if (!value) {
            return 0;
        }
        const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
        return Number.isFinite(ms) ? ms : 0;
    }

    private sqlInList(ids: string[]): string {
        return ids.filter((id) => Boolean(id)).map((id) => `'${EscapeSQLString(id)}'`).join(',');
    }
}
