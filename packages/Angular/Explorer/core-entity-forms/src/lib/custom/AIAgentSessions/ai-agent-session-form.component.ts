import { Component, OnInit, inject } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent, CUSTOM_LAYOUT_TOOLBAR_CONFIG } from '@memberjunction/ng-base-forms';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJAIAgentSessionFormComponent } from '../../generated/Entities/MJAIAgentSession/mjaiagentsession.form.component';

/**
 * Authoritative shape persisted in `AIAgentSession.Config` for a client-direct
 * realtime voice session. Mirrors `RealtimeSessionConfig` on the server
 * (MJServer/RealtimeClientSessionResolver). All fields optional — non-voice
 * sessions may carry none of them.
 */
interface SessionConfigJson {
    targetAgentID?: string;
    coAgentRunID?: string;
    promptRunID?: string;
}

/** Date values arrive as ISO strings from `ResultType: 'simple'` RunViews. */
type DateLike = Date | string;

/** Narrowed read-only row from 'MJ: AI Agent Runs' for the session run tree. */
interface SessionRunRow {
    ID: string;
    AgentID: string;
    Agent: string | null;
    ParentRunID: string | null;
    Status: string;
    StartedAt: DateLike;
    CompletedAt: DateLike | null;
    TotalTokensUsed: number | null;
    TotalCost: number | null;
    TotalTokensUsedRollup: number | null;
    TotalCostRollup: number | null;
}

/** Narrowed read-only row from 'MJ: AI Agent Session Channels'. */
interface SessionChannelRow {
    ID: string;
    ChannelID: string;
    Channel: string;
    Status: 'Connected' | 'Connecting' | 'Disconnected' | 'Paused';
    SocketUrl: string | null;
    __mj_CreatedAt: DateLike;
    LastActiveAt: DateLike;
    DisconnectedAt: DateLike | null;
}

/** Narrowed read-only row from 'MJ: AI Agent Channels' (definition lookup for transport). */
interface ChannelDefinitionRow {
    ID: string;
    Name: string;
    TransportType: string;
}

/** Narrowed read-only row from 'MJ: Conversation Details' for the transcript. */
interface TranscriptRow {
    ID: string;
    Role: 'User' | 'AI' | 'Error';
    Message: string;
    Agent: string | null;
    User: string | null;
    __mj_CreatedAt: DateLike;
}

/** Narrowed read-only row from 'MJ: AI Prompt Runs' (the co-agent model leg). */
interface CoAgentPromptRunRow {
    ID: string;
    Model: string;
    Status: string;
    RunAt: DateLike;
    CompletedAt: DateLike | null;
    TokensUsed: number | null;
    TokensPrompt: number | null;
    TokensCompletion: number | null;
    TotalCost: number | null;
}

/** A flattened node in the session run tree (depth-first order, indented by depth). */
export interface SessionRunTreeItem {
    /** 'run' = AIAgentRun row, 'promptRun' = the co-agent's streaming model leg */
    kind: 'run' | 'promptRun';
    id: string;
    entityName: string;
    title: string;
    subtitle: string;
    status: string;
    startedAt: DateLike | null;
    completedAt: DateLike | null;
    tokens: number | null;
    cost: number | null;
    depth: number;
    isCoAgentRun: boolean;
}

/** Channel row decorated with its definition's transport type for display. */
export interface SessionChannelDisplayRow {
    row: SessionChannelRow;
    transportType: string | null;
}

/**
 * Custom form for 'MJ: AI Agent Sessions' — the observability surface for
 * long-lived realtime (voice) agent sessions. Mirrors the AI Agent Run form's
 * visual language: header with icon / status badge / stats, config bar, and
 * tabbed panes for the delegated run tree, channels, transcript, and details.
 */
@RegisterClass(BaseFormComponent, 'MJ: AI Agent Sessions')
@Component({
    standalone: false,
    selector: 'mj-ai-agent-session-form',
    templateUrl: './ai-agent-session-form.component.html',
    styleUrls: ['./ai-agent-session-form.component.css']
})
export class MJAIAgentSessionFormComponentExtended extends MJAIAgentSessionFormComponent implements OnInit {
    public record!: MJAIAgentSessionEntity;

