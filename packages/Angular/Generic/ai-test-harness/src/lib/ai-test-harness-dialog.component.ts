import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import { Metadata } from '@memberjunction/core';
import { AITestHarnessComponent } from './ai-test-harness.component';
import { ChatMessage } from '@memberjunction/ai';

/**
 * Configuration data interface for the AI Test Harness Dialog.
 * Provides all necessary options for initializing the dialog with appropriate
 * agent/prompt data, dimensions, and initial variable configurations.
 */
export interface AITestHarnessDialogData {
    /** ID of the AI agent to load (alternative to providing agent entity) */
    agentId?: string;
    /** Pre-loaded AI agent entity (alternative to providing agentId) */
    agent?: MJAIAgentEntityExtended;
    /** ID of the AI prompt to load (alternative to providing prompt entity) */
    promptId?: string;
    /** Pre-loaded AI prompt entity (alternative to providing promptId) */
    prompt?: MJAIPromptEntityExtended;
    /** Custom dialog title (defaults to agent/prompt name) */
    title?: string;
    /** Dialog width in CSS units or viewport percentage */
    width?: string | number;
    /** Dialog height in CSS units or viewport percentage */
    height?: string | number;
    /** Initial data context variables for agent execution */
    initialDataContext?: Record<string, any>;
    /** Initial template data variables for prompt rendering */
    initialTemplateData?: Record<string, any>;
    /** Initial template variables for prompt execution */
    initialTemplateVariables?: Record<string, any>;
    /** Pre-selected AI model ID for prompt execution */
    selectedModelId?: string;
    /** Pre-selected AI vendor ID for prompt execution */
    selectedVendorId?: string;
    /** Pre-selected AI configuration ID for prompt execution */
    selectedConfigurationId?: string;
    /** Mode of operation - 'agent' or 'prompt' */
    mode?: 'agent' | 'prompt';
    /** ID of an existing prompt run to preload data from */
    promptRunId?: string;
}

/**
 * Dialog wrapper component for the AI Agent Test Harness.
 * Provides a modal dialog interface with proper sizing, header, and close functionality.
 * Automatically loads agent data and initializes the test harness with provided configuration.
 * 
 * ## Features:
 * - **Automatic Agent Loading**: Loads agent by ID or uses provided entity
 * - **Configurable Dimensions**: Supports custom dialog sizing
 * - **Initial Data Setup**: Pre-populates data context and template variables
 * - **Clean Dialog Interface**: Professional header with close button
 * - **Responsive Layout**: Adapts to content and screen size
 * 
 * ## Usage:
 * This component is typically opened through the `TestHarnessDialogService` rather than directly:
 * ```typescript
 * const dialogRef = this.testHarnessService.openAgentTestHarness({
 *   agentId: 'agent-123',
 *   initialDataContext: { userId: 'user-456' }
 * });
 * ```
 */
