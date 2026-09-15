import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewChecked, SecurityContext, ChangeDetectorRef } from '@angular/core';
import { RecordNavigationAdapter } from '@memberjunction/ng-base-types';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended, MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended, MJAIPromptRunEntityExtended } from "@memberjunction/ai-core-plus";
import { MJTemplateParamEntity, MJAIConfigurationEntity, MJTaskEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { ChatMessage } from '@memberjunction/ai';
import { Subject, Subscription } from 'rxjs';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ParseJSONRecursive, ParseJSONOptions, UUIDsEqual, EscapeHTML } from '@memberjunction/global';
import {
    ParentTaskIDFromStepOutput,
    ReadPaneSizePair,
    ToPaneSizePair,
    type PaneSizePair,
} from '@memberjunction/ng-task-graph-editor';

type StreamedStep = {
    StepType?: string;
    OutputData?: string | Record<string, unknown> | null;
};

/** `GetAll()` on the agent run puts steps in `__runSteps`, not `Steps`. */
function streamedRunSteps(serialized: unknown): StreamedStep[] {
    if (!serialized || typeof serialized !== 'object') return [];
    const record = serialized as Record<string, unknown>;
    const raw = record['__runSteps'] ?? record['Steps'];
    return Array.isArray(raw) ? raw as StreamedStep[] : [];
}

function streamedRunID(serialized: unknown): string | undefined {
    if (!serialized || typeof serialized !== 'object') return undefined;
    const id = (serialized as Record<string, unknown>)['ID'];
    return typeof id === 'string' ? id : undefined;
}

interface AITestHarnessPrefs {
    StartingPayloadOpen: boolean;
}

function ReadHarnessPrefs(raw: string | undefined): AITestHarnessPrefs {
    const defaults: AITestHarnessPrefs = { StartingPayloadOpen: false };
    if (!raw) return defaults;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
        const obj = parsed as Record<string, unknown>;
        return { StartingPayloadOpen: obj['StartingPayloadOpen'] === true };
    } catch {
        return defaults;
    }
}

/**
 * Supported modes for the test harness
 */
/**
 * What the harness is testing.
 *
 * `'workflow'` is not a variant of `'agent'` — it is a different interaction entirely. You do not
 * converse with a Flow agent: its first step is compiled from its own graph, so anything typed into
 * a composer is discarded, and the one reply it produces ("Started — 4 tasks running") is not an
 * answer to it. Offering a chat transcript there teaches the wrong model of what a workflow is.
 */
