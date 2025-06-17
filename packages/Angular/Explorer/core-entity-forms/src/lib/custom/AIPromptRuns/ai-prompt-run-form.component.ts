import { Component, ElementRef, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { AIPromptRunEntity, AIPromptEntity, AIModelEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { AIPromptRunFormComponent } from '../../generated/Entities/AIPromptRun/aipromptrun.form.component';
import { SharedService } from '@memberjunction/ng-shared';
import { Router, ActivatedRoute } from '@angular/router';

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Runs')
@Component({
    selector: 'mj-ai-prompt-run-form',
    templateUrl: './ai-prompt-run-form.component.html',
    styleUrls: ['./ai-prompt-run-form.component.css']
})
export class AIPromptRunFormComponentExtended extends AIPromptRunFormComponent {
    public record!: AIPromptRunEntity;
    
    // Related entities
    public prompt: AIPromptEntity | null = null;
    public model: AIModelEntity | null = null;
    public parentRun: AIPromptRunEntity | null = null;
    public childRuns: AIPromptRunEntity[] = [];
    
    // UI state
    public isLoadingRelatedData = false;
    public messagesExpanded = true;
    public resultExpanded = true;
    public metricsExpanded = false;
    public hierarchyExpanded = false;
    
    // Formatted values
    public formattedMessages = '';
    public formattedResult = '';
    
    constructor(
        elementRef: ElementRef,
        public sharedService: SharedService,
        router: Router,
        route: ActivatedRoute,
        cdr: ChangeDetectorRef
    ) {
        super(elementRef, sharedService, router, route, cdr);
    }
    
    async ngOnInit() {
        await super.ngOnInit();
        if (this.record?.ID) {
            await this.loadRelatedData();
            this.formatJsonFields();
        }
    }
    
    private async loadRelatedData() {
        this.isLoadingRelatedData = true;
        try {
            const md = new Metadata();
            
            // Load prompt
            if (this.record.PromptID) {
                this.prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts');
                if (this.prompt) {
                    await this.prompt.Load(this.record.PromptID);
                }
            }
            
            // Load model
            if (this.record.ModelID) {
                this.model = await md.GetEntityObject<AIModelEntity>('AI Models');
                if (this.model) {
                    await this.model.Load(this.record.ModelID);
                }
            }
            
            // Load parent run if exists
            if (this.record.ParentID) {
                this.parentRun = await md.GetEntityObject<AIPromptRunEntity>('MJ: AI Prompt Runs');
                if (this.parentRun) {
                    await this.parentRun.Load(this.record.ParentID);
                }
            }
            
            // Load child runs
            await this.loadChildRuns();
        } catch (error) {
            console.error('Error loading related data:', error);
        } finally {
            this.isLoadingRelatedData = false;
        }
    }
    
    private async loadChildRuns() {
        if (!this.record.ID) return;
        
        const rv = new RunView();
        const result = await rv.RunView<AIPromptRunEntity>({
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `ParentID='${this.record.ID}'`,
            OrderBy: 'ExecutionOrder ASC, RunAt DESC',
            ResultType: 'entity_object'
        });
        
        this.childRuns = result.Results;
    }
    
    private formatJsonFields() {
        // Format messages
        if (this.record.Messages) {
            try {
                const parsed = JSON.parse(this.record.Messages);
                this.formattedMessages = JSON.stringify(parsed, null, 2);
            } catch {
                this.formattedMessages = this.record.Messages;
            }
        } else {
            this.formattedMessages = '';
        }
        
        // Format result
        if (this.record.Result) {
            try {
                const parsed = JSON.parse(this.record.Result);
                this.formattedResult = JSON.stringify(parsed, null, 2);
            } catch {
                this.formattedResult = this.record.Result;
            }
        } else {
            this.formattedResult = '';
        }
    }
    
    getStatusColor(): string {
        if (!this.record) return '#6c757d';
        
        if (this.record.Success === true) {
            return '#28a745'; // Green
        } else if (this.record.Success === false) {
            return '#dc3545'; // Red
        } else if (this.record.CompletedAt) {
            return '#17a2b8'; // Blue (completed but no success flag)
        } else {
            return '#ffc107'; // Yellow (running)
        }
    }
    
    getStatusIcon(): string {
        if (!this.record) return 'fa-circle';
        
        if (this.record.Success === true) {
            return 'fa-check-circle';
        } else if (this.record.Success === false) {
            return 'fa-times-circle';
        } else if (this.record.CompletedAt) {
            return 'fa-info-circle';
        } else {
            return 'fa-spinner fa-spin';
        }
    }
    
    getStatusText(): string {
        if (!this.record) return 'Unknown';
        
        if (this.record.Success === true) {
            return 'Success';
        } else if (this.record.Success === false) {
            return 'Failed';
        } else if (this.record.CompletedAt) {
            return 'Completed';
        } else {
            return 'Running';
        }
    }
    
    formatDuration(ms: number | null): string {
        if (!ms) return '-';
        
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return `${minutes}m ${seconds}s`;
        }
    }
    
    formatCost(cost: number | null): string {
        if (!cost) return '-';
        return `$${cost.toFixed(4)}`;
    }
    
    formatTokens(tokens: number | null): string {
        if (!tokens) return '-';
        return tokens.toLocaleString();
    }
    
    getRunTypeIcon(runType: string | null): string {
        switch (runType) {
            case 'Single':
                return 'fa-play-circle';
            case 'ParallelParent':
                return 'fa-layer-group';
            case 'ParallelChild':
                return 'fa-clone';
            case 'ResultSelector':
                return 'fa-filter';
            default:
                return 'fa-circle';
        }
    }
    
    getRunTypeColor(runType: string | null): string {
        switch (runType) {
            case 'Single':
                return '#6f42c1';
            case 'ParallelParent':
                return '#007bff';
            case 'ParallelChild':
                return '#17a2b8';
            case 'ResultSelector':
                return '#28a745';
            default:
                return '#6c757d';
        }
    }
    
    navigateToEntity(entityName: string, recordId: string | null) {
        if (!recordId) return;
        
        SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }
    
    copyToClipboard(text: string, fieldName: string) {
        navigator.clipboard.writeText(text).then(() => {
            // Just show a console log for now, as ShowSimpleNotification may not exist
            console.log(`${fieldName} copied to clipboard`);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
    
    async refreshData() {
        if (this.record?.ID) {
            await this.record.Load(this.record.ID);
            await this.loadRelatedData();
            this.formatJsonFields();
        }
    }
}