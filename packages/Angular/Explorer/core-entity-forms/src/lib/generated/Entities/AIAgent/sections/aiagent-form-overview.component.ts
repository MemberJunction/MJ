import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AIAgentEntity, AIAgentActionEntity, AIAgentPromptEntity } from '@memberjunction/core-entities';
import { RunView, LogError, CompositeKey } from '@memberjunction/core';

interface AgentPrompt {
  ID: string;
  Name: string;
  Purpose: string;
  ExecutionOrder: number;
  Status: string;
  ContextBehavior: string;
}

interface AgentAction {
  ID: string;
  Name: string;
  Status: string;
}

interface SubAgentItem {
  ID: string;
  Name: string;
  Description: string;
  Status: string;
  ExecutionMode: string;
  ExecutionOrder: number;
}

@RegisterClass(BaseFormSectionComponent, 'AI Agents.overview') 
@Component({
    selector: 'gen-aiagent-form-overview',
    templateUrl: './aiagent-form-overview.component.html',
    styleUrls: ['../../../../../shared/form-styles.css', './aiagent-form-overview.component.css']
})
export class AIAgentFormOverviewComponent extends BaseFormSectionComponent implements OnInit {
    @Input() override record!: AIAgentEntity;
    @Input() override EditMode: boolean = false;

    public agentPrompts: AgentPrompt[] = [];
    public agentActions: AgentAction[] = [];
    public subAgents: SubAgentItem[] = [];
    
    public loadingPrompts: boolean = false;
    public loadingActions: boolean = false;
    public loadingSubAgents: boolean = false;

    constructor(private router: Router) { 
        super();
    }

    ngOnInit() {
        if (this.record && this.record.IsSaved) {
            this.loadRelatedData();
        }
    }

    private async loadRelatedData(): Promise<void> {
        // Load all related data in parallel
        await Promise.all([
            this.loadAgentPrompts(),
            this.loadAgentActions(), 
            this.loadSubAgents()
        ]);
    }

    private async loadAgentPrompts(): Promise<void> {
        try {
            this.loadingPrompts = true;
            const rv = new RunView();
            const result = await rv.RunView<AIAgentPromptEntity>({
                EntityName: 'MJ: AI Agent Prompts',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                OrderBy: 'ExecutionOrder ASC, __mj_CreatedAt ASC',
                ResultType: 'entity_object'
            });

            if (!result.Success) {
                LogError(`Failed to load agent prompts: ${result.ErrorMessage}`);
                return;
            }

            this.agentPrompts = result.Results.map(p => ({
                ID: p.ID,
                Name: p.Prompt || 'Unnamed Prompt',
                Purpose: p.Purpose || '',
                ExecutionOrder: p.ExecutionOrder || 0,
                Status: p.Status || 'Active',
                ContextBehavior: p.ContextBehavior || 'Complete'
            }));
        } catch (error) {
            LogError('Error loading agent prompts: ' + String(error));
        } finally {
            this.loadingPrompts = false;
        }
    }

    private async loadAgentActions(): Promise<void> {
        try {
            this.loadingActions = true;
            const rv = new RunView();
            const result = await rv.RunView<AIAgentActionEntity>({
                EntityName: 'AI Agent Actions',
                ExtraFilter: `AgentID='${this.record.ID}'`,
                OrderBy: 'Status ASC',
                ResultType: 'entity_object'
            });

            if (!result.Success) {
                LogError(`Failed to load agent actions: ${result.ErrorMessage}`);
                return;
            }

            this.agentActions = result.Results.map(a => ({
                ID: a.ID,
                Name: a.Action || 'Unnamed Action',
                Status: a.Status || 'Active'
            }));
        } catch (error) {
            LogError('Error loading agent actions: ' + String(error));
        } finally {
            this.loadingActions = false;
        }
    }

    private async loadSubAgents(): Promise<void> {
        try {
            this.loadingSubAgents = true;
            const rv = new RunView();
            const result = await rv.RunView<AIAgentEntity>({
                EntityName: 'AI Agents',
                ExtraFilter: `ParentID='${this.record.ID}'`,
                OrderBy: 'ExecutionOrder ASC, Name ASC',
                ResultType: 'entity_object'
            });

            if (!result.Success) {
                LogError(`Failed to load sub-agents: ${result.ErrorMessage}`);
                return;
            }

            this.subAgents = result.Results.map(s => ({
                ID: s.ID,
                Name: s.Name || 'Unnamed Sub-Agent',
                Description: s.Description || '',
                Status: s.Status || 'Active',
                ExecutionMode: s.ExecutionMode || 'Sequential',
                ExecutionOrder: s.ExecutionOrder || 0
            }));
        } catch (error) {
            LogError('Error loading sub-agents: ' + String(error));
        } finally {
            this.loadingSubAgents = false;
        }
    }

    public openPromptRecord(promptId: string): void {
        const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: promptId }]);
        const newURL: string[] = ['resource', 'record', compositeKey.ToURLSegment()];
        this.router.navigate(newURL, { queryParams: { Entity: 'MJ: AI Agent Prompts' } });
    }

    public openActionRecord(actionId: string): void {
        const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: actionId }]);
        const newURL: string[] = ['resource', 'record', compositeKey.ToURLSegment()];
        this.router.navigate(newURL, { queryParams: { Entity: 'AI Agent Actions' } });
    }

    public openSubAgentRecord(subAgentId: string): void {
        const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: subAgentId }]);
        const newURL: string[] = ['resource', 'record', compositeKey.ToURLSegment()];
        this.router.navigate(newURL, { queryParams: { Entity: 'AI Agents' } });
    }

    public getContextBehaviorBadgeClass(behavior: string): string {
        switch (behavior?.toLowerCase()) {
            case 'complete': return 'badge-primary';
            case 'smart': return 'badge-info';
            case 'none': return 'badge-secondary';
            case 'recentmessages': return 'badge-warning';
            case 'initialmessages': return 'badge-warning';
            case 'custom': return 'badge-success';
            default: return 'badge-secondary';
        }
    }

    public getExecutionModeBadgeClass(mode: string): string {
        switch (mode?.toLowerCase()) {
            case 'sequential': return 'badge-info';
            case 'parallel': return 'badge-success';
            default: return 'badge-secondary';
        }
    }

    public getStatusClass(status: string): string {
        switch (status?.toLowerCase()) {
            case 'active': return 'status-active';
            case 'inactive': return 'status-inactive';
            case 'deprecated': return 'status-inactive';
            case 'preview': return 'status-pending';
            case 'pending': return 'status-pending';
            case 'revoked': return 'status-error';
            case 'error': return 'status-error';
            default: return 'status-unknown';
        }
    }
}

export function LoadAIAgentFormOverviewComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}