    /** Hide the generated-section controls — this form has a fully custom layout. */
    public readonly ToolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** Sessions read best full-width, like the agent-run form. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }

    // UI state
    public ActiveTab: 'runs' | 'channels' | 'transcript' | 'details' = 'runs';
    public Loading = false;
    public LoadError: string | null = null;

    // Loaded data
    public RunTree: SessionRunTreeItem[] = [];
    public Channels: SessionChannelDisplayRow[] = [];
    public Transcript: TranscriptRow[] = [];
    public DelegatedRunCount = 0;
    public TargetAgentID: string | null = null;
    public TargetAgentName: string | null = null;
    public CoAgentPromptRun: CoAgentPromptRunRow | null = null;
    public SessionTokens: number | null = null;
    public SessionCost: number | null = null;

    private sessionConfig: SessionConfigJson = {};
    private cachedPrettyConfig: string | null = null;

    private navigationService = inject(NavigationService);
    private appManager = inject(ApplicationManager);

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        if (this.record?.ID) {
            this.sessionConfig = this.parseSessionConfig(this.record.Config_);
            await this.loadSessionData();
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Data loading
    // ────────────────────────────────────────────────────────────────────

    /** Parses the session's Config JSON; returns an empty config on any error. */
    private parseSessionConfig(raw: string | null): SessionConfigJson {
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw) as Partial<SessionConfigJson>;
            return {
                targetAgentID: typeof parsed.targetAgentID === 'string' ? parsed.targetAgentID : undefined,
                coAgentRunID: typeof parsed.coAgentRunID === 'string' ? parsed.coAgentRunID : undefined,
                promptRunID: typeof parsed.promptRunID === 'string' ? parsed.promptRunID : undefined
            };
        } catch {
            return {};
        }
    }

    /**
     * Loads everything the form shows in a single batched RunViews round trip:
     * the session's run tree, its channel instances (+ channel definitions for
     * transport), the transcript, and — when the Config carries observability
     * ids — the co-agent prompt run and target agent name.
     */
    private async loadSessionData(): Promise<void> {
        this.Loading = true;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const sessionId = this.record.ID;

            const results = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Agent Runs',
                    Fields: ['ID', 'AgentID', 'Agent', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt',
                             'TotalTokensUsed', 'TotalCost', 'TotalTokensUsedRollup', 'TotalCostRollup'],
                    ExtraFilter: `AgentSessionID='${sessionId}'`,
                    OrderBy: 'StartedAt ASC',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: AI Agent Session Channels',
                    Fields: ['ID', 'ChannelID', 'Channel', 'Status', 'SocketUrl', '__mj_CreatedAt', 'LastActiveAt', 'DisconnectedAt'],
                    ExtraFilter: `AgentSessionID='${sessionId}'`,
                    OrderBy: '__mj_CreatedAt ASC',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: AI Agent Channels',
                    Fields: ['ID', 'Name', 'TransportType'],
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Conversation Details',
                    Fields: ['ID', 'Role', 'Message', 'Agent', 'User', '__mj_CreatedAt'],
                    ExtraFilter: `AgentSessionID='${sessionId}'`,
                    OrderBy: '__mj_CreatedAt ASC',
                    ResultType: 'simple'
                },
                // Co-agent model leg — only meaningful when Config carries promptRunID;
                // an impossible filter keeps the batch shape stable when it doesn't.
                {
                    EntityName: 'MJ: AI Prompt Runs',
                    Fields: ['ID', 'Model', 'Status', 'RunAt', 'CompletedAt', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost'],
                    ExtraFilter: this.sessionConfig.promptRunID ? `ID='${this.sessionConfig.promptRunID}'` : `1=0`,
                    ResultType: 'simple'
                },
                // Target agent name resolution from Config.targetAgentID
                {
                    EntityName: 'AI Agents',
                    Fields: ['ID', 'Name'],
                    ExtraFilter: this.sessionConfig.targetAgentID ? `ID='${this.sessionConfig.targetAgentID}'` : `1=0`,
                    ResultType: 'simple'
                }
            ]);

            const runs = (results[0]?.Success ? results[0].Results : []) as SessionRunRow[];
            const channelRows = (results[1]?.Success ? results[1].Results : []) as SessionChannelRow[];
            const channelDefs = (results[2]?.Success ? results[2].Results : []) as ChannelDefinitionRow[];
            this.Transcript = (results[3]?.Success ? results[3].Results : []) as TranscriptRow[];
            const promptRuns = (results[4]?.Success ? results[4].Results : []) as CoAgentPromptRunRow[];
            const targetAgents = (results[5]?.Success ? results[5].Results : []) as { ID: string; Name: string }[];

            this.CoAgentPromptRun = promptRuns.length > 0 ? promptRuns[0] : null;
            this.TargetAgentID = this.sessionConfig.targetAgentID ?? null;
            this.TargetAgentName = targetAgents.length > 0 ? targetAgents[0].Name : null;

            this.Channels = channelRows.map(row => ({
                row,
                transportType: channelDefs.find(d => UUIDsEqual(d.ID, row.ChannelID))?.TransportType ?? null
            }));

            this.RunTree = this.buildRunTree(runs);
            this.DelegatedRunCount = runs.filter(r => r.ParentRunID != null).length;
            this.computeSessionUsage(runs);
        } catch (error) {
            console.error('Error loading agent session data:', error);
            this.LoadError = 'Failed to load session data';
        } finally {
            this.Loading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Flattens the session's runs into a depth-first tree: root runs (no
     * ParentRunID, or parent outside the session) first, children nested by
     * ParentRunID. The co-agent run (Config.coAgentRunID) gets its streaming
     * prompt run inserted directly beneath it as a 'promptRun' leg.
     */
    private buildRunTree(runs: SessionRunRow[]): SessionRunTreeItem[] {
        const items: SessionRunTreeItem[] = [];
        const byParent = new Map<string, SessionRunRow[]>();
        const idSet = new Set(runs.map(r => r.ID.toUpperCase()));

        const roots: SessionRunRow[] = [];
        for (const run of runs) {
            if (run.ParentRunID && idSet.has(run.ParentRunID.toUpperCase())) {
                const key = run.ParentRunID.toUpperCase();
                const list = byParent.get(key) ?? [];
                list.push(run);
                byParent.set(key, list);
            } else {
                roots.push(run);
            }
        }

        const visit = (run: SessionRunRow, depth: number): void => {
            const isCoAgent = this.sessionConfig.coAgentRunID != null && UUIDsEqual(run.ID, this.sessionConfig.coAgentRunID);
            items.push(this.runToTreeItem(run, depth, isCoAgent));
            if (isCoAgent && this.CoAgentPromptRun) {
                items.push(this.promptRunToTreeItem(this.CoAgentPromptRun, depth + 1));
            }
            for (const child of byParent.get(run.ID.toUpperCase()) ?? []) {
                visit(child, depth + 1);
            }
        };
        for (const root of roots) {
            visit(root, 0);
        }
        return items;
    }

    private runToTreeItem(run: SessionRunRow, depth: number, isCoAgent: boolean): SessionRunTreeItem {
        const shortId = run.ID.substring(0, 8);
        return {
            kind: 'run',
            id: run.ID,
            entityName: 'MJ: AI Agent Runs',
            title: isCoAgent
                ? `${run.Agent ?? 'Co-Agent'} · session run`
                : `${run.Agent ?? 'Agent'} · delegated run`,
            subtitle: isCoAgent
                ? `AIAgentRun #${shortId} · one long-lived run for this session`
                : `AIAgentRun #${shortId} · ParentRunID #${run.ParentRunID?.substring(0, 8) ?? '—'} · invoked via target-agent tool`,
            status: run.Status,
            startedAt: run.StartedAt,
            completedAt: run.CompletedAt,
            tokens: run.TotalTokensUsedRollup ?? run.TotalTokensUsed,
            cost: run.TotalCostRollup ?? run.TotalCost,
            depth,
            isCoAgentRun: isCoAgent
        };
    }

    private promptRunToTreeItem(pr: CoAgentPromptRunRow, depth: number): SessionRunTreeItem {
        return {
            kind: 'promptRun',
            id: pr.ID,
            entityName: 'MJ: AI Prompt Runs',
            title: `Model leg · ${pr.Model}`,
            subtitle: `AIPromptRun #${pr.ID.substring(0, 8)} · ${pr.TokensPrompt ?? 0} in · ${pr.TokensCompletion ?? 0} out · usage checkpointed incrementally`,
            status: pr.Status,
            startedAt: pr.RunAt,
            completedAt: pr.CompletedAt,
            tokens: pr.TokensUsed,
            cost: pr.TotalCost,
            depth,
            isCoAgentRun: false
        };
    }

    /**
     * Session-level tokens/cost for the header stats: prefer the co-agent run's
     * rollups (covers delegated children), fall back to the prompt run's
     * incremental usage when the run rollups haven't been finalized yet.
     */
    private computeSessionUsage(runs: SessionRunRow[]): void {
        const coAgentRun = this.sessionConfig.coAgentRunID
            ? runs.find(r => UUIDsEqual(r.ID, this.sessionConfig.coAgentRunID)) ?? null
            : null;
        const runTokens = coAgentRun ? (coAgentRun.TotalTokensUsedRollup ?? coAgentRun.TotalTokensUsed) : null;
        const runCost = coAgentRun ? (coAgentRun.TotalCostRollup ?? coAgentRun.TotalCost) : null;
        this.SessionTokens = runTokens ?? this.CoAgentPromptRun?.TokensUsed ?? null;
        this.SessionCost = runCost ?? this.CoAgentPromptRun?.TotalCost ?? null;
    }

    // ────────────────────────────────────────────────────────────────────
    // Display helpers
    // ────────────────────────────────────────────────────────────────────

    public ChangeTab(tab: 'runs' | 'channels' | 'transcript' | 'details'): void {
        this.ActiveTab = tab;
    }

    public GetStatusIcon(status: string | null): string {
        switch (status) {
            case 'Active': return 'fa-tower-broadcast';
            case 'Idle': return 'fa-moon';
            case 'Closed': return 'fa-circle-stop';
            default: return 'fa-question-circle';
        }
    }

    public GetRunStatusIcon(status: string): string {
        switch (status) {
            case 'Running': return 'fa-circle-notch fa-spin';
            case 'Completed': return 'fa-check-circle';
            case 'Failed': return 'fa-times-circle';
            case 'Cancelled': return 'fa-ban';
            case 'Paused': return 'fa-pause-circle';
            case 'AwaitingFeedback': return 'fa-hourglass-half';
            case 'Pending': return 'fa-clock';
            default: return 'fa-question-circle';
        }
    }

    public GetChannelIcon(channelName: string | null): string {
        switch (channelName) {
            case 'VoiceAudio': return 'fa-microphone-lines';
            case 'TextChat': return 'fa-comment';
            case 'ClientControl': return 'fa-sliders';
            case 'Whiteboard': return 'fa-chalkboard';
            case 'Video': return 'fa-video';
            default: return 'fa-plug';
        }
    }

    /** Short, readable session id (first segment of the UUID). */
    public get ShortSessionId(): string {
        return this.record?.ID ? `sess_${this.record.ID.substring(0, 8).toLowerCase()}` : '';
    }

    /** Created → ClosedAt (terminal) or LastActiveAt (still open) duration. */
    public get SessionDuration(): string {
        if (!this.record) return '';
        const start = this.toDate(this.record.__mj_CreatedAt);
        const end = this.toDate(this.record.ClosedAt) ?? this.toDate(this.record.LastActiveAt);
        if (!start || !end) return '—';
        return this.FormatDuration(start, end);
    }

    public FormatDuration(start: DateLike | null, end: DateLike | null): string {
        const s = this.toDate(start);
        const e = this.toDate(end);
        if (!s) return '—';
        if (!e) return 'Running...';
        const ms = e.getTime() - s.getTime();
        if (ms < 0) return '—';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
        return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
    }

    private toDate(value: DateLike | null | undefined): Date | null {
        if (value == null) return null;
        const d = value instanceof Date ? value : new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    /** Pretty-printed session Config JSON for the Details tab (cached). */
    public get PrettyConfig(): string {
        if (!this.record?.Config_) return '';
        if (this.cachedPrettyConfig !== null) return this.cachedPrettyConfig;
        try {
            this.cachedPrettyConfig = JSON.stringify(JSON.parse(this.record.Config_), null, 2);
        } catch {
            this.cachedPrettyConfig = this.record.Config_;
        }
        return this.cachedPrettyConfig;
    }

    // ────────────────────────────────────────────────────────────────────
    // Navigation
    // ────────────────────────────────────────────────────────────────────

    public OpenEntityRecord(entityName: string, recordId: string | null): void {
        if (recordId) {
            SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
        }
    }

    /** Opens the linked conversation in the Chat app (same pattern as the agent-run form). */
    public NavigateToConversation(): void {
        if (!this.record?.ConversationID) return;
        const chatApp = this.appManager.GetAllApps().find(app => app.Name === 'Chat');
        if (!chatApp) {
            // Fall back to the raw conversation record when the Chat app isn't installed
            this.OpenEntityRecord('MJ: Conversations', this.record.ConversationID);
            return;
        }
        this.navigationService.OpenNavItemByName(
            'Conversations',
            { conversationId: this.record.ConversationID },
            chatApp.ID
        );
    }

    public RefreshData(): void {
        if (!this.record?.ID) return;
        this.cachedPrettyConfig = null;
        this.record.Load(this.record.ID).then(() => {
            this.sessionConfig = this.parseSessionConfig(this.record.Config_);
            void this.loadSessionData();
        });
    }
}