export type TestHarnessMode = 'agent' | 'prompt' | 'workflow';

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
    /** Payload data from agent execution to display separately */
    payload?: any;
    /** Whether the payload section is collapsed */
    payloadCollapsed?: boolean;
    /** Execution data for agent runs */
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
    /** Selected configuration ID (prompt mode) */
    selectedConfigurationId?: string;
    /** Skip validation setting (prompt mode) */
    skipValidation?: boolean;
    /** Selected configuration ID (agent mode) */
    agentConfigurationId?: string;
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
 * const agent = await metadata.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
 * await agent.Load('agent-id');
 * this.testHarness.aiAgent = agent;
 * this.testHarness.isVisible = true;
 * ```
 */
@Component({
  standalone: false,
    selector: 'mj-ai-test-harness',
    templateUrl: './ai-test-harness.component.html',
    styleUrls: ['./ai-test-harness.component.css']
})
export class AITestHarnessComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges, AfterViewChecked  {
    /**
     * Creates a new AI Test Harness component instance.
     * @param sanitizer - Angular DomSanitizer for safe HTML rendering of formatted content
     * @param cdr - Angular ChangeDetectorRef for managing change detection
     */
    constructor(
        private sanitizer: DomSanitizer,
        private cdr: ChangeDetectorRef,
        private confirmService: MJConfirmService
    ) {
        super();
        try {
            const saved = ReadPaneSizePair(UserInfoEngine.Instance.GetSetting(AITestHarnessComponent.SPLIT_KEY));
            if (saved) this.HarnessSplitSizes = saved;
            this.StartingPayloadOpen = ReadHarnessPrefs(
                UserInfoEngine.Instance.GetSetting(AITestHarnessComponent.PREFS_KEY),
            ).StartingPayloadOpen;
        } catch {
            // Engine not configured yet (unit tests, pre-bootstrap) — keep the default.
        }
    }
    
    /** The mode of operation - either 'agent' or 'prompt' */
    @Input() Mode: TestHarnessMode = 'agent';

    /** @deprecated Use {@link Mode}. */
    @Input() set mode(value: TestHarnessMode) {
      this.Mode = value;
    }
    /** @deprecated Use {@link Mode}. */
    get mode(): TestHarnessMode {
      return this.Mode;
    }
    
    /** The entity to test - either an AI Agent or AI Prompt */
    @Input() entity: MJAIAgentEntityExtended | MJAIPromptEntityExtended | null = null;
    
    /** The original prompt run ID when re-running a previous prompt execution */
    @Input() OriginalPromptRunId: string | null = null;

    /** @deprecated Use {@link OriginalPromptRunId}. */
    @Input() set originalPromptRunId(value: string | null) {
      this.OriginalPromptRunId = value;
    }
    /** @deprecated Use {@link OriginalPromptRunId}. */
    get originalPromptRunId(): string | null {
      return this.OriginalPromptRunId;
    }
    
    /** The system prompt override to use instead of rendering from template */
    @Input() SystemPromptOverride: string | null = null;

    /** @deprecated Use {@link SystemPromptOverride}. */
    @Input() set systemPromptOverride(value: string | null) {
      this.SystemPromptOverride = value;
    }
    /** @deprecated Use {@link SystemPromptOverride}. */
    get systemPromptOverride(): string | null {
      return this.SystemPromptOverride;
    }
    
    /** Whether a re-run has been executed (shows Reset button instead of Re-Run) */
    public HasExecutedRerun: boolean = false;

    /** @deprecated Use {@link HasExecutedRerun}. */
    public get hasExecutedRerun(): boolean {
      return this.HasExecutedRerun;
    }
    /** @deprecated Use {@link HasExecutedRerun}. */
    public set hasExecutedRerun(value: boolean) {
      this.HasExecutedRerun = value;
    }
    
    /** Original messages from the prompt run for reset functionality */
    private originalPromptRunMessages: ConversationMessage[] = [];
    
    /** @deprecated Use 'entity' instead. Kept for backward compatibility. */
    @Input() 
    get aiAgent(): MJAIAgentEntityExtended | null {
        return this.isAgentEntity(this.entity) ? this.entity : null;
    }
    set aiAgent(value: MJAIAgentEntityExtended | null) {
        this.entity = value;
        if (value) {
            this.Mode = 'agent';
        }
    }
    
    /**
     * True when the loaded agent is a Flow agent, which is decided by its type rather than by a
     * caller remembering to set one more input. `vwAIAgents` carries the type's name, so this costs
     * no extra query.
     */
    public get IsWorkflowAgent(): boolean {
        const agent = this.isAgentEntity(this.entity) ? this.entity : null;
        return (agent?.Type ?? '').trim().toLowerCase() === 'flow';
    }

    /** The effective mode, with a Flow agent selecting `'workflow'` whatever the caller asked for. */
    public get EffectiveMode(): TestHarnessMode {
        return this.Mode === 'agent' && this.IsWorkflowAgent ? 'workflow' : this.Mode;
    }

    /**
     * What the execution monitor is watching.
     *
     * A workflow run IS an agent run — it is the same `AIAgentRun` row, just one that compiled a
     * graph instead of reasoning. Widening the monitor's own contract would imply otherwise.
     */
    public get MonitorRunType(): 'agent' | 'prompt' {
        return this.Mode === 'prompt' ? 'prompt' : 'agent';
    }

    /** Optional starting payload for a workflow run, as JSON the user can edit. */
    public WorkflowStartingPayload: string = '';
    /** Parse error for the payload editor, shown inline rather than swallowed at submit time. */
    public WorkflowPayloadError: string | null = null;
    /** The graph the most recent run submitted, so the harness can show it running. */
    public WorkflowParentTaskID: string | null = null;
    /** True after Debug — chrome, breakpoints, and the start-paused seed stay on for this run. */
    public WorkflowDebuggerActive = false;
    public WorkflowSettled = false;
    /** Parsed starting payload, handed to the run as template data on the next send. */
    private workflowStartingData: Record<string, unknown> | null = null;
    /** Consumed by executeAgent; set only by DebugWorkflow so Pause-after-submit cannot race. */
    private startWorkflowPaused = false;
    private workflowAttachTimer: ReturnType<typeof setInterval> | null = null;

    /** [chat, sidebar] percentages. Restored from `MJ: User Settings`. */
    public HarnessSplitSizes: PaneSizePair = [70, 30];
    private static readonly SPLIT_KEY = 'mj.aiTestHarness.splitSizes.v1';
    private static readonly PREFS_KEY = 'mj.aiTestHarness.prefs.v1';
    /** Starting-payload editor is collapsed unless the person opens it. */
    public StartingPayloadOpen = false;

    public OnToggleStartingPayload(): void {
        this.StartingPayloadOpen = !this.StartingPayloadOpen;
        UserInfoEngine.Instance.SetSettingDebounced(
            AITestHarnessComponent.PREFS_KEY,
            JSON.stringify({ StartingPayloadOpen: this.StartingPayloadOpen } satisfies AITestHarnessPrefs),
        );
        this.cdr.markForCheck();
    }

    public OnHarnessSplitDragEnd(sizes: readonly (number | '*')[]): void {
        const pair = ToPaneSizePair(sizes);
        if (!pair) return;
        this.HarnessSplitSizes = pair;
        UserInfoEngine.Instance.SetSettingDebounced(AITestHarnessComponent.SPLIT_KEY, JSON.stringify(pair));
    }

    /**
     * Starts the workflow.
     *
     * Deliberately not routed through the chat send path: there is no message, and pushing an empty
     * user turn into a transcript to trigger a run is exactly the fiction this mode removes.
     */
    public async RunWorkflow(): Promise<void> {
        this.WorkflowPayloadError = null;
        let payload: Record<string, unknown> | undefined;

        const raw = this.WorkflowStartingPayload.trim();
        if (raw.length > 0) {
            try {
                const parsed: unknown = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    this.WorkflowPayloadError = 'The starting payload must be a JSON object, like { "ticker": "NVDA" }.';
                    return;
                }
                payload = parsed as Record<string, unknown>;
            } catch (e) {
                this.WorkflowPayloadError = `That is not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
                return;
            }
        }

        this.stopWorkflowAttachPoll();
        this.WorkflowParentTaskID = null;
        if (!this.startWorkflowPaused) {
            this.WorkflowDebuggerActive = false;
            this.WorkflowSettled = false;
        }
        this.workflowStartingData = payload ?? null;
        // Reuse the existing send path: it already owns streaming, the execution monitor, run
        // capture and error handling. A second invocation path here would be a second thing to keep
        // correct, and the two would drift.
        this.CurrentUserMessage = 'Run the workflow.';
        await this.SendMessage();
        this.startWorkflowPaused = false;
    }

    /**
     * Starts the workflow paused. `$.debug.paused` is written at Submit — Pause-after-submit
     * races the first dispatcher poll, so this cannot be a follow-up control.
     */
    public async DebugWorkflow(): Promise<void> {
        this.startWorkflowPaused = true;
        this.WorkflowDebuggerActive = true;
        this.WorkflowSettled = false;
        await this.RunWorkflow();
    }

    public OnWorkflowCanvasSettled(): void {
        this.WorkflowSettled = true;
        this.cdr.detectChanges();
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
            this.ResetHarness();
        }
    }

    /** Event emitted when the visibility state changes, allowing parent components to react */
    @Output() VisibilityChange = new EventEmitter<boolean>();

    /**
     * @deprecated Use {@link VisibilityChange}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (visibilityChange) keeps working. Must stay AFTER VisibilityChange: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() visibilityChange = this.VisibilityChange;
    
    /**
     * Emitted when the user navigates to view a run (agent or prompt)
     */
    @Output() RunOpened = new EventEmitter<{ runId: string; runType: 'agent' | 'prompt' }>();

    /**
     * @deprecated Use {@link RunOpened}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (runOpened) keeps working. Must stay AFTER RunOpened: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() runOpened = this.RunOpened;
    
    /**
     * Event emitted when the component requests to be minimized (e.g., when navigating to a run)
     */
    @Output() MinimizeRequested = new EventEmitter<void>();

    /**
     * @deprecated Use {@link MinimizeRequested}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (minimizeRequested) keeps working. Must stay AFTER MinimizeRequested: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() minimizeRequested = this.MinimizeRequested;
    
    /** Reference to the scrollable messages container for auto-scrolling functionality */
    @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
    
    /** Reference to the hidden file input element for conversation import functionality */
    @ViewChild('fileInput') private fileInput!: ElementRef;
    
    /** Reference to the message input textarea */
    @ViewChild('messageInput') private messageInput!: ElementRef<HTMLTextAreaElement>;
    
    /** Reference to the save dialog input */
    @ViewChild('saveDialogInput') private saveDialogInput?: ElementRef;

    // === Conversation State ===
    /** Complete array of all messages in the current conversation session */
    public ConversationMessages: ConversationMessage[] = [];

    /** @deprecated Use {@link ConversationMessages}. */
    public get conversationMessages(): ConversationMessage[] {
      return this.ConversationMessages;
    }
    /** @deprecated Use {@link ConversationMessages}. */
    public set conversationMessages(value: ConversationMessage[]) {
      this.ConversationMessages = value;
    }
    
    /** Current text input by the user (bound to textarea) */
    public CurrentUserMessage: string = '';

    /** @deprecated Use {@link CurrentUserMessage}. */
    public get currentUserMessage(): string {
      return this.CurrentUserMessage;
    }
    /** @deprecated Use {@link CurrentUserMessage}. */
    public set currentUserMessage(value: string) {
      this.CurrentUserMessage = value;
    }
    
    /** Whether an agent execution is currently in progress */
    public IsExecuting = false;

    /** @deprecated Use {@link IsExecuting}. */
    public get isExecuting() {
      return this.IsExecuting;
    }
    /** @deprecated Use {@link IsExecuting}. */
    public set isExecuting(value) {
      this.IsExecuting = value;
    }
    
    // === Data Context Management ===
    /** Unified variables for agent execution (combines data context and template data) */
    public AgentVariables: DataContextVariable[] = [];

    /** @deprecated Use {@link AgentVariables}. */
    public get agentVariables(): DataContextVariable[] {
      return this.AgentVariables;
    }
    /** @deprecated Use {@link AgentVariables}. */
    public set agentVariables(value: DataContextVariable[]) {
      this.AgentVariables = value;
    }
    
    // === Prompt-specific properties ===
    /** Variables for prompt template rendering */
    public TemplateVariables: DataContextVariable[] = [];

    /** @deprecated Use {@link TemplateVariables}. */
    public get templateVariables(): DataContextVariable[] {
      return this.TemplateVariables;
    }
    /** @deprecated Use {@link TemplateVariables}. */
    public set templateVariables(value: DataContextVariable[]) {
      this.TemplateVariables = value;
    }
    
    /** Selected AI model for prompt execution */
    public SelectedModelId: string = '';

    /** @deprecated Use {@link SelectedModelId}. */
    public get selectedModelId(): string {
      return this.SelectedModelId;
    }
    /** @deprecated Use {@link SelectedModelId}. */
    public set selectedModelId(value: string) {
      this.SelectedModelId = value;
    }
    
    /** Selected AI vendor for prompt execution */
    public SelectedVendorId: string = '';

    /** @deprecated Use {@link SelectedVendorId}. */
    public get selectedVendorId(): string {
      return this.SelectedVendorId;
    }
    /** @deprecated Use {@link SelectedVendorId}. */
    public set selectedVendorId(value: string) {
      this.SelectedVendorId = value;
    }
    
    /** Available AI vendors for the selected model */
    public AvailableVendors: any[] = [];

    /** @deprecated Use {@link AvailableVendors}. */
    public get availableVendors(): any[] {
      return this.AvailableVendors;
    }
    /** @deprecated Use {@link AvailableVendors}. */
    public set availableVendors(value: any[]) {
      this.AvailableVendors = value;
    }
    
    /** Selected AI configuration for prompt execution */
    public SelectedConfigurationId: string = '';

    /** @deprecated Use {@link SelectedConfigurationId}. */
    public get selectedConfigurationId(): string {
      return this.SelectedConfigurationId;
    }
    /** @deprecated Use {@link SelectedConfigurationId}. */
    public set selectedConfigurationId(value: string) {
      this.SelectedConfigurationId = value;
    }
    
    /** Available AI configurations */
    public AvailableConfigurations: MJAIConfigurationEntity[] = [];

    /** @deprecated Use {@link AvailableConfigurations}. */
    public get availableConfigurations(): MJAIConfigurationEntity[] {
      return this.AvailableConfigurations;
    }
    /** @deprecated Use {@link AvailableConfigurations}. */
    public set availableConfigurations(value: MJAIConfigurationEntity[]) {
      this.AvailableConfigurations = value;
    }
    
    /** Default model for the prompt (cached for display) */
    private defaultModelName: string = '';
    
    /** Maximum tokens for prompt execution */
    public MaxTokens: number | null = null;

    /** @deprecated Use {@link MaxTokens}. */
    public get maxTokens(): number | null {
      return this.MaxTokens;
    }
    /** @deprecated Use {@link MaxTokens}. */
    public set maxTokens(value: number | null) {
      this.MaxTokens = value;
    }
    
    /** Whether to skip validation when running prompts */
    public SkipValidation: boolean = false;

    /** @deprecated Use {@link SkipValidation}. */
    public get skipValidation(): boolean {
      return this.SkipValidation;
    }
    /** @deprecated Use {@link SkipValidation}. */
    public set skipValidation(value: boolean) {
      this.SkipValidation = value;
    }
    
    /** Selected AI configuration for agent execution */
    public AgentConfigurationId: string = '';

    /** @deprecated Use {@link AgentConfigurationId}. */
    public get agentConfigurationId(): string {
      return this.AgentConfigurationId;
    }
    /** @deprecated Use {@link AgentConfigurationId}. */
    public set agentConfigurationId(value: string) {
      this.AgentConfigurationId = value;
    }
    
    /** Advanced LLM Parameters */
    public AdvancedParams = {
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

    /** @deprecated Use {@link AdvancedParams}. */
    public get advancedParams() {
      return this.AdvancedParams;
    }
    /** @deprecated Use {@link AdvancedParams}. */
    public set advancedParams(value) {
      this.AdvancedParams = value;
    }
    
    /** Raw stop sequences input for textarea */
    public StopSequencesText: string = '';

    /** @deprecated Use {@link StopSequencesText}. */
    public get stopSequencesText(): string {
      return this.StopSequencesText;
    }
    /** @deprecated Use {@link StopSequencesText}. */
    public set stopSequencesText(value: string) {
      this.StopSequencesText = value;
    }
    
    /** Whether advanced parameters panel is expanded */
    public AdvancedParamsExpanded: boolean = false;

    /** @deprecated Use {@link AdvancedParamsExpanded}. */
    public get advancedParamsExpanded(): boolean {
      return this.AdvancedParamsExpanded;
    }
    /** @deprecated Use {@link AdvancedParamsExpanded}. */
    public set advancedParamsExpanded(value: boolean) {
      this.AdvancedParamsExpanded = value;
    }
    
    /** Available AI models for prompt execution */
    public AvailableModels: any[] = [];

    /** @deprecated Use {@link AvailableModels}. */
    public get availableModels(): any[] {
      return this.AvailableModels;
    }
    /** @deprecated Use {@link AvailableModels}. */
    public set availableModels(value: any[]) {
      this.AvailableModels = value;
    }
    
    /** Available response format options */
    protected responseFormatOptions = [
        { text: 'Any', value: 'Any' },
        { text: 'Text', value: 'Text' },
        { text: 'Markdown', value: 'Markdown' },
        { text: 'JSON', value: 'JSON' },
        { text: 'Model Specific', value: 'ModelSpecific' }
    ];

    /** Selected response format for prompt execution */
    public SelectedResponseFormat = this.responseFormatOptions[0];

    /** @deprecated Use {@link SelectedResponseFormat}. */
    public get selectedResponseFormat() {
      return this.SelectedResponseFormat;
    }
    /** @deprecated Use {@link SelectedResponseFormat}. */
    public set selectedResponseFormat(value) {
      this.SelectedResponseFormat = value;
    }
    
    // === UI State Management ===
    /** Whether the configuration sidebar is currently visible */
    public ShowSidebar = true;

    /** @deprecated Use {@link ShowSidebar}. */
    public get showSidebar() {
      return this.ShowSidebar;
    }
    /** @deprecated Use {@link ShowSidebar}. */
    public set showSidebar(value) {
      this.ShowSidebar = value;
    }
    
    /** Currently active tab in the sidebar */
    public ActiveTab: 'agentVariables' | 'executionMonitor' | 'agentSettings' | 'templateVariables' | 'modelSettings' | 'savedConversations' = 'agentVariables';

    /** @deprecated Use {@link ActiveTab}. */
    public get activeTab(): 'agentVariables' | 'executionMonitor' | 'agentSettings' | 'templateVariables' | 'modelSettings' | 'savedConversations' {
      return this.ActiveTab;
    }
    /** @deprecated Use {@link ActiveTab}. */
    public set activeTab(value: 'agentVariables' | 'executionMonitor' | 'agentSettings' | 'templateVariables' | 'modelSettings' | 'savedConversations') {
      this.ActiveTab = value;
    }
    
    /** Array of saved conversation sessions loaded from localStorage */
    public SavedConversations: SavedConversation[] = [];

    /** @deprecated Use {@link SavedConversations}. */
    public get savedConversations(): SavedConversation[] {
      return this.SavedConversations;
    }
    /** @deprecated Use {@link SavedConversations}. */
    public set savedConversations(value: SavedConversation[]) {
      this.SavedConversations = value;
    }
    
    /** ID of the currently active/loaded conversation, if any */
    public CurrentConversationId: string | null = null;

    /** @deprecated Use {@link CurrentConversationId}. */
    public get currentConversationId(): string | null {
      return this.CurrentConversationId;
    }
    /** @deprecated Use {@link CurrentConversationId}. */
    public set currentConversationId(value: string | null) {
      this.CurrentConversationId = value;
    }
    
    /** Flag to control JSON dialog visibility */
    public ShowJsonDialog: boolean = false;

    /** @deprecated Use {@link ShowJsonDialog}. */
    public get showJsonDialog(): boolean {
      return this.ShowJsonDialog;
    }
    /** @deprecated Use {@link ShowJsonDialog}. */
    public set showJsonDialog(value: boolean) {
      this.ShowJsonDialog = value;
    }
    
    /** Current JSON content to display in the dialog */
    public CurrentJsonContent: string = '';

    /** @deprecated Use {@link CurrentJsonContent}. */
    public get currentJsonContent(): string {
      return this.CurrentJsonContent;
    }
    /** @deprecated Use {@link CurrentJsonContent}. */
    public set currentJsonContent(value: string) {
      this.CurrentJsonContent = value;
    }
    
    /** Whether the JSON viewer window is visible */
    public ShowJsonWindow = false;

    /** @deprecated Use {@link ShowJsonWindow}. */
    public get showJsonWindow() {
      return this.ShowJsonWindow;
    }
    /** @deprecated Use {@link ShowJsonWindow}. */
    public set showJsonWindow(value) {
      this.ShowJsonWindow = value;
    }
    
    // === Execution Monitor Properties ===
    /** Mode for the execution monitor component */
    public ExecutionMonitorMode: 'live' | 'historical' = 'historical';

    /** @deprecated Use {@link ExecutionMonitorMode}. */
    public get executionMonitorMode(): 'live' | 'historical' {
      return this.ExecutionMonitorMode;
    }
    /** @deprecated Use {@link ExecutionMonitorMode}. */
    public set executionMonitorMode(value: 'live' | 'historical') {
      this.ExecutionMonitorMode = value;
    }
    
    /** Current agent run being displayed in execution monitor */
    public CurrentAgentRun: MJAIAgentRunEntityExtended | null = null;

    /** @deprecated Use {@link CurrentAgentRun}. */
    public get currentAgentRun(): MJAIAgentRunEntityExtended | null {
      return this.CurrentAgentRun;
    }
    /** @deprecated Use {@link CurrentAgentRun}. */
    public set currentAgentRun(value: MJAIAgentRunEntityExtended | null) {
      this.CurrentAgentRun = value;
    }
    
    /**
     * Tracks agent steps during live execution (deprecated - now using agent run's Steps directly)
     */
    public LiveAgentSteps: MJAIAgentRunStepEntityExtended[] = [];

    /** @deprecated Use {@link LiveAgentSteps}. */
    public get liveAgentSteps(): MJAIAgentRunStepEntityExtended[] {
      return this.LiveAgentSteps;
    }
    /** @deprecated Use {@link LiveAgentSteps}. */
    public set liveAgentSteps(value: MJAIAgentRunStepEntityExtended[]) {
      this.LiveAgentSteps = value;
    }
    
    /** Track the last processed run ID to avoid reprocessing same data */
    private lastProcessedRunId: string | null = null;
    
    /** Track the last agent run ID for run chaining */
    private lastAgentRunId: string | null = null;
    
    /** Agent conversation state tracking */
    private agentConversationState: any = null;
    private lastAgentPayload: any = null;
    private subAgentHistory: any[] = [];
    
    /** Whether to show the save conversation dialog */
    public ShowSaveDialog: boolean = false;

    /** @deprecated Use {@link ShowSaveDialog}. */
    public get showSaveDialog(): boolean {
      return this.ShowSaveDialog;
    }
    /** @deprecated Use {@link ShowSaveDialog}. */
    public set showSaveDialog(value: boolean) {
      this.ShowSaveDialog = value;
    }
    
    /** Name for the new conversation being saved */
    public NewConversationName: string = '';

    /** @deprecated Use {@link NewConversationName}. */
    public get newConversationName(): string {
      return this.NewConversationName;
    }
    /** @deprecated Use {@link NewConversationName}. */
    public set newConversationName(value: string) {
      this.NewConversationName = value;
    }
    
    /** Temporary name for the dialog input to avoid binding conflicts */
    public TempConversationName: string = '';

    /** @deprecated Use {@link TempConversationName}. */
    public get tempConversationName(): string {
      return this.TempConversationName;
    }
    /** @deprecated Use {@link TempConversationName}. */
    public set tempConversationName(value: string) {
      this.TempConversationName = value;
    }
    
    /** Whether to show the load confirmation dialog */
    public ShowLoadConfirmDialog: boolean = false;

    /** @deprecated Use {@link ShowLoadConfirmDialog}. */
    public get showLoadConfirmDialog(): boolean {
      return this.ShowLoadConfirmDialog;
    }
    /** @deprecated Use {@link ShowLoadConfirmDialog}. */
    public set showLoadConfirmDialog(value: boolean) {
      this.ShowLoadConfirmDialog = value;
    }
    
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
    private _metadata = this.ProviderToUse;
    
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
    async ngOnInit() {
        console.log('🚀 AITestHarnessComponent.ngOnInit');
        console.log('📌 originalPromptRunId:', this.OriginalPromptRunId);
        console.log('🎯 entity:', this.entity);
        console.log('📊 mode:', this.Mode);
        
        // Ensure we have an entity
        if (!this.entity && this.aiAgent) {
            // Handle backward compatibility
            this.entity = this.aiAgent;
            this.Mode = 'agent';
        }
        
        this.loadSavedConversations();
        this.subscribeToEvents();
        this.ResetHarness();
        
        // Load configurations for both modes
        this.loadAvailableConfigurations();
        
        // If we have a prompt run ID, load the conversation history
        if (this.OriginalPromptRunId && this.Mode === 'prompt') {
            console.log('🔄 Loading from prompt run in ngOnInit');
            await this.loadFromPromptRun(this.OriginalPromptRunId);
        }
        
        // Load models if in prompt mode
        if (this.Mode === 'prompt') {
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
                this.Mode = 'agent';
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
        this.stopWorkflowAttachPoll();
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
                this.messageInput?.nativeElement?.focus();
            });
        }
    }

    private subscribeToEvents() {
        // Set up direct GraphQL subscription for agent execution stream
        const dataProvider = this.ProviderToUse as GraphQLDataProvider;
        const _providerPushStatusSub = dataProvider.PushStatusUpdates().subscribe(async (status: any) => {
            const message = JSON.parse(status.message || '{}');
            if (message?.resolver === 'RunAIAgentResolver') {
                // Handle different types of streaming messages
                if (message?.type === 'ExecutionProgress' && message.data?.agentRun) {
                    // The server should be sending the full serialized agent run
                    const serializedAgentRun = message.data.agentRun;
                    
                    // Update streaming message content if available
                    if (message.data.progress?.message) {
                        const streamingMessage = this.ConversationMessages.find(m => m.isStreaming);
                        if (streamingMessage) {
                            // Clear any typing animation interval
                            const typingInterval = (streamingMessage as any)._typingInterval;
                            if (typingInterval) {
                                clearInterval(typingInterval);
                                delete (streamingMessage as any)._typingInterval;
                            }
                            
                            // Update the streaming content with the status message
                            streamingMessage.streamingContent = message.data.progress.message;
                            this.scrollNeeded = true;
                        }
                    }
                    
                    // Update or create the agent run entity from the serialized data
                    if (!this.CurrentAgentRun) {
                        // First time - create the entity
                        const md = this.ProviderToUse;
                        this.CurrentAgentRun = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs');
                    }
                    
                    // Load the serialized data into our entity
                    await this.CurrentAgentRun.LoadFromData(serializedAgentRun);
                    
                    // Update assistant message with agent run ID if available
                    const streamingMessage = this.ConversationMessages.find(m => m.isStreaming);
                    if (streamingMessage && this.CurrentAgentRun.ID) {
                        streamingMessage.agentRunId = this.CurrentAgentRun.ID;
                    }
                    
                    // We're in live mode during streaming
                    this.ExecutionMonitorMode = 'live';
                    
                    // Pass the steps from the agent run to the execution monitor for live display
                    this.LiveAgentSteps = this.CurrentAgentRun.Steps || [];
                    // Flow agents park on the graph. Attach the canvas from the TaskGraph step
                    // the moment it lands — waiting for RunAIAgent to return deadlocks Debug.
                    if (this.EffectiveMode === 'workflow') {
                        this.tryAttachWorkflowFromStream(serializedAgentRun, this.LiveAgentSteps);
                    }
                    
                    console.log('📊 Agent run update:', {
                        id: this.CurrentAgentRun.ID,
                        status: this.CurrentAgentRun.Status,
                        stepCount: this.CurrentAgentRun.Steps?.length || 0,
                        executionMonitorMode: this.ExecutionMonitorMode,
                        steps: this.CurrentAgentRun.Steps?.map(s => ({
                            id: s.ID,
                            type: s.StepType,
                            status: s.Status,
                            hasSubAgentRun: !!s.SubAgentRun,
                            subStepCount: s.SubAgentRun?.Steps?.length || 0
                        }))
                    });
                    
                    // Force change detection
                    this.cdr.detectChanges();
                }
                else if (message?.type === 'StreamingContent' && message.data?.streaming) {
                    
                    const streamingMessage = this.ConversationMessages.find(m => m.isStreaming);
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
                    this.ExecutionMonitorMode = 'historical';
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
            const prompt = this.entity as MJAIPromptEntityExtended;
            if (prompt.AIModelTypeID) {
                filteredModels = AIEngineBase.Instance.Models.filter(
                    model => UUIDsEqual(model.AIModelTypeID, prompt.AIModelTypeID) && model.IsActive
                );
            } else {
                // No model type restriction, show all active models
                filteredModels = AIEngineBase.Instance.Models.filter(model => model.IsActive);
            }
            
            // Set default response format from prompt with slight delay for Kendo dropdown
            setTimeout(() => {
                const format = this.responseFormatOptions.find(f => f.value.trim().toLowerCase() === prompt.ResponseFormat.trim().toLowerCase());
                if (format) {
                    this.SelectedResponseFormat = format;
                }
                else {
                    this.SelectedResponseFormat = this.responseFormatOptions[0]; // Default to 'Any'
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
            const prompt = this.entity as MJAIPromptEntityExtended;
            this.defaultModelName = await this.getDefaultModelName(prompt);
        }
        
        // Add a blank option at the beginning with the default model name
        this.AvailableModels = [
            { ID: '', Name: this.defaultModelName ? `-- Default: ${this.defaultModelName} --` : '-- Use Default Model --' },
            ...filteredModels
        ];
        
        // Don't auto-select a model - let the dropdown show the blank option
        this.SelectedModelId = '';
        
        // If we have a default model, load its default vendor
        if (this.defaultModelName) {
            await this.loadDefaultVendor();
        } else {
            this.SelectedVendorId = '';
            this.AvailableVendors = [];
        }
    }
    
    /** Default model object for the prompt (cached for vendor lookup) */
    private defaultModel: any = null;
    
    /**
     * Gets the default model name for a prompt based on its configuration
     */
    private async getDefaultModelName(prompt: MJAIPromptEntityExtended): Promise<string> {
        try {
            // Get prompt-specific model associations
            const promptModels = AIEngineBase.Instance.PromptModels.filter(
                pm => UUIDsEqual(pm.PromptID, prompt.ID) &&
                      (pm.Status === 'Active' || pm.Status === 'Preview')
            );
            
            let defaultModel: any = null;
            
            if (promptModels.length > 0) {
                // Sort by priority (higher priority first)
                promptModels.sort((a, b) => (b.Priority || 0) - (a.Priority || 0));
                
                // Find the first active model
                for (const pm of promptModels) {
                    const model = AIEngineBase.Instance.Models.find(m => UUIDsEqual(m.ID, pm.ModelID) && m.IsActive);
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
                         (!prompt.AIModelTypeID || UUIDsEqual(m.AIModelTypeID, prompt.AIModelTypeID))
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
                this.AvailableVendors = [];
                return;
            }
            
            // Get vendors that offer this model - same logic as loadVendorsForModel
            const modelVendors = AIEngineBase.Instance.ModelVendors.filter(
                mv => UUIDsEqual(mv.ModelID, this.defaultModel.ID) &&
                      mv.Status === 'Active' &&
                      mv.Type?.trim().toLowerCase() === 'inference provider'
            );
            
            // Map to vendor objects with priority from ModelVendor
            const vendorObjects: any[] = [];
            for (const mv of modelVendors) {
                const vendor = AIEngineBase.Instance.Vendors.find(v => UUIDsEqual(v.ID, mv.VendorID));
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

            this.AvailableVendors = vendorObjects;
            
            // Select the highest priority vendor
            if (vendorObjects.length > 0) {
                this.SelectedVendorId = vendorObjects[0].ID;
            }
        } catch (error) {
            console.error('Error loading default vendor:', error);
            this.AvailableVendors = [];
        }
    }
    
    /**
     * Loads available AI configurations from the database
     * Only configurations with 'Active' or 'Preview' status are shown
     */
    private async loadAvailableConfigurations() {
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJAIConfigurationEntity>({
                EntityName: 'MJ: AI Configurations',
                ExtraFilter: `Status IN ('Active', 'Preview')`,
                OrderBy: 'IsDefault DESC, Name',
                ResultType: 'entity_object'
            });
            
            if (result.Success && result.Results) {
                this.AvailableConfigurations = result.Results;
                
                // Auto-select the default configuration if one exists
                const defaultConfig = this.AvailableConfigurations.find(c => c.IsDefault);
                if (defaultConfig) {
                    this.SelectedConfigurationId = defaultConfig.ID;
                }
            } else {
                console.error('Failed to load AI configurations:', result.ErrorMessage);
                this.AvailableConfigurations = [];
            }
        } catch (error) {
            console.error('Error loading AI configurations:', error);
            this.AvailableConfigurations = [];
        }
    }
    
    /**
     * Handles model selection change and loads available vendors for the selected model
     */
    public OnModelSelectionChange() {
        this.SelectedVendorId = '';
        this.AvailableVendors = [];
        
        if (!this.SelectedModelId) {
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

    /** @deprecated Use {@link OnModelSelectionChange}. */
    public onModelSelectionChange() {
      return this.OnModelSelectionChange();
    }
    
    /**
     * Loads available vendors for the selected model
     */
    private loadVendorsForModel() {
        if (!this.SelectedModelId) {
            return;
        }
        
        // Get model-specific vendors
        const modelVendors = AIEngineBase.Instance.ModelVendors.filter(
            mv => UUIDsEqual(mv.ModelID, this.SelectedModelId) &&
                  mv.Status === 'Active' &&
                  mv.Type?.trim().toLowerCase() === 'inference provider'
        );
        
        // Map to vendor objects with priority from ModelVendor
        const vendorObjects: any[] = [];
        for (const mv of modelVendors) {
            const vendor = AIEngineBase.Instance.Vendors.find(v => UUIDsEqual(v.ID, mv.VendorID));
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
        
        this.AvailableVendors = vendorObjects;
        
        // Auto-select the highest priority vendor if only one or set default
        if (vendorObjects.length === 1) {
            this.SelectedVendorId = vendorObjects[0].ID;
        } else if (vendorObjects.length > 1) {
            // Select the highest priority (lowest priority number)
            this.SelectedVendorId = vendorObjects[0].ID;
        }
    }
    
    /**
     * Loads default parameter values from the AI prompt entity
     */
    private loadPromptDefaults() {
        if (this.Mode === 'prompt' && this.entity && this.isPromptEntity(this.entity)) {
            const prompt = this.entity as MJAIPromptEntityExtended;
            
            // Load default values from prompt entity
            if (prompt.Temperature != null) this.AdvancedParams.temperature = prompt.Temperature;
            if (prompt.TopP != null) this.AdvancedParams.topP = prompt.TopP;
            if (prompt.TopK != null) this.AdvancedParams.topK = prompt.TopK;
            if (prompt.MinP != null) this.AdvancedParams.minP = prompt.MinP;
            if (prompt.FrequencyPenalty != null) this.AdvancedParams.frequencyPenalty = prompt.FrequencyPenalty;
            if (prompt.PresencePenalty != null) this.AdvancedParams.presencePenalty = prompt.PresencePenalty;
            if (prompt.Seed != null) this.AdvancedParams.seed = prompt.Seed;
            if (prompt.StopSequences) {
                this.StopSequencesText = prompt.StopSequences;
                this.AdvancedParams.stopSequences = prompt.StopSequences.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
            }
            if (prompt.IncludeLogProbs != null) this.AdvancedParams.includeLogProbs = prompt.IncludeLogProbs;
            if (prompt.TopLogProbs != null) this.AdvancedParams.topLogProbs = prompt.TopLogProbs;
        }
    }

    /**
     * Loads template parameters from the prompt's template and pre-populates
     * the template variables with their default values
     */
    private async loadTemplateParameters() {
        if (this.Mode === 'prompt' && this.entity && this.isPromptEntity(this.entity)) {
            const prompt = this.entity as MJAIPromptEntityExtended;
            
            if (!prompt.TemplateID) {
                return; // No template to load parameters from
            }

            try {
                const rv = RunView.FromMetadataProvider(this.ProviderToUse);
                const result = await rv.RunView<MJTemplateParamEntity>({
                    EntityName: 'MJ: Template Params',
                    ExtraFilter: `TemplateID='${prompt.TemplateID}'`,
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                });

                if (result.Success && result.Results && result.Results.length > 0) {
                    // Clear existing template variables
                    this.TemplateVariables = [];
                    
                    // Add each template parameter as a variable with its default value
                    for (const param of result.Results) {
                        this.TemplateVariables.push({
                            name: param.Name,
                            value: param.DefaultValue || '',
                            type: this.getVariableTypeFromParamType(param.Type)
                        });
                    }
                    
                    // If no parameters found, add one empty variable to start
                    if (this.TemplateVariables.length === 0) {
                        this.TemplateVariables.push({ name: '', value: '', type: 'string' });
                    }
                }
            } catch (error) {
                console.error('Error loading template parameters:', error);
                // Add one empty variable on error
                this.TemplateVariables = [{ name: '', value: '', type: 'string' }];
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
    public ResetToPromptDefaults() {
        if (this.Mode === 'prompt' && this.entity && this.isPromptEntity(this.entity)) {
            const prompt = this.entity as MJAIPromptEntityExtended;
            
            // Reset model selection to default
            this.SelectedModelId = '';
            
            // Reset vendor - will be loaded by loadDefaultVendor
            this.SelectedVendorId = '';
            
            // Reset response format to prompt's setting
            const format = this.responseFormatOptions.find(f => 
                f.value.trim().toLowerCase() === prompt.ResponseFormat.trim().toLowerCase()
            );
            this.SelectedResponseFormat = format || this.responseFormatOptions[0];
            
            // Reset max tokens
            this.MaxTokens = null;
            
            // Reset skip validation
            this.SkipValidation = false;
            
            // Reset configuration to default
            const defaultConfig = this.AvailableConfigurations.find(c => c.IsDefault);
            if (defaultConfig) {
                this.SelectedConfigurationId = defaultConfig.ID;
            } else {
                this.SelectedConfigurationId = '';
            }
            
            // Reset advanced parameters
            this.AdvancedParams = {
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
            this.StopSequencesText = '';
            
            // Reload prompt defaults for advanced params
            this.loadPromptDefaults();
            
            // Reload default vendor for the default model
            if (this.defaultModelName) {
                this.loadDefaultVendor();
            }
        }
    }

    /** @deprecated Use {@link ResetToPromptDefaults}. */
    public resetToPromptDefaults() {
      return this.ResetToPromptDefaults();
    }

    /**
     * Resets the test harness to its initial state, clearing all conversations,
     * variables, and UI state. Called automatically when the harness becomes visible.
     */
    public ResetHarness() {
        this.ConversationMessages = [];
        this.CurrentUserMessage = '';
        this.IsExecuting = false;
        this.AgentVariables = [{ name: '', value: '', type: 'string' }];
        this.TemplateVariables = [];
        this.CurrentConversationId = null;
        this.ShowSidebar = true;
        // Clear execution data and tracking when explicitly resetting
        this.CurrentAgentRun = null;
        this.lastProcessedRunId = null;
        this.lastAgentRunId = null; // Clear run chaining
        this.ExecutionMonitorMode = 'historical';
        // Reset conversation state
        this.agentConversationState = null;
        this.lastAgentPayload = null;
        this.subAgentHistory = [];
        // Set default tab based on mode
        this.ActiveTab = this.Mode === 'agent' ? 'agentVariables' : 'modelSettings';
        // Reset advanced parameters
        this.AdvancedParams = {
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
        this.StopSequencesText = '';
        this.AdvancedParamsExpanded = false;
        this.SkipValidation = false;
        // Reset agent configuration to default
        if (this.Mode === 'agent') {
            const defaultConfig = this.AvailableConfigurations.find(c => c.IsDefault);
            this.AgentConfigurationId = defaultConfig?.ID || '';
        }
        this.stopWorkflowAttachPoll();
        this.WorkflowParentTaskID = null;
        this.WorkflowDebuggerActive = false;
        this.startWorkflowPaused = false;
        this.WorkflowSettled = false;
    }

    /** @deprecated Use {@link ResetHarness}. */
    public resetHarness() {
      return this.ResetHarness();
    }
    
    /**
     * Starts a new conversation
     */
    public async NewConversation() {
        if (this.ConversationMessages.length > 0 && !this.CurrentConversationId) {
            // Unsaved conversation exists - use our custom dialog
            if (await this.confirmService.Confirm({ title: 'Unsaved conversation', message: 'You have an unsaved conversation. Would you like to save it first?', confirmText: 'Save' })) {
                this.SaveConversation();
                return;
            }
        }
        
        // Clear execution data when explicitly starting a new conversation
        this.CurrentAgentRun = null;
        this.lastProcessedRunId = null;
        this.lastAgentRunId = null; // Clear run chaining
        
        this.ResetHarness();
        MJNotificationService.Instance.CreateSimpleNotification(
            'Started new conversation',
            'info',
            2000
        );
    }

    /** @deprecated Use {@link NewConversation}. */
    public async newConversation() {
      return this.NewConversation();
    }

    /**
     * Closes the test harness by setting visibility to false and emitting the change event.
     * Used by dialog implementations and close buttons.
     */
    public close() {
        this._isVisible = false;
        this.VisibilityChange.emit(false);
    }

    /**
     * Toggles the visibility of the configuration sidebar.
     * Allows users to show/hide the data context and conversation management panels.
     */
    public ToggleSidebar() {
        this.ShowSidebar = !this.ShowSidebar;
    }

    /** @deprecated Use {@link ToggleSidebar}. */
    public toggleSidebar() {
      return this.ToggleSidebar();
    }

    /**
     * Switches to the specified tab in the configuration sidebar.
     * @param tab - The tab to activate
     */
    public SelectTab(tab: 'agentVariables' | 'executionMonitor' | 'agentSettings' | 'templateVariables' | 'modelSettings' | 'savedConversations') {
        console.log('🔄 Switching to tab:', tab, {
            currentAgentRun: !!this.CurrentAgentRun,
            agentRunStatus: this.CurrentAgentRun?.Status || 'none',
            conversationMessages: this.ConversationMessages.length,
            executionMonitorMode: this.ExecutionMonitorMode
        });
        
        this.ActiveTab = tab;
        
        // If switching to execution monitor tab, ensure it has the latest data
        if (tab === 'executionMonitor') {
            console.log('📊 Switching to execution monitor tab');
            
            // Always ensure we have the latest execution data when switching to monitor
            if (this.ConversationMessages.length > 0) {
                const lastAssistantMessage = this.ConversationMessages
                    .filter(m => m.role === 'assistant' && m.agentRunId)
                    .pop();
                    
                console.log('🔍 Last assistant message with agent run:', {
                    found: !!lastAssistantMessage,
                    hasAgentRunId: !!lastAssistantMessage?.agentRunId,
                    agentRunId: lastAssistantMessage?.agentRunId
                });
                
                if (lastAssistantMessage && lastAssistantMessage.agentRunId) {
                    // Always update agent run to ensure it's fresh
                    const messageRunId = lastAssistantMessage.agentRunId;
                    
                    // Load the agent run
                    this.loadAgentRun(messageRunId);
                    this.ExecutionMonitorMode = 'historical';
                    this.lastProcessedRunId = messageRunId;
                    
                    console.log('✅ Loading agent run:', {
                        mode: this.ExecutionMonitorMode,
                        runId: this.lastProcessedRunId
                    });
                    
                    // Trigger change detection to ensure the execution monitor updates
                    setTimeout(() => {
                        this.cdr.detectChanges();
                    }, 50);
                } else {
                    console.log('❌ No agent run ID found in messages');
                }
            } else {
                console.log('❌ No conversation messages found');
            }
        } else {
            console.log('📄 Switching away from execution monitor, preserving data:', {
                currentAgentRunExists: !!this.CurrentAgentRun
            });
            // Don't clear currentAgentRun when switching away from execution monitor
            // This preserves the state for when the user switches back
        }
    }

    /** @deprecated Use {@link SelectTab}. */
    public selectTab(tab: 'agentVariables' | 'executionMonitor' | 'agentSettings' | 'templateVariables' | 'modelSettings' | 'savedConversations') {
      return this.SelectTab(tab);
    }

    /**
     * Shows the execution history for a specific message
     * @param message - The message to show execution history for
     */
    public async ShowMessageExecutionHistory(message: ConversationMessage) {
        if (message.agentRunId && this.Mode === 'agent') {
            // Load the agent run entity
            await this.loadAgentRun(message.agentRunId);
            this.ExecutionMonitorMode = 'historical';
            // Switch to execution monitor tab if not already there
            if (this.ActiveTab !== 'executionMonitor') {
                this.SelectTab('executionMonitor');
            }
        }
    }

    /** @deprecated Use {@link ShowMessageExecutionHistory}. */
    public async showMessageExecutionHistory(message: ConversationMessage) {
      return this.ShowMessageExecutionHistory(message);
    }
    
    /**
     * Loads an agent run entity by ID
     * @param runId - The ID of the agent run to load
     */
    private async loadAgentRun(runId: string): Promise<void> {
        const md = this.ProviderToUse;
        const agentRunEntity = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs');
        await agentRunEntity.Load(runId);
        await this.internalLoadAgenRun(agentRunEntity);
    }

    private async loadAgentRunFromData(agentRunData: any): Promise<void> {
        const md = this.ProviderToUse;
        const agentRunEntity = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs');
        await agentRunEntity.LoadFromData(agentRunData);
        await this.internalLoadAgenRun(agentRunEntity);
    }

    private async internalLoadAgenRun(agentRunEntity: MJAIAgentRunEntityExtended): Promise<void> {
        try {
            this.CurrentAgentRun = agentRunEntity;
            // The Load method automatically loads related steps through InnerLoad override
            // No need to call LoadRelatedData explicitly as it's protected
            
            // Set execution monitor mode
            this.ExecutionMonitorMode = 'historical';
            
            console.log('✅ Loaded agent run:', {
                id: agentRunEntity.ID,
                stepCount: this.CurrentAgentRun.Steps?.length || 0
            });
            
            // Force change detection to update the execution monitor
            this.cdr.detectChanges();
        } catch (error) {
            console.error('❌ Failed to load agent run:', error);
            this.CurrentAgentRun = null;
        }
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
    /**
     * Executes a re-run of a previously loaded prompt run.
     * This bypasses the need for a new user message since we're re-running with existing messages.
     */
    public async ExecuteRerun() {
        if (this.Mode === 'prompt' && this.ConversationMessages.length > 0) {
            // Mark that we've executed a re-run
            this.HasExecutedRerun = true;
            
            // For prompt re-runs, we need to execute the prompt with the loaded messages
            await this.executePrompt('');  // Empty message since we're using loaded conversation
        }
    }

    /** @deprecated Use {@link ExecuteRerun}. */
    public async executeRerun() {
      return this.ExecuteRerun();
    }
    
    /**
     * Resets the conversation back to the original messages from the prompt run.
     * This is available after a re-run has been executed.
     */
    public ResetToOriginalMessages() {
        if (this.originalPromptRunMessages.length > 0) {
            // Reset messages to the original state
            this.ConversationMessages = [...this.originalPromptRunMessages];
            
            // Reset the execution flag so Re-Run button shows again
            this.HasExecutedRerun = false;
            
            // Trigger change detection
            this.cdr.detectChanges();
            
            console.log('🔄 Reset to original messages from prompt run');
        }
    }

    /** @deprecated Use {@link ResetToOriginalMessages}. */
    public resetToOriginalMessages() {
      return this.ResetToOriginalMessages();
    }
    
    /**
     * Finds the graph a run submitted, from its `TaskGraph` step.
     *
     * Read from the step's recorded output rather than from the reply text, because the reply is
     * prose meant for a person and the step is the record. Absent simply means this run did not
     * submit a graph — true of every Loop agent, and of a Flow agent whose compile failed.
     */
    private captureSubmittedGraph(result: { agentRun?: { Steps?: Array<{ StepType?: string; OutputData?: string | null }> } }): void {
        this.tryAttachWorkflowFromStream(result?.agentRun, result?.agentRun?.Steps ?? []);
    }

    /**
     * The canvas must appear when the graph is *submitted*, not when the parked agent run
     * settles. Debug starts paused, so settle never happens until the operator continues.
     *
     * Three sources, in order: streamed `__runSteps` (what GetAll actually sends), the
     * hydrated `Steps` collection, then a RunView of the parent task by AgentRunID —
     * OutputData is often missing from the live stream even when the monitor already
     * shows the TaskGraph step as complete.
     */
    private tryAttachWorkflowFromStream(
        serialized: unknown,
        hydratedSteps: Array<{ StepType?: string; OutputData?: string | Record<string, unknown> | null }>,
    ): void {
        if (this.WorkflowParentTaskID) return;
        const streamed = streamedRunSteps(serialized);
        if (this.tryAttachWorkflowFromSteps(streamed) || this.tryAttachWorkflowFromSteps(hydratedSteps)) {
            return;
        }
        const runID = streamedRunID(serialized) ?? this.CurrentAgentRun?.ID;
        if (runID && !runID.startsWith('temp-')) {
            this.startWorkflowAttachPoll(runID);
            void this.tryAttachWorkflowFromAgentRun(runID);
        }
    }

    private tryAttachWorkflowFromSteps(
        steps: Array<{ StepType?: string; OutputData?: string | Record<string, unknown> | null }>,
    ): boolean {
        if (this.WorkflowParentTaskID) return true;
        for (const step of steps) {
            if (step?.StepType !== 'TaskGraph') continue;
            const parentTaskID = ParentTaskIDFromStepOutput(step.OutputData);
            if (!parentTaskID) continue;
            this.attachWorkflowCanvas(parentTaskID);
            return true;
        }
        return false;
    }

    private attachWorkflowCanvas(parentTaskID: string): void {
        this.stopWorkflowAttachPoll();
        this.WorkflowParentTaskID = parentTaskID;
        this.cdr.detectChanges();
    }

    private async tryAttachWorkflowFromAgentRun(agentRunID: string): Promise<void> {
        if (this.WorkflowParentTaskID) return;
        const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{ ID: string }>({
            EntityName: 'MJ: Tasks',
            ExtraFilter: `AgentRunID='${agentRunID}' AND ParentID IS NULL`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
            MaxRows: 1,
        });
        const id = result.Success ? result.Results?.[0]?.ID : undefined;
        if (!id) return;
        this.attachWorkflowCanvas(id);
    }

    private startWorkflowAttachPoll(agentRunID: string): void {
        if (this.workflowAttachTimer) return;
        let ticks = 0;
        this.workflowAttachTimer = setInterval(() => {
            if (this.WorkflowParentTaskID || ++ticks > 40) {
                this.stopWorkflowAttachPoll();
                return;
            }
            void this.tryAttachWorkflowFromAgentRun(agentRunID);
        }, 400);
    }

    private stopWorkflowAttachPoll(): void {
        if (this.workflowAttachTimer) {
            clearInterval(this.workflowAttachTimer);
            this.workflowAttachTimer = null;
        }
    }

    public async SendMessage() {
        if (!this.CurrentUserMessage.trim() || !this.entity) {
            return;
        }

        // Add user message to conversation
        const userMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'user',
            content: this.CurrentUserMessage.trim(),
            timestamp: new Date()
        };
        this.ConversationMessages.push(userMessage);
        
        // Clear input and update change detection
        const messageToSend = this.CurrentUserMessage;
        this.CurrentUserMessage = '';
        
        // Use Promise.resolve to defer the change detection to the next microtask
        // This prevents ExpressionChangedAfterItHasBeenCheckedError
        Promise.resolve().then(() => {
            this.cdr.detectChanges();
        });
        
        // Scroll to bottom
        this.scrollNeeded = true;

        // Auto-switch to execution monitor tab if in agent mode
        if (this.Mode === 'agent' && this.ActiveTab !== 'executionMonitor') {
            this.SelectTab('executionMonitor');
        }
        
        // Clear previous execution data when starting a new execution
        this.CurrentAgentRun = null;
        this.lastProcessedRunId = null;
        
        // Execute based on mode
        if (this.Mode === 'agent') {
            await this.executeAgent(messageToSend);
        } else {
            await this.executePrompt(messageToSend);
        }
    }

    /** @deprecated Use {@link SendMessage}. */
    public async sendMessage() {
      return this.SendMessage();
    }

    private async executeAgent(userMessage: string) {
        if (!this.entity || !this.isAgentEntity(this.entity)) return;

        this.IsExecuting = true;

        // Clear previous execution data when starting a new run
        // Create a proper agent run entity for live tracking
        const md = this.ProviderToUse;
        this.CurrentAgentRun = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs');
        this.CurrentAgentRun.ID = `temp-${Date.now()}`;
        this.CurrentAgentRun.Status = 'Running';
        this.CurrentAgentRun.StartedAt = new Date();
        // Steps will be populated by the agent updates
        this.LiveAgentSteps = [];
        this.ExecutionMonitorMode = 'live';

        // Add placeholder assistant message for streaming
        const assistantMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            streamingContent: this.Mode === 'agent' ? 'Running agent...' : 'Running prompt...',
            agentRunId: '',
            streamingStartTime: Date.now(),
            elapsedTime: 0
        };
        this.ConversationMessages.push(assistantMessage);
        this.scrollNeeded = true;
        
        // Start elapsed time counter
        this.startElapsedTimeCounter(assistantMessage);
        
        // Initialize execution monitor for live mode - already created above
        

        try {
            // Get GraphQL data provider
            const dataProvider = this.ProviderToUse as GraphQLDataProvider;
 
            // Build data context - include conversation state if available
            const dataContext = this.buildDataContext();
            const templateData = this.buildTemplateData();
            
            // Add conversation state to data context if we have it
            if (this.agentConversationState) {
                dataContext._conversationState = this.agentConversationState;
            }
            if (this.lastAgentPayload) {
                dataContext._lastPayload = this.lastAgentPayload;
            }
            if (this.subAgentHistory.length > 0) {
                dataContext._subAgentHistory = this.subAgentHistory;
            }
            // A workflow's starting payload rides in the same data context every other run uses, so
            // a step's input mapping reaches it the ordinary way: `data.<key>`.
            if (this.workflowStartingData) {
                Object.assign(dataContext, this.workflowStartingData);
            }
            
            // Execute the agent using the new AI client
            // Start typing animation while we wait for the first real stream
            this.startTypingAnimation(assistantMessage);

            const executionResult = await dataProvider.AI.RunAIAgent({
                agent: this.entity as MJAIAgentEntityExtended,
                conversationMessages: this.ConversationMessages, 
                data: Object.keys(dataContext).length > 0 ? dataContext : undefined, 
                lastRunId: this.lastAgentRunId || undefined,
                autoPopulateLastRunPayload: this.lastAgentRunId ? true : false,
                configurationId: this.AgentConfigurationId || undefined,
                taskGraphDebug: this.startWorkflowPaused ? { paused: true } : undefined,
            });

            // Stop elapsed time counter
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }

            // Update assistant message with result
            assistantMessage.isStreaming = false;

            if (executionResult?.success) {
                // executionResult is now an ExecuteAgentResult from the GraphQL client
                // It has already been parsed and contains: success, payload, agentRun, etc.
                const parseOptions: ParseJSONOptions = {
                    extractInlineJson: true,
                    maxDepth: 100,
                    debug: false
                };

                // Apply recursive JSON parsing to extract any nested JSON strings
                const fullResult = ParseJSONRecursive(executionResult, parseOptions);

                // Store agent run ID with the message
                if (fullResult && fullResult.agentRun?.ID) {
                    assistantMessage.agentRunId = fullResult.agentRun.ID;
                }

                // Load the agent run for display
                if (fullResult && fullResult.agentRun) {
                    await this.loadAgentRunFromData(fullResult.agentRun);
                    // Only switch to historical mode after successfully loading
                    this.ExecutionMonitorMode = 'historical';
                    // Clear live steps only after we have the historical data
                    this.LiveAgentSteps = [];
                } else {
                    // If no agent run ID, keep showing live steps
                    console.log('⚠️ No agent run ID in result, keeping live mode');
                }

                // Auto-expand all monitoring nodes once execution is complete
                setTimeout(() => {
                    this.expandAllMonitoringNodes();
                }, 100);

                // Preserve conversation state from the result
                if (fullResult.payload) {
                    this.lastAgentPayload = fullResult.payload;

                    // Extract conversation state if present
                    if (fullResult.payload.conversationState) {
                        this.agentConversationState = fullResult.payload.conversationState;
                    }
                }

                // Extract the user message from the nested payload structure
                let displayContent = 'No response generated';
                let payloadData = fullResult.payload;

                if (fullResult.agentRun?.Message?.length > 0) {
                    displayContent = fullResult.agentRun.Message;
                }

                assistantMessage.content = displayContent;
                assistantMessage.payload = payloadData; // Store the payload if present
                const startedAt = executionResult.agentRun?.StartedAt ? new Date(executionResult.agentRun.StartedAt).getTime() : 0;
                const completedAt = executionResult.agentRun?.CompletedAt ? new Date(executionResult.agentRun.CompletedAt).getTime() : 0;
                const executionTime = (startedAt && completedAt) ? (completedAt - startedAt) : 0;
                assistantMessage.executionTime = executionTime;
                assistantMessage.agentRunId = fullResult.agentRun?.ID || assistantMessage.agentRunId;

                // Update the tracking ID when we set new execution data
                this.lastProcessedRunId = assistantMessage.agentRunId || null;

                // Update the last agent run ID for run chaining
                if (fullResult.agentRun?.ID) {
                    this.lastAgentRunId = fullResult.agentRun.ID;
                }

                // A workflow run's real output is the graph it submitted, not the sentence it
                // returned. Capture the parent task so the pane can show it running — the run itself
                // has already ended by this point, which is exactly why the graph is the thing to
                // watch rather than the transcript.
                this.captureSubmittedGraph(fullResult);

                // Store the full result as raw content for debugging/inspection
                assistantMessage.rawContent = JSON.stringify(fullResult, null, 2);

                // Force change detection to update the execution monitor
                this.cdr.detectChanges();
            } else {
                console.error('❌ AI Test Harness: Execution failed', {
                    success: executionResult?.success,
                    errorMessage: executionResult?.agentRun?.ErrorMessage,
                    hasPayload: !!executionResult?.payload
                });
                assistantMessage.content = 'I encountered an error processing your request.';
                assistantMessage.error = executionResult?.agentRun?.ErrorMessage || 'Unknown error occurred';

                // On failure, clear live steps and switch to historical mode
                if (this.CurrentAgentRun) {
                    this.ExecutionMonitorMode = 'historical';
                    this.LiveAgentSteps = [];
                }

                // Store the error result as raw content
                if (executionResult) {
                    assistantMessage.rawContent = JSON.stringify(executionResult, null, 2);
                }
            }

            delete assistantMessage.streamingContent;
            this.scrollNeeded = true;

            // Auto-save conversation
            this.autoSaveConversation();
            
            // Auto-expand all monitoring nodes once execution is complete (for prompt mode)
            if (this.Mode === 'prompt') {
                setTimeout(() => {
                    this.expandAllMonitoringNodes();
                }, 100);
            }

        } catch (error) {
            console.error('❌ AI Test Harness: Caught error during agent execution', {
                error: error,
                message: (error as any)?.message,
                stack: (error as any)?.stack,
                type: (error as any)?.constructor?.name
            });
            
            // Update assistant message with error
            const lastMessage = this.ConversationMessages[this.ConversationMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.isStreaming = false;
                lastMessage.content = 'I encountered an error processing your request.';
                lastMessage.error = (error as Error).message;
                delete lastMessage.streamingContent;
            }
            
            // On error, clear live steps and switch to historical mode
            if (this.CurrentAgentRun) {
                this.ExecutionMonitorMode = 'historical';
                this.LiveAgentSteps = [];
            }
            
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to execute agent: ' + (error as Error).message,
                'error',
                6000
            );
        } finally {
            this.IsExecuting = false;
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

        this.IsExecuting = true;

        // Add placeholder assistant message for streaming
        const assistantMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            streamingContent: this.Mode === 'agent' ? 'Running agent...' : 'Running prompt...',
            agentRunId: '',
            streamingStartTime: Date.now(),
            elapsedTime: 0
        };
        this.ConversationMessages.push(assistantMessage);
        this.scrollNeeded = true;
        
        // Start elapsed time counter
        this.startElapsedTimeCounter(assistantMessage);

        try {
            // Get GraphQL data provider
            const dataProvider = this.ProviderToUse as GraphQLDataProvider;

            // Build template variables from user input
            const templateVariables = this.buildTemplateVariables();
            
            // Prepare data context (template variables + user message)
            const dataContext = {
                ...templateVariables,
                userMessage: userMessage
            };
            
            // Build conversation messages
            const messages = this.ConversationMessages
                .filter(m => !m.isStreaming && m.content) // Only include non-streaming messages with content
                .map(m => ({
                    role: m.role as string,
                    content: m.content as string
                }));
            
            // Execute the prompt using the new AI client
            const executionResult = await dataProvider.AI.RunAIPrompt({
                promptId: (this.entity as MJAIPromptEntityExtended).ID,
                data: dataContext,
                overrideModelId: this.SelectedModelId || undefined,
                overrideVendorId: this.SelectedVendorId || undefined,
                configurationId: this.SelectedConfigurationId || undefined,
                skipValidation: this.SkipValidation,
                templateData: undefined, // Additional template context if needed
                responseFormat: this.SelectedResponseFormat?.value,
                temperature: this.AdvancedParams.temperature ?? undefined,
                topP: this.AdvancedParams.topP ?? undefined,
                topK: this.AdvancedParams.topK ?? undefined,
                minP: this.AdvancedParams.minP ?? undefined,
                frequencyPenalty: this.AdvancedParams.frequencyPenalty ?? undefined,
                presencePenalty: this.AdvancedParams.presencePenalty ?? undefined,
                seed: this.AdvancedParams.seed ?? undefined,
                stopSequences: this.AdvancedParams.stopSequences.length > 0 ? this.AdvancedParams.stopSequences : undefined,
                includeLogProbs: this.AdvancedParams.includeLogProbs,
                topLogProbs: this.AdvancedParams.includeLogProbs ? this.AdvancedParams.topLogProbs : undefined,
                messages: messages.length > 0 ? messages : undefined,
                rerunFromPromptRunID: this.OriginalPromptRunId || undefined,
                systemPromptOverride: this.SystemPromptOverride || undefined
            });

            // Stop elapsed time counter
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }

            // Update assistant message with result
            assistantMessage.isStreaming = false;
            
            // Define parse options for both success and error cases
            const parseOptions: ParseJSONOptions = {
                extractInlineJson: true,
                maxDepth: 100,
                debug: false
            };

            if (executionResult?.success) {
                // Use parsedResult if available, otherwise fall back to output
                // Handle case where parsedResult is already an object (from GraphQL client)
                const contentToDisplay = executionResult.parsedResult
                    ? (typeof executionResult.parsedResult === 'object'
                        ? JSON.stringify(executionResult.parsedResult, null, 2)
                        : executionResult.parsedResult)
                    : (executionResult.output || 'No response generated');
                assistantMessage.content = contentToDisplay;
                assistantMessage.executionTime = executionResult.executionTimeMs;
                
                // Store the complete execution result for JSON display
                // If chatResult is provided, parse it and include it in the display
                const resultForDisplay: any = { ...executionResult };
                if (executionResult.chatResult) {
                    try {
                        resultForDisplay.chatResult = JSON.parse(executionResult.chatResult);
                    } catch {
                        // If parsing fails, keep it as a string
                    }
                }
                
                // Apply recursive JSON parsing to the entire result
                const recursivelyParsed = ParseJSONRecursive(resultForDisplay, parseOptions);
                assistantMessage.rawContent = JSON.stringify(recursivelyParsed, null, 2);
                
                // Store execution metadata
                if (executionResult.promptRunId) {
                    assistantMessage.agentRunId = executionResult.promptRunId;
                    // Update the tracking ID when we set new execution data
                    this.lastProcessedRunId = assistantMessage.agentRunId || null;
                }
            } else {
                assistantMessage.content = 'I encountered an error processing your request.';
                assistantMessage.error = executionResult?.error || 'Unknown error occurred';
                
                // Include chatResult in error case too
                if (executionResult) {
                    const errorResult: any = { ...executionResult };
                    if (executionResult.chatResult) {
                        try {
                            errorResult.chatResult = JSON.parse(executionResult.chatResult);
                        } catch {
                            // If parsing fails, keep it as a string
                        }
                    }
                    
                    // Apply recursive JSON parsing to the error result
                    const recursivelyParsed = ParseJSONRecursive(errorResult, parseOptions);
                    assistantMessage.rawContent = JSON.stringify(recursivelyParsed, null, 2);
                }
            }
            
            delete assistantMessage.streamingContent;
            this.scrollNeeded = true;

            // Auto-save conversation
            this.autoSaveConversation();
            
            // Focus back on input
            this.focusMessageInput();

        } catch (error) {
            // Update assistant message with error
            const lastMessage = this.ConversationMessages[this.ConversationMessages.length - 1];
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
            this.IsExecuting = false;
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
        for (const variable of this.AgentVariables) {
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
        
        for (const variable of this.TemplateVariables) {
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
    public AddAgentVariable() {
        this.AgentVariables.push({
            name: '',
            value: '',
            type: 'string'
        });
    }

    /** @deprecated Use {@link AddAgentVariable}. */
    public addAgentVariable() {
      return this.AddAgentVariable();
    }

    /**
     * Removes an agent variable at the specified index.
     * @param index - Zero-based index of the variable to remove
     */
    public RemoveAgentVariable(index: number) {
        this.AgentVariables.splice(index, 1);
    }

    /** @deprecated Use {@link RemoveAgentVariable}. */
    public removeAgentVariable(index: number) {
      return this.RemoveAgentVariable(index);
    }

    /**
     * Adds a new empty template variable to the collection (prompt mode only).
     * Template variables are used for prompt template rendering.
     */
    public AddTemplateVariable() {
        this.TemplateVariables.push({
            name: '',
            value: '',
            type: 'string'
        });
    }

    /** @deprecated Use {@link AddTemplateVariable}. */
    public addTemplateVariable() {
      return this.AddTemplateVariable();
    }

    /**
     * Removes a template variable at the specified index (prompt mode only).
     * @param index - Zero-based index of the variable to remove
     */
    public RemoveTemplateVariable(index: number) {
        this.TemplateVariables.splice(index, 1);
    }

    /** @deprecated Use {@link RemoveTemplateVariable}. */
    public removeTemplateVariable(index: number) {
      return this.RemoveTemplateVariable(index);
    }

    /**
     * Clears the current conversation after user confirmation.
     * Resets both the message history and the current conversation ID.
     */
    public async ClearConversation() {
        if (this.ConversationMessages.length > 0) {
            if (await this.confirmService.Confirm({ title: 'Clear conversation', message: 'Are you sure you want to clear the conversation?' })) {
                this.ConversationMessages = [];
                this.CurrentConversationId = null;
            }
        }
    }

    /** @deprecated Use {@link ClearConversation}. */
    public async clearConversation() {
      return this.ClearConversation();
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
                this.SavedConversations = parsedData || [];
                
                // Convert date strings back to Date objects
                this.SavedConversations.forEach(conv => {
                    conv.createdAt = new Date(conv.createdAt);
                    conv.updatedAt = new Date(conv.updatedAt);
                    conv.messages.forEach(msg => {
                        msg.timestamp = new Date(msg.timestamp);
                    });
                });
            } else {
                this.SavedConversations = [];
            }
        } catch (error) {
            // Error loading saved conversations
            this.SavedConversations = [];
        }
    }
    
    /**
     * Gets the storage key for saved conversations based on entity type and ID
     */
    private getStorageKey(): string {
        if (!this.entity) {
            return '';
        }
        
        const entityType = this.Mode === 'agent' ? 'agent' : 'prompt';
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
    public SaveConversation() {
        if (this.ConversationMessages.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No messages to save',
                'warning',
                3000
            );
            return;
        }

        // If updating existing conversation, pre-fill the name
        if (this.CurrentConversationId) {
            const currentConv = this.SavedConversations.find(c => c.id === this.CurrentConversationId);
            this.TempConversationName = currentConv ? currentConv.name : '';
        } else {
            this.TempConversationName = '';
        }
        
        this.ShowSaveDialog = true;
        // Focus on input after dialog renders
        setTimeout(() => {
            if (this.saveDialogInput && this.saveDialogInput.nativeElement) {
                const input = this.saveDialogInput.nativeElement;
                input.focus();
                input.select();
            }
        }, 100);
    }

    /** @deprecated Use {@link SaveConversation}. */
    public saveConversation() {
      return this.SaveConversation();
    }
    

    public UpdateTempConversation() {
        this.TempConversationName = this.saveDialogInput?.nativeElement.value.trim() || '';        
    }

    /** @deprecated Use {@link UpdateTempConversation}. */
    public updateTempConversation() {
      return this.UpdateTempConversation();
    }

    /**
     * Handles the save dialog confirmation
     */
    public ConfirmSaveConversation() {
        // Use the temp name from the input
        const convoName = this.saveDialogInput?.nativeElement.value;
        const trimmedName = convoName?.trim() || '';
        
        if (!trimmedName) {
            return;
        }
        
        this.NewConversationName = trimmedName;
        
        const conversation: SavedConversation = {
            id: this.generateMessageId(),
            name: this.NewConversationName.trim(),
            agentId: this.entity?.ID || '',
            agentName: this.getEntityName() || '',
            messages: [...this.ConversationMessages],
            dataContext: this.buildDataContext(),
            templateData: this.Mode === 'agent' ? this.buildTemplateData() : {},
            templateVariables: this.Mode === 'prompt' ? this.buildTemplateVariables() : {},
            advancedParams: this.Mode === 'prompt' ? this.AdvancedParams : undefined,
            selectedModelId: this.Mode === 'prompt' ? this.SelectedModelId : undefined,
            selectedVendorId: this.Mode === 'prompt' ? this.SelectedVendorId : undefined,
            selectedConfigurationId: this.Mode === 'prompt' ? this.SelectedConfigurationId : undefined,
            skipValidation: this.Mode === 'prompt' ? this.SkipValidation : undefined,
            agentConfigurationId: this.Mode === 'agent' ? this.AgentConfigurationId : undefined,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (this.CurrentConversationId) {
            // Update existing conversation
            const index = this.SavedConversations.findIndex(c => c.id === this.CurrentConversationId);
            if (index >= 0) {
                conversation.id = this.CurrentConversationId;
                conversation.createdAt = this.SavedConversations[index].createdAt;
                conversation.name = this.NewConversationName.trim(); // Use the edited name
                this.SavedConversations[index] = conversation;
            } else {
                // Current ID not found, treat as new
                this.SavedConversations.unshift(conversation);
                this.CurrentConversationId = conversation.id;
            }
        } else {
            // Add new conversation
            this.SavedConversations.unshift(conversation);
            this.CurrentConversationId = conversation.id;
        }

        // Limit to 50 saved conversations
        if (this.SavedConversations.length > 50) {
            this.SavedConversations = this.SavedConversations.slice(0, 50);
        }

        // Save to localStorage
        this.saveConversationsToStorage();
        
        MJNotificationService.Instance.CreateSimpleNotification(
            'Conversation saved successfully',
            'success',
            3000
        );
        
        this.ShowSaveDialog = false;
        this.NewConversationName = '';
        this.TempConversationName = '';
    }

    /** @deprecated Use {@link ConfirmSaveConversation}. */
    public confirmSaveConversation() {
      return this.ConfirmSaveConversation();
    }
    
    /**
     * Cancels the save dialog
     */
    public CancelSaveDialog() {
        this.ShowSaveDialog = false;
        this.NewConversationName = '';
        this.TempConversationName = '';
    }

    /** @deprecated Use {@link CancelSaveDialog}. */
    public cancelSaveDialog() {
      return this.CancelSaveDialog();
    }
    
    // Removed debug methods - no longer needed with ngModel binding
    
    /**
     * Saves conversations to localStorage
     */
    private saveConversationsToStorage() {
        try {
            const storageKey = this.getStorageKey();
            localStorage.setItem(storageKey, JSON.stringify(this.SavedConversations));
        } catch (error) {
            // Error saving conversations
            throw error;
        }
    }

    private autoSaveConversation() {
        if (this.CurrentConversationId && this.ConversationMessages.length > 0) {
            const index = this.SavedConversations.findIndex(c => c.id === this.CurrentConversationId);
            if (index >= 0) {
                this.SavedConversations[index].messages = [...this.ConversationMessages];
                this.SavedConversations[index].dataContext = this.buildDataContext();
                if (this.Mode === 'agent') {
                    this.SavedConversations[index].templateData = this.buildTemplateData();
                    this.SavedConversations[index].agentConfigurationId = this.AgentConfigurationId;
                } else {
                    this.SavedConversations[index].templateVariables = this.buildTemplateVariables();
                    this.SavedConversations[index].advancedParams = this.AdvancedParams;
                    this.SavedConversations[index].selectedModelId = this.SelectedModelId;
                    this.SavedConversations[index].selectedVendorId = this.SelectedVendorId;
                    this.SavedConversations[index].selectedConfigurationId = this.SelectedConfigurationId;
                    this.SavedConversations[index].skipValidation = this.SkipValidation;
                }
                this.SavedConversations[index].updatedAt = new Date();
                
                // Save to localStorage
                try {
                    this.saveConversationsToStorage();
                } catch (error) {
                    // Error auto-saving conversation
                }
            }
        }
    }

    public LoadConversation(conversation: SavedConversation) {
        if (this.ConversationMessages.length > 0) {
            this.pendingLoadConversation = conversation;
            this.ShowLoadConfirmDialog = true;
            return;
        }

        this.doLoadConversation(conversation);
    }

    /** @deprecated Use {@link LoadConversation}. */
    public loadConversation(conversation: SavedConversation) {
      return this.LoadConversation(conversation);
    }
    
    /**
     * Confirms loading a conversation after dialog confirmation
     */
    public ConfirmLoadConversation() {
        if (this.pendingLoadConversation) {
            this.doLoadConversation(this.pendingLoadConversation);
            this.ShowLoadConfirmDialog = false;
            this.pendingLoadConversation = null;
        }
    }

    /** @deprecated Use {@link ConfirmLoadConversation}. */
    public confirmLoadConversation() {
      return this.ConfirmLoadConversation();
    }
    
    /**
     * Cancels loading a conversation
     */
    public CancelLoadConversation() {
        this.ShowLoadConfirmDialog = false;
        this.pendingLoadConversation = null;
    }

    /** @deprecated Use {@link CancelLoadConversation}. */
    public cancelLoadConversation() {
      return this.CancelLoadConversation();
    }
    
    /**
     * Actually loads the conversation
     */
    private doLoadConversation(conversation: SavedConversation) {
        this.ConversationMessages = [...conversation.messages];
        this.CurrentConversationId = conversation.id;
        
        // Restore agent variables (unified from dataContext and templateData)
        this.AgentVariables = [];
        const allVariables = { ...conversation.dataContext, ...(conversation.templateData || {}) };
        for (const [key, value] of Object.entries(allVariables)) {
            this.AgentVariables.push({
                name: key,
                value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                type: typeof value === 'boolean' ? 'boolean' : 
                      typeof value === 'number' ? 'number' :
                      typeof value === 'object' ? 'object' : 'string'
            });
        }
        
        // Restore configuration for agent mode
        if (this.Mode === 'agent') {
            if (conversation.agentConfigurationId !== undefined) {
                this.AgentConfigurationId = conversation.agentConfigurationId;
            }
        }
        
        // Restore template variables for prompt mode
        if (this.Mode === 'prompt') {
            this.TemplateVariables = [];
            for (const [key, value] of Object.entries(conversation.templateVariables || {})) {
                this.TemplateVariables.push({
                    name: key,
                    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                    type: typeof value === 'boolean' ? 'boolean' : 
                          typeof value === 'number' ? 'number' :
                          typeof value === 'object' ? 'object' : 'string'
                });
            }
            
            // Restore advanced parameters
            if (conversation.advancedParams) {
                this.AdvancedParams = { ...this.AdvancedParams, ...conversation.advancedParams };
                // Restore stop sequences text
                this.StopSequencesText = this.AdvancedParams.stopSequences?.join(', ') || '';
            }
            
            // Restore model and vendor selection
            if (conversation.selectedModelId !== undefined) {
                this.SelectedModelId = conversation.selectedModelId;
                // Trigger vendor loading if model is selected
                if (this.SelectedModelId) {
                    this.OnModelSelectionChange();
                    // After vendors load, restore vendor selection
                    setTimeout(() => {
                        if (conversation.selectedVendorId !== undefined) {
                            this.SelectedVendorId = conversation.selectedVendorId;
                        }
                    }, 100);
                }
            }
            if (conversation.selectedVendorId !== undefined && !this.SelectedModelId) {
                this.SelectedVendorId = conversation.selectedVendorId;
            }
            
            // Restore configuration selection
            if (conversation.selectedConfigurationId !== undefined) {
                this.SelectedConfigurationId = conversation.selectedConfigurationId;
            }
            
            // Restore skip validation setting
            if (conversation.skipValidation !== undefined) {
                this.SkipValidation = conversation.skipValidation;
            }
        }
        
        // Load agent run from the last assistant message if available
        const lastAssistantMessage = this.ConversationMessages
            .filter(m => m.role === 'assistant' && m.agentRunId)
            .pop();
            
        if (lastAssistantMessage && lastAssistantMessage.agentRunId) {
            
            this.loadAgentRun(lastAssistantMessage.agentRunId);
            this.ExecutionMonitorMode = 'historical';
            this.lastProcessedRunId = lastAssistantMessage.agentRunId;
            
        } else {
            // Clear agent run if no execution found
            this.CurrentAgentRun = null;
            this.ExecutionMonitorMode = 'historical';
            this.lastProcessedRunId = null;
        }

        this.scrollNeeded = true;
        
        MJNotificationService.Instance.CreateSimpleNotification(
            'Conversation loaded',
            'info',
            3000
        );
    }

    public async DeleteConversation(conversation: SavedConversation, event: Event) {
        event.stopPropagation();
        
        if (await this.confirmService.ConfirmDelete({ title: 'Delete Conversation', message: `Delete conversation "${conversation.name}"?` })) {
            const index = this.SavedConversations.findIndex(c => c.id === conversation.id);
            if (index >= 0) {
                this.SavedConversations.splice(index, 1);
                
                // Save to localStorage
                this.saveConversationsToStorage();
                
                if (this.CurrentConversationId === conversation.id) {
                    this.CurrentConversationId = null;
                }
                
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Conversation deleted',
                    'info',
                    3000
                );
            }
        }
    }

    /** @deprecated Use {@link DeleteConversation}. */
    public async deleteConversation(conversation: SavedConversation, event: Event) {
      return this.DeleteConversation(conversation, event);
    }

    public ExportConversation() {
        if (this.ConversationMessages.length === 0) {
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
                type: this.Mode
            },
            messages: this.ConversationMessages,
            dataContext: this.buildDataContext(),
            exportedAt: new Date().toISOString()
        };
        
        // Add mode-specific data
        if (this.Mode === 'agent') {
            exportData.templateData = this.buildTemplateData();
            exportData.agentSettings = {
                configurationId: this.AgentConfigurationId
            };
        } else {
            exportData.templateVariables = this.buildTemplateVariables();
            exportData.modelSettings = {
                modelId: this.SelectedModelId,
                vendorId: this.SelectedVendorId,
                configurationId: this.SelectedConfigurationId,
                maxTokens: this.MaxTokens,
                skipValidation: this.SkipValidation
            };
            exportData.advancedParams = this.AdvancedParams;
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const entityName = this.getEntityName()?.replace(/[^a-zA-Z0-9]/g, '-') || 'conversation';
        link.download = `${this.Mode}-conversation-${entityName}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
    }

    /** @deprecated Use {@link ExportConversation}. */
    public exportConversation() {
      return this.ExportConversation();
    }

    public ImportConversation() {
        this.fileInput.nativeElement.click();
    }

    /** @deprecated Use {@link ImportConversation}. */
    public importConversation() {
      return this.ImportConversation();
    }

    public OnFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target?.result as string);

                    // Validate and import
                    if (data.messages && Array.isArray(data.messages)) {
                        if (this.ConversationMessages.length > 0) {
                            if (!(await this.confirmService.Confirm({ title: 'Import conversation', message: 'Importing will replace the current conversation. Continue?' }))) {
                                return;
                            }
                        }
                        
                        this.ConversationMessages = data.messages.map((msg: any) => ({
                            ...msg,
                            timestamp: new Date(msg.timestamp)
                        }));
                        
                        // Import agent variables (unified from dataContext and templateData)
                        this.AgentVariables = [];
                        const importedVariables = { ...(data.dataContext || {}), ...(data.templateData || {}) };
                        for (const [key, value] of Object.entries(importedVariables)) {
                            this.AgentVariables.push({
                                name: key,
                                value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                                type: typeof value === 'boolean' ? 'boolean' : 
                                      typeof value === 'number' ? 'number' :
                                      typeof value === 'object' ? 'object' : 'string'
                            });
                        }
                        
                        // Template data is already imported into agentVariables above
                        
                        // Import advanced parameters if in prompt mode
                        if (this.Mode === 'prompt' && data.advancedParams) {
                            this.AdvancedParams = { ...this.AdvancedParams, ...data.advancedParams };
                            this.StopSequencesText = this.AdvancedParams.stopSequences?.join(', ') || '';
                        }
                        
                        // Import agent settings if in agent mode
                        if (this.Mode === 'agent' && data.agentSettings) {
                            if (data.agentSettings.configurationId !== undefined) {
                                this.AgentConfigurationId = data.agentSettings.configurationId;
                            }
                        }
                        
                        // Import model settings if in prompt mode
                        if (this.Mode === 'prompt' && data.modelSettings) {
                            if (data.modelSettings.modelId !== undefined) {
                                this.SelectedModelId = data.modelSettings.modelId;
                                // Trigger vendor loading if model is selected
                                if (this.SelectedModelId) {
                                    this.OnModelSelectionChange();
                                    // After vendors load, restore vendor selection
                                    setTimeout(() => {
                                        if (data.modelSettings.vendorId !== undefined) {
                                            this.SelectedVendorId = data.modelSettings.vendorId;
                                        }
                                    }, 100);
                                }
                            }
                            if (data.modelSettings.vendorId !== undefined && !this.SelectedModelId) {
                                this.SelectedVendorId = data.modelSettings.vendorId;
                            }
                            if (data.modelSettings.configurationId !== undefined) {
                                this.SelectedConfigurationId = data.modelSettings.configurationId;
                            }
                            if (data.modelSettings.maxTokens !== undefined) {
                                this.MaxTokens = data.modelSettings.maxTokens;
                            }
                            if (data.modelSettings.skipValidation !== undefined) {
                                this.SkipValidation = data.modelSettings.skipValidation;
                            }
                        }
                        
                        this.CurrentConversationId = null;
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

    /** @deprecated Use {@link OnFileSelected}. */
    public onFileSelected(event: Event) {
      return this.OnFileSelected(event);
    }

    /**
     * Handles keyboard input in the message textarea.
     * Sends message on Enter (without Shift) and allows multi-line input with Shift+Enter.
     * @param event - Keyboard event from the textarea
     */
    public HandleKeyPress(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.SendMessage();
        }
    }

    /** @deprecated Use {@link HandleKeyPress}. */
    public handleKeyPress(event: KeyboardEvent) {
      return this.HandleKeyPress(event);
    }

    /**
     * Generates CSS class names for message display based on message properties.
     * @param message - The conversation message to generate classes for
     * @returns Space-separated CSS class string for styling
     */
    public GetMessageClass(message: ConversationMessage): string {
        return `message message-${message.role}${message.isStreaming ? ' streaming' : ''}${message.error ? ' error' : ''}`;
    }

    /** @deprecated Use {@link GetMessageClass}. */
    public getMessageClass(message: ConversationMessage): string {
      return this.GetMessageClass(message);
    }

    /**
     * Formats a Date object into a user-friendly time string.
     * @param date - Date object to format
     * @returns Formatted time string in HH:MM format
     */
    public FormatTimestamp(date: Date): string {
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    /** @deprecated Use {@link FormatTimestamp}. */
    public formatTimestamp(date: Date): string {
      return this.FormatTimestamp(date);
    }

    /**
     * Formats execution time from milliseconds into a human-readable string.
     * Automatically selects appropriate units (minutes, seconds, or milliseconds).
     * @param milliseconds - Execution time in milliseconds
     * @returns Formatted time string (e.g., "2m 30.5s", "1.23s", "500ms")
     */
    public FormatExecutionTime(milliseconds: number): string {
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

    /** @deprecated Use {@link FormatExecutionTime}. */
    public formatExecutionTime(milliseconds: number): string {
      return this.FormatExecutionTime(milliseconds);
    }

    public FormatElapsedTime(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const ms = milliseconds % 1000;
        if (seconds > 0) {
            return `${seconds}.${Math.floor(ms / 100)}s`;
        } else {
            return `${ms}ms`;
        }
    }

    /** @deprecated Use {@link FormatElapsedTime}. */
    public formatElapsedTime(milliseconds: number): string {
      return this.FormatElapsedTime(milliseconds);
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
    public ShowRawJsonDialog(message: ConversationMessage) {
        if (message.rawContent) {
            try {
                const parsed = JSON.parse(message.rawContent);
                if (parsed.agentRunID) {
                    const enhancedParsed = { ...parsed, _agentRunID: parsed.agentRunID };
                    this.CurrentJsonContent = this.FormatJson(enhancedParsed);
                } else {
                    this.CurrentJsonContent = this.FormatJson(parsed);
                }
            } catch {
                this.CurrentJsonContent = message.rawContent;
            }
            this.ShowJsonWindow = true;
        }
    }

    /** @deprecated Use {@link ShowRawJsonDialog}. */
    public showRawJsonDialog(message: ConversationMessage) {
      return this.ShowRawJsonDialog(message);
    }

    /** Closes the JSON viewer window */
    public CloseJsonWindow(): void {
        this.ShowJsonWindow = false;
        this.CurrentJsonContent = '';
    }

    /** @deprecated Use {@link CloseJsonWindow}. */
    public closeJsonWindow(): void {
      return this.CloseJsonWindow();
    }
    
    /**
     * Get the last run ID from conversation messages
     */
    GetLastRunId(): string | null {
        const lastAssistantMessage = this.ConversationMessages
            .filter(m => m.role === 'assistant' && m.agentRunId)
            .pop();
        return lastAssistantMessage?.agentRunId || null;
    }

    /** @deprecated Use {@link GetLastRunId}. */
    getLastRunId(): string | null {
      return this.GetLastRunId();
    }
    
    /**
     * Expands all nodes in the execution monitor
     * Called automatically when execution completes
     */
    private expandAllMonitoringNodes(): void {
        if (this.CurrentAgentRun && this.ExecutionMonitorMode === 'historical') {
            // Force refresh the execution monitor by reassigning the entity
            this.CurrentAgentRun = this.CurrentAgentRun;
            // Note: The execution monitor component should handle auto-expansion internally
        }
    }
    
    
    /**
     * Navigate to the run details form
     */
    NavigateToRun(event: { runId: string; runType: 'agent' | 'prompt' }) {
        if (event.runType === 'agent') {
            RecordNavigationAdapter.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(event.runId));
        } else {
            RecordNavigationAdapter.OpenEntityRecord('MJ: AI Prompt Runs', CompositeKey.FromID(event.runId));
        }
        
        // Emit event so parent window can minimize
        this.RunOpened.emit(event);
    }

    /** @deprecated Use {@link NavigateToRun}. */
    navigateToRun(event: { runId: string; runType: 'agent' | 'prompt' }) {
      return this.NavigateToRun(event);
    }
    
    /**
     * Copies the message content to clipboard.
     * @param message - The message to copy
     */
    public async CopyMessage(message: ConversationMessage) {
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

    /** @deprecated Use {@link CopyMessage}. */
    public async copyMessage(message: ConversationMessage) {
      return this.CopyMessage(message);
    }
    

    /**
     * Focuses the message input textarea.
     */
    private focusMessageInput(): void {
        if (this.messageInput) {
            setTimeout(() => {
                this.messageInput.nativeElement.focus();
            }, 100);
        }
    }

    /**
     * Determines if the provided content is valid JSON.
     * @param content - String content to test
     * @returns True if content can be parsed as JSON, false otherwise
     */
    public IsJsonContent(content: string): boolean {
        if (!content) return false;
        try {
            JSON.parse(content);
            return true;
        } catch {
            return false;
        }
    }

    /** @deprecated Use {@link IsJsonContent}. */
    public isJsonContent(content: string): boolean {
      return this.IsJsonContent(content);
    }

    /**
     * Formats JSON content with proper indentation for display.
     * Also recursively parses any nested JSON strings.
     * @param content - JSON string to format
     * @returns Formatted JSON string or original content if parsing fails
     */
    public FormatJson(content: any): string {
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };

        try {
            let parsed: any;
            if (typeof content === 'string') {
                parsed = JSON.parse(content);
            } else {
                parsed = content;
            }
            
            // Apply recursive JSON parsing
            const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
            return JSON.stringify(recursivelyParsed, null, 2);
        } catch {
            return typeof content === 'string' ? content : JSON.stringify(content);
        }
    }

    /** @deprecated Use {@link FormatJson}. */
    public formatJson(content: any): string {
      return this.FormatJson(content);
    }

    /**
     * Checks if the payload should be displayed (not null, undefined, or empty object)
     * @param payload - The payload to check
     * @returns true if the payload has content, false otherwise
     */
    public hasPayload(payload: any): boolean {
        if (!payload) {
            return false;
        }
        
        // Check if it's an empty object
        if (typeof payload === 'object' && Object.keys(payload).length === 0) {
            return false;
        }
        
        return true;
    }

    /**
     * Toggles the collapsed state of a message's payload section
     * @param message - The message to toggle payload visibility for
     */
    public TogglePayloadCollapse(message: ConversationMessage): void {
        message.payloadCollapsed = !message.payloadCollapsed;
    }

    /** @deprecated Use {@link TogglePayloadCollapse}. */
    public togglePayloadCollapse(message: ConversationMessage): void {
      return this.TogglePayloadCollapse(message);
    }

    /**
     * Formats streaming content with markdown rendering
     * @param message - The message containing streaming content
     * @returns SafeHtml formatted content
     */
    public GetFormattedStreamingContent(message: ConversationMessage): SafeHtml {
        if (!message.streamingContent) {
            return this.sanitizer.sanitize(SecurityContext.HTML, '') || '';
        }
        
        const trimmedContent = message.streamingContent.trim();
        
        // Check if content type is markdown before applying markdown rendering
        const contentType = this.DetectContentType(trimmedContent);
        if (contentType === 'markdown') {
            return this.RenderMarkdown(trimmedContent);
        } else {
            // For plain text, just sanitize and return without extra processing
            return this.sanitizer.sanitize(SecurityContext.HTML, trimmedContent) || '';
        }
    }

    /** @deprecated Use {@link GetFormattedStreamingContent}. */
    public getFormattedStreamingContent(message: ConversationMessage): SafeHtml {
      return this.GetFormattedStreamingContent(message);
    }

    /**
     * Automatically detects the content type of a message for appropriate rendering.
     * Uses pattern matching to identify JSON, Markdown, or plain text content.
     * @param content - Content string to analyze
     * @returns Detected content type ('markdown', 'json', or 'text')
     */
    public DetectContentType(content: string): 'markdown' | 'json' | 'text' {
        if (!content) return 'text';
        
        // Check if it's JSON
        if (this.IsJsonContent(content)) {
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

    /** @deprecated Use {@link DetectContentType}. */
    public detectContentType(content: string): 'markdown' | 'json' | 'text' {
      return this.DetectContentType(content);
    }

    public RenderMarkdown(content: string): SafeHtml {
        // Basic markdown to HTML conversion with improved formatting
        let html = content;
        
        // Escape HTML first
        html = EscapeHTML(html);
        
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

    /** @deprecated Use {@link RenderMarkdown}. */
    public renderMarkdown(content: string): SafeHtml {
      return this.RenderMarkdown(content);
    }

    public GetFormattedContent(message: ConversationMessage): SafeHtml {
        const content = message.content;
        const contentStr = typeof content === 'string' ? content : String(content);
        const contentType = this.DetectContentType(contentStr);
        
        if (contentType === 'json') {
            // Try to extract human-readable content from JSON
            const extractedContent = this.extractHumanReadableContent(contentStr);
            if (extractedContent) {
                // Just render the extracted content
                return this.RenderMarkdown(extractedContent);
            } else {
                // Fallback to inline code editor for JSON display
                return this.renderJsonWithCodeEditor(contentStr);
            }
        } else if (contentType === 'markdown') {
            return this.RenderMarkdown(contentStr);
        } else {
            // Convert plain text to markdown for consistent formatting
            return this.RenderMarkdown(contentStr);
        }
    }

    /** @deprecated Use {@link GetFormattedContent}. */
    public getFormattedContent(message: ConversationMessage): SafeHtml {
      return this.GetFormattedContent(message);
    }

    /**
     * Renders JSON content using an inline code editor component
     */
    private renderJsonWithCodeEditor(jsonStr: string): SafeHtml {
        try {
            // Format the JSON for display
            const formattedJson = this.FormatJson(jsonStr);
            
            // Generate a unique ID for this editor instance
            const editorId = `json-editor-${this.generateMessageId()}`;
            
            // Create the HTML with a placeholder div that we'll replace with the code editor
            const html = `
                <div class="inline-json-editor" data-editor-id="${editorId}" data-json-content="${this.escapeHtmlAttribute(formattedJson)}">
                    <div class="json-editor-container" style="height: 300px; width: 100%; border: 1px solid var(--mj-border-default); border-radius: 4px; overflow: hidden;">
                        <pre style="margin: 0; padding: 12px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; overflow: auto; height: 100%;">${this.escapeHtml(formattedJson)}</pre>
                    </div>
                </div>
            `;
            
            // Note: In a real implementation, we would need to dynamically create the code editor component
            // For now, we'll use a styled pre tag as a fallback
            return this.sanitizer.bypassSecurityTrustHtml(html);
        } catch {
            // If JSON parsing fails, show as plain text
            const html = `<pre style="margin: 0; padding: 12px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; overflow: auto; background: var(--mj-bg-surface-card); border-radius: 4px;">${this.escapeHtml(jsonStr)}</pre>`;
            return this.sanitizer.bypassSecurityTrustHtml(html);
        }
    }
    
    /**
     * Escapes HTML content for use in attributes
     */
    private escapeHtmlAttribute(text: string): string {
        return EscapeHTML(text);
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
    public GetExecutionSummary(message: ConversationMessage): string {
        if (!message.rawContent) return '';
        
        try {
            const parsed = JSON.parse(message.rawContent);
            if (parsed.agentRunID) {
                return `Agent run ID: ${parsed.agentRunID}`;
            }
        } catch {
            // Ignore parse errors
        }
        
        return '';
    }

    /** @deprecated Use {@link GetExecutionSummary}. */
    public getExecutionSummary(message: ConversationMessage): string {
      return this.GetExecutionSummary(message);
    }

    /**
     * Closes the JSON dialog
     */
    public CloseJsonDialog() {
        this.ShowJsonWindow = false;
        this.CurrentJsonContent = '';
    }

    /** @deprecated Use {@link CloseJsonDialog}. */
    public closeJsonDialog() {
      return this.CloseJsonDialog();
    }
    
    /**
     * Copies the JSON content to clipboard
     */
    public CopyJsonContent() {
        if (this.CurrentJsonContent) {
            navigator.clipboard.writeText(this.CurrentJsonContent).then(() => {
                // Success - JSON copied
            }).catch((err) => {
                // Error copying
            });
        }
    }

    /** @deprecated Use {@link CopyJsonContent}. */
    public copyJsonContent() {
      return this.CopyJsonContent();
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
    public HasExtractableContent(message: ConversationMessage): boolean {
        if (!message.content || message.role === 'user') {
            return false;
        }
        
        const contentStr = typeof message.content === 'string' ? message.content : String(message.content);
        if (!this.IsJsonContent(contentStr)) {
            return false;
        }
        
        const extractedContent = this.extractHumanReadableContent(contentStr);
        return extractedContent !== null && extractedContent !== contentStr;
    }

    /** @deprecated Use {@link HasExtractableContent}. */
    public hasExtractableContent(message: ConversationMessage): boolean {
      return this.HasExtractableContent(message);
    }

    /**
     * Determines whether to show the raw toggle button for a message.
     * Combines the logic for raw content availability and extractable content.
     * @param message - The conversation message to check
     * @returns True if the raw toggle should be displayed
     */
    public ShowRawToggle(message: ConversationMessage): boolean {
        return (message.rawContent && !message.isStreaming) || this.HasExtractableContent(message);
    }

    /** @deprecated Use {@link ShowRawToggle}. */
    public showRawToggle(message: ConversationMessage): boolean {
      return this.ShowRawToggle(message);
    }

    private escapeHtml(text: string): string {
        return EscapeHTML(text);
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
    private isAgentEntity(entity: any): entity is MJAIAgentEntityExtended {
        // Check using the EntityInfo property from BaseEntity
        return entity && entity.EntityInfo && entity.EntityInfo.Name === 'MJ: AI Agents';
    }
    
    /**
     * Type guard to check if entity is an AI Prompt
     */
    private isPromptEntity(entity: any): entity is MJAIPromptEntityExtended {
        // Check using the EntityInfo property from BaseEntity
        const result = entity && entity.EntityInfo && entity.EntityInfo.Name === 'MJ: AI Prompts';
        
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
     * Gets the icon class for the current entity
     */
    public GetEntityIconClass(): string {
        if (!this.entity) {
            return this.Mode === 'agent' ? 'fa-solid fa-robot' : 'fa-solid fa-comment-dots';
        }
        
        if (this.isAgentEntity(this.entity)) {
            // Agent entity - check for IconClass
            return (this.entity as any).IconClass || 'fa-solid fa-robot';
        }
        
        // Prompt entity - use default prompt icon
        return 'fa-solid fa-comment-dots';
    }

    /** @deprecated Use {@link GetEntityIconClass}. */
    public getEntityIconClass(): string {
      return this.GetEntityIconClass();
    }
    
    /**
     * Checks if the entity has a logo URL
     */
    public HasEntityLogo(): boolean {
        if (!this.entity || !this.isAgentEntity(this.entity)) {
            return false;
        }
        return !!(this.entity as any).LogoURL;
    }

    /** @deprecated Use {@link HasEntityLogo}. */
    public hasEntityLogo(): boolean {
      return this.HasEntityLogo();
    }
    
    /**
     * Gets the logo URL for the entity (agent only)
     */
    public GetEntityLogoURL(): string {
        if (!this.entity || !this.isAgentEntity(this.entity)) {
            return '';
        }
        return (this.entity as any).LogoURL || '';
    }

    /** @deprecated Use {@link GetEntityLogoURL}. */
    public getEntityLogoURL(): string {
      return this.GetEntityLogoURL();
    }
    
    /**
     * Updates stop sequences from the textarea input
     */
    public UpdateStopSequences() {
        if (this.StopSequencesText.trim() === '') {
            this.AdvancedParams.stopSequences = [];
        } else {
            // Split by comma and trim each sequence
            this.AdvancedParams.stopSequences = this.StopSequencesText
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        }
    }

    /** @deprecated Use {@link UpdateStopSequences}. */
    public updateStopSequences() {
      return this.UpdateStopSequences();
    }
    
    /**
     * Toggles the advanced parameters expansion panel
     */
    public ToggleAdvancedParams() {
        this.AdvancedParamsExpanded = !this.AdvancedParamsExpanded;
    }

    /** @deprecated Use {@link ToggleAdvancedParams}. */
    public toggleAdvancedParams() {
      return this.ToggleAdvancedParams();
    }
    
    /**
     * Navigates to the AI Agent Run form to view detailed execution information
     * @param agentRunId - The ID of the agent run to view
     */
    public navigateToAgentRun({runId, runType}: {runId: string, runType: 'agent' | 'prompt'}) {
        if (runId && runType==='agent') {
            RecordNavigationAdapter.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(runId));
            // Request minimization from our container
            this.MinimizeRequested.emit();
        }
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
            console.log('📝 Raw Messages field:', promptRun.Messages);
            
            // Set the model/vendor/configuration
            if (promptRun.ModelID) {
                this.SelectedModelId = promptRun.ModelID;
            }
            if (promptRun.VendorID) {
                this.SelectedVendorId = promptRun.VendorID;
            }
            if (promptRun.ConfigurationID) {
                this.SelectedConfigurationId = promptRun.ConfigurationID;
            }
            
            // Set advanced parameters
            if (promptRun.Temperature != null) {
                this.AdvancedParams.temperature = promptRun.Temperature;
            }
            if (promptRun.TopP != null) {
                this.AdvancedParams.topP = promptRun.TopP;
            }
            if (promptRun.TopK != null) {
                this.AdvancedParams.topK = promptRun.TopK;
            }
            if (promptRun.MinP != null) {
                this.AdvancedParams.minP = promptRun.MinP;
            }
            if (promptRun.FrequencyPenalty != null) {
                this.AdvancedParams.frequencyPenalty = promptRun.FrequencyPenalty;
            }
            if (promptRun.PresencePenalty != null) {
                this.AdvancedParams.presencePenalty = promptRun.PresencePenalty;
            }
            if (promptRun.Seed != null) {
                this.AdvancedParams.seed = promptRun.Seed;
            }
            
            // Use the extended entity methods to get conversation messages
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
                    timestamp: new Date(),
                    isStreaming: false
                }));
                
                console.log('🎯 Converted messages for test harness:', convertedMessages);
                this.ConversationMessages = convertedMessages;
                
                // Store original messages for reset functionality
                this.originalPromptRunMessages = [...convertedMessages];
                
                // Reset re-run execution state
                this.HasExecutedRerun = false;
                
                console.log('✅ conversationMessages set:', this.ConversationMessages);
                
                // Trigger change detection
                this.cdr.detectChanges();
            } else {
                console.log('⚠️ No chat messages found in prompt run');
            }
            
            // Extract and store the system prompt for re-run
            const systemPrompt = promptRun.GetSystemPrompt();
            if (systemPrompt) {
                this.SystemPromptOverride = systemPrompt;
                console.log('📋 System prompt override set');
            }
            
            // Switch to model settings tab for prompt re-runs
            if (this.ActiveTab !== 'modelSettings') {
                this.SelectTab('modelSettings');
            }
        } else {
            console.error('❌ Failed to load prompt run:', promptRunId);
        }
    }

    /** Case-insensitive UUID comparison for configuration ID matching in templates. */
    public IsConfigMatchById(config: MJAIConfigurationEntity, id: string | undefined): boolean {
        return UUIDsEqual(config.ID, id);
    }
}