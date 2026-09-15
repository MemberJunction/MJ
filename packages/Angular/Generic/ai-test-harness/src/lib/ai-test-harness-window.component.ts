import { Component, Input, Output, EventEmitter, ViewChild, OnInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { Metadata } from '@memberjunction/core';

export interface AITestHarnessWindowData {
    agentId?: string;
    agent?: MJAIAgentEntityExtended;
    promptId?: string;
    prompt?: MJAIPromptEntityExtended;
    promptRunId?: string;
    title?: string;
    width?: string | number;
    height?: string | number;
    initialDataContext?: Record<string, any>;
    initialTemplateData?: Record<string, any>;
    initialTemplateVariables?: Record<string, any>;
    selectedModelId?: string;
    mode?: 'agent' | 'prompt';
}

@Component({
  standalone: false,
    selector: 'mj-ai-test-harness-window',
    template: `
        <div class="window-content">
            @if (loading) {
                <div class="loading-container">
                    <mj-loading [text]="'Loading ' + (mode === 'agent' ? 'AI Agent' : 'AI Prompt') + '...'" size="large"></mj-loading>
                </div>
            }
            @else if (error) {
                <div class="error-container">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    <p>{{ error }}</p>
                </div>
            }
            @else {
                <mj-ai-test-harness
                    [entity]="(agent || prompt) || null"
                    [mode]="mode"
                    [isVisible]="true"
                    [originalPromptRunId]="data.promptRunId || null"
                    (minimizeRequested)="onMinimizeRequested()">
                </mj-ai-test-harness>
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
        }
        
        .window-content {
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        
        .loading-container,
        .error-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 1rem;
        }
        
        .error-container {
            color: #dc3545;
            
            i {
                font-size: 3rem;
            }
        }
        
        mj-ai-test-harness {
            flex: 1;
            overflow: hidden;
        }
    `]
})
export class AITestHarnessWindowComponent extends BaseAngularComponent implements OnInit  {
    @Input() Data: AITestHarnessWindowData = {};

    /** @deprecated Use {@link Data}. */
    @Input() set data(value: AITestHarnessWindowData) {
      this.Data = value;
    }
    /** @deprecated Use {@link Data}. */
    get data(): AITestHarnessWindowData {
      return this.Data;
    }
    @Output() CloseWindow = new EventEmitter<void>();

    /**
     * @deprecated Use {@link CloseWindow}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (closeWindow) keeps working. Must stay AFTER CloseWindow: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() closeWindow = this.CloseWindow;
    
    WindowTitle = 'AI Test Harness';

    /** @deprecated Use {@link WindowTitle}. */
    get windowTitle() {
      return this.WindowTitle;
    }
    /** @deprecated Use {@link WindowTitle}. */
    set windowTitle(value) {
      this.WindowTitle = value;
    }
    width: number = 1200;
    height: number = 800;
    Loading = true;

    /** @deprecated Use {@link Loading}. */
    get loading() {
      return this.Loading;
    }
    /** @deprecated Use {@link Loading}. */
    set loading(value) {
      this.Loading = value;
    }
    error = '';
    
    agent?: MJAIAgentEntityExtended;
    prompt?: MJAIPromptEntityExtended;
    Mode: 'agent' | 'prompt' = 'agent';

    /** @deprecated Use {@link Mode}. */
    get mode(): 'agent' | 'prompt' {
      return this.Mode;
    }
    /** @deprecated Use {@link Mode}. */
    set mode(value: 'agent' | 'prompt') {
      this.Mode = value;
    }
    
    private metadata = this.ProviderToUse;
    
    ngOnInit() {
        console.log('🪟 AITestHarnessWindowComponent.ngOnInit - data:', this.Data);
        console.log('📌 promptRunId:', this.Data.promptRunId);
        
        // Set window dimensions
        this.width = this.convertToNumber(this.Data.width) || 1200;
        this.height = this.convertToNumber(this.Data.height) || 800;
        
        // Determine mode
        this.Mode = this.Data.mode || (this.Data.promptId || this.Data.prompt ? 'prompt' : 'agent');
        
        // Load entity
        this.LoadEntity();
    }
    
    async LoadEntity() {
        try {
            if (this.Mode === 'agent') {
                if (this.Data.agent) {
                    this.agent = this.Data.agent;
                    this.WindowTitle = this.Data.title || `Test Agent: ${this.agent.Name}`;
                } else if (this.Data.agentId) {
                    const agentEntity = await this.metadata.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
                    await agentEntity.Load(this.Data.agentId);
                    if (agentEntity.IsSaved) {
                        this.agent = agentEntity;
                        this.WindowTitle = this.Data.title || `Test Agent: ${this.agent.Name}`;
                    } else {
                        throw new Error('Agent not found');
                    }
                } else {
                    throw new Error('No agent provided');
                }
            } else {
                if (this.Data.prompt) {
                    this.prompt = this.Data.prompt;
                    this.WindowTitle = this.Data.title || `Test Prompt: ${this.prompt.Name}`;
                } else if (this.Data.promptId) {
                    const promptEntity = await this.metadata.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
                    await promptEntity.Load(this.Data.promptId);
                    if (promptEntity.IsSaved) {
                        this.prompt = promptEntity;
                        this.WindowTitle = this.Data.title || `Test Prompt: ${this.prompt.Name}`;
                    } else {
                        throw new Error('Prompt not found');
                    }
                } else {
                    throw new Error('No prompt provided');
                }
            }
            
            this.Loading = false;
        } catch (err: any) {
            this.error = err.message || 'Failed to load entity';
            this.Loading = false;
        }
    }

    /** @deprecated Use {@link LoadEntity}. */
    async loadEntity() {
      return this.LoadEntity();
    }
    
    OnClose() {
        this.CloseWindow.emit();
    }

    /** @deprecated Use {@link OnClose}. */
    onClose() {
      return this.OnClose();
    }
    
    OnMinimizeRequested() {
        // Since Kendo Window doesn't support minimize functionality,
        // we'll close the window when navigating to view the agent run
        this.CloseWindow.emit();
    }

    /** @deprecated Use {@link OnMinimizeRequested}. */
    onMinimizeRequested() {
      return this.OnMinimizeRequested();
    }
    
    private convertToNumber(value: string | number | undefined): number | undefined {
        if (!value) return undefined;
        if (typeof value === 'number') return value;
        
        // Handle percentage values
        if (value.endsWith('vw') || value.endsWith('vh')) {
            const percentage = parseFloat(value) / 100;
            if (value.endsWith('vw')) {
                return window.innerWidth * percentage;
            } else {
                return window.innerHeight * percentage;
            }
        }
        
        // Handle pixel values
        if (value.endsWith('px')) {
            return parseFloat(value);
        }
        
        // Try to parse as number
        const parsed = parseFloat(value);
        return isNaN(parsed) ? undefined : parsed;
    }
}