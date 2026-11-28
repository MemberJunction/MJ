import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewContainerRef, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CompositeKey, RunView } from '@memberjunction/core';
import {
    MJActionEntity,
    MJAIAgentActionEntity,
    MJAIAgentEntity,
    MJAIAgentRelationshipEntity,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { RegisterClassEx, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { AIAgentManagementService } from '../../custom/AIAgents/ai-agent-management.service';
import type { MJAIAgentFormComponentExtended } from '../../custom/AIAgents/ai-agent-form.component';
import {
    AGENT_SECTION_KEYS,
    BuildUnifiedSubAgents,
    DefaultAgentIcon,
    ResolveLinkedPromptsAndActions,
    UnifiedSubAgentItem,
} from './agent-form-helpers';

interface AgentSkillRow {
    ID: string;
    SkillID: string;
    Skill: string | null;
    Status: string | null;
    IsActive?: boolean | null;
}

interface AgentClientToolRow {
    ID: string;
    ClientToolDefinitionID: string;
    ClientToolDefinition: string | null;
    Status: string | null;
}

/**
 * Capabilities Hub panel (`BaseFormPanel` — `after-fields`, `sortKey: 170`, `inclusion: 'Primary'`).
 *
 * Claims `MJ: AI Agent Actions` and presents Option B's unified tabbed Capabilities surface:
 * - **Actions**: rich cards with Add/Remove via `AIAgentManagementService` + native tool indicator
 * - **Sub-Agents**: unified Child (`ParentID`) + Related (`MJAIAgentRelationshipEntity`) view with filter & dialogs
 * - **Skills**: assigned `MJ: AI Agent Skills` rows + `AcceptsSkills` / `SkillActivationMode` indicators
 * - **Client Tools**: assigned `MJ: AI Agent Client Tools` rows + `AllowEphemeralClientTools` indicator
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:capabilities',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'after-fields',
        sortKey: 170,
        contributionKey: AGENT_SECTION_KEYS.Capabilities,
        sectionKey: AGENT_SECTION_KEYS.Capabilities,
        relatedEntity: 'MJ: AI Agent Actions',
        relatedJoinField: 'AgentID',
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-capabilities-panel',
    templateUrl: './agent-capabilities.panel.html',
    styleUrls: ['./agent-capabilities.panel.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentCapabilitiesPanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly viewContainerRef = inject(ViewContainerRef);
    private readonly managementService = inject(AIAgentManagementService);

    public readonly SectionKey = AGENT_SECTION_KEYS.Capabilities;
    public ActiveTab: 'actions' | 'subagents' | 'skills' | 'clientTools' = 'actions';
    public SubAgentFilter: 'all' | 'child' | 'related' = 'all';

    public Loading = false;
    public Actions: MJActionEntity[] = [];
    public AgentActionLinks: MJAIAgentActionEntity[] = [];
    public SubAgents: UnifiedSubAgentItem[] = [];
    public Skills: AgentSkillRow[] = [];
    public ClientTools: AgentClientToolRow[] = [];

    public get FilteredSubAgents(): UnifiedSubAgentItem[] {
        if (this.SubAgentFilter === 'child') return this.SubAgents.filter((s) => s.LinkType === 'child');
        if (this.SubAgentFilter === 'related') return this.SubAgents.filter((s) => s.LinkType === 'related');
        return this.SubAgents;
    }

    public get TotalCapabilityCount(): number {
        return this.Actions.length + this.SubAgents.length + this.Skills.length + this.ClientTools.length;
    }

    public async ngOnInit(): Promise<void> {
        await this.loadCapabilities();
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        void this.loadCapabilities(true);
    }

    public SetTab(tab: 'actions' | 'subagents' | 'skills' | 'clientTools'): void {
        this.ActiveTab = tab;
    }

    public SetSubAgentFilter(filter: 'all' | 'child' | 'related'): void {
        this.SubAgentFilter = filter;
    }

    public SubAgentIcon(agent: MJAIAgentEntityExtended): string {
        return DefaultAgentIcon(agent.IconClass, agent.Type);
    }

    public OpenRecord(entityName: string, id: string): void {
        SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(id)); // first-pk-ok: capability tabs only open core MJ single-ID entities (Actions, AI Agents, AI Skills, AI Client Tools)
    }

    public async AddAction(): Promise<void> {
        if (!this.Record?.ID) return;
        const selected = await firstValueFrom(
            this.managementService.OpenAddActionDialog({
                agentId: this.Record.ID,
                agentName: this.Record.Name || 'AI Agent',
                existingActionIds: this.Actions.map((a) => a.ID),
                viewContainerRef: this.viewContainerRef,
            }),
        );
        if (!selected || selected.length === 0) return;

        const host = this.FormComponent as MJAIAgentFormComponentExtended;
        const provider = this.FormComponent.ProviderToUse;
        const existingActionIds = new UUIDSet(this.Actions.map((a) => a.ID));
        for (const action of selected) {
            if (existingActionIds.Has(action.ID)) continue;
            existingActionIds.Add(action.ID);
            const link = await provider.GetEntityObject<MJAIAgentActionEntity>(
                'MJ: AI Agent Actions',
                provider.CurrentUser,
            );
            link.NewRecord();
            link.AgentID = this.Record.ID;
            link.ActionID = action.ID;
            link.Status = 'Active';
            host.QueuePendingRecord(link, 'save');
            this.Actions = [...this.Actions, action];
            this.AgentActionLinks = [...this.AgentActionLinks, link];
        }
        this.FormComponent.SetSectionRowCount(this.SectionKey, this.TotalCapabilityCount);
        this.cdr.markForCheck();
    }

    public RemoveAction(action: MJActionEntity, event: Event): void {
        event.stopPropagation();
        const host = this.FormComponent as MJAIAgentFormComponentExtended;
        const link = this.AgentActionLinks.find((aa) => UUIDsEqual(aa.ActionID, action.ID));
        if (link && link.IsSaved) {
            host.QueuePendingRecord(link, 'delete');
        } else if (link) {
            host.UnqueuePendingRecord(link);
        }
        this.Actions = this.Actions.filter((a) => !UUIDsEqual(a.ID, action.ID));
        this.AgentActionLinks = this.AgentActionLinks.filter((aa) => !UUIDsEqual(aa.ActionID, action.ID));
        this.FormComponent.SetSectionRowCount(this.SectionKey, this.TotalCapabilityCount);
        this.cdr.markForCheck();
    }

    public async LinkRelatedSubAgent(): Promise<void> {
        if (!this.Record?.ID) return;
        const result = await firstValueFrom(
            this.managementService.OpenSubAgentSelectorDialog({
                title: `Link Sub-Agents to ${this.Record.Name || 'AI Agent'}`,
                parentAgentId: this.Record.ID,
                multiSelect: true,
                showCreateNew: false,
                viewContainerRef: this.viewContainerRef,
            }),
        );
        if (!result || result.SelectedAgents.length === 0) return;

        const host = this.FormComponent as MJAIAgentFormComponentExtended;
        const provider = this.FormComponent.ProviderToUse;
        const existingSubAgentIds = new UUIDSet(this.SubAgents.map((s) => s.Agent.ID));
        for (const sub of result.SelectedAgents) {
            if (existingSubAgentIds.Has(sub.ID)) continue;
            existingSubAgentIds.Add(sub.ID);
            const rel = await provider.GetEntityObject<MJAIAgentRelationshipEntity>(
                'MJ: AI Agent Relationships',
                provider.CurrentUser,
            );
            rel.NewRecord();
            rel.AgentID = this.Record.ID;
            rel.SubAgentID = sub.ID;
            rel.Status = 'Active';
            host.QueuePendingRecord(rel, 'save');
            this.SubAgents = [...this.SubAgents, { Agent: sub, LinkType: 'related', Relationship: rel }];
        }
        this.FormComponent.SetSectionRowCount(this.SectionKey, this.TotalCapabilityCount);
        this.cdr.markForCheck();
    }

    private async loadCapabilities(forceRefresh = false): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;

        this.Loading = true;
        this.cdr.markForCheck();
        try {
            await Promise.all([AIEngineBase.Instance.Config(forceRefresh), ActionEngineBase.Instance.Config(forceRefresh)]);
            const linked = ResolveLinkedPromptsAndActions(
                agentId,
                [],
                [],
                ActionEngineBase.Instance.Actions ?? [],
                AIEngineBase.Instance.AgentActions ?? [],
            );
            this.Actions = linked.Actions;
            this.AgentActionLinks = (AIEngineBase.Instance.AgentActions ?? []).filter((aa) =>
                UUIDsEqual(aa.AgentID, agentId),
            );
            this.SubAgents = BuildUnifiedSubAgents(
                agentId,
                (AIEngineBase.Instance.Agents ?? []) as MJAIAgentEntityExtended[],
                AIEngineBase.Instance.AgentRelationships ?? [],
            );

            const rv = RunView.FromMetadataProvider(this.FormComponent.ProviderToUse);
            const results = await rv.RunViews([
                {
                    EntityName: 'MJ: AI Agent Skills',
                    Fields: ['ID', 'SkillID', 'Skill', 'Status'],
                    ExtraFilter: `AgentID='${agentId}'`,
                    OrderBy: 'Skill ASC',
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: AI Agent Client Tools',
                    Fields: ['ID', 'ClientToolDefinitionID', 'ClientToolDefinition', 'Status'],
                    ExtraFilter: `AgentID='${agentId}'`,
                    OrderBy: 'ClientToolDefinition ASC',
                    ResultType: 'simple',
                },
            ]);
            this.Skills = (results[0]?.Success ? results[0].Results : []) as AgentSkillRow[];
            this.ClientTools = (results[1]?.Success ? results[1].Results : []) as AgentClientToolRow[];
            this.FormComponent?.SetSectionRowCount(this.SectionKey, this.TotalCapabilityCount);
        } catch (err) {
            console.error('Error loading AI Agent capabilities:', err);
        } finally {
            this.Loading = false;
            this.cdr.markForCheck();
        }
    }
}

export function LoadAgentCapabilitiesPanel(): void {
    /* no-op marker */
}
