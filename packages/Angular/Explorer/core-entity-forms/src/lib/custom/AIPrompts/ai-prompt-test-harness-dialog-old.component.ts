import { Component, Input, Output, EventEmitter, OnInit, ViewChild } from '@angular/core';
import { AIPromptEntity, TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { AIPromptTestHarnessComponent } from './ai-prompt-test-harness.component';

export interface AIPromptTestHarnessDialogData {
    promptId?: string;
    prompt?: AIPromptEntity;
    title?: string;
    width?: string | number;
    height?: string | number;
    initialTemplateVariables?: Record<string, any>;
    selectedModelId?: string;
}

@Component({
    selector: 'mj-ai-prompt-test-harness-dialog-old',
    template: `
        <div class="test-harness-dialog">
            <div class="dialog-header">
                <h2>{{ title }}</h2>
                <button class="close-button" (click)="close()">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="dialog-content">
                <mj-ai-prompt-test-harness 
                    #testHarness
                    [aiPrompt]="prompt"
                    [template]="template"
                    [templateContent]="templateContent"
                    [isVisible]="true">
                </mj-ai-prompt-test-harness>
            </div>
        </div>
    `,
    styles: [`
        .test-harness-dialog {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
        }

        .dialog-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            border-bottom: 1px solid #e0e0e0;
            background-color: #f5f5f5;
        }

        .dialog-header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 500;
        }

        .close-button {
            position: relative;
            top: -4px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        
        .close-button:hover {
            background-color: rgba(0, 0, 0, 0.04);
        }

        .dialog-content {
            flex: 1;
            overflow: hidden;
            padding: 0;
        }

        :host ::ng-deep .test-harness-container {
            height: 100%;
        }
    `]
})
export class AIPromptTestHarnessDialogComponent implements OnInit {
    @ViewChild('testHarness', { static: false }) testHarness!: AIPromptTestHarnessComponent;
    
    prompt: AIPromptEntity | null = null;
    template: TemplateEntity | null = null;
    templateContent: TemplateContentEntity | null = null;
    title: string = 'AI Prompt Test Harness';
    @Input() data: AIPromptTestHarnessDialogData = {};
    @Output() closeDialog = new EventEmitter<void>();
    
    async ngOnInit() {
        if (this.data.title) {
            this.title = this.data.title;
        }
        
        // Load prompt if ID provided
        if (this.data.promptId && !this.data.prompt) {
            const md = new Metadata();
            this.prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts');
            await this.prompt.Load(this.data.promptId);
            
            if (this.prompt) {
                this.title = `Test Harness: ${this.prompt.Name}`;
                
                // Load related template and template content
                if (this.prompt.TemplateID) {
                    await this.loadTemplateData(this.prompt.TemplateID);
                }
            }
        } else if (this.data.prompt) {
            this.prompt = this.data.prompt;
            this.title = `Test Harness: ${this.prompt.Name}`;
            
            // Load related template and template content
            if (this.prompt.TemplateID) {
                await this.loadTemplateData(this.prompt.TemplateID);
            }
        }
        
        // Wait for view to initialize then set initial data if provided
        setTimeout(() => {
            if (this.testHarness) {
                if (this.data.initialTemplateVariables) {
                    // Convert initial template variables
                    const variables = Object.entries(this.data.initialTemplateVariables).map(([name, value]) => ({
                        name,
                        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                        type: this.detectVariableType(value),
                        description: ''
                    }));
                    this.testHarness.templateVariables = variables;
                }
                
                // Note: selectedModelId is not used in the new test harness component
                // as model selection is handled differently
            }
        }, 100);
    }
    
    private async loadTemplateData(templateId: string) {
        const md = new Metadata();
        
        // Load template
        this.template = await md.GetEntityObject<TemplateEntity>('Templates');
        await this.template.Load(templateId);
        
        // Load template content
        if (this.template) {
            const rv = new RunView();
            const result = await rv.RunView<TemplateContentEntity>({
                EntityName: 'Template Contents',
                ExtraFilter: `TemplateID='${templateId}' AND IsActive=1`,
                OrderBy: 'Priority DESC',
                ResultType: 'entity_object'
            });
            
            if (result.Results && result.Results.length > 0) {
                this.templateContent = result.Results[0];
            }
        }
    }
    
    private detectVariableType(value: any): 'string' | 'number' | 'boolean' | 'object' | 'array' {
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'object') return 'object';
        return 'string';
    }
    
    close(): void {
        this.closeDialog.emit();
    }
}