import { Component, Input, Output, EventEmitter, ViewChild, OnInit } from '@angular/core';
import { AIAgentEntityExtended, AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { Metadata } from '@memberjunction/core';

export interface AITestHarnessWindowData {
    agentId?: string;
    agent?: AIAgentEntityExtended;
    promptId?: string;
    prompt?: AIPromptEntityExtended;
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
export class AITestHarnessWindowComponent implements OnInit {
    @Input() data: AITestHarnessWindowData = {};
    @Output() closeWindow = new EventEmitter<void>();
    
    windowTitle = 'AI Test Harness';
    width: number = 1200;
    height: number = 800;
    loading = true;
    error = '';
    
    agent?: AIAgentEntityExtended;
    prompt?: AIPromptEntityExtended;
    mode: 'agent' | 'prompt' = 'agent';
    
    private metadata = new Metadata();
    
    ngOnInit() {
        console.log('🪟 AITestHarnessWindowComponent.ngOnInit - data:', this.data);
        console.log('📌 promptRunId:', this.data.promptRunId);
        
        // Set window dimensions
        this.width = this.convertToNumber(this.data.width) || 1200;
        this.height = this.convertToNumber(this.data.height) || 800;
        
        // Determine mode
        this.mode = this.data.mode || (this.data.promptId || this.data.prompt ? 'prompt' : 'agent');
        
        // Load entity
        this.loadEntity();
    }
    
    async loadEntity() {
        try {
            if (this.mode === 'agent') {
                if (this.data.agent) {
                    this.agent = this.data.agent;
                    this.windowTitle = this.data.title || `Test Agent: ${this.agent.Name}`;
                } else if (this.data.agentId) {
                    const agentEntity = await this.metadata.GetEntityObject<AIAgentEntityExtended>('AI Agents');
                    await agentEntity.Load(this.data.agentId);
                    if (agentEntity.IsSaved) {
                        this.agent = agentEntity;
                        this.windowTitle = this.data.title || `Test Agent: ${this.agent.Name}`;
                    } else {
                        throw new Error('Agent not found');
                    }
                } else {
                    throw new Error('No agent provided');
                }
            } else {
                if (this.data.prompt) {
                    this.prompt = this.data.prompt;
                    this.windowTitle = this.data.title || `Test Prompt: ${this.prompt.Name}`;
                } else if (this.data.promptId) {
                    const promptEntity = await this.metadata.GetEntityObject<AIPromptEntityExtended>('AI Prompts');
                    await promptEntity.Load(this.data.promptId);
                    if (promptEntity.IsSaved) {
                        this.prompt = promptEntity;
                        this.windowTitle = this.data.title || `Test Prompt: ${this.prompt.Name}`;
                    } else {
                        throw new Error('Prompt not found');
                    }
                } else {
                    throw new Error('No prompt provided');
                }
            }
            
            this.loading = false;
        } catch (err: any) {
            this.error = err.message || 'Failed to load entity';
            this.loading = false;
        }
    }
    
    onClose() {
        this.closeWindow.emit();
    }
    
    onMinimizeRequested() {
        // Since Kendo Window doesn't support minimize functionality,
        // we'll close the window when navigating to view the agent run
        this.closeWindow.emit();
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