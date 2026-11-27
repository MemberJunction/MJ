import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { RegisterClassEx, UUIDsEqual } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import {
    AGENT_SECTION_KEYS,
    FormatCostUsd,
    FormatDurationBetween,
    FormatTokenCount,
    GetRunResultPreview,
    HasRunResult,
} from './agent-form-helpers';

/** Narrowed read-only row from `MJ: AI Agent Sessions`. */
interface AgentSessionRow {
    ID: string;
    AgentID: string;
    Agent: string | null;
    User: string;
    Status: string;
    LastActiveAt: Date | string | null;
    ClosedAt: Date | string | null;
    __mj_CreatedAt: Date | string;
}

/** Narrowed read-only row from `MJ: AI Agent Runs` — always includes both `FinalPayload` and `Result`. */
export interface AgentRunHistoryRow {
    ID: string;
    Status: MJAIAgentRunEntityExtended['Status'];
    Configuration: string | null;
    StartedAt: Date | string | null;
    CompletedAt: Date | string | null;
    TotalTokensUsed: number | null;
    TotalTokensUsedRollup: number | null;
    TotalCost: number | null;
    TotalCostRollup: number | null;
    ConversationID: string | null;
    FinalPayload: string | null;
    Result: string | null;
    ErrorMessage: string | null;
    __mj_CreatedAt: Date | string;
}

const RUN_HISTORY_FIELDS = [
    'ID',
    'Status',
    'Configuration',
    'StartedAt',
    'CompletedAt',
    'TotalTokensUsed',
    'TotalTokensUsedRollup',
    'TotalCost',
    'TotalCostRollup',
    'ConversationID',
    'FinalPayload',
    'Result',
    'ErrorMessage',
    '__mj_CreatedAt',
] as const;

