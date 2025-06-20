import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewChecked, SecurityContext, ViewContainerRef, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TextAreaComponent } from '@progress/kendo-angular-inputs';
import { WindowService, WindowRef, WindowCloseResult } from '@progress/kendo-angular-dialog';
import { AIAgentEntity, AIPromptEntity, TemplateParamEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ChatMessage } from '@memberjunction/ai';
import { Subject, Subscription } from 'rxjs';
import { AgentExecutionMonitorComponent } from './agent-execution-monitor.component';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * Supported modes for the test harness
 */
export type TestHarnessMode = 'agent' | 'prompt';

/**
 * Result interface for AI agent execution operations.
 * Contains comprehensive information about the execution outcome, timing, and data.
 */

/**
 * Represents a variable in the data context or template data for agent execution.
 * Used to pass dynamic data to agents during testing and execution.
 */
export interface DataContextVariable {
    /** Variable name used in agent prompts and templates */
    name: string;
    /** String representation of the variable value */
    value: string;
    /** Data type for proper conversion during execution */
    type: 'string' | 'number' | 'boolean' | 'object';
}

/**
 * Enhanced chat message interface extending the base ChatMessage from @memberjunction/ai.
 * Includes additional properties for streaming, timing, error handling, and content management.
 */
export interface ConversationMessage extends ChatMessage {
    /** Unique identifier for this message */
    id: string;
    /** Timestamp when the message was created */
    timestamp: Date;
    /** Whether this message is currently being streamed */
    isStreaming?: boolean;
    /** Accumulated content during streaming (temporary) */
    streamingContent?: string;
    /** Total execution time for AI-generated messages */
    executionTime?: number;
    /** Associated agent run ID for tracking */
    agentRunId?: string;
    /** Error message if processing failed */
    error?: string;
    /** Original unprocessed content from the AI model */
    rawContent?: string;
    /** Whether to display raw content instead of processed content */
    showRaw?: boolean;
    /** Timestamp when streaming started (for elapsed time calculation) */
    streamingStartTime?: number;
    /** Current elapsed time during streaming */
    elapsedTime?: number;
    /** Whether JSON raw section is expanded in collapsible view */
    showJsonRaw?: boolean;
    /** Execution history data for this message (agent mode) */
    executionData?: any;
}

/**
 * Represents a saved conversation session with complete state information.
 * Includes all messages, context data, and metadata for restoration.
 */
export interface SavedConversation {
    /** Unique identifier for the saved conversation */
    id: string;
    /** User-provided name for the conversation */
    name: string;
    /** ID of the agent used in this conversation */
    agentId: string;
    /** Name of the agent for display purposes */
    agentName: string;
    /** Complete message history */
    messages: ConversationMessage[];
    /** Data context variables used during the conversation */
    dataContext: Record<string, any>;
    /** Template data variables used during the conversation (agent mode) */
    templateData: Record<string, any>;
    /** Template variables used during the conversation (prompt mode) */
    templateVariables?: Record<string, any>;
    /** Advanced parameters used during the conversation (prompt mode) */
    advancedParams?: any;
    /** Selected model ID (prompt mode) */
    selectedModelId?: string;
    /** Selected vendor ID (prompt mode) */
    selectedVendorId?: string;
    /** Skip validation setting (prompt mode) */
    skipValidation?: boolean;
    /** When the conversation was first created */
    createdAt: Date;
    /** When the conversation was last modified */
    updatedAt: Date;
}

/**
 * Comprehensive test harness component for AI Agent development and testing.
 * Provides a full-featured chat interface with conversation management, data context configuration,
 * template data management, streaming responses, conversation persistence, and import/export capabilities.
 * 
 * ## Key Features:
 * - **Interactive Chat**: Real-time conversation with AI agents
 * - **Streaming Support**: Live streaming of agent responses with elapsed time tracking
 * - **Data Context Management**: Configure variables passed to agent during execution
 * - **Template Data Management**: Manage template variables for agent prompts
 * - **Conversation Persistence**: Save/load conversations with full state restoration
 * - **Import/Export**: JSON-based conversation backup and sharing
 * - **Content Formatting**: Automatic detection and rendering of Markdown, JSON, and plain text
 * - **Raw Content Toggle**: View both processed and raw AI responses
 * - **Error Handling**: Comprehensive error display and user feedback
 * 
 * ## Usage:
 * ```html
 * <mj-ai-agent-test-harness 
 *   [aiAgent]="myAgent"
 *   [isVisible]="true"
 *   (visibilityChange)="onVisibilityChanged($event)">
 * </mj-ai-agent-test-harness>
 * ```
 * 
 * @example
 * ```typescript
 * // Using with agent entity
 * const agent = await metadata.GetEntityObject<AIAgentEntity>('AI Agents');
 * await agent.Load('agent-id');
 * this.testHarness.aiAgent = agent;
 * this.testHarness.isVisible = true;
 * ```
 */
@Component({
    selector: 'mj-ai-test-harness',
    templateUrl: './ai-test-harness.component.html',
    styleUrls: ['./ai-test-harness.component.css']
})
export class AITestHarnessComponent implements OnInit, OnDestroy, OnChanges, AfterViewChecked {
    /**
     * Creates a new AI Test Harness component instance.
     * @param sanitizer - Angular DomSanitizer for safe HTML rendering of formatted content
     * @param windowService - Kendo WindowService for creating modal windows
     * @param viewContainerRef - Angular ViewContainerRef for window positioning
     * @param cdr - Angular ChangeDetectorRef for managing change detection
     */
    constructor(
        private sanitizer: DomSanitizer,
        private windowService: WindowService,
        private viewContainerRef: ViewContainerRef,
        private cdr: ChangeDetectorRef
    ) {}
    
    /** The mode of operation - either 'agent' or 'prompt' */
    @Input() mode: TestHarnessMode = 'agent';
    
    /** The entity to test - either an AI Agent or AI Prompt */
    @Input() entity: AIAgentEntity | AIPromptEntity | null = null;
    
    /** @deprecated Use 'entity' instead. Kept for backward compatibility. */
    @Input() 
    get aiAgent(): AIAgentEntity | null {
        return this.isAgentEntity(this.entity) ? this.entity : null;
    }
    set aiAgent(value: AIAgentEntity | null) {
        this.entity = value;
        if (value) {
            this.mode = 'agent';
        }
    }
    
    private _isVisible: boolean = false;
    
    /**
     * Controls the visibility of the test harness. When set to true, automatically resets the harness state.
     * This property is typically controlled by parent components or dialog wrappers.
     */
    @Input() 
    get isVisible(): boolean {
        return this._isVisible;
    }
    set isVisible(value: boolean) {
        const wasVisible = this._isVisible;
        this._isVisible = value;
        if (value && !wasVisible) {
            this.resetHarness();
        }
    }

    /** Event emitted when the visibility state changes, allowing parent components to react */
    @Output() visibilityChange = new EventEmitter<boolean>();
    
    /** Reference to the scrollable messages container for auto-scrolling functionality */
    @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
    
    /** Reference to the hidden file input element for conversation import functionality */
    @ViewChild('fileInput') private fileInput!: ElementRef;
    
    /** Reference to the message input textarea */
    @ViewChild('messageInput') private messageInput!: TextAreaComponent;
    
    /** Reference to the save dialog input */
    @ViewChild('saveDialogInput') private saveDialogInput?: ElementRef;

    // === Conversation State ===
    /** Complete array of all messages in the current conversation session */
    public conversationMessages: ConversationMessage[] = [];
    
    /** Current text input by the user (bound to textarea) */
    public currentUserMessage: string = '';
    
    /** Whether an agent execution is currently in progress */
    public isExecuting = false;
    
    // === Data Context Management ===
    /** Unified variables for agent execution (combines data context and template data) */
    public agentVariables: DataContextVariable[] = [];
    
    // === Prompt-specific properties ===
    /** Variables for prompt template rendering */
    public templateVariables: DataContextVariable[] = [];
    
    /** Selected AI model for prompt execution */
    public selectedModelId: string = '';
    
    /** Selected AI vendor for prompt execution */
    public selectedVendorId: string = '';
    
    /** Available AI vendors for the selected model */
    public availableVendors: any[] = [];
    
    /** Default model for the prompt (cached for display) */
    private defaultModelName: string = '';
    
    /** Maximum tokens for prompt execution */
    public maxTokens: number | null = null;
    
    /** Whether to skip validation when running prompts */
    public skipValidation: boolean = false;
    
    /** Advanced LLM Parameters */
    public advancedParams = {
        temperature: null as number | null,
        topP: null as number | null,
        topK: null as number | null,
        minP: null as number | null,
        frequencyPenalty: null as number | null,
        presencePenalty: null as number | null,
        seed: null as number | null,
        stopSequences: [] as string[],
        includeLogProbs: false,
        topLogProbs: 2
    };
    
    /** Raw stop sequences input for textarea */
    public stopSequencesText: string = '';
    
    /** Whether advanced parameters panel is expanded */
    public advancedParamsExpanded: boolean = false;
    
    /** Available AI models for prompt execution */
    public availableModels: any[] = [];
    
    /** Available response format options */
    protected responseFormatOptions = [
        { text: 'Any', value: 'Any' },
        { text: 'Text', value: 'Text' },
        { text: 'Markdown', value: 'Markdown' },
        { text: 'JSON', value: 'JSON' },
        { text: 'Model Specific', value: 'ModelSpecific' }
    ];

    /** Selected response format for prompt execution */
    public selectedResponseFormat = this.responseFormatOptions[0];
    
    // === UI State Management ===
    /** Whether the configuration sidebar is currently visible */
    public showSidebar = true;
    
    /** Currently active tab in the sidebar */
    public activeTab: 'agentVariables' | 'executionMonitor' | 'templateVariables' | 'modelSettings' | 'savedConversations' = 'agentVariables';
    
    /** Array of saved conversation sessions loaded from localStorage */
    public savedConversations: SavedConversation[] = [];
    
    /** ID of the currently active/loaded conversation, if any */
    public currentConversationId: string | null = null;
    
    /** Flag to control JSON dialog visibility */
    public showJsonDialog: boolean = false;
    
    /** Current JSON content to display in the dialog */
    public currentJsonContent: string = '';
    
