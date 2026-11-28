import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import {
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJConversationDetailEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import {
    ChiefOfStaffPage,
    ValidateSearchQueryParam,
} from './chief-of-staff-agent-context';
import { BaseChiefOfStaffPage, ChiefOfStaffClientTool } from './chief-of-staff-page-base';

export type AgentChannelStatusFilter = 'All' | MJAgentChannelEntity['ChannelStatus'];

/**
 * The Chief of Staff application's Agent Channels page: lists shared, observable
 * agent-to-agent coordination threads (`MJ: Agent Channels` IS-A `MJ: Conversations`),
 * shows loop-guard / rate-limit telemetry, and lets human participants inspect transcripts,
 * post direct replies (which reset `ConsecutiveAgentTurns` and re-open paused channels),
 * or resolve completed threads.
 *
 * 🚨 SAFETY BOUNDARY 🚨
 * Exposes ONLY read-only navigation/filter/select/refresh client tools to the co-agent.
 * Posting replies and resolving channels remain human-driven in the UI.
 */
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffAgentChannels')
@Component({
    standalone: false,
    selector: 'mj-chief-of-staff-agent-channels',
    templateUrl: './chief-of-staff-agent-channels.component.html',
    styleUrls: ['./chief-of-staff-pages.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChiefOfStaffAgentChannelsComponent extends BaseChiefOfStaffPage {
    protected readonly Page: ChiefOfStaffPage = 'agent-channels';

    public Channels: MJAgentChannelEntity[] = [];
    public ParticipantsByChannel = new Map<string, MJAgentChannelParticipantEntity[]>();
    public SelectedChannel: MJAgentChannelEntity | null = null;
    public SelectedMessages: MJConversationDetailEntity[] = [];

    public StatusFilter: AgentChannelStatusFilter = 'All';
    public readonly StatusFilterOptions: readonly AgentChannelStatusFilter[] = [
        'All',
        'Open',
        'Paused For Human',
        'Resolved',
    ];
    /** Optional agent filter pill selection (`null` = All agents). */
    public AgentFilterID: string | null = null;

    public IsLoadingChannels = false;
    public IsLoadingMessages = false;
    public IsPostingReply = false;
    public ReplyDraft = '';
    public ChannelErrorMessage: string | null = null;
    public ChannelStatusMessage: string | null = null;
    /** On mobile/tablet (<= 900px), toggles between the full-width Thread List and the Thread Detail pane. */
    public MobileShowingDetail = false;

    /** User's personal agents that appear as participants in any loaded channel (or owned instances). */
    public get AgentFilterOptions(): ReadonlyArray<{ ID: string; Name: string }> {
        const seen = new Map<string, string>();
        for (const agent of this.MyOwnedAgents) {
            seen.set(agent.ID.toLowerCase(), agent.Name);
        }
        for (const list of this.ParticipantsByChannel.values()) {
            for (const p of list) {
                if (p.AgentID && !seen.has(p.AgentID.toLowerCase())) {
                    seen.set(p.AgentID.toLowerCase(), p.Agent || this.GetAgentDisplayNameById(p.AgentID));
                }
            }
        }
        return Array.from(seen.entries())
            .map(([id, name]) => ({ ID: id, Name: name }))
            .sort((a, b) => a.Name.localeCompare(b.Name));
    }

    public IsAgentFilterSelected(agentId: string | null): boolean {
        if (agentId === null) {
            return this.AgentFilterID === null;
        }
        return Boolean(this.AgentFilterID && UUIDsEqual(this.AgentFilterID, agentId));
    }

    public SetAgentFilter(agentId: string | null): void {
        this.AgentFilterID = agentId;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public get FilteredChannels(): MJAgentChannelEntity[] {
        const search = this.SearchText.trim().toLowerCase();
        return this.Channels.filter((c) => {
            if (this.StatusFilter !== 'All' && c.ChannelStatus !== this.StatusFilter) {
                return false;
            }
            const participants = this.ParticipantsByChannel.get(c.ID) ?? [];
            if (this.AgentFilterID) {
                const participantAgentIds = new UUIDSet();
                for (const p of participants) {
                    if (p.AgentID) {
                        participantAgentIds.Add(p.AgentID);
                    }
                }
                if (!participantAgentIds.Has(this.AgentFilterID)) {
                    return false;
                }
            }
            if (!search) {
                return true;
            }
            const topicMatch = c.Topic.toLowerCase().includes(search);
            const participantMatch = participants.some(
                (p) =>
                    (p.User ?? '').toLowerCase().includes(search) ||
                    (p.Agent ?? '').toLowerCase().includes(search),
            );
            return topicMatch || participantMatch;
        });
    }

    public get PausedChannelCount(): number {
        return this.Channels.filter((c) => c.ChannelStatus === 'Paused For Human').length;
    }

    public get OpenChannelCount(): number {
        return this.Channels.filter((c) => c.ChannelStatus === 'Open').length;
    }

    public get SelectedParticipants(): MJAgentChannelParticipantEntity[] {
        return this.SelectedChannel
            ? (this.ParticipantsByChannel.get(this.SelectedChannel.ID) ?? [])
            : [];
    }

    protected override OnDataLoaded(): void {
        void this.LoadChannels();
    }

    public async LoadChannels(): Promise<void> {
        if (this.IsLoadingChannels) {
            return;
        }
        this.IsLoadingChannels = true;
        this.ChannelErrorMessage = null;
        this.cdr.markForCheck();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [channelsRes, participantsRes] = await Promise.all([
                rv.RunView<MJAgentChannelEntity>({
                    EntityName: 'MJ: Agent Channels',
                    OrderBy: '__mj_UpdatedAt DESC',
                    MaxRows: 100,
                    ResultType: 'entity_object',
                }),
                rv.RunView<MJAgentChannelParticipantEntity>({
                    EntityName: 'MJ: Agent Channel Participants',
                    OrderBy: 'JoinedAt ASC',
                    MaxRows: 500,
                    ResultType: 'entity_object',
                }),
            ]);

            if (!channelsRes.Success) {
                this.ChannelErrorMessage =
                    channelsRes.ErrorMessage || 'Could not load Agent Channels.';
                return;
            }

            this.Channels = channelsRes.Results;
            const grouped = new Map<string, MJAgentChannelParticipantEntity[]>();
            for (const part of participantsRes.Success ? participantsRes.Results : []) {
                const list = grouped.get(part.AgentChannelID) ?? [];
                list.push(part);
                grouped.set(part.AgentChannelID, list);
            }
            this.ParticipantsByChannel = grouped;

            if (this.SelectedChannel) {
                const refreshed =
                    this.Channels.find((c) => UUIDsEqual(c.ID, this.SelectedChannel!.ID)) ?? null;
                this.SelectedChannel = refreshed;
                if (refreshed) {
                    await this.LoadMessagesForChannel(refreshed.ID);
                } else {
                    this.SelectedMessages = [];
                }
            } else if (this.Channels.length > 0) {
                await this.SelectChannel(this.Channels[0], false);
            }
        } catch (error) {
            this.ChannelErrorMessage =
                error instanceof Error ? error.message : 'Failed to load Agent Channels.';
        } finally {
            this.IsLoadingChannels = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    public async SelectChannel(channel: MJAgentChannelEntity, openMobileDetail: boolean = true): Promise<void> {
        this.SelectedChannel = channel;
        this.ReplyDraft = '';
        this.ChannelStatusMessage = null;
        if (openMobileDetail) {
            this.MobileShowingDetail = true;
        }
        this.cdr.markForCheck();
        await this.LoadMessagesForChannel(channel.ID);
        this.publishAgentContext();
    }

    public ShowMobileThreadList(): void {
        this.MobileShowingDetail = false;
        this.cdr.markForCheck();
    }

    public DismissChannelStatusMessage(): void {
        this.ChannelStatusMessage = null;
        this.cdr.markForCheck();
    }

    public async LoadMessagesForChannel(channelId: string): Promise<void> {
        this.IsLoadingMessages = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<MJConversationDetailEntity>({
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `ConversationID='${EscapeSQLString(channelId)}'`,
                OrderBy: '__mj_CreatedAt ASC',
                MaxRows: 100,
                ResultType: 'entity_object',
            });
            this.SelectedMessages = res.Success ? res.Results : [];
        } finally {
            this.IsLoadingMessages = false;
            this.cdr.markForCheck();
        }
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public SetStatusFilter(status: AgentChannelStatusFilter): void {
        this.StatusFilter = status;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnReplyDraftInput(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
            this.ReplyDraft = event.target.value;
            this.cdr.markForCheck();
        }
    }

    public async PostHumanReply(): Promise<void> {
        const channel = this.SelectedChannel;
        const messageText = this.ReplyDraft.trim();
        if (!channel || !messageText || this.IsPostingReply) {
            return;
        }
        const wasPaused = channel.ChannelStatus === 'Paused For Human';
        this.IsPostingReply = true;
        this.ChannelErrorMessage = null;
        this.ChannelStatusMessage = null;
        this.cdr.markForCheck();

        try {
            const detail = await this.ProviderToUse.GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                this.ProviderToUse.CurrentUser,
            );
            detail.NewRecord();
            detail.ConversationID = channel.ID;
            detail.UserID = this.ProviderToUse.CurrentUser?.ID ?? null;
            detail.AgentID = null;
            detail.Role = 'User';
            detail.Message = messageText;

            const saved = await detail.Save();
            if (!saved) {
                throw new Error(
                    detail.LatestResult?.CompleteMessage || 'Failed to post message to Agent Channel.',
                );
            }

            this.ReplyDraft = '';
            await this.LoadChannels();
            const successMsg = wasPaused
                ? 'Reply posted. Channel resumed to Open and participant agents have been notified.'
                : 'Reply posted and participant agents have been notified.';
            this.ChannelStatusMessage = successMsg;
            this.showBanner('success', successMsg);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Failed to post reply.';
            this.ChannelErrorMessage = errMsg;
            this.showBanner('error', errMsg);
        } finally {
            this.IsPostingReply = false;
            this.cdr.markForCheck();
        }
    }

    public async MarkSelectedChannelResolved(): Promise<void> {
        const channel = this.SelectedChannel;
        if (!channel || channel.ChannelStatus === 'Resolved' || this.IsPostingReply) {
            return;
        }
        this.IsPostingReply = true;
        this.ChannelErrorMessage = null;
        this.ChannelStatusMessage = null;
        this.cdr.markForCheck();

        try {
            channel.ChannelStatus = 'Resolved';
            channel.ResolvedAt = new Date();
            const saved = await channel.Save();
            if (!saved) {
                throw new Error(
                    channel.LatestResult?.CompleteMessage || 'Failed to resolve Agent Channel.',
                );
            }
            await this.LoadChannels();
            const resolvedMsg = 'Agent Channel marked as Resolved.';
            this.ChannelStatusMessage = resolvedMsg;
            this.showBanner('success', resolvedMsg);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Failed to resolve Agent Channel.';
            this.ChannelErrorMessage = errMsg;
            this.showBanner('error', errMsg);
        } finally {
            this.IsPostingReply = false;
            this.cdr.markForCheck();
        }
    }

    public OpenSelectedChannelRecord(): void {
        if (this.SelectedChannel) {
            this.navigationService.OpenEntityRecord(
                'MJ: Agent Channels',
                CompositeKey.FromID(this.SelectedChannel.ID),
            );
        }
    }

    public ParticipantsFor(channelId: string): MJAgentChannelParticipantEntity[] {
        return this.ParticipantsByChannel.get(channelId) ?? [];
    }

    protected override PageAgentTools(): ChiefOfStaffClientTool[] {
        return [
            {
                Name: 'SearchAgentChannels',
                Description:
                    'Filter visible Agent Channels by topic or participant name. Pass empty string to clear.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search text; empty string clears.' },
                    },
                    required: ['query'],
                },
                Handler: async (params) => {
                    const check = ValidateSearchQueryParam(params['query'] as string | undefined);
                    if (!check.ok) {
                        return check.result;
                    }
                    this.OnSearchChange(check.value);
                    return {
                        Success: true,
                        Data: {
                            SearchText: this.SearchText,
                            VisibleChannelCount: this.FilteredChannels.length,
                        },
                    };
                },
            },
            {
                Name: 'FilterAgentChannelsByStatus',
                Description:
                    'Filter Agent Channels by status: All, Open, Paused For Human, or Resolved.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            enum: ['All', 'Open', 'Paused For Human', 'Resolved'],
                        },
                    },
                    required: ['status'],
                },
                Handler: async (params) => {
                    const raw = String(params['status'] ?? 'All') as AgentChannelStatusFilter;
                    if (!this.StatusFilterOptions.includes(raw)) {
                        return {
                            Success: false,
                            Error: `Invalid status "${raw}". Expected one of: ${this.StatusFilterOptions.join(', ')}.`,
                        };
                    }
                    this.SetStatusFilter(raw);
                    return {
                        Success: true,
                        Data: {
                            StatusFilter: this.StatusFilter,
                            VisibleChannelCount: this.FilteredChannels.length,
                        },
                    };
                },
            },
            {
                Name: 'RefreshAgentChannels',
                Description: 'Reload Agent Channels and the currently selected transcript.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    await this.LoadChannels();
                    return {
                        Success: true,
                        Data: {
                            TotalChannels: this.Channels.length,
                            OpenChannels: this.OpenChannelCount,
                            PausedChannels: this.PausedChannelCount,
                        },
                    };
                },
            },
        ];
    }
}

export function LoadChiefOfStaffAgentChannels(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