@Component({
  standalone: false,
    selector: 'mj-ai-test-harness-dialog',
    template: `
        <div class="test-harness-dialog">
            <div class="dialog-header">
                <h2>{{ title }}</h2>
                <button class="close-button" (click)="close()">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div class="dialog-content">
                <mj-ai-test-harness 
                    #testHarness
                    [mode]="mode"
                    [entity]="mode === 'agent' ? agent : prompt"
                    [isVisible]="true">
                </mj-ai-test-harness>
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
export class AITestHarnessDialogComponent extends BaseAngularComponent implements OnInit, AfterViewInit  {
    /** Reference to the embedded test harness component */
    @ViewChild('testHarness', { static: false }) TestHarness!: AITestHarnessComponent;

    /** @deprecated Use {@link TestHarness}. */
    get testHarness(): AITestHarnessComponent {
      return this.TestHarness;
    }
    /** @deprecated Use {@link TestHarness}. */
    set testHarness(value: AITestHarnessComponent) {
      this.TestHarness = value;
    }
    
    /** The loaded AI agent entity for testing */
    Agent: MJAIAgentEntityExtended | null = null;

    /** @deprecated Use {@link Agent}. */
    get agent(): MJAIAgentEntityExtended | null {
      return this.Agent;
    }
    /** @deprecated Use {@link Agent}. */
    set agent(value: MJAIAgentEntityExtended | null) {
      this.Agent = value;
    }
    
    /** The loaded AI prompt entity for testing */
    Prompt: MJAIPromptEntityExtended | null = null;

    /** @deprecated Use {@link Prompt}. */
    get prompt(): MJAIPromptEntityExtended | null {
      return this.Prompt;
    }
    /** @deprecated Use {@link Prompt}. */
    set prompt(value: MJAIPromptEntityExtended | null) {
      this.Prompt = value;
    }
    
    /** The mode of operation - either 'agent' or 'prompt' */
    Mode: 'agent' | 'prompt' = 'agent';

    /** @deprecated Use {@link Mode}. */
    get mode(): 'agent' | 'prompt' {
      return this.Mode;
    }
    /** @deprecated Use {@link Mode}. */
    set mode(value: 'agent' | 'prompt') {
      this.Mode = value;
    }
    
    /** Display title for the dialog header */
    title: string = 'AI Test Harness';
    
    /** Configuration data passed from the dialog service */
    @Input() Data: AITestHarnessDialogData = {};

    /** @deprecated Use {@link Data}. */
    @Input() set data(value: AITestHarnessDialogData) {
      this.Data = value;
    }
    /** @deprecated Use {@link Data}. */
    get data(): AITestHarnessDialogData {
      return this.Data;
    }
    
    /** Event emitted when the dialog should be closed */
    @Output() CloseDialog = new EventEmitter<void>();

    /**
     * @deprecated Use {@link CloseDialog}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (closeDialog) keeps working. Must stay AFTER CloseDialog: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() closeDialog = this.CloseDialog;
    
    constructor(private cdr: ChangeDetectorRef) {
    super();}
    
    /**
     * Initializes the dialog component by loading agent/prompt data and configuring
     * the embedded test harness with initial variables and settings.
     */
    async ngOnInit() {
        // Set mode from data
        if (this.Data.mode) {
            this.Mode = this.Data.mode;
        }
        
        if (this.Data.title) {
            this.title = this.Data.title;
        }
        
        const md = this.ProviderToUse;
        
        // Load entity based on mode
        if (this.Mode === 'agent' || (!this.Data.promptId && !this.Data.prompt)) {
            // Agent mode
            if (this.Data.agentId && !this.Data.agent) {
                this.Agent = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
                await this.Agent.Load(this.Data.agentId);
                
                if (this.Agent) {
                    this.title = this.title || `Test Harness: ${this.Agent.Name}`;
                }
            } else if (this.Data.agent) {
                this.Agent = this.Data.agent;
                this.title = this.title || `Test Harness: ${this.Agent.Name}`;
            }
        } else {
            // Prompt mode
            this.Mode = 'prompt';
            if (this.Data.promptId && !this.Data.prompt) {
                this.Prompt = await md.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
                await this.Prompt.Load(this.Data.promptId);
                
                if (this.Prompt) {
                    this.title = this.title || `Test Harness: ${this.Prompt.Name}`;
                }
            } else if (this.Data.prompt) {
                this.Prompt = this.Data.prompt;
                this.title = this.title || `Test Harness: ${this.Prompt.Name}`;
            }
        }
    }
    
    /**
     * AfterViewInit lifecycle hook to set initial data after view is initialized
     */
    async ngAfterViewInit(): Promise<void> {
        console.log('🚀 ngAfterViewInit - testHarness available:', !!this.TestHarness);
        console.log('📊 Dialog data:', this.Data);
        console.log('🎯 Mode:', this.Mode);
        
        if (this.TestHarness) {
            // Check if we need to load from a prompt run
            if (this.Data.promptRunId && this.Mode === 'prompt') {
                console.log('🔄 Loading from prompt run in AfterViewInit:', this.Data.promptRunId);
                await this.loadFromPromptRun(this.Data.promptRunId);
            } else {
                console.log('📌 Not loading from prompt run - promptRunId:', this.Data.promptRunId, 'mode:', this.Mode);
                if (this.Mode === 'agent') {
                    // Agent mode: set agent variables
                    if (this.Data.initialDataContext) {
                        const variables = Object.entries(this.Data.initialDataContext).map(([name, value]) => ({
                            name,
                            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                            type: this.detectVariableType(value)
                        }));
                        this.TestHarness.agentVariables = variables;
                    }
                    
                    if (this.Data.initialTemplateData) {
                        const templateVariables = Object.entries(this.Data.initialTemplateData).map(([name, value]) => ({
                            name,
                            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                            type: this.detectVariableType(value)
                        }));
                        this.TestHarness.agentVariables = [...this.TestHarness.agentVariables, ...templateVariables];
                    }
                } else {
                    // Prompt mode: set template variables
                    if (this.Data.initialTemplateVariables) {
                        const variables = Object.entries(this.Data.initialTemplateVariables).map(([name, value]) => ({
                            name,
                            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                            type: this.detectVariableType(value)
                        }));
                        this.TestHarness.templateVariables = variables;
                    }
                    
                    // Set selected model if provided
                    if (this.Data.selectedModelId) {
                        this.TestHarness.selectedModelId = this.Data.selectedModelId;
                    }
                    if (this.Data.selectedVendorId) {
                        this.TestHarness.selectedVendorId = this.Data.selectedVendorId;
                    }
                    if (this.Data.selectedConfigurationId) {
                        this.TestHarness.selectedConfigurationId = this.Data.selectedConfigurationId;
                    }
                }
            }
            
            // Trigger change detection to ensure view updates
            console.log('🔄 Triggering change detection');
            this.cdr.detectChanges();
            
            // Check after change detection
            setTimeout(() => {
                console.log('⏱️ After timeout - conversationMessages:', this.TestHarness?.conversationMessages);
                console.log('⏱️ Test harness component state:', {
                    mode: this.TestHarness?.mode,
                    entity: this.TestHarness?.entity?.Name,
                    messagesLength: this.TestHarness?.conversationMessages?.length
                });
            }, 100);
        }
    }
    
    /**
     * Determines the appropriate variable type for initial data configuration.
     * @param value - The value to analyze for type detection
     * @returns The detected variable type
     * @private
     */
    private detectVariableType(value: any): 'string' | 'number' | 'boolean' | 'object' {
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'object') return 'object';
        return 'string';
    }
    
    /**
     * Loads data from an existing prompt run to pre-populate the test harness
     * @param promptRunId - The ID of the prompt run to load
     */
    private async loadFromPromptRun(promptRunId: string): Promise<void> {
        console.log('🔄 Loading from prompt run:', promptRunId);
        const md = this.ProviderToUse;
        const promptRun = await md.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs');
        
        if (await promptRun.Load(promptRunId)) {
            console.log('✅ Prompt run loaded successfully');
            // Load the prompt if not already loaded
            if (!this.Prompt && promptRun.PromptID) {
                this.Prompt = await md.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
                await this.Prompt.Load(promptRun.PromptID);
                this.TestHarness.entity = this.Prompt;
                
                // Update title to indicate we're re-running
                this.title = `Re-Run: ${this.Prompt.Name}`;
            }
            
            // Set the model/vendor/configuration
            if (promptRun.ModelID) {
                this.TestHarness.selectedModelId = promptRun.ModelID;
            }
            if (promptRun.VendorID) {
                this.TestHarness.selectedVendorId = promptRun.VendorID;
            }
            if (promptRun.ConfigurationID) {
                this.TestHarness.selectedConfigurationId = promptRun.ConfigurationID;
            }
            
            // Note: We do NOT extract template variables because we want to use
            // the already-rendered system prompt from the previous run, not re-render it
            
            // Set advanced parameters
            if (promptRun.Temperature != null) {
                this.TestHarness.advancedParams.temperature = promptRun.Temperature;
            }
            if (promptRun.TopP != null) {
                this.TestHarness.advancedParams.topP = promptRun.TopP;
            }
            if (promptRun.TopK != null) {
                this.TestHarness.advancedParams.topK = promptRun.TopK;
            }
            if (promptRun.MinP != null) {
                this.TestHarness.advancedParams.minP = promptRun.MinP;
            }
            if (promptRun.FrequencyPenalty != null) {
                this.TestHarness.advancedParams.frequencyPenalty = promptRun.FrequencyPenalty;
            }
            if (promptRun.PresencePenalty != null) {
                this.TestHarness.advancedParams.presencePenalty = promptRun.PresencePenalty;
            }
            if (promptRun.Seed != null) {
                this.TestHarness.advancedParams.seed = promptRun.Seed;
            }
            // Note: responseFormat is handled separately, not in advancedParams
            
            // Use the extended entity methods to get conversation messages
            console.log('📝 Raw Messages field:', promptRun.Messages);
            const parsedData = promptRun.ParseMessagesData();
            console.log('🔍 Parsed messages data:', parsedData);
            
            const chatMessages = promptRun.GetChatMessages();
            console.log('💬 Extracted chat messages:', chatMessages);
            
            if (chatMessages.length > 0) {
                // Convert messages to the format expected by the test harness
                const convertedMessages = chatMessages.map((msg, index) => ({
                    id: `msg-${Date.now()}-${index}`,
                    role: msg.role,
                    content: typeof msg.content === 'string' ? msg.content : 
                             Array.isArray(msg.content) ? 
                             msg.content.filter(block => block.type === 'text').map(block => block.content).join('\n') : 
                             '',
                    timestamp: new Date()
                }));
                
                console.log('🎯 Converted messages for test harness:', convertedMessages);
                this.TestHarness.conversationMessages = convertedMessages;
                console.log('✅ Test harness conversationMessages set:', this.TestHarness.conversationMessages);
            } else {
                console.log('⚠️ No chat messages found in prompt run');
            }
            
            // Store the original prompt run ID for reference
            this.TestHarness.originalPromptRunId = promptRunId;
            
            // Extract and store the system prompt for re-run
            const systemPrompt = promptRun.GetSystemPrompt();
            if (systemPrompt) {
                this.TestHarness.systemPromptOverride = systemPrompt;
            }
            
            // Add a note indicating this is a re-run
            if (this.TestHarness.conversationMessages.length > 0) {
                // Add a system message indicating this is a re-run
                this.TestHarness.conversationMessages.unshift({
                    id: `system-${Date.now()}`,
                    role: 'system',
                    content: `[Re-running from Prompt Run #${promptRunId.substring(0, 8)}]`,
                    timestamp: new Date()
                });
            }
        }
    }
    
    /**
     * Closes the dialog by emitting the close event.
     * This method is called by the close button in the header.
     */
    close(): void {
        this.CloseDialog.emit();
    }
}