    /** Reference to the JSON window when open */
    private jsonWindowRef: WindowRef | null = null;
    
    // === Execution Monitor Properties ===
    /** Mode for the execution monitor component */
    public executionMonitorMode: 'live' | 'historical' = 'historical';
    
    /** Current execution data for the monitor */
    public currentExecutionData: any = null;
    
    /** Agent conversation state tracking */
    private agentConversationState: any = null;
    private lastAgentReturnValue: any = null;
    private subAgentHistory: any[] = [];
    
    /** Whether to show the save conversation dialog */
    public showSaveDialog: boolean = false;
    
    /** Name for the new conversation being saved */
    public newConversationName: string = '';
    
    /** Temporary name for the dialog input to avoid binding conflicts */
    public tempConversationName: string = '';
    
    /** Whether to show the load confirmation dialog */
    public showLoadConfirmDialog: boolean = false;
    
    /** Conversation pending to be loaded */
    private pendingLoadConversation: SavedConversation | null = null;
    
    /** Reference to the current message for JSON display */
    private currentJsonMessage: ConversationMessage | null = null;
    
    // === Private State & Intervals ===
    /** Subject for component destruction cleanup */
    private destroy$ = new Subject<void>();
    
    /** Flag indicating that auto-scroll is needed on next view check */
    private scrollNeeded = false;
    
    
    /** Interval handle for elapsed time counter during streaming */
    private elapsedTimeInterval: any;
    
    /** MemberJunction metadata instance for entity operations */
    private _metadata = new Metadata();
    
    /** Track if input has been focused to prevent repeated focusing */
    private _hasFocused = false;
    
    /** Subscription to MJGlobal events for streaming updates */
    private _mjGlobalEventSub: Subscription | undefined;
    
    /** Direct GraphQL subscription for agent execution streaming */
    private _agentStreamSub: Subscription | undefined;

    /**
     * Component initialization. Loads saved conversations, sets up event subscriptions,
     * and initializes the harness to a clean state.
     */
    ngOnInit() {
        // Ensure we have an entity
        if (!this.entity && this.aiAgent) {
            // Handle backward compatibility
            this.entity = this.aiAgent;
            this.mode = 'agent';
        }
        
        this.loadSavedConversations();
        this.subscribeToEvents();
        this.resetHarness();
        
        // Load models if in prompt mode
        if (this.mode === 'prompt') {
            this.loadAvailableModels();
            this.loadPromptDefaults();
            this.loadTemplateParameters(); // Load template parameters for pre-population
        }
    }

    /**
     * Responds to input property changes, particularly when entity is set/changed
     */
    ngOnChanges(changes: SimpleChanges) {
        if (changes['entity']) {
            if (changes['entity'].currentValue) {
                this.loadSavedConversations();
            }
        }
        
        if (changes['aiAgent']) {
            if (!this.entity && this.aiAgent) {
                this.entity = this.aiAgent;
                this.mode = 'agent';
                this.loadSavedConversations();
            }
        }
        
        if (changes['isVisible']) {
            if (changes['isVisible'].currentValue) {
                // Reset focus flag when dialog becomes visible
                this._hasFocused = false;
            }
        }
    }

