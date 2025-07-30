import { Component, ElementRef, ChangeDetectorRef, AfterViewInit, ViewContainerRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { AIPromptRunEntityExtended, AIPromptEntity, AIModelEntity } from '@memberjunction/core-entities';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { AIPromptRunFormComponent } from '../../generated/Entities/AIPromptRun/aipromptrun.form.component';
import { SharedService } from '@memberjunction/ng-shared';
import { Router, ActivatedRoute } from '@angular/router';
import { ChatMessage } from '@memberjunction/ai';
import { TestHarnessWindowService } from '@memberjunction/ng-ai-test-harness';
import { ParseJSONOptions, ParseJSONRecursive } from '@memberjunction/global';

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Runs')
@Component({
    selector: 'mj-ai-prompt-run-form',
    templateUrl: './ai-prompt-run-form.component.html',
    styleUrls: ['./ai-prompt-run-form.component.css']
})
export class AIPromptRunFormComponentExtended extends AIPromptRunFormComponent implements AfterViewInit {
    public record!: AIPromptRunEntityExtended;
    
    // Related entities
    public prompt: AIPromptEntity | null = null;
    public model: AIModelEntity | null = null;
    public parentRun: AIPromptRunEntityExtended | null = null;
    public childRuns: AIPromptRunEntityExtended[] = [];
    
    // UI state
    public isLoadingRelatedData = false;
    public isParsingMessages = true; // Add loading state for message parsing
    public inputExpanded = true;
    public messagesExpanded = true;
    public dataExpanded = false; // Changed to false - often blank
    public rawExpanded = false;
    public resultExpanded = true;
    public metricsExpanded = false;
    public hierarchyExpanded = false;
    public validationExpanded = true; // Expand validation panel by default if there are retries
    
    // Formatted values
    public formattedMessages = '';
    public formattedResult = '';
    public formattedValidationSummary = '';
    public formattedValidationAttempts = '';
    public formattedData = '';
    
    // Parsed input data
    public chatMessages: ChatMessage[] = [];
    public inputData: any = null;
    
    // Validation data
    public validationAttempts: any[] = [];
    public validationSummary: any = null;
    
    constructor(
        elementRef: ElementRef,
        public sharedService: SharedService,
        router: Router,
        route: ActivatedRoute,
        cdr: ChangeDetectorRef,
        private testHarnessWindowService: TestHarnessWindowService,
        private viewContainerRef: ViewContainerRef
    ) {
        super(elementRef, sharedService, router, route, cdr);
    }
    
    async ngOnInit() {
        await super.ngOnInit();
        if (this.record?.ID) {
            await this.loadRelatedData();
            this.formatJsonFields();
            this.loadValidationData();
        }
    }
    
    ngAfterViewInit() {
        // Force change detection to ensure expansion panels render correctly
        setTimeout(() => {
            this.cdr.detectChanges();
        }, 0);
    }
    
    onInputPanelToggle() {
        // Force change detection when parent panel is toggled
        // This helps ensure nested expansion panels render correctly
        setTimeout(() => {
            this.cdr.detectChanges();
        }, 100);
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
                this.parentRun = await md.GetEntityObject<AIPromptRunEntityExtended>('MJ: AI Prompt Runs');
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
        const result = await rv.RunView<AIPromptRunEntityExtended>({
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `ParentID='${this.record.ID}'`,
            OrderBy: 'ExecutionOrder ASC, RunAt DESC',
            ResultType: 'entity_object'
        });
        
        if (result.Success) {
            this.childRuns = result.Results || [];
        }
    }
    
    private formatJsonFields() {
        this.isParsingMessages = true; // Start parsing
        
        // Use the extended entity methods to parse messages
        const messageData = this.record.ParseMessagesData();
        this.chatMessages = messageData.chatMessages;
        this.inputData = messageData.inputData;
        this.formattedMessages = messageData.formattedMessages;
        this.formattedData = messageData.formattedData;
        
        this.isParsingMessages = false; // Done parsing
        
        // Format result using extended entity method
        this.formattedResult = this.record.GetFormattedResult();
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
    
    navigateToOriginalRun() {
        if (this.record?.RerunFromPromptRunID) {
            SharedService.Instance.OpenEntityRecord('MJ: AI Prompt Runs', CompositeKey.FromID(this.record.RerunFromPromptRunID));
        }
    }
    
    reRunPrompt() {
        console.log('🚀 Re-Run button clicked');
        console.log('📋 Current record:', this.record);
        console.log('🆔 Record ID:', this.record?.ID);
        console.log('🎯 Prompt ID:', this.record?.PromptID);
        
        if (!this.record?.ID || !this.record.PromptID) {
            console.error('❌ Cannot re-run: missing record ID or PromptID');
            return;
        }
        
        const params = {
            promptId: this.record.PromptID,
            promptRunId: this.record.ID,
            title: `Re-Run: ${this.prompt?.Name || 'Prompt'}`,
            width: '80vw',
            height: '80vh',
            viewContainerRef: this.viewContainerRef
        };
        
        console.log('📞 Calling openPromptTestHarness with params:', params);
        
        // Open AI Test Harness dialog with the prompt run ID
        this.testHarnessWindowService.openPromptTestHarness(params).subscribe({
            next: (result: any) => {
                if (result) {
                    // Optionally refresh the current view or show a success message
                    console.log('Test harness completed', result);
                }
            },
            error: (error: any) => {
                console.error('Error in test harness:', error);
            }
        });
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
            this.loadValidationData();
        }
    }
    
    private loadValidationData() {
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };

        // Parse validation attempts if available
        if (this.record.ValidationAttempts) {
            try {
                this.validationAttempts = JSON.parse(this.record.ValidationAttempts);
                const recursivelyParsed = ParseJSONRecursive(this.validationAttempts, parseOptions);
                this.formattedValidationAttempts = JSON.stringify(recursivelyParsed, null, 2);
            } catch (error) {
                console.error('Error parsing ValidationAttempts:', error);
                this.validationAttempts = [];
                this.formattedValidationAttempts = '';
            }
        } else {
            this.validationAttempts = [];
            this.formattedValidationAttempts = '';
        }
        
        // Parse validation summary if available
        if (this.record.ValidationSummary) {
            try {
                this.validationSummary = JSON.parse(this.record.ValidationSummary);
                const recursivelyParsed = ParseJSONRecursive(this.validationSummary, parseOptions);
                this.formattedValidationSummary = JSON.stringify(recursivelyParsed, null, 2);
            } catch (error) {
                console.error('Error parsing ValidationSummary:', error);
                this.validationSummary = null;
                this.formattedValidationSummary = '';
            }
        } else {
            this.validationSummary = null;
            this.formattedValidationSummary = '';
        }
        
        // Set validation panel expansion based on whether there were retries
        this.validationExpanded = (this.record.ValidationAttemptCount || 0) > 1;
    }
}