/**
 * Execution History (`Runs & Sessions`) panel (`BaseFormPanel` — `after-fields`, `sortKey: 140`, `inclusion: 'Primary'`).
 *
 * Claims `MJ: AI Agent Runs` and provides:
 * - Segmented Runs vs. Realtime Voice Sessions toggle
 * - Run ID search + pagination
 * - Expandable run cards with direct & rollup token/cost metrics, JSON result viewer
 *   (`FinalPayload` preferred over legacy `Result`, hidden while `Running`), and error details
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:runs-sessions',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'after-fields',
        sortKey: 140,
        contributionKey: AGENT_SECTION_KEYS.Runs,
        sectionKey: AGENT_SECTION_KEYS.Runs,
        relatedEntity: 'MJ: AI Agent Runs',
        relatedJoinField: 'AgentID',
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-runs-sessions-panel',
    templateUrl: './agent-runs-sessions.panel.html',
    styleUrls: ['./agent-runs-sessions.panel.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentRunsSessionsPanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);

    public readonly SectionKey = AGENT_SECTION_KEYS.Runs;
    public ActiveView: 'runs' | 'sessions' = 'runs';

    public LoadingRuns = false;
    public Runs: AgentRunHistoryRow[] = [];
    public TotalRunCount = 0;
    public CurrentPage = 1;
    public readonly PageSize = 20;
    public SearchText = '';
    public ExpandedRunIds = new Set<string>();

    public LoadingSessions = false;
    public SessionsLoaded = false;
    public Sessions: AgentSessionRow[] = [];
    public TotalSessionCount = 0;

    public get TotalPages(): number {
        return Math.max(1, Math.ceil(this.TotalRunCount / this.PageSize));
    }

    public get FilteredRuns(): AgentRunHistoryRow[] {
        const q = this.SearchText.trim().toLowerCase();
        if (!q) return this.Runs;
        return this.Runs.filter((r) =>
            r.ID.toLowerCase().includes(q)
            || (r.Status ?? '').toLowerCase().includes(q)
            || (r.Configuration ?? '').toLowerCase().includes(q),
        );
    }

    public async ngOnInit(): Promise<void> {
        await this.loadRunsPage(1);
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        this.SessionsLoaded = false;
        void this.loadRunsPage(1);
    }

    public async SetView(view: 'runs' | 'sessions'): Promise<void> {
        this.ActiveView = view;
        if (view === 'sessions' && !this.SessionsLoaded) {
            await this.loadSessions();
        }
        this.cdr.markForCheck();
    }

    public ToggleExpanded(runId: string): void {
        if (this.ExpandedRunIds.has(runId)) this.ExpandedRunIds.delete(runId);
        else this.ExpandedRunIds.add(runId);
    }

    public IsExpanded(runId: string): boolean {
        return this.ExpandedRunIds.has(runId);
    }

    public HasResult(run: AgentRunHistoryRow): boolean {
        return HasRunResult(run);
    }

    public ResultPreview(run: AgentRunHistoryRow): string {
        return GetRunResultPreview(run, false);
    }

    public RunDuration(run: AgentRunHistoryRow): string {
        return FormatDurationBetween(run.StartedAt, run.CompletedAt);
    }

    public SessionDuration(session: AgentSessionRow): string {
        return FormatDurationBetween(session.__mj_CreatedAt, session.ClosedAt ?? session.LastActiveAt);
    }

    public TokensLabel(n: number | null | undefined): string {
        return FormatTokenCount(n);
    }

    public CostLabel(n: number | null | undefined): string {
        return FormatCostUsd(n);
    }

    public IsCoAgentSession(session: AgentSessionRow): boolean {
        return UUIDsEqual(session.AgentID, this.Record?.ID);
    }

    public OpenRun(runId: string, event?: Event): void {
        event?.stopPropagation();
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(runId));
    }

    public OpenSession(sessionId: string, event?: Event): void {
        event?.stopPropagation();
        SharedService.Instance.OpenEntityRecord('MJ: AI Agent Sessions', CompositeKey.FromID(sessionId));
    }

    public async GoToPage(page: number): Promise<void> {
        if (page < 1 || page > this.TotalPages || page === this.CurrentPage) return;
        await this.loadRunsPage(page);
    }

    private async loadRunsPage(page: number): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;

        this.LoadingRuns = true;
        this.CurrentPage = page;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const res = await rv.RunView<AgentRunHistoryRow>({
                EntityName: 'MJ: AI Agent Runs',
                Fields: [...RUN_HISTORY_FIELDS],
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: this.PageSize,
                StartRow: (page - 1) * this.PageSize,
                ResultType: 'simple',
            });
            if (res.Success) {
                this.Runs = res.Results ?? [];
                const total = res.TotalRowCount ?? this.Runs.length;
                this.TotalRunCount = total;
                this.FormComponent?.SetSectionRowCount(this.SectionKey, total);
            }
        } catch (err) {
            console.error('Error loading AI Agent execution history:', err);
        } finally {
            this.LoadingRuns = false;
            this.cdr.markForCheck();
        }
    }

    private async loadSessions(): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;

        this.LoadingSessions = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const res = await rv.RunView<AgentSessionRow>({
                EntityName: 'MJ: AI Agent Sessions',
                Fields: ['ID', 'AgentID', 'Agent', 'User', 'Status', 'LastActiveAt', 'ClosedAt', '__mj_CreatedAt'],
                ExtraFilter: `AgentID='${agentId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 25,
                ResultType: 'simple',
            });
            if (res.Success) {
                this.Sessions = res.Results ?? [];
                this.TotalSessionCount = res.TotalRowCount ?? this.Sessions.length;
            }
            this.SessionsLoaded = true;
        } catch (err) {
            console.error('Error loading AI Agent sessions:', err);
        } finally {
            this.LoadingSessions = false;
            this.cdr.markForCheck();
        }
    }
}

export function LoadAgentRunsSessionsPanel(): void {
    /* no-op marker */
}
