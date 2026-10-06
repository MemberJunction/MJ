import { Component, ChangeDetectionStrategy, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IMetadataProvider, LogError, Metadata, RunView } from '@memberjunction/core';
import { EscapeSQLString, RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { ConversationEngine, ConversationScope, MJConversationEntity } from '@memberjunction/core-entities';

interface ConversationDetailRow {
    ID: string;
    Role: string;
    Message: string;
    CreatedAt: string;
}

/** Number of newest messages the Recent Turns card shows. */
const RECENT_MESSAGE_COUNT = 4;

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Conversations:overview',
    metadata: {
        entity: 'Conversations',
        slot: 'before-fields',
        sortKey: 10,
    },
})
@Component({
    selector: 'mj-conversation-overview-panel',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-convo-overview-grid">
            <!-- Card 1: Message Flow Metrics -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-comments" style="color: var(--mj-brand-primary, #38bdf8);"></i> Turn Summary</div>
                    <span class="mj-card-badge">{{ TotalMessageCount }} Turns</span>
                </div>
                <div class="mj-card-body">
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Total Messages</span>
                        <span class="mj-metric-val">{{ TotalMessageCount }}</span>
                    </div>
                    @if (BranchCount > 0) {
                        <div class="mj-branch-note">across {{ BranchCount }} {{ BranchCount === 1 ? 'branch' : 'branches' }}</div>
                    }
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">User Prompts</span>
                        <span class="mj-metric-val">{{ UserMessageCount }}</span>
                    </div>
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Agent Responses</span>
                        <span class="mj-metric-val">{{ AgentMessageCount }}</span>
                    </div>
                </div>
            </div>

            <!-- Card 2: Recent Activity Stream -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-clock-rotate-left" style="color: #10b981;"></i> Recent Turns</div>
                    <span class="mj-card-badge">History</span>
                </div>
                <div class="mj-card-body">
                    @if (Messages.length === 0) {
                        <span style="font-size: 12px; color: var(--mj-text-muted);">No messages in this conversation yet.</span>
                    } @else {
                        @for (msg of RecentMessages; track msg.ID) {
                            <div class="mj-metric-row">
                                <span class="mj-metric-label" style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 200px;">
                                    <strong>{{ msg.Role }}:</strong> {{ msg.Message }}
                                </span>
                                <span class="mj-pill" [class.mj-pill-blue]="msg.Role === 'user'" [class.mj-pill-green]="msg.Role !== 'user'">
                                    {{ msg.Role }}
                                </span>
                            </div>
                        }
                    }
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; width: 100%; margin-bottom: 20px; }
        .mj-convo-overview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 16px;
        }
        .mj-overview-card {
            background: var(--mj-bg-surface-card, #141f36);
            border: 1px solid var(--mj-border-default, #223254);
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .mj-card-header {
            padding: 10px 14px;
            background: var(--mj-bg-surface, #111a2e);
            border-bottom: 1px solid var(--mj-border-default, #223254);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .mj-card-title {
            font-size: 12.5px;
            font-weight: 700;
            color: var(--mj-text-primary, #f8fafc);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .mj-card-badge {
            font-size: 11px;
            padding: 2px 7px;
            border-radius: 9999px;
            background: var(--mj-bg-surface-elevated, #1a2744);
            color: var(--mj-text-secondary, #94a3b8);
            border: 1px solid var(--mj-border-default, #223254);
        }
        .mj-card-body {
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .mj-metric-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
        }
        .mj-metric-label { color: var(--mj-text-secondary, #94a3b8); }
        .mj-branch-note { font-size: 11px; color: var(--mj-text-muted); margin-top: -6px; }
        .mj-metric-val { font-weight: 600; color: var(--mj-text-primary, #f8fafc); font-family: monospace; }
        .mj-pill { font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
        .mj-pill-green { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .mj-pill-blue { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
    `]
})
export class ConversationOverviewPanel extends BaseFormPanel<MJConversationEntity> implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    /** The newest messages on the conversation's current branch path, newest first. */
    public Messages: ConversationDetailRow[] = [];
    /** Messages on the conversation's current branch path. */
    public TotalMessageCount = 0;
    /** User messages on the conversation's current branch path. */
    public UserMessageCount = 0;
    /** AI messages on the conversation's current branch path. */
    public AgentMessageCount = 0;
    /** Branch rows of the conversation, whichever path is current. */
    public BranchCount = 0;

    public ngOnInit(): void {
        this.loadConversationMessages();
    }

    public get RecentMessages(): ConversationDetailRow[] {
        return this.Messages.slice(0, RECENT_MESSAGE_COUNT);
    }

    /** The host form's provider, or the default provider when the panel has no host form. */
    private get providerToUse(): IMetadataProvider {
        return this.FormComponent?.ProviderToUse ?? Metadata.Provider; // global-provider-ok: BaseFormPanel has no Provider input; a panel without a host form uses the default provider
    }

    /**
     * Loads the counts and newest messages on the conversation's current branch path, and the
     * conversation's branch count, in one batch. When the branch scope cannot be read, the counts
     * stay at zero.
     */
    private async loadConversationMessages(): Promise<void> {
        if (!this.Record?.ID) return;
        const provider = this.providerToUse;
        let scope: ConversationScope;
        try {
            scope = await ConversationEngine.LoadCurrentScope(this.Record.ID, provider.CurrentUser, provider);
        } catch (e) {
            LogError(`Conversation overview: could not read the branch scope of conversation ${this.Record.ID}: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const [total, user, agent, recent, branches] = await rv.RunViews<ConversationDetailRow>([
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: ConversationEngine.ScopeFilter(scope),
                    ResultType: 'count_only',
                },
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `${ConversationEngine.ScopeFilter(scope)} AND [Role]='User'`,
                    ResultType: 'count_only',
                },
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `${ConversationEngine.ScopeFilter(scope)} AND [Role]='AI'`,
                    ResultType: 'count_only',
                },
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: ConversationEngine.ScopeFilter(scope),
                    Fields: ['ID', 'Role', 'Message', '__mj_CreatedAt'],
                    OrderBy: 'Sequence DESC',
                    MaxRows: RECENT_MESSAGE_COUNT,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: Conversation Branches',
                    ExtraFilter: `ConversationID='${EscapeSQLString(this.Record.ID)}'`,
                    ResultType: 'count_only',
                },
            ], provider.CurrentUser);
            this.TotalMessageCount = total?.Success ? total.TotalRowCount : 0;
            this.UserMessageCount = user?.Success ? user.TotalRowCount : 0;
            this.AgentMessageCount = agent?.Success ? agent.TotalRowCount : 0;
            this.Messages = recent?.Success ? recent.Results : [];
            this.BranchCount = branches?.Success ? branches.TotalRowCount : 0;
            this.cdr.markForCheck();
        } catch (e) {
            LogError(`Conversation overview: could not load the details of conversation ${this.Record.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
