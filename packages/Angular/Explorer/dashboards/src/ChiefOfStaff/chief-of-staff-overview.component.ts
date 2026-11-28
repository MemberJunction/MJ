import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RunView } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
    ChiefOfStaffPage,
    OverviewCollapsiblePanel,
    OverviewStripDensity,
} from './chief-of-staff-agent-context';
import { BaseChiefOfStaffPage } from './chief-of-staff-page-base';

/**
 * The My Agents application's Overview page: a multi-instance Executive Bento Canvas showing
 * all of the user's personal agents, unified Pending Approvals across every agent with agent
 * attribution chips, Upcoming Wakes & Briefings, and Active Agent Channels.
 *
 * Also registered under the driver classes of the former Chief of Staff dashboard so saved
 * workspace tabs and deep links continue to resolve cleanly.
 */
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffOverview')
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffDashboard')
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffResource')
@Component({
    standalone: false,
    selector: 'mj-chief-of-staff-overview',
    templateUrl: './chief-of-staff-overview.component.html',
    styleUrls: ['./chief-of-staff-pages.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChiefOfStaffOverviewComponent extends BaseChiefOfStaffPage {
    protected readonly Page: ChiefOfStaffPage = 'overview';
    protected override readonly ScopeAllAgents: boolean = true;

    /**
     * Optional card-click filter scoping Overview's approvals & wakes to one personal agent.
     * `null` (default) = "All My Agents" (unified view across every agent).
     */
    public SelectedScopeAgentID: string | null = null;

    /** Summary of the user's active agent-to-agent coordination channels. */
    public Channels: MJAgentChannelEntity[] = [];
    public ChannelParticipantsByChannel = new Map<string, MJAgentChannelParticipantEntity[]>();
    public IsLoadingChannels = false;

    public get StripDensity(): OverviewStripDensity {
        return this.effectiveDashboardPrefs.overviewStripDensity;
    }

    public SetStripDensity(density: OverviewStripDensity): void {
        if (this.StripDensity === density) {
            return;
        }
        this.persistDashboardPreferences({ overviewStripDensity: density });
        this.cdr.markForCheck();
    }

    public IsOverviewPanelCollapsed(panel: OverviewCollapsiblePanel): boolean {
        return this.effectiveDashboardPrefs.overviewCollapsedPanels.includes(panel);
    }

    public ToggleOverviewPanel(panel: OverviewCollapsiblePanel): void {
        const current = this.effectiveDashboardPrefs.overviewCollapsedPanels;
        const next = current.includes(panel)
            ? current.filter((p) => p !== panel)
            : [...current, panel];
        this.persistDashboardPreferences({ overviewCollapsedPanels: next });
        this.cdr.markForCheck();
    }

    public get SelectedScopeAgentName(): string | null {
        if (!this.SelectedScopeAgentID) {
            return null;
        }
        return this.GetAgentDisplayNameById(this.SelectedScopeAgentID, 'Selected Agent');
    }

    /** Pending approval requests across all agents (or filtered to the clicked agent card). */
    public get ScopedPendingRequests(): MJAIAgentRequestEntity[] {
        if (!this.SelectedScopeAgentID) {
            return this.PendingRequests;
        }
        return this.PendingRequests.filter((r) => UUIDsEqual(r.AgentID, this.SelectedScopeAgentID));
    }

    /** Upcoming wake routines across all agents (or filtered to the clicked agent card). */
    public get ScopedUpcomingRoutines(): MJUserRoutineEntity[] {
        if (!this.SelectedScopeAgentID) {
            return this.UpcomingRoutines;
        }
        return this.UpcomingRoutines.filter((r) => UUIDsEqual(r.TargetID, this.SelectedScopeAgentID));
    }

    public get OpenChannelCount(): number {
        return this.Channels.filter((c) => c.ChannelStatus === 'Open').length;
    }

    public get PausedChannelCount(): number {
        return this.Channels.filter((c) => c.ChannelStatus === 'Paused For Human').length;
    }

    /** Top recent active channels (Paused For Human first, then Open, then Resolved). */
    public get RecentChannels(): MJAgentChannelEntity[] {
        const rank = (status: MJAgentChannelEntity['ChannelStatus']): number => {
            if (status === 'Paused For Human') return 0;
            if (status === 'Open') return 1;
            return 2;
        };
        return [...this.Channels]
            .sort((a, b) => rank(a.ChannelStatus) - rank(b.ChannelStatus))
            .slice(0, 4);
    }

    public PendingApprovalCountForAgent(agentId: string): number {
        return this.PendingRequests.filter((r) => UUIDsEqual(r.AgentID, agentId)).length;
    }

    public ActiveWakeCountForAgent(agentId: string): number {
        return this.Routines.filter((r) => r.Status === 'Active' && UUIDsEqual(r.TargetID, agentId)).length;
    }

    public IsScopeAgentSelected(agentId: string): boolean {
        return Boolean(this.SelectedScopeAgentID && UUIDsEqual(this.SelectedScopeAgentID, agentId));
    }

    public ToggleScopeAgent(agentId: string): void {
        if (this.SelectedScopeAgentID && UUIDsEqual(this.SelectedScopeAgentID, agentId)) {
            this.SelectedScopeAgentID = null;
        } else {
            this.SelectedScopeAgentID = agentId;
        }
        this.cdr.markForCheck();
    }

    public ClearScopeFilter(): void {
        this.SelectedScopeAgentID = null;
        this.cdr.markForCheck();
    }

    public OpenAgentInWorkspace(agentName: string, event?: Event): void {
        event?.stopPropagation();
        this.OpenPage('governance', agentName);
    }

    public OpenManageAgents(): void {
        this.OpenPage('governance', this.SelectedScopeAgentName ?? null);
    }

    public OpenAgentChannels(): void {
        this.OpenPage('agent-channels', null);
    }

    public ChannelParticipantsFor(channelId: string): MJAgentChannelParticipantEntity[] {
        return this.ChannelParticipantsByChannel.get(channelId) ?? [];
    }

    public FormatChannelParticipantsSummary(channelId: string): string {
        const list = this.ChannelParticipantsFor(channelId);
        if (list.length === 0) {
            return 'No participants recorded';
        }
        return list
            .map((p) => {
                if (p.Agent && p.User) {
                    return `${p.Agent} (${p.User})`;
                }
                return p.Agent || p.User || 'Participant';
            })
            .join(' · ');
    }

    protected override OnDataLoaded(): void {
        // Clear stale card filter if that agent was archived
        if (
            this.SelectedScopeAgentID &&
            !this.AvailableAgents.some((a) => UUIDsEqual(a.ID, this.SelectedScopeAgentID))
        ) {
            this.SelectedScopeAgentID = null;
        }
        void this.loadChannelSummary();
    }

    private async loadChannelSummary(): Promise<void> {
        if (this.IsLoadingChannels) {
            return;
        }
        this.IsLoadingChannels = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [channelsRes, participantsRes] = await Promise.all([
                rv.RunView<MJAgentChannelEntity>({
                    EntityName: 'MJ: Agent Channels',
                    OrderBy: '__mj_UpdatedAt DESC',
                    MaxRows: 25,
                    ResultType: 'entity_object',
                }),
                rv.RunView<MJAgentChannelParticipantEntity>({
                    EntityName: 'MJ: Agent Channel Participants',
                    OrderBy: 'JoinedAt ASC',
                    MaxRows: 150,
                    ResultType: 'entity_object',
                }),
            ]);
            this.Channels = channelsRes.Success ? channelsRes.Results : [];
            const grouped = new Map<string, MJAgentChannelParticipantEntity[]>();
            for (const part of participantsRes.Success ? participantsRes.Results : []) {
                const list = grouped.get(part.AgentChannelID) ?? [];
                list.push(part);
                grouped.set(part.AgentChannelID, list);
            }
            this.ChannelParticipantsByChannel = grouped;
        } catch {
            // Best-effort summary; never block Overview if channels entity is unavailable
            this.Channels = [];
            this.ChannelParticipantsByChannel = new Map();
        } finally {
            this.IsLoadingChannels = false;
            this.cdr.markForCheck();
        }
    }
}

export function LoadChiefOfStaffOverview(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
