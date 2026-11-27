import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewContainerRef, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CompositeKey } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentPromptEntity } from '@memberjunction/core-entities';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { RegisterClassEx, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { SharedService } from '@memberjunction/ng-shared';
import { AIAgentManagementService } from '../../custom/AIAgents/ai-agent-management.service';
import type { MJAIAgentFormComponentExtended } from '../../custom/AIAgents/ai-agent-form.component';
import { AGENT_SECTION_KEYS, ResolveLinkedPromptsAndActions } from './agent-form-helpers';

/**
 * Prompts & Models panel (`BaseFormPanel` — `after-fields`, `sortKey: 180`, `inclusion: 'Primary'`).
 *
 * Claims `MJ: AI Agent Prompts` and presents:
 * - `ModelSelectionMode` selector (`Agent Type` vs. `Agent`)
 * - Rich prompt cards with template preview, role tag, advanced settings dialog, add/remove in EditMode
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:prompts',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'after-fields',
        sortKey: 180,
        contributionKey: AGENT_SECTION_KEYS.Prompts,
        sectionKey: AGENT_SECTION_KEYS.Prompts,
        relatedEntity: 'MJ: AI Agent Prompts',
        relatedJoinField: 'AgentID',
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-prompts-panel',
    templateUrl: './agent-prompts.panel.html',
    styleUrls: ['./agent-prompts.panel.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentPromptsPanel extends BaseFormPanel<MJAIAgentEntity> implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly viewContainerRef = inject(ViewContainerRef);
    private readonly managementService = inject(AIAgentManagementService);

    public readonly SectionKey = AGENT_SECTION_KEYS.Prompts;
    public readonly ModelSelectionModes: ReadonlyArray<MJAIAgentEntity['ModelSelectionMode']> = ['Agent Type', 'Agent'];

    public Loading = false;
    public Prompts: MJAIPromptEntityExtended[] = [];
    public AgentPromptLinks: MJAIAgentPromptEntity[] = [];

    public async ngOnInit(): Promise<void> {
        await this.loadPrompts();
    }

    public override OnRecordRefreshed(_record: MJAIAgentEntity): void {
        void this.loadPrompts(true);
    }

    public PromptPreview(prompt: MJAIPromptEntityExtended): string {
        const text = prompt.TemplateText ?? '';
        if (!text) return '';
        return text.length > 140 ? `${text.substring(0, 140)}...` : text;
    }

    public OpenPrompt(promptId: string): void {
        SharedService.Instance.OpenEntityRecord('MJ: AI Prompts', CompositeKey.FromID(promptId));
    }

    public async AddPrompt(): Promise<void> {
        if (!this.Record?.ID) return;
        const linkedIds = this.Prompts.map((p) => p.ID);
        const result = await firstValueFrom(
            this.managementService.OpenPromptSelectorDialog({
                title: `Add Prompts to ${this.Record.Name || 'AI Agent'}`,
                multiSelect: true,
                showCreateNew: true,
                linkedPromptIds: linkedIds,
                viewContainerRef: this.viewContainerRef,
            }),
        );
        if (!result || result.SelectedPrompts.length === 0) return;

        const host = this.FormComponent as MJAIAgentFormComponentExtended;
        const provider = this.FormComponent.ProviderToUse;
        const existingPromptIds = new UUIDSet(this.Prompts.map((p) => p.ID));
        for (const prompt of result.SelectedPrompts) {
            if (existingPromptIds.Has(prompt.ID)) continue;
            existingPromptIds.Add(prompt.ID);
            const link = await provider.GetEntityObject<MJAIAgentPromptEntity>(
                'MJ: AI Agent Prompts',
                provider.CurrentUser,
            );
            link.NewRecord();
            link.AgentID = this.Record.ID;
            link.PromptID = prompt.ID;
            link.Status = 'Active';
            host.QueuePendingRecord(link, 'save');
            this.Prompts = [...this.Prompts, prompt];
            this.AgentPromptLinks = [...this.AgentPromptLinks, link];
        }
        this.FormComponent.SetSectionRowCount(this.SectionKey, this.Prompts.length);
        this.cdr.markForCheck();
    }

    public async OpenAdvancedSettings(prompt: MJAIPromptEntityExtended, event: Event): Promise<void> {
        event.stopPropagation();
        const link = this.AgentPromptLinks.find((ap) => UUIDsEqual(ap.PromptID, prompt.ID));
        if (!link) return;
        const result = await firstValueFrom(
            this.managementService.OpenAgentPromptAdvancedSettingsDialog({
                agentPrompt: link,
                allAgentPrompts: this.AgentPromptLinks,
                viewContainerRef: this.viewContainerRef,
            }),
        );
        if (!result) return;
        const host = this.FormComponent as MJAIAgentFormComponentExtended;
        host.QueuePendingRecord(link, 'save');
        MJNotificationService.Instance.CreateSimpleNotification(
            'Prompt settings queued — click Save Changes to commit.',
            'info',
            3000,
        );
        this.cdr.markForCheck();
    }

    public RemovePrompt(prompt: MJAIPromptEntityExtended, event: Event): void {
        event.stopPropagation();
        const host = this.FormComponent as MJAIAgentFormComponentExtended;
        const link = this.AgentPromptLinks.find((ap) => UUIDsEqual(ap.PromptID, prompt.ID));
        if (link && link.IsSaved) {
            host.QueuePendingRecord(link, 'delete');
        } else if (link) {
            host.UnqueuePendingRecord(link);
        }
        this.Prompts = this.Prompts.filter((p) => !UUIDsEqual(p.ID, prompt.ID));
        this.AgentPromptLinks = this.AgentPromptLinks.filter((ap) => !UUIDsEqual(ap.PromptID, prompt.ID));
        this.FormComponent.SetSectionRowCount(this.SectionKey, this.Prompts.length);
        this.cdr.markForCheck();
    }

    private async loadPrompts(forceRefresh = false): Promise<void> {
        const agentId = this.Record?.ID;
        if (!agentId) return;

        this.Loading = true;
        this.cdr.markForCheck();
        try {
            await AIEngineBase.Instance.Config(forceRefresh);
            const linked = ResolveLinkedPromptsAndActions(
                agentId,
                AIEngineBase.Instance.Prompts ?? [],
                AIEngineBase.Instance.AgentPrompts ?? [],
                [],
                [],
            );
            this.Prompts = linked.Prompts;
            this.AgentPromptLinks = (AIEngineBase.Instance.AgentPrompts ?? []).filter((ap) =>
                UUIDsEqual(ap.AgentID, agentId),
            );
            this.FormComponent?.SetSectionRowCount(this.SectionKey, this.Prompts.length);
        } catch (err) {
            console.error('Error loading AI Agent prompts:', err);
        } finally {
            this.Loading = false;
            this.cdr.markForCheck();
        }
    }
}

export function LoadAgentPromptsPanel(): void {
    /* no-op marker */
}