    /**
     * Component cleanup. Destroys subscriptions and clears any active intervals
     * to prevent memory leaks.
     */
    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }
        if (this._mjGlobalEventSub) {
            this._mjGlobalEventSub.unsubscribe();
        }
        if (this._agentStreamSub) {
            this._agentStreamSub.unsubscribe();
        }
    }

    /**
     * Post-view check hook that handles auto-scrolling to the bottom of the message container
     * when new content is added.
     */
    ngAfterViewChecked() {
        if (this.scrollNeeded) {
            this.scrollToBottom();
            this.scrollNeeded = false;
        }
        
        // Auto-focus message input when dialog first becomes visible
        // Use Promise.resolve to schedule this after current change detection cycle
        if (this.isVisible && !this._hasFocused && this.messageInput) {
            this._hasFocused = true;
            Promise.resolve().then(() => {
                this.messageInput?.focus();
            });
        }
    }

    private subscribeToEvents() {
        // Set up direct GraphQL subscription for agent execution stream
        const dataProvider = Metadata.Provider as GraphQLDataProvider;
        const _providerPushStatusSub = dataProvider.PushStatusUpdates().subscribe((status: any) => {
            const message = JSON.parse(status.message || '{}');
            if (message?.resolver === 'RunAIAgentResolver') {
                // Handle different types of streaming messages
                if (message?.type === 'ExecutionProgress' && message.data?.progress) {
                    const userMsg = message.data.progress.message;
                    
                    // Update streaming message content
                    const streamingMessage = this.conversationMessages.find(m => m.isStreaming);
                    if (streamingMessage) {
                        // Clear any typing animation interval
                        const typingInterval = (streamingMessage as any)._typingInterval;
                        if (typingInterval) {
                            clearInterval(typingInterval);
                            delete (streamingMessage as any)._typingInterval;
                        }
                        
                        // Update the streaming content with the status message
                        streamingMessage.streamingContent = userMsg;
                        this.scrollNeeded = true;
                    }
                    
                    // Update execution monitor with live progress
                    if (!this.currentExecutionData) {
                        this.currentExecutionData = { liveSteps: [] };
                    }
                    this.executionMonitorMode = 'live';
                    
                    // Add or update the current step in the execution tree
                    const stepInfo = {
                        step: {
                            ID: `temp-${Date.now()}`,
                            StepName: userMsg,
                            StepType: message.data.progress.step || 'unknown',
                            Status: 'Running',
                            StartedAt: new Date()
                        },
                        executionType: message.data.progress.step || 'unknown',
                        agentHierarchy: message.data.progress.agentHierarchy || [],
                        depth: message.data.progress.depth || 0,
                        startTime: new Date()
                    };
                    
                    // For live mode, we'll append steps as they come
                    if (!this.currentExecutionData.liveSteps) {
                        this.currentExecutionData.liveSteps = [];
                    }
                    this.currentExecutionData.liveSteps.push(stepInfo);
                    
                    // Trigger change detection for the monitor
                    this.currentExecutionData = { ...this.currentExecutionData };
                }
                else if (message?.type === 'StreamingContent' && message.data?.streaming) {
                    
                    const streamingMessage = this.conversationMessages.find(m => m.isStreaming);
                    if (streamingMessage) {
                        // Append streaming content
                        if (!streamingMessage.streamingContent) {
                            streamingMessage.streamingContent = '';
                        }
                        streamingMessage.streamingContent = message.data.streaming.content;
                        this.scrollNeeded = true;
                    }
                }
                else if (message?.type === 'partial_result' && message.data?.partialResult) {
                    // Could update execution monitor with partial results
                }
                else if (message?.type === 'complete') {
                    // Switch execution monitor to historical mode with final data
                    this.executionMonitorMode = 'historical';
                }
            }
        });
    }
    
    
    /**
     * Loads available AI models for prompt execution.
     * Only called when the harness is in prompt mode.
     */
    private async loadAvailableModels() {
        await AIEngineBase.Instance.Config(false);
        
        // Filter models by the prompt's AIModelTypeID if it exists
        let filteredModels: any[] = [];
        if (this.entity && 'AIModelTypeID' in this.entity) {
            const prompt = this.entity as AIPromptEntity;
            if (prompt.AIModelTypeID) {
                filteredModels = AIEngineBase.Instance.Models.filter(
                    model => model.AIModelTypeID === prompt.AIModelTypeID && model.IsActive
                );
            } else {
                // No model type restriction, show all active models
                filteredModels = AIEngineBase.Instance.Models.filter(model => model.IsActive);
            }
            
            // Set default response format from prompt with slight delay for Kendo dropdown
            setTimeout(() => {
                const format = this.responseFormatOptions.find(f => f.value.trim().toLowerCase() === prompt.ResponseFormat.trim().toLowerCase());
                if (format) {
                    this.selectedResponseFormat = format;
                }
                else {
                    this.selectedResponseFormat = this.responseFormatOptions[0]; // Default to 'Any'
                }
            }, 0);
        } else {
            // Not a prompt entity, show all active models
            filteredModels = AIEngineBase.Instance.Models.filter(model => model.IsActive);
        }
        
        // Sort models by name
        filteredModels.sort((a, b) => a.Name.localeCompare(b.Name));
        
        // Determine the default model for this prompt
        if (this.entity && 'AIModelTypeID' in this.entity) {
            const prompt = this.entity as AIPromptEntity;
            this.defaultModelName = await this.getDefaultModelName(prompt);
        }
        
        // Add a blank option at the beginning with the default model name
        this.availableModels = [
            { ID: '', Name: this.defaultModelName ? `-- Default: ${this.defaultModelName} --` : '-- Use Default Model --' },
            ...filteredModels
        ];
        
        // Don't auto-select a model - let the dropdown show the blank option
        this.selectedModelId = '';
        
        // If we have a default model, load its default vendor
        if (this.defaultModelName) {
            await this.loadDefaultVendor();
        } else {
            this.selectedVendorId = '';
            this.availableVendors = [];
        }
    }
    
    /** Default model object for the prompt (cached for vendor lookup) */
    private defaultModel: any = null;
    
    /**
     * Gets the default model name for a prompt based on its configuration
     */
    private async getDefaultModelName(prompt: AIPromptEntity): Promise<string> {
        try {
            // Get prompt-specific model associations
            const promptModels = AIEngineBase.Instance.PromptModels.filter(
                pm => pm.PromptID === prompt.ID && 
                      (pm.Status === 'Active' || pm.Status === 'Preview')
            );
            
            let defaultModel: any = null;
            
            if (promptModels.length > 0) {
                // Sort by priority (higher priority first)
                promptModels.sort((a, b) => (b.Priority || 0) - (a.Priority || 0));
                
                // Find the first active model
                for (const pm of promptModels) {
                    const model = AIEngineBase.Instance.Models.find(m => m.ID === pm.ModelID && m.IsActive);
                    if (model) {
                        defaultModel = model;
                        break;
                    }
                }
            }
            
            // If no prompt-specific model, use selection strategy
            if (!defaultModel) {
                const candidates = AIEngineBase.Instance.Models.filter(
                    m => m.IsActive && 
                         (!prompt.AIModelTypeID || m.AIModelTypeID === prompt.AIModelTypeID)
                );
                
                if (candidates.length > 0) {
                    // Apply selection strategy
                    if (prompt.SelectionStrategy === 'ByPower') {
                        candidates.sort((a, b) => {
                            switch (prompt.PowerPreference) {
                                case 'Lowest':
                                    return (a.PowerRank || 0) - (b.PowerRank || 0);
                                case 'Highest':
                                case 'Balanced':
                                default:
                                    return (b.PowerRank || 0) - (a.PowerRank || 0);
                            }
                        });
                    }
                    defaultModel = candidates[0];
                }
            }
            
            // Cache the default model object for vendor lookup
            this.defaultModel = defaultModel;
            
            return defaultModel ? defaultModel.Name : '';
        } catch (error) {
            console.error('Error getting default model name:', error);
            return '';
        }
    }
    
    /**
     * Loads the vendors for the default model
     */
    private async loadDefaultVendor() {
        try {
            if (!this.defaultModel) {
                this.availableVendors = [];
                return;
            }
            
            // Get vendors that offer this model - same logic as loadVendorsForModel
            const modelVendors = AIEngineBase.Instance.ModelVendors.filter(
                mv => mv.ModelID === this.defaultModel.ID && 
                      mv.Status === 'Active' &&
                      mv.Type?.trim().toLowerCase() === 'inference provider'
            );
            
            // Map to vendor objects with priority from ModelVendor
            const vendorObjects: any[] = [];
            for (const mv of modelVendors) {
                const vendor = AIEngineBase.Instance.Vendors.find(v => v.ID === mv.VendorID);
                if (vendor) {
                    vendorObjects.push({
                        ID: vendor.ID,
                        Name: vendor.Name,
                        Priority: mv.Priority || 999 // Use ModelVendor priority
                    });
                }
            }
            
            // Sort by priority (lower number = higher priority)
            vendorObjects.sort((a, b) => a.Priority - b.Priority);
            
            this.availableVendors = vendorObjects;
            
            // Select the highest priority vendor
            if (vendorObjects.length > 0) {
                this.selectedVendorId = vendorObjects[0].ID;
            }
        } catch (error) {
            console.error('Error loading default vendor:', error);
            this.availableVendors = [];
        }
    }
    
    /**
     * Handles model selection change and loads available vendors for the selected model
     */
    public onModelSelectionChange() {
        this.selectedVendorId = '';
        this.availableVendors = [];
        
        if (!this.selectedModelId) {
            // When default model is selected, load default vendor
            if (this.defaultModelName) {
                this.loadDefaultVendor();
            }
            return;
        }
        
        // Ensure AIEngineBase is configured
        if (!AIEngineBase.Instance.Models || AIEngineBase.Instance.Models.length === 0) {
            AIEngineBase.Instance.Config(false).then(() => {
                this.loadVendorsForModel();
            });
        } else {
            this.loadVendorsForModel();
        }
    }
    
    /**
     * Loads available vendors for the selected model
     */
    private loadVendorsForModel() {
        if (!this.selectedModelId) {
            return;
        }
        
        // Get model-specific vendors
        const modelVendors = AIEngineBase.Instance.ModelVendors.filter(
            mv => mv.ModelID === this.selectedModelId && 
                  mv.Status === 'Active' &&
                  mv.Type?.trim().toLowerCase() === 'inference provider'
        );
        
        // Map to vendor objects with priority from ModelVendor
        const vendorObjects: any[] = [];
        for (const mv of modelVendors) {
            const vendor = AIEngineBase.Instance.Vendors.find(v => v.ID === mv.VendorID);
            if (vendor) {
                // For now, include all vendors. TODO: Filter by vendor type when available
                vendorObjects.push({
                    ID: vendor.ID,
                    Name: vendor.Name,
                    Priority: mv.Priority || 999 // Use ModelVendor priority
                });
            }
        }
        
        // Sort by priority (lower number = higher priority)
        vendorObjects.sort((a, b) => a.Priority - b.Priority);
        
        this.availableVendors = vendorObjects;
        
        // Auto-select the highest priority vendor if only one or set default
        if (vendorObjects.length === 1) {
            this.selectedVendorId = vendorObjects[0].ID;
        } else if (vendorObjects.length > 1) {
            // Select the highest priority (lowest priority number)
            this.selectedVendorId = vendorObjects[0].ID;
        }
    }
    
    /**
     * Loads default parameter values from the AI prompt entity
     */
    private loadPromptDefaults() {
        if (this.mode === 'prompt' && this.entity && this.isPromptEntity(this.entity)) {
            const prompt = this.entity as AIPromptEntity;
            
            // Load default values from prompt entity
            if (prompt.Temperature != null) this.advancedParams.temperature = prompt.Temperature;
            if (prompt.TopP != null) this.advancedParams.topP = prompt.TopP;
            if (prompt.TopK != null) this.advancedParams.topK = prompt.TopK;
            if (prompt.MinP != null) this.advancedParams.minP = prompt.MinP;
            if (prompt.FrequencyPenalty != null) this.advancedParams.frequencyPenalty = prompt.FrequencyPenalty;
            if (prompt.PresencePenalty != null) this.advancedParams.presencePenalty = prompt.PresencePenalty;
            if (prompt.Seed != null) this.advancedParams.seed = prompt.Seed;
            if (prompt.StopSequences) {
                this.stopSequencesText = prompt.StopSequences;
                this.advancedParams.stopSequences = prompt.StopSequences.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            }
            if (prompt.IncludeLogProbs != null) this.advancedParams.includeLogProbs = prompt.IncludeLogProbs;
            if (prompt.TopLogProbs != null) this.advancedParams.topLogProbs = prompt.TopLogProbs;
        }
    }

    /**
     * Loads template parameters from the prompt's template and pre-populates
     * the template variables with their default values
     */
    private async loadTemplateParameters() {
        if (this.mode === 'prompt' && this.entity && this.isPromptEntity(this.entity)) {
            const prompt = this.entity as AIPromptEntity;
            
            if (!prompt.TemplateID) {
                return; // No template to load parameters from
            }

            try {
                const rv = new RunView();
                const result = await rv.RunView<TemplateParamEntity>({
                    EntityName: 'Template Params',
                    ExtraFilter: `TemplateID='${prompt.TemplateID}'`,
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                });

                if (result.Success && result.Results && result.Results.length > 0) {
                    // Clear existing template variables
                    this.templateVariables = [];
                    
                    // Add each template parameter as a variable with its default value
                    for (const param of result.Results) {
                        this.templateVariables.push({
                            name: param.Name,
                            value: param.DefaultValue || '',
                            type: this.getVariableTypeFromParamType(param.Type)
                        });
                    }
                    
                    // If no parameters found, add one empty variable to start
                    if (this.templateVariables.length === 0) {
                        this.templateVariables.push({ name: '', value: '', type: 'string' });
                    }
                }
            } catch (error) {
                console.error('Error loading template parameters:', error);
                // Add one empty variable on error
                this.templateVariables = [{ name: '', value: '', type: 'string' }];
            }
        }
    }

    /**
     * Maps template parameter types to variable types
     */
    private getVariableTypeFromParamType(paramType: string): 'string' | 'number' | 'boolean' | 'object' {
        switch (paramType?.toLowerCase()) {
            case 'number':
            case 'integer':
            case 'float':
            case 'decimal':
                return 'number';
            case 'boolean':
            case 'bool':
                return 'boolean';
            case 'object':
            case 'json':
            case 'array':
                return 'object';
            default:
                return 'string';
        }
    }

    
    /**
     * Resets all model settings to the prompt defaults
     */
    public resetToPromptDefaults() {
        if (this.mode === 'prompt' && this.entity && this.isPromptEntity(this.entity)) {
            const prompt = this.entity as AIPromptEntity;
            
            // Reset model selection to default
            this.selectedModelId = '';
            
            // Reset vendor - will be loaded by loadDefaultVendor
            this.selectedVendorId = '';
            
            // Reset response format to prompt's setting
            const format = this.responseFormatOptions.find(f => 
                f.value.trim().toLowerCase() === prompt.ResponseFormat.trim().toLowerCase()
            );
            this.selectedResponseFormat = format || this.responseFormatOptions[0];
            
            // Reset max tokens
            this.maxTokens = null;
            
            // Reset skip validation
            this.skipValidation = false;
            
            // Reset advanced parameters
            this.advancedParams = {
                temperature: null,
                topP: null,
                topK: null,
                minP: null,
                frequencyPenalty: null,
                presencePenalty: null,
                seed: null,
                stopSequences: [],
                includeLogProbs: false,
                topLogProbs: 2
            };
            this.stopSequencesText = '';
            
            // Reload prompt defaults for advanced params
            this.loadPromptDefaults();
            
            // Reload default vendor for the default model
            if (this.defaultModelName) {
                this.loadDefaultVendor();
            }
        }
    }

    /**
     * Resets the test harness to its initial state, clearing all conversations,
     * variables, and UI state. Called automatically when the harness becomes visible.
     */
    public resetHarness() {
        this.conversationMessages = [];
        this.currentUserMessage = '';
        this.isExecuting = false;
        this.agentVariables = [{ name: '', value: '', type: 'string' }];
        this.templateVariables = [];
        this.currentConversationId = null;
        this.showSidebar = true;
        this.currentExecutionData = null;
        this.executionMonitorMode = 'historical';
        // Reset conversation state
        this.agentConversationState = null;
        this.lastAgentReturnValue = null;
        this.subAgentHistory = [];
        // Set default tab based on mode
        this.activeTab = this.mode === 'agent' ? 'agentVariables' : 'templateVariables';
        // Reset advanced parameters
        this.advancedParams = {
            temperature: null,
            topP: null,
            topK: null,
            minP: null,
            frequencyPenalty: null,
            presencePenalty: null,
            seed: null,
            stopSequences: [],
            includeLogProbs: false,
            topLogProbs: 2
        };
        this.stopSequencesText = '';
        this.advancedParamsExpanded = false;
        this.skipValidation = false;
    }
    
    /**
     * Starts a new conversation
     */
    public newConversation() {
        if (this.conversationMessages.length > 0 && !this.currentConversationId) {
            // Unsaved conversation exists - use our custom dialog
            if (confirm('You have an unsaved conversation. Would you like to save it first?')) {
                this.saveConversation();
                return;
            }
        }
        
        this.resetHarness();
        MJNotificationService.Instance.CreateSimpleNotification(
            'Started new conversation',
            'info',
            2000
        );
    }

    /**
     * Closes the test harness by setting visibility to false and emitting the change event.
     * Used by dialog implementations and close buttons.
     */
    public close() {
        this._isVisible = false;
        this.visibilityChange.emit(false);
    }

    /**
     * Toggles the visibility of the configuration sidebar.
     * Allows users to show/hide the data context and conversation management panels.
     */
    public toggleSidebar() {
        this.showSidebar = !this.showSidebar;
    }

    /**
     * Switches to the specified tab in the configuration sidebar.
     * @param tab - The tab to activate
     */
    public selectTab(tab: 'agentVariables' | 'executionMonitor' | 'templateVariables' | 'modelSettings' | 'savedConversations') {
        
        this.activeTab = tab;
        
        // If switching to execution monitor tab, ensure it has the latest data
        if (tab === 'executionMonitor' && this.conversationMessages.length > 0) {
            const lastAssistantMessage = this.conversationMessages
                .filter(m => m.role === 'assistant' && m.executionData)
                .pop();
                
            if (lastAssistantMessage && lastAssistantMessage.executionData) {
                this.currentExecutionData = lastAssistantMessage.executionData;
                this.executionMonitorMode = 'historical';
            }
        }
    }

    /**
     * Shows the execution history for a specific message
     * @param message - The message to show execution history for
     */
    public showMessageExecutionHistory(message: ConversationMessage) {
        if (message.executionData && this.mode === 'agent') {
            this.currentExecutionData = message.executionData;
            this.executionMonitorMode = 'historical';
            // Switch to execution monitor tab if not already there
            if (this.activeTab !== 'executionMonitor') {
                this.selectTab('executionMonitor');
            }
        }
    }
    
    /**
     * Extract sub-agent nodes from execution tree
     */
    private extractSubAgentNodes(executionTree: any[]): any[] {
        const subAgentNodes: any[] = [];
        
        const traverse = (nodes: any[]) => {
            for (const node of nodes) {
                if (node.executionType === 'sub-agent') {
                    subAgentNodes.push({
                        agentName: node.step?.StepName,
                        result: node.outputData,
                        timestamp: node.endTime || node.startTime
                    });
                }
                if (node.children) {
                    traverse(node.children);
                }
            }
        };
        
        traverse(executionTree);
        return subAgentNodes;
    }

    /**
     * Sends the current user message to the AI agent and initiates execution.
     * Handles message validation, conversation updates, UI state management, and agent execution.
     * Automatically clears the input field and triggers auto-scroll after sending.
     * 
     * @example
     * ```typescript
     * // Called when user presses Enter or clicks Send button
     * await this.sendMessage();
     * ```
     */
    public async sendMessage() {
        if (!this.currentUserMessage.trim() || !this.entity) {
            return;
        }

        // Add user message to conversation
        const userMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'user',
            content: this.currentUserMessage.trim(),
            timestamp: new Date()
        };
        this.conversationMessages.push(userMessage);
        
        // Clear input and update change detection
        const messageToSend = this.currentUserMessage;
        this.currentUserMessage = '';
        this.cdr.detectChanges();
        
        // Scroll to bottom
        this.scrollNeeded = true;

        // Auto-switch to execution monitor tab if in agent mode
        if (this.mode === 'agent' && this.activeTab !== 'executionMonitor') {
            this.selectTab('executionMonitor');
        }
        
        // Execute based on mode
        if (this.mode === 'agent') {
            await this.executeAgent(messageToSend);
        } else {
            await this.executePrompt(messageToSend);
        }
    }

    private async executeAgent(userMessage: string) {
        if (!this.entity || !this.isAgentEntity(this.entity)) return;

        this.isExecuting = true;

        // Clear previous execution data when starting a new run
        this.currentExecutionData = { liveSteps: [] };
        this.executionMonitorMode = 'live';

        // Add placeholder assistant message for streaming
        const assistantMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            streamingContent: this.mode === 'agent' ? 'Running agent...' : 'Running prompt...',
            agentRunId: '',
            streamingStartTime: Date.now(),
            elapsedTime: 0
        };
        this.conversationMessages.push(assistantMessage);
        this.scrollNeeded = true;
        
        // Start elapsed time counter
        this.startElapsedTimeCounter(assistantMessage);
        
        // Initialize execution monitor for live mode
        this.currentExecutionData = { liveSteps: [] };
        this.executionMonitorMode = 'live';
        

        try {
            // Get GraphQL data provider
            const dataProvider = Metadata.Provider as GraphQLDataProvider;

            // Build conversation history for context
            const messages = this.conversationMessages
                .filter(m => !m.isStreaming)
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));

            // Build data context - include conversation state if available
            const dataContext = this.buildDataContext();
            const templateData = this.buildTemplateData();
            
            // Add conversation state to data context if we have it
            if (this.agentConversationState) {
                dataContext._conversationState = this.agentConversationState;
            }
            if (this.lastAgentReturnValue) {
                dataContext._lastReturnValue = this.lastAgentReturnValue;
            }
            if (this.subAgentHistory.length > 0) {
                dataContext._subAgentHistory = this.subAgentHistory;
            }

            // Generate a session ID for this execution
            const sessionId = dataProvider.sessionId;
            
            // Execute the agent
            const query = `
                mutation RunAIAgent($agentId: String!, $messages: String!, $sessionId: String!, $data: String, $templateData: String) {
                    RunAIAgent(agentId: $agentId, messages: $messages, sessionId: $sessionId, data: $data, templateData: $templateData) {
                        success
                        errorMessage
                        executionTimeMs
                        payload
                    }
                }
            `;

            const variables = {
                agentId: (this.entity as AIAgentEntity).ID,
                messages: JSON.stringify(messages),
                sessionId: sessionId,
                data: Object.keys(dataContext).length > 0 ? JSON.stringify(dataContext) : null,
                templateData: Object.keys(templateData).length > 0 ? JSON.stringify(templateData) : null
            };

            
            // Start typing animation while we wait for the first real stream
            this.startTypingAnimation(assistantMessage);

            
            let result;
            try {
                result = await dataProvider.ExecuteGQL(query, variables);
            } catch (gqlError: any) {
                console.error('❌ AI Test Harness: GraphQL execution failed', {
                    error: gqlError,
                    message: gqlError?.message,
                    networkError: gqlError?.networkError,
                    graphQLErrors: gqlError?.graphQLErrors,
                    statusCode: gqlError?.networkError?.statusCode
                });
                throw gqlError;
            }
            
            const executionResult = result?.RunAIAgent;

            // Stop elapsed time counter
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }

            // Update assistant message with result
            assistantMessage.isStreaming = false;
            
            if (executionResult?.success) {
                // Parse the payload to get the full execution result
                const fullResult = JSON.parse(executionResult.payload);
                
                // Store execution data with the message
                assistantMessage.executionData = fullResult;
                
                // Merge live steps with final result if needed
                if (this.currentExecutionData && this.currentExecutionData.liveSteps && fullResult) {
                    // Preserve the live steps we collected during execution
                    fullResult.liveSteps = this.currentExecutionData.liveSteps;
                }
                
                // Update execution monitor with the new data
                this.currentExecutionData = fullResult;
                this.executionMonitorMode = 'historical';
                
                // Preserve conversation state from the result
                if (fullResult.returnValue) {
                    this.lastAgentReturnValue = fullResult.returnValue;
                    
                    // Extract conversation state if present
                    if (fullResult.returnValue.conversationState) {
                        this.agentConversationState = fullResult.returnValue.conversationState;
                    }
                    
                    // Track sub-agent executions
                    if (fullResult.executionTree) {
                        const subAgentNodes = this.extractSubAgentNodes(fullResult.executionTree);
                        if (subAgentNodes.length > 0) {
                            this.subAgentHistory.push(...subAgentNodes);
                        }
                    }
                }
                
                // Extract the user message from the nested returnValue structure
                let displayContent = 'No response generated';
                if (fullResult.returnValue) {
                    if (typeof fullResult.returnValue === 'object' && 
                        fullResult.returnValue.nextStep?.userMessage) {
                        // This is the expected structure for chat responses
                        displayContent = fullResult.returnValue.nextStep.userMessage;
                    } else if (typeof fullResult.returnValue === 'string') {
                        // Simple string response
                        displayContent = fullResult.returnValue;
                    } else {
                        // Other structured response - show as JSON
                        displayContent = JSON.stringify(fullResult.returnValue, null, 2);
                    }
                }
                
                assistantMessage.content = displayContent;
                assistantMessage.executionTime = executionResult.executionTimeMs;
                assistantMessage.agentRunId = fullResult.agentRun?.ID || assistantMessage.agentRunId;
                
                // Store the full result as raw content for debugging/inspection
                assistantMessage.rawContent = executionResult.payload;
            } else {
                console.error('❌ AI Test Harness: Execution failed', {
                    success: executionResult?.success,
                    errorMessage: executionResult?.errorMessage,
                    hasPayload: !!executionResult?.payload
                });
                assistantMessage.content = 'I encountered an error processing your request.';
                assistantMessage.error = executionResult?.errorMessage || 'Unknown error occurred';
                
                // Try to parse error payload if available
                if (executionResult?.payload) {
                    try {
                        JSON.parse(executionResult.payload); // Validate it's valid JSON
                        assistantMessage.rawContent = executionResult.payload;
                    } catch {
                        // Ignore parse errors
                    }
                }
            }

            delete assistantMessage.streamingContent;
            this.scrollNeeded = true;

            // Auto-save conversation
            this.autoSaveConversation();

        } catch (error) {
            console.error('❌ AI Test Harness: Caught error during agent execution', {
                error: error,
                message: (error as any)?.message,
                stack: (error as any)?.stack,
                type: (error as any)?.constructor?.name
            });
            
            // Update assistant message with error
            const lastMessage = this.conversationMessages[this.conversationMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.isStreaming = false;
                lastMessage.content = 'I encountered an error processing your request.';
                lastMessage.error = (error as Error).message;
                delete lastMessage.streamingContent;
            }
            
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to execute agent: ' + (error as Error).message,
                'error',
                6000
            );
        } finally {
            this.isExecuting = false;
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }
            
            // Focus back on the input
            this.focusMessageInput();
        }
    }

    private async executePrompt(userMessage: string) {
        if (!this.entity || !this.isPromptEntity(this.entity)) return;

        this.isExecuting = true;

        // Add placeholder assistant message for streaming
        const assistantMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            streamingContent: this.mode === 'agent' ? 'Running agent...' : 'Running prompt...',
            agentRunId: '',
            streamingStartTime: Date.now(),
            elapsedTime: 0
        };
        this.conversationMessages.push(assistantMessage);
        this.scrollNeeded = true;
        
        // Start elapsed time counter
        this.startElapsedTimeCounter(assistantMessage);

        try {
            // Get GraphQL data provider
            const dataProvider = Metadata.Provider as GraphQLDataProvider;

            // Build template variables from user input
            const templateVariables = this.buildTemplateVariables();
            
            // Prepare data context (template variables + user message)
            const dataContext = {
                ...templateVariables,
                userMessage: userMessage
            };
            
            // Build conversation messages
            const messages = this.conversationMessages
                .filter(m => !m.isStreaming && m.content) // Only include non-streaming messages with content
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));
            
            // Execute the prompt using RunAIPrompt
            const query = `
                mutation RunAIPrompt($promptId: String!, $data: String, $modelId: String, $vendorId: String, $configurationId: String, $skipValidation: Boolean, $templateData: String, $responseFormat: String, $temperature: Float, $topP: Float, $topK: Int, $minP: Float, $frequencyPenalty: Float, $presencePenalty: Float, $seed: Int, $stopSequences: [String!], $includeLogProbs: Boolean, $topLogProbs: Int, $messages: String) {
                    RunAIPrompt(promptId: $promptId, data: $data, modelId: $modelId, vendorId: $vendorId, configurationId: $configurationId, skipValidation: $skipValidation, templateData: $templateData, responseFormat: $responseFormat, temperature: $temperature, topP: $topP, topK: $topK, minP: $minP, frequencyPenalty: $frequencyPenalty, presencePenalty: $presencePenalty, seed: $seed, stopSequences: $stopSequences, includeLogProbs: $includeLogProbs, topLogProbs: $topLogProbs, messages: $messages) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        tokensUsed
                        promptRunId
                        rawResult
                        validationResult
                    }
                }
            `;

            const variables = {
                promptId: (this.entity as AIPromptEntity).ID,
                data: JSON.stringify(dataContext),
                modelId: this.selectedModelId || undefined,
                vendorId: this.selectedVendorId || undefined,
                configurationId: undefined, // Use default configuration
                skipValidation: this.skipValidation,
                templateData: null, // Additional template context if needed
                responseFormat: this.selectedResponseFormat?.value,
                temperature: this.advancedParams.temperature ?? undefined,
                topP: this.advancedParams.topP ?? undefined,
                topK: this.advancedParams.topK ?? undefined,
                minP: this.advancedParams.minP ?? undefined,
                frequencyPenalty: this.advancedParams.frequencyPenalty ?? undefined,
                presencePenalty: this.advancedParams.presencePenalty ?? undefined,
                seed: this.advancedParams.seed ?? undefined,
                stopSequences: this.advancedParams.stopSequences.length > 0 ? this.advancedParams.stopSequences : undefined,
                includeLogProbs: this.advancedParams.includeLogProbs,
                topLogProbs: this.advancedParams.includeLogProbs ? this.advancedParams.topLogProbs : undefined,
                messages: messages.length > 0 ? JSON.stringify(messages) : undefined
            };

            const result = await dataProvider.ExecuteGQL(query, variables);
            const executionResult = result?.RunAIPrompt;

            // Stop elapsed time counter
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }

            // Update assistant message with result
            assistantMessage.isStreaming = false;
            
            if (executionResult?.success) {
                // Use parsedResult if available, otherwise fall back to output
                assistantMessage.content = executionResult.parsedResult || executionResult.output || 'No response generated';
                assistantMessage.executionTime = executionResult.executionTimeMs;
                
                // Store the complete execution result for JSON display
                assistantMessage.rawContent = JSON.stringify(executionResult, null, 2);
                
                // Store execution metadata
                if (executionResult.promptRunId) {
                    assistantMessage.agentRunId = executionResult.promptRunId;
                }
            } else {
                assistantMessage.content = 'I encountered an error processing your request.';
                assistantMessage.error = executionResult?.error || 'Unknown error occurred';
            }
            
            delete assistantMessage.streamingContent;
            this.scrollNeeded = true;

            // Auto-save conversation
            this.autoSaveConversation();
            
            // Focus back on input
            this.focusMessageInput();

        } catch (error) {
            // Update assistant message with error
            const lastMessage = this.conversationMessages[this.conversationMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.isStreaming = false;
                lastMessage.content = 'I encountered an error processing your request.';
                lastMessage.error = (error as Error).message;
                delete lastMessage.streamingContent;
            }
            
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to execute prompt: ' + (error as Error).message,
                'error',
                6000
            );
        } finally {
            this.isExecuting = false;
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }
            
            // Focus back on the input
            this.focusMessageInput();
        }
    }
 

    private startTypingAnimation(message: ConversationMessage) {
        const initialMessages = [
            "I'm processing your request...",
            "Let me think about that...",
            "Working on your request...",
            "Analyzing your question...",
            "Processing..."
        ];
        
        const selectedMessage = initialMessages[Math.floor(Math.random() * initialMessages.length)];
        let index = 0;
        
        // Store the interval handle on the message itself so we can cancel it when real streaming starts
        const typingInterval = setInterval(() => {
            if (index < selectedMessage.length && message.isStreaming) {
                message.streamingContent = selectedMessage.substring(0, index + 1);
                index++;
                this.scrollNeeded = true;
            } else {
                clearInterval(typingInterval);
            }
        }, 50);
        
        // Store interval reference in case we need to clear it
        (message as any)._typingInterval = typingInterval;
    }

    private buildDataContext(): Record<string, any> {
        const context: Record<string, any> = {};
        
        // Use unified agent variables
        for (const variable of this.agentVariables) {
            if (variable.name.trim()) {
                context[variable.name] = this.convertVariableValue(variable.value, variable.type);
            }
        }
        
        return context;
    }

    private buildTemplateData(): Record<string, any> {
        // For backward compatibility, return the same data as buildDataContext
        // since we've unified the variables
        return this.buildDataContext();
    }

    private buildTemplateVariables(): Record<string, any> {
        const variables: Record<string, any> = {};
        
        for (const variable of this.templateVariables) {
            if (variable.name.trim()) {
                variables[variable.name] = this.convertVariableValue(variable.value, variable.type);
            }
        }
        
        return variables;
    }

    private convertVariableValue(value: string, type: string): any {
        switch (type) {
            case 'number':
                return parseFloat(value) || 0;
            case 'boolean':
                return value.toLowerCase() === 'true';
            case 'object':
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            default:
                return value;
        }
    }

    /**
     * Adds a new empty agent variable to the collection.
     * Agent variables are passed to the agent during execution for dynamic content and template rendering.
     */
    public addAgentVariable() {
        this.agentVariables.push({
            name: '',
            value: '',
            type: 'string'
        });
    }

    /**
     * Removes an agent variable at the specified index.
     * @param index - Zero-based index of the variable to remove
     */
    public removeAgentVariable(index: number) {
        this.agentVariables.splice(index, 1);
    }

    /**
     * Adds a new empty template variable to the collection (prompt mode only).
     * Template variables are used for prompt template rendering.
     */
    public addTemplateVariable() {
        this.templateVariables.push({
            name: '',
            value: '',
            type: 'string'
        });
    }

    /**
     * Removes a template variable at the specified index (prompt mode only).
     * @param index - Zero-based index of the variable to remove
     */
    public removeTemplateVariable(index: number) {
        this.templateVariables.splice(index, 1);
    }

    /**
     * Clears the current conversation after user confirmation.
     * Resets both the message history and the current conversation ID.
     */
    public clearConversation() {
        if (this.conversationMessages.length > 0) {
            if (confirm('Are you sure you want to clear the conversation?')) {
                this.conversationMessages = [];
                this.currentConversationId = null;
            }
        }
    }

    private scrollToBottom(): void {
        try {
            if (this.messagesContainer) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        } catch(err) {
            // Error scrolling to bottom
        }
    }

    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Saved conversations functionality
    private loadSavedConversations() {
        try {
            const storageKey = this.getStorageKey();
            const saved = localStorage.getItem(storageKey);
            
            if (saved) {
                const parsedData = JSON.parse(saved);
                this.savedConversations = parsedData || [];
                
                // Convert date strings back to Date objects
                this.savedConversations.forEach(conv => {
                    conv.createdAt = new Date(conv.createdAt);
                    conv.updatedAt = new Date(conv.updatedAt);
                    conv.messages.forEach(msg => {
                        msg.timestamp = new Date(msg.timestamp);
                    });
                });
            } else {
                this.savedConversations = [];
            }
        } catch (error) {
            // Error loading saved conversations
            this.savedConversations = [];
        }
    }
    
    /**
     * Gets the storage key for saved conversations based on entity type and ID
     */
    private getStorageKey(): string {
        if (!this.entity) {
            return '';
        }
        
        const entityType = this.mode === 'agent' ? 'agent' : 'prompt';
        const entityId = this.entity.ID || 'unknown';
        return `mj_test_harness_${entityType}_${entityId}_conversations`;
    }

    /**
     * Saves the current conversation to localStorage with user-provided name.
     * Handles both creating new conversations and updating existing ones.
     * Automatically limits storage to 50 conversations to prevent excessive memory usage.
     * 
     * @example
     * ```typescript
     * // User clicks save button
     * this.saveConversation(); // Prompts for name and saves
     * ```
     */
    public saveConversation() {
        if (this.conversationMessages.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No messages to save',
                'warning',
                3000
            );
            return;
        }

        // If updating existing conversation, pre-fill the name
        if (this.currentConversationId) {
            const currentConv = this.savedConversations.find(c => c.id === this.currentConversationId);
            this.tempConversationName = currentConv ? currentConv.name : '';
        } else {
            this.tempConversationName = '';
        }
        
        this.showSaveDialog = true;
        // Focus on input after dialog renders
        setTimeout(() => {
            if (this.saveDialogInput && this.saveDialogInput.nativeElement) {
                const input = this.saveDialogInput.nativeElement;
                input.focus();
                input.select();
            }
        }, 100);
    }
    

    public updateTempConversation() {
        this.tempConversationName = this.saveDialogInput?.nativeElement.value.trim() || '';        
    }

    /**
     * Handles the save dialog confirmation
     */
    public confirmSaveConversation() {
        // Use the temp name from the input
        const convoName = this.saveDialogInput?.nativeElement.value;
        const trimmedName = convoName?.trim() || '';
        
        if (!trimmedName) {
            return;
        }
        
        this.newConversationName = trimmedName;
        
        const conversation: SavedConversation = {
            id: this.generateMessageId(),
            name: this.newConversationName.trim(),
            agentId: this.entity?.ID || '',
            agentName: this.getEntityName() || '',
            messages: [...this.conversationMessages],
            dataContext: this.buildDataContext(),
            templateData: this.mode === 'agent' ? this.buildTemplateData() : {},
            templateVariables: this.mode === 'prompt' ? this.buildTemplateVariables() : {},
            advancedParams: this.mode === 'prompt' ? this.advancedParams : undefined,
            selectedModelId: this.mode === 'prompt' ? this.selectedModelId : undefined,
            selectedVendorId: this.mode === 'prompt' ? this.selectedVendorId : undefined,
            skipValidation: this.mode === 'prompt' ? this.skipValidation : undefined,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (this.currentConversationId) {
            // Update existing conversation
            const index = this.savedConversations.findIndex(c => c.id === this.currentConversationId);
            if (index >= 0) {
                conversation.id = this.currentConversationId;
                conversation.createdAt = this.savedConversations[index].createdAt;
                conversation.name = this.newConversationName.trim(); // Use the edited name
                this.savedConversations[index] = conversation;
            } else {
                // Current ID not found, treat as new
                this.savedConversations.unshift(conversation);
                this.currentConversationId = conversation.id;
            }
        } else {
            // Add new conversation
            this.savedConversations.unshift(conversation);
            this.currentConversationId = conversation.id;
        }

        // Limit to 50 saved conversations
        if (this.savedConversations.length > 50) {
            this.savedConversations = this.savedConversations.slice(0, 50);
        }

        // Save to localStorage
        this.saveConversationsToStorage();
        
        MJNotificationService.Instance.CreateSimpleNotification(
            'Conversation saved successfully',
            'success',
            3000
        );
        
        this.showSaveDialog = false;
        this.newConversationName = '';
        this.tempConversationName = '';
    }
    
    /**
     * Cancels the save dialog
     */
    public cancelSaveDialog() {
        this.showSaveDialog = false;
        this.newConversationName = '';
        this.tempConversationName = '';
    }
    
    // Removed debug methods - no longer needed with ngModel binding
    
    /**
     * Saves conversations to localStorage
     */
    private saveConversationsToStorage() {
        try {
            const storageKey = this.getStorageKey();
            localStorage.setItem(storageKey, JSON.stringify(this.savedConversations));
        } catch (error) {
            // Error saving conversations
            throw error;
        }
    }

    private autoSaveConversation() {
        if (this.currentConversationId && this.conversationMessages.length > 0) {
            const index = this.savedConversations.findIndex(c => c.id === this.currentConversationId);
            if (index >= 0) {
                this.savedConversations[index].messages = [...this.conversationMessages];
                this.savedConversations[index].dataContext = this.buildDataContext();
                if (this.mode === 'agent') {
                    this.savedConversations[index].templateData = this.buildTemplateData();
                } else {
                    this.savedConversations[index].templateVariables = this.buildTemplateVariables();
                    this.savedConversations[index].advancedParams = this.advancedParams;
                    this.savedConversations[index].selectedModelId = this.selectedModelId;
                    this.savedConversations[index].selectedVendorId = this.selectedVendorId;
                    this.savedConversations[index].skipValidation = this.skipValidation;
                }
                this.savedConversations[index].updatedAt = new Date();
                
                // Save to localStorage
                try {
                    this.saveConversationsToStorage();
                } catch (error) {
                    // Error auto-saving conversation
                }
            }
        }
    }

    public loadConversation(conversation: SavedConversation) {
        if (this.conversationMessages.length > 0) {
            this.pendingLoadConversation = conversation;
            this.showLoadConfirmDialog = true;
            return;
        }

        this.doLoadConversation(conversation);
    }
    
    /**
     * Confirms loading a conversation after dialog confirmation
     */
    public confirmLoadConversation() {
        if (this.pendingLoadConversation) {
            this.doLoadConversation(this.pendingLoadConversation);
            this.showLoadConfirmDialog = false;
            this.pendingLoadConversation = null;
        }
    }
    
    /**
     * Cancels loading a conversation
     */
    public cancelLoadConversation() {
        this.showLoadConfirmDialog = false;
        this.pendingLoadConversation = null;
    }
    
    /**
     * Actually loads the conversation
     */
    private doLoadConversation(conversation: SavedConversation) {
        this.conversationMessages = [...conversation.messages];
        this.currentConversationId = conversation.id;
        
        // Restore agent variables (unified from dataContext and templateData)
        this.agentVariables = [];
        const allVariables = { ...conversation.dataContext, ...(conversation.templateData || {}) };
        for (const [key, value] of Object.entries(allVariables)) {
            this.agentVariables.push({
                name: key,
                value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                type: typeof value === 'boolean' ? 'boolean' : 
                      typeof value === 'number' ? 'number' :
                      typeof value === 'object' ? 'object' : 'string'
            });
        }
        
        // Restore template variables for prompt mode
        if (this.mode === 'prompt') {
            this.templateVariables = [];
            for (const [key, value] of Object.entries(conversation.templateVariables || {})) {
                this.templateVariables.push({
                    name: key,
                    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                    type: typeof value === 'boolean' ? 'boolean' : 
                          typeof value === 'number' ? 'number' :
                          typeof value === 'object' ? 'object' : 'string'
                });
            }
            
            // Restore advanced parameters
            if (conversation.advancedParams) {
                this.advancedParams = { ...this.advancedParams, ...conversation.advancedParams };
                // Restore stop sequences text
                this.stopSequencesText = this.advancedParams.stopSequences?.join(', ') || '';
            }
            
            // Restore model and vendor selection
            if (conversation.selectedModelId !== undefined) {
                this.selectedModelId = conversation.selectedModelId;
                // Trigger vendor loading if model is selected
                if (this.selectedModelId) {
                    this.onModelSelectionChange();
                    // After vendors load, restore vendor selection
                    setTimeout(() => {
                        if (conversation.selectedVendorId !== undefined) {
                            this.selectedVendorId = conversation.selectedVendorId;
                        }
                    }, 100);
                }
            }
            if (conversation.selectedVendorId !== undefined && !this.selectedModelId) {
                this.selectedVendorId = conversation.selectedVendorId;
            }
            
            // Restore skip validation setting
            if (conversation.skipValidation !== undefined) {
                this.skipValidation = conversation.skipValidation;
            }
        }
        
        // Load execution data from the last assistant message if available
        const lastAssistantMessage = this.conversationMessages
            .filter(m => m.role === 'assistant' && m.executionData)
            .pop();
            
        if (lastAssistantMessage && lastAssistantMessage.executionData) {
            
            this.currentExecutionData = lastAssistantMessage.executionData;
            this.executionMonitorMode = 'historical';
            
            // If execution monitor tab is active, ensure it updates
            if (this.activeTab === 'executionMonitor') {
                // Force change detection
                setTimeout(() => {
                    this.currentExecutionData = { ...lastAssistantMessage.executionData };
                }, 0);
            }
        } else {
            // Clear execution data if no execution found
            this.currentExecutionData = null;
            this.executionMonitorMode = 'historical';
        }

        this.scrollNeeded = true;
        
        MJNotificationService.Instance.CreateSimpleNotification(
            'Conversation loaded',
            'info',
            3000
        );
    }

    public async deleteConversation(conversation: SavedConversation, event: Event) {
        event.stopPropagation();
        
        if (confirm(`Delete conversation "${conversation.name}"?`)) {
            const index = this.savedConversations.findIndex(c => c.id === conversation.id);
            if (index >= 0) {
                this.savedConversations.splice(index, 1);
                
                // Save to localStorage
                this.saveConversationsToStorage();
                
                if (this.currentConversationId === conversation.id) {
                    this.currentConversationId = null;
                }
                
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Conversation deleted',
                    'info',
                    3000
                );
            }
        }
    }

    public exportConversation() {
        if (this.conversationMessages.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No messages to export',
                'warning',
                3000
            );
            return;
        }

        const exportData: any = {
            entity: {
                id: this.entity?.ID,
                name: this.getEntityName(),
                type: this.mode
            },
            messages: this.conversationMessages,
            dataContext: this.buildDataContext(),
            exportedAt: new Date().toISOString()
        };
        
        // Add mode-specific data
        if (this.mode === 'agent') {
            exportData.templateData = this.buildTemplateData();
        } else {
            exportData.templateVariables = this.buildTemplateVariables();
            exportData.modelSettings = {
                modelId: this.selectedModelId,
                vendorId: this.selectedVendorId,
                maxTokens: this.maxTokens,
                skipValidation: this.skipValidation
            };
            exportData.advancedParams = this.advancedParams;
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const entityName = this.getEntityName()?.replace(/[^a-zA-Z0-9]/g, '-') || 'conversation';
        link.download = `${this.mode}-conversation-${entityName}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
    }

    public importConversation() {
        this.fileInput.nativeElement.click();
    }

    public onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target?.result as string);
                    
                    // Validate and import
                    if (data.messages && Array.isArray(data.messages)) {
                        if (this.conversationMessages.length > 0) {
                            if (!confirm('Importing will replace the current conversation. Continue?')) {
                                return;
                            }
                        }
                        
                        this.conversationMessages = data.messages.map((msg: any) => ({
                            ...msg,
                            timestamp: new Date(msg.timestamp)
                        }));
                        
                        // Import agent variables (unified from dataContext and templateData)
                        this.agentVariables = [];
                        const importedVariables = { ...(data.dataContext || {}), ...(data.templateData || {}) };
                        for (const [key, value] of Object.entries(importedVariables)) {
                            this.agentVariables.push({
                                name: key,
                                value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                                type: typeof value === 'boolean' ? 'boolean' : 
                                      typeof value === 'number' ? 'number' :
                                      typeof value === 'object' ? 'object' : 'string'
                            });
                        }
                        
                        // Template data is already imported into agentVariables above
                        
                        // Import advanced parameters if in prompt mode
                        if (this.mode === 'prompt' && data.advancedParams) {
                            this.advancedParams = { ...this.advancedParams, ...data.advancedParams };
                            this.stopSequencesText = this.advancedParams.stopSequences?.join(', ') || '';
                        }
                        
                        this.currentConversationId = null;
                        this.scrollNeeded = true;
                        
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'Conversation imported successfully',
                            'success',
                            3000
                        );
                    } else {
                        throw new Error('Invalid conversation format');
                    }
                } catch (error) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to import conversation: ' + (error as Error).message,
                        'error',
                        5000
                    );
                }
                
                // Reset file input
                input.value = '';
            };
            
            reader.readAsText(file);
        }
    }

    /**
     * Handles keyboard input in the message textarea.
     * Sends message on Enter (without Shift) and allows multi-line input with Shift+Enter.
     * @param event - Keyboard event from the textarea
     */
    public handleKeyPress(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    /**
     * Generates CSS class names for message display based on message properties.
     * @param message - The conversation message to generate classes for
     * @returns Space-separated CSS class string for styling
     */
    public getMessageClass(message: ConversationMessage): string {
        return `message message-${message.role}${message.isStreaming ? ' streaming' : ''}${message.error ? ' error' : ''}`;
    }

    /**
     * Formats a Date object into a user-friendly time string.
     * @param date - Date object to format
     * @returns Formatted time string in HH:MM format
     */
    public formatTimestamp(date: Date): string {
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    /**
     * Formats execution time from milliseconds into a human-readable string.
     * Automatically selects appropriate units (minutes, seconds, or milliseconds).
     * @param milliseconds - Execution time in milliseconds
     * @returns Formatted time string (e.g., "2m 30.5s", "1.23s", "500ms")
     */
    public formatExecutionTime(milliseconds: number): string {
        if (milliseconds >= 60000) {
            const minutes = Math.floor(milliseconds / 60000);
            const seconds = ((milliseconds % 60000) / 1000).toFixed(2);
            return `${minutes}m ${seconds}s`;
        } else if (milliseconds >= 1000) {
            return `${(milliseconds / 1000).toFixed(2)}s`;
        } else {
            return `${milliseconds}ms`;
        }
    }

    public formatElapsedTime(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const ms = milliseconds % 1000;
        if (seconds > 0) {
            return `${seconds}.${Math.floor(ms / 100)}s`;
        } else {
            return `${ms}ms`;
        }
    }

    private startElapsedTimeCounter(message: ConversationMessage) {
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }
        
        this.elapsedTimeInterval = setInterval(() => {
            if (message.streamingStartTime && message.isStreaming) {
                message.elapsedTime = Date.now() - message.streamingStartTime;
            } else {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }
        }, 100); // Update every 100ms for smooth counter
    }

    /**
     * Shows the raw JSON dialog for a specific message
     * @param message - The message to show raw JSON for
     */
    public showRawJsonDialog(message: ConversationMessage) {
        if (message.rawContent) {
            // Close any existing window
            if (this.jsonWindowRef) {
                this.jsonWindowRef.close();
            }

            try {
                // Try to parse and format the JSON
                const parsed = JSON.parse(message.rawContent);
                
                // If this is an agent result with execution tree, enhance the display
                if (parsed.executionTree) {
                    this.currentJsonContent = JSON.stringify({
                        ...parsed,
                        _executionTreeSummary: this.summarizeExecutionTree(parsed.executionTree)
                    }, null, 2);
                } else {
                    this.currentJsonContent = JSON.stringify(parsed, null, 2);
                }
            } catch {
                // If not valid JSON, show as-is
                this.currentJsonContent = message.rawContent;
            }

            // Import the JsonViewerWindowComponent dynamically
            import('./json-viewer-window.component').then(({ JsonViewerWindowComponent }) => {
                // Create the window using WindowService
                // Calculate center position accounting for scroll
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                const centerTop = Math.max(50, (window.innerHeight - 700) / 2 + scrollTop);
                const centerLeft = Math.max(50, (window.innerWidth - 900) / 2 + scrollLeft);

                this.jsonWindowRef = this.windowService.open({
                    title: 'Raw JSON Response',
                    content: JsonViewerWindowComponent,
                    width: 900,
                    height: 700,
                    minWidth: 600,
                    minHeight: 400,
                    resizable: true,
                    draggable: true,
                    top: centerTop,
                    left: centerLeft
                });

                // Pass the JSON content to the component
                const windowContent = this.jsonWindowRef.content.instance;
                windowContent.jsonContent = this.currentJsonContent;

                // Handle window close
                this.jsonWindowRef.result.subscribe((result: WindowCloseResult) => {
                    this.jsonWindowRef = null;
                    this.currentJsonContent = '';
                });
            });
        }
    }
    
    /**
     * Creates a summary of the execution tree for easier viewing
     * @param executionTree - The execution tree to summarize
     * @returns A human-readable summary of the execution
     */
    private summarizeExecutionTree(executionTree: any[]): any {
        if (!executionTree || !Array.isArray(executionTree)) return null;
        
        const summary = {
            totalSteps: 0,
            stepsByType: {} as Record<string, number>,
            hierarchy: [] as any[]
        };
        
        const processNode = (node: any, level: number = 0) => {
            summary.totalSteps++;
            
            // Count by type
            const type = node.executionType || 'unknown';
            summary.stepsByType[type] = (summary.stepsByType[type] || 0) + 1;
            
            // Create hierarchical summary
            const nodeSummary = {
                level,
                stepName: node.step?.StepName || 'Unknown Step',
                type: node.executionType,
                duration: node.durationMs ? `${node.durationMs}ms` : 'N/A',
                status: node.step?.Status || 'Unknown',
                agentPath: node.agentHierarchy?.join(' → ') || '',
                hasInputData: !!node.inputData,
                hasOutputData: !!node.outputData
            };
            
            summary.hierarchy.push(nodeSummary);
            
            // Process children recursively
            if (node.children && node.children.length > 0) {
                node.children.forEach((child: any) => processNode(child, level + 1));
            }
        };
        
        executionTree.forEach(node => processNode(node));
        
        return summary;
    }
    
    /**
     * Copies the message content to clipboard.
     * @param message - The message to copy
     */
    public async copyMessage(message: ConversationMessage) {
        try {
            // Convert content to string if needed
            const content = typeof message.content === 'string' 
                ? message.content 
                : JSON.stringify(message.content);
            
            await navigator.clipboard.writeText(content);
            
            MJNotificationService.Instance.CreateSimpleNotification(
                'Message copied to clipboard',
                'success',
                2000
            );
        } catch (error) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to copy message',
                'error',
                3000
            );
        }
    }
    

    /**
     * Focuses the message input textarea.
     */
    private focusMessageInput(): void {
        if (this.messageInput) {
            setTimeout(() => {
                this.messageInput.focus();
            }, 100);
        }
    }

    /**
     * Determines if the provided content is valid JSON.
     * @param content - String content to test
     * @returns True if content can be parsed as JSON, false otherwise
     */
    public isJsonContent(content: string): boolean {
        if (!content) return false;
        try {
            JSON.parse(content);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Formats JSON content with proper indentation for display.
     * @param content - JSON string to format
     * @returns Formatted JSON string or original content if parsing fails
     */
    public formatJson(content: string): string {
        try {
            return JSON.stringify(JSON.parse(content), null, 2);
        } catch {
            return content;
        }
    }

    /**
     * Automatically detects the content type of a message for appropriate rendering.
     * Uses pattern matching to identify JSON, Markdown, or plain text content.
     * @param content - Content string to analyze
     * @returns Detected content type ('markdown', 'json', or 'text')
     */
    public detectContentType(content: string): 'markdown' | 'json' | 'text' {
        if (!content) return 'text';
        
        // Check if it's JSON
        if (this.isJsonContent(content)) {
            return 'json';
        }
        
        // Check for markdown indicators
        const markdownPatterns = [
            /^#{1,6}\s/m,  // Headers
            /\*\*[^*]+\*\*/,  // Bold
            /\*[^*]+\*/,  // Italic
            /\[([^\]]+)\]\(([^)]+)\)/,  // Links
            /```[\s\S]*?```/,  // Code blocks
            /`[^`]+`/,  // Inline code
            /^[-*+]\s/m,  // Lists
            /^\d+\.\s/m  // Numbered lists
        ];
        
        if (markdownPatterns.some(pattern => pattern.test(content))) {
            return 'markdown';
        }
        
        return 'text';
    }

    public renderMarkdown(content: string): SafeHtml {
        // Basic markdown to HTML conversion with improved formatting
        let html = content;
        
        // Escape HTML first
        html = html.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;');
        
        // Code blocks with language support
        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || '';
            const className = language ? ` class="language-${language}"` : '';
            return `<pre class="code-block"><code${className}>${code.trim()}</code></pre>`;
        });
        
        // Regular code blocks without language
        html = html.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3 class="markdown-h3">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 class="markdown-h2">$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1 class="markdown-h1">$1</h1>');
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="markdown-link">$1</a>');
        
        // Unordered lists
        html = html.replace(/^[*-+] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul class="markdown-list">$1</ul>');
        
        // Numbered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ol class="markdown-list">$1</ol>');
        
        // Paragraphs and line breaks - improved handling
        html = html.replace(/\n\s*\n/g, '</p><p class="markdown-paragraph">');
        html = html.replace(/\n/g, '<br>');
        html = `<p class="markdown-paragraph">${html}</p>`;
        
        // Clean up empty paragraphs
        html = html.replace(/<p class="markdown-paragraph"><\/p>/g, '');
        
        return this.sanitizer.bypassSecurityTrustHtml(`<div class="markdown-content">${html}</div>`);
    }

    public getFormattedContent(message: ConversationMessage): SafeHtml {
        const content = message.content;
        const contentStr = typeof content === 'string' ? content : String(content);
        const contentType = this.detectContentType(contentStr);
        
        if (contentType === 'json') {
            // Try to extract human-readable content from JSON
            const extractedContent = this.extractHumanReadableContent(contentStr);
            if (extractedContent) {
                // Just render the extracted content
                return this.renderMarkdown(extractedContent);
            } else {
                // Fallback to inline code editor for JSON display
                return this.renderJsonWithCodeEditor(contentStr);
            }
        } else if (contentType === 'markdown') {
            return this.renderMarkdown(contentStr);
        } else {
            // Convert plain text to markdown for consistent formatting
            return this.renderMarkdown(contentStr);
        }
    }

    /**
     * Renders JSON content using an inline code editor component
     */
    private renderJsonWithCodeEditor(jsonStr: string): SafeHtml {
        try {
            // Format the JSON for display
            const formattedJson = this.formatJson(jsonStr);
            
            // Generate a unique ID for this editor instance
            const editorId = `json-editor-${this.generateMessageId()}`;
            
            // Create the HTML with a placeholder div that we'll replace with the code editor
            const html = `
                <div class="inline-json-editor" data-editor-id="${editorId}" data-json-content="${this.escapeHtmlAttribute(formattedJson)}">
                    <div class="json-editor-container" style="height: 300px; width: 100%; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden;">
                        <pre style="margin: 0; padding: 12px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; overflow: auto; height: 100%;">${this.escapeHtml(formattedJson)}</pre>
                    </div>
                </div>
            `;
            
            // Note: In a real implementation, we would need to dynamically create the code editor component
            // For now, we'll use a styled pre tag as a fallback
            return this.sanitizer.bypassSecurityTrustHtml(html);
        } catch {
            // If JSON parsing fails, show as plain text
            const html = `<pre style="margin: 0; padding: 12px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; overflow: auto; background: #f8f9fa; border-radius: 4px;">${this.escapeHtml(jsonStr)}</pre>`;
            return this.sanitizer.bypassSecurityTrustHtml(html);
        }
    }
    
    /**
     * Escapes HTML content for use in attributes
     */
    private escapeHtmlAttribute(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * Renders JSON content with human-readable content prominently displayed
     * and raw JSON in a collapsible section below with proper text wrapping.
     */
    
    /**
     * Gets a summary of the execution for tooltip display
     * @param message - The message to get execution summary for
     * @returns A brief summary of the execution steps
     */
    public getExecutionSummary(message: ConversationMessage): string {
        if (!message.rawContent) return '';
        
        try {
            const parsed = JSON.parse(message.rawContent);
            if (parsed.executionTree) {
                const summary = this.summarizeExecutionTree(parsed.executionTree);
                const stepCounts = Object.entries(summary.stepsByType)
                    .map(([type, count]) => `${count} ${type}`)
                    .join(', ');
                return `${summary.totalSteps} steps executed (${stepCounts})`;
            }
        } catch {
            // Ignore parse errors
        }
        
        return '';
    }

    /**
     * Closes the JSON dialog
     */
    public closeJsonDialog() {
        if (this.jsonWindowRef) {
            this.jsonWindowRef.close();
            this.jsonWindowRef = null;
        }
        this.showJsonDialog = false;
        this.currentJsonContent = '';
    }
    
    /**
     * Copies the JSON content to clipboard
     */
    public copyJsonContent() {
        if (this.currentJsonContent) {
            navigator.clipboard.writeText(this.currentJsonContent).then(() => {
                // Success - JSON copied
            }).catch((err) => {
                // Error copying
            });
        }
    }

    /**
     * Extracts human-readable content from JSON responses.
     * Prioritizes userMessage field first, then checks other common fields.
     * @param jsonStr - JSON string to extract content from
     * @returns Extracted human-readable content or null if none found
     */
    private extractHumanReadableContent(jsonStr: string): string | null {
        try {
            const parsed = JSON.parse(jsonStr);
            
            // Priority 1: Always check userMessage first, regardless of taskComplete status
            if (parsed.userMessage && typeof parsed.userMessage === 'string' && parsed.userMessage.trim()) {
                return parsed.userMessage;
            }
            
            // Priority 2: Check for nested userMessage in nextStep or other objects
            if (parsed.nextStep && parsed.nextStep.userMessage && 
                typeof parsed.nextStep.userMessage === 'string' && parsed.nextStep.userMessage.trim()) {
                return parsed.nextStep.userMessage;
            }
            
            // Priority 3: Other common human-readable fields
            const contentFields = [
                'message', 'content', 'response', 'text', 'output',
                'result', 'answer', 'reply', 'description', 'summary'
            ];
            
            for (const field of contentFields) {
                if (parsed[field] && typeof parsed[field] === 'string' && parsed[field].trim()) {
                    return parsed[field];
                }
            }
            
            // Priority 4: Check nested objects for content
            for (const key of Object.keys(parsed)) {
                if (typeof parsed[key] === 'object' && parsed[key] !== null) {
                    for (const field of ['userMessage', 'message', 'content']) {
                        if (parsed[key][field] && typeof parsed[key][field] === 'string' && parsed[key][field].trim()) {
                            return parsed[key][field];
                        }
                    }
                }
            }
            
            // Priority 5: If it's a simple string value, return it
            if (typeof parsed === 'string' && parsed.trim()) {
                return parsed;
            }
            
            // Priority 6: If it's an object with a single string property, consider returning it
            const keys = Object.keys(parsed);
            if (keys.length === 1 && typeof parsed[keys[0]] === 'string' && parsed[keys[0]].trim()) {
                return parsed[keys[0]];
            }
            
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Checks if a message contains JSON content that has extractable human-readable content.
     * Used to determine if the raw toggle should be shown.
     * @param message - The conversation message to check
     * @returns True if the message has extractable content different from raw JSON
     */
    public hasExtractableContent(message: ConversationMessage): boolean {
        if (!message.content || message.role === 'user') {
            return false;
        }
        
        const contentStr = typeof message.content === 'string' ? message.content : String(message.content);
        if (!this.isJsonContent(contentStr)) {
            return false;
        }
        
        const extractedContent = this.extractHumanReadableContent(contentStr);
        return extractedContent !== null && extractedContent !== contentStr;
    }

    /**
     * Determines whether to show the raw toggle button for a message.
     * Combines the logic for raw content availability and extractable content.
     * @param message - The conversation message to check
     * @returns True if the raw toggle should be displayed
     */
    public showRawToggle(message: ConversationMessage): boolean {
        return (message.rawContent && !message.isStreaming) || this.hasExtractableContent(message);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formats JSON for proper display with text wrapping instead of wide code blocks.
     * Creates a structured, readable format that respects container width.
     */
    private formatJsonForDisplay(jsonStr: string): string {
        try {
            const parsed = JSON.parse(jsonStr);
            return this.createJsonDisplayHtml(parsed, 0);
        } catch {
            // If JSON parsing fails, escape and display as-is with wrapping
            return `<div class="json-fallback">${this.escapeHtml(jsonStr)}</div>`;
        }
    }

    /**
     * Creates formatted HTML for JSON display with proper indentation and wrapping.
     */
    private createJsonDisplayHtml(obj: any, depth: number = 0): string {
        const indent = '  '.repeat(depth);
        const nextIndent = '  '.repeat(depth + 1);
        
        if (obj === null) return `<span class="json-null">null</span>`;
        if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;
        if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
        if (typeof obj === 'string') {
            const escaped = this.escapeHtml(obj);
            return `<span class="json-string">"<span class="json-string-content">${escaped}</span>"</span>`;
        }
        
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '<span class="json-bracket">[]</span>';
            
            const items = obj.map(item => 
                `<div class="json-array-item">${nextIndent}${this.createJsonDisplayHtml(item, depth + 1)}</div>`
            ).join(',\n');
            
            return `<span class="json-bracket">[</span>\n${items}\n<div class="json-indent">${indent}</div><span class="json-bracket">]</span>`;
        }
        
        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            if (keys.length === 0) return '<span class="json-bracket">{}</span>';
            
            const properties = keys.map(key => {
                const escapedKey = this.escapeHtml(key);
                const value = this.createJsonDisplayHtml(obj[key], depth + 1);
                return `<div class="json-property">${nextIndent}<span class="json-key">"${escapedKey}"</span><span class="json-colon">:</span> ${value}</div>`;
            }).join(',\n');
            
            return `<span class="json-bracket">{</span>\n${properties}\n<div class="json-indent">${indent}</div><span class="json-bracket">}</span>`;
        }
        
        return String(obj);
    }
    
    /**
     * Type guard to check if entity is an AI Agent
     */
    private isAgentEntity(entity: any): entity is AIAgentEntity {
        // Check using the EntityInfo property from BaseEntity
        return entity && entity.EntityInfo && entity.EntityInfo.Name === 'AI Agents';
    }
    
    /**
     * Type guard to check if entity is an AI Prompt
     */
    private isPromptEntity(entity: any): entity is AIPromptEntity {
        // Check using the EntityInfo property from BaseEntity
        const result = entity && entity.EntityInfo && entity.EntityInfo.Name === 'AI Prompts';
        
        return result;
    }
    
    /**
     * Gets the display name of the current entity
     */
    public getEntityName(): string {
        if (!this.entity) return '';
        return this.entity.Name || 'Untitled';
    }
    
    /**
     * Updates stop sequences from the textarea input
     */
    public updateStopSequences() {
        if (this.stopSequencesText.trim() === '') {
            this.advancedParams.stopSequences = [];
        } else {
            // Split by comma and trim each sequence
            this.advancedParams.stopSequences = this.stopSequencesText
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        }
    }
    
    /**
     * Toggles the advanced parameters expansion panel
     */
    public toggleAdvancedParams() {
        this.advancedParamsExpanded = !this.advancedParamsExpanded;
    }
}