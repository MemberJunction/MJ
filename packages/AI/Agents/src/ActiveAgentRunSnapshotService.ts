/**
 * @fileoverview Builds a live, point-in-time snapshot of active and recently completed
 * agent runs on a parent conversation for Side Question execution.
 *
 * Queries `MJ: AI Agent Runs`, descendant sub-agent runs, recent `MJ: AI Agent Run Steps`,
 * and `MJ: Tasks` fresh from the database provider (bypassing cache), enriches in-flight
 * runs on the same MJAPI replica with {@link AgentRunWatchdog.ReadLiveRunHint}, and
 * wraps untrusted run/step payloads safely inside `<untrusted_external_data>` after
 * escaping runtime-state tags.
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, LogError, RunView, type RunViewParams, type RunViewResult, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, GroupByUUID, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { ConversationEngine, type ConversationBranchRow } from '@memberjunction/core-entities';
import { AgentRunWatchdog } from './agent-run-watchdog';
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
    Status: string;
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
    Status: string;
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
    Status: string;
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

const ACTIVE_RUN_STATUSES = new Set<string>(['Running', 'Paused', 'AwaitingFeedback']);

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
    protected get maxRunsToInspect(): number {
        return 5;
    }

    /** Maximum number of recent steps shown per run. */
    protected get maxStepsPerRun(): number {
        return 8;
    }

    /** Character cap per previewed payload/output/live-hint string. */
    protected get maxStepPreviewChars(): number {
        return 400;
    }

    /** Window (minutes) for including recently completed/failed/cancelled runs alongside active runs. */
    protected get recentTerminalWindowMinutes(): number {
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

        const rootRunsResult = await rv.RunView<AgentRunSnapshotRow>(
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ConversationID='${EscapeSQLString(params.ParentConversationID)}'`,
                OrderBy: 'StartedAt DESC',
                Fields: [
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
                ],
                MaxRows: this.maxRunsToInspect * 2,
                BypassCache: true,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            params.ContextUser
        );

        if (!rootRunsResult.Success) {
            LogError(`ActiveAgentRunSnapshotService: failed to query runs for ${params.ParentConversationID}: ${rootRunsResult.ErrorMessage}`);
            return `Snapshot unavailable at ${nowIso} (unable to read active run records).`;
        }

        const cutoffMs = now - this.recentTerminalWindowMinutes * 60_000;
        const candidatePrimaryRuns = (rootRunsResult.Results ?? [])
            .filter((r) => this.isRelevantRun(r, cutoffMs))
            .slice(0, this.maxRunsToInspect);

        if (candidatePrimaryRuns.length === 0) {
            return `Snapshot captured at ${nowIso}: No agent runs are currently running, paused, or completed within the last ${this.recentTerminalWindowMinutes} minutes on the main conversation.`;
        }

        const { descendants, detailById, branches } = await this.loadDescendantsAndBranchContext(
            rv,
            params,
            candidatePrimaryRuns
        );
        const primaryRuns = this.filterRunsByBranchPath(
            candidatePrimaryRuns,
            params.ParentBranchID ?? null,
            detailById,
            branches
        );

        if (primaryRuns.length === 0) {
            return `Snapshot captured at ${nowIso}: No agent runs are currently running, paused, or completed within the last ${this.recentTerminalWindowMinutes} minutes on this branch.`;
        }

        const primaryIds = new UUIDSet(primaryRuns.map((r) => r.ID));
        const byRunId = new UUIDMap<AgentRunSnapshotRow>();
        for (const run of primaryRuns) {
            byRunId.Set(run.ID, run);
        }
        for (const desc of descendants) {
            const rootOrParent = desc.RootParentRunID ?? desc.ParentRunID;
            if (!rootOrParent || !primaryIds.Has(rootOrParent)) {
                continue;
            }
            if (!byRunId.Has(desc.ID)) {
                byRunId.Set(desc.ID, desc);
            }
        }
        const allRuns = [...byRunId.Values()];
        const allRunIds = allRuns.map((r) => r.ID);

        const { stepsByRun, tasksByRun } = await this.loadStepsAndTasksBatched(rv, params.ContextUser, allRunIds);

        return this.formatSnapshot(now, nowIso, params, primaryRuns, allRuns, stepsByRun, tasksByRun);
    }

    private isRelevantRun(run: AgentRunSnapshotRow, cutoffMs: number): boolean {
        if (ACTIVE_RUN_STATUSES.has(run.Status)) {
            return true;
        }
        const timestamp = this.toEpochMs(run.CompletedAt ?? run.StartedAt);
        return timestamp >= cutoffMs;
    }

    private async loadDescendantsAndBranchContext(
        rv: RunView,
        params: CaptureActiveRunsSnapshotParams,
        seedRuns: AgentRunSnapshotRow[]
    ): Promise<{
        descendants: AgentRunSnapshotRow[];
        detailById: UUIDMap<DetailPlacementRow>;
        branches: ConversationBranchRow[];
    }> {
        const descendants: AgentRunSnapshotRow[] = [];
        const detailById = new UUIDMap<DetailPlacementRow>();
        let branches: ConversationBranchRow[] = [];

        const seedIn = this.sqlInList(seedRuns.map((r) => r.ID));
        if (!seedIn) {
            return { descendants, detailById, branches };
        }

        const detailIds = new UUIDSet(
            seedRuns.map((r) => r.ConversationDetailID).filter((id): id is string => Boolean(id))
        );
        const requests: RunViewParams[] = [
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `RootParentRunID IN (${seedIn}) OR ParentRunID IN (${seedIn})`,
                OrderBy: 'StartedAt ASC',
                Fields: [
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
                ],
                MaxRows: this.maxRunsToInspect * 4,
                BypassCache: true,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
        ];

        const detailIn = detailIds.Size > 0 ? this.sqlInList([...detailIds]) : '';
        const detailQueryIdx = detailIn ? requests.length : -1;
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

        const branchesQueryIdx = params.ParentBranchID && detailIn ? requests.length : -1;
        if (branchesQueryIdx >= 0) {
            requests.push({
                EntityName: 'MJ: Conversation Branches',
                ExtraFilter: `ConversationID='${EscapeSQLString(params.ParentConversationID)}'`,
                Fields: ['ID', 'ConversationID', 'ParentBranchID', 'ForkFromSequence'],
                BypassCache: true,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            });
        }

        try {
            const results = await rv.RunViews(requests, params.ContextUser);
            const descRes = results[0] as RunViewResult<AgentRunSnapshotRow> | undefined;
            if (descRes?.Success && descRes.Results) {
                descendants.push(...descRes.Results);
            }
            if (detailQueryIdx >= 0) {
                const detailRes = results[detailQueryIdx] as RunViewResult<DetailPlacementRow> | undefined;
                if (detailRes?.Success && detailRes.Results) {
                    for (const row of detailRes.Results) {
                        detailById.Set(row.ID, row);
                    }
                }
            }
            if (branchesQueryIdx >= 0) {
                const branchRes = results[branchesQueryIdx] as RunViewResult<ConversationBranchRow> | undefined;
                if (branchRes?.Success && branchRes.Results) {
                    branches = branchRes.Results;
                }
            }
        } catch (err: unknown) {
            LogError(`ActiveAgentRunSnapshotService: descendant/branch query failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        return { descendants, detailById, branches };
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

        try {
            const [stepsResult, taskResult] = (await rv.RunViews(
                [
                    {
                        EntityName: 'MJ: AI Agent Run Steps',
                        ExtraFilter: `AgentRunID IN (${inList})`,
                        OrderBy: 'StepNumber DESC',
                        Fields: [
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
                        ],
                        MaxRows: runIds.length * this.maxStepsPerRun,
                        BypassCache: true,
                        SkipTotalRowCount: true,
                        ResultType: 'simple',
                    },
                    {
                        EntityName: 'MJ: Tasks',
                        ExtraFilter: `AgentRunID IN (${inList})`,
                        OrderBy: 'StartedAt ASC',
                        Fields: [
                            'ID',
                            'ParentID',
                            'Name',
                            'Status',
                            'PercentComplete',
                            'AgentRunID',
                            'StepType',
                            'ErrorMessage',
                        ],
                        MaxRows: 25,
                        BypassCache: true,
                        SkipTotalRowCount: true,
                        ResultType: 'simple',
                    },
                ],
                contextUser
            )) as [RunViewResult<AgentRunStepSnapshotRow> | undefined, RunViewResult<TaskSnapshotRow> | undefined];

            if (stepsResult?.Success && stepsResult.Results) {
                const grouped = GroupByUUID(stepsResult.Results, (s) => s.AgentRunID);
                for (const [runKey, runSteps] of grouped) {
                    stepsByRun.Set(runKey, runSteps.slice(0, this.maxStepsPerRun));
                }
            }
            if (taskResult?.Success && taskResult.Results) {
                for (const task of taskResult.Results) {
                    if (!task.AgentRunID) {
                        continue;
                    }
                    const bucket = tasksByRun.Get(task.AgentRunID) ?? [];
                    bucket.push(task);
                    tasksByRun.Set(task.AgentRunID, bucket);
                }
            }
        } catch (err: unknown) {
            LogError(`ActiveAgentRunSnapshotService: batched step/task query failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        return { stepsByRun, tasksByRun };
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
            if (aActive !== bActive) {
                return aActive - bActive;
            }
            return this.toEpochMs(b.StartedAt) - this.toEpochMs(a.StartedAt);
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
            lines.push(`${indent}  - Error: ${this.wrapUntrusted(run.ErrorMessage)}`);
        }

        const liveHint = AgentRunWatchdog.Instance.ReadLiveRunHint(run.ID);
        if (liveHint) {
            lines.push(`${indent}  - In-flight state (this replica): ${this.wrapUntrusted(liveHint)}`);
        }

        const tasks = tasksByRun.Get(run.ID) ?? [];
        if (tasks.length > 0) {
            lines.push(`${indent}  - Tasks:`);
            for (const task of tasks) {
                const pct = task.PercentComplete != null ? ` (${task.PercentComplete}%)` : '';
                const stepKind = task.StepType ? ` [${task.StepType}]` : '';
                const err = task.ErrorMessage ? ` — error: ${this.truncateAndEscape(task.ErrorMessage)}` : '';
                lines.push(`${indent}    - ${this.truncateAndEscape(task.Name)}${stepKind}: ${task.Status}${pct}${err}`);
            }
        }

        const steps = [...(stepsByRun.Get(run.ID) ?? [])].sort((a, b) => a.StepNumber - b.StepNumber);
        if (steps.length > 0) {
            lines.push(`${indent}  - Recent steps:`);
            for (const step of steps) {
                const stepElapsed = this.formatElapsedSeconds(step.StartedAt, step.CompletedAt, now);
                const err = step.ErrorMessage ? ` | error: ${this.truncateAndEscape(step.ErrorMessage)}` : '';
                lines.push(
                    `${indent}    - #${step.StepNumber} [${step.StepType}] ${this.truncateAndEscape(step.StepName)} -> ${step.Status} (${stepElapsed})${err}`
                );
                const previewSource = step.OutputData ?? step.PayloadAtEnd;
                if (previewSource && previewSource.trim()) {
                    lines.push(`${indent}      preview: ${this.wrapUntrusted(previewSource)}`);
                }
            }
        }

        if (run.FinalPayload && run.FinalPayload.trim()) {
            lines.push(`${indent}  - Final payload: ${this.wrapUntrusted(run.FinalPayload)}`);
        }

        const children = childrenByParent.Get(run.ID) ?? [];
        for (const child of children) {
            this.appendRunBlock(lines, child, now, depth + 1, stepsByRun, tasksByRun, childrenByParent);
        }
    }

    private wrapUntrusted(text: string): string {
        return `<untrusted_external_data>${this.truncateAndEscape(text)}</untrusted_external_data>`;
    }

    private truncateAndEscape(raw: string): string {
        const singleLine = raw.replace(/\s+/g, ' ').trim();
        const truncated = singleLine.length > this.maxStepPreviewChars
            ? `${singleLine.slice(0, this.maxStepPreviewChars)}...`
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
        const cleaned = ids.filter((id) => Boolean(id)).map((id) => `'${EscapeSQLString(id)}'`);
        return cleaned.join(',');
    }
}
