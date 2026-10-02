import { Component, AfterViewInit, ViewContainerRef, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent, CUSTOM_LAYOUT_TOOLBAR_CONFIG } from '@memberjunction/ng-base-forms';
import { MJAIPromptRunEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { MJAIModelEntity } from "@memberjunction/core-entities";
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { MJAIPromptRunFormComponent } from '../../generated/Entities/MJAIPromptRun/mjaipromptrun.form.component';
import { SharedService } from '@memberjunction/ng-shared';
import { ChatMessage } from '@memberjunction/ai';
import { TestHarnessWindowManagerService } from '@memberjunction/ng-ai-test-harness';
import { ParseJSONOptions, ParseJSONRecursive } from '@memberjunction/global';

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Runs')
@Component({
  standalone: false,
    selector: 'mj-ai-prompt-run-form',
    templateUrl: './ai-prompt-run-form.component.html',
    styleUrls: ['./ai-prompt-run-form.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJAIPromptRunFormComponentExtended extends MJAIPromptRunFormComponent implements AfterViewInit, OnDestroy {
    public record!: MJAIPromptRunEntityExtended;
    public readonly ToolbarConfig = CUSTOM_LAYOUT_TOOLBAR_CONFIG;

    /** @deprecated Use {@link ToolbarConfig}. */
    public get toolbarConfig() {
      return this.ToolbarConfig;
    }

    /** Custom-layout AI Prompt Run form looks best full-width on first open. */
    public override getDefaultFormWidthMode(): 'centered' | 'full-width' { return 'full-width'; }

    // Related entities
    public Prompt: MJAIPromptEntityExtended | null = null;

    /** @deprecated Use {@link Prompt}. */
    public get prompt(): MJAIPromptEntityExtended | null {
      return this.Prompt;
    }
    /** @deprecated Use {@link Prompt}. */
    public set prompt(value: MJAIPromptEntityExtended | null) {
      this.Prompt = value;
    }
    public model: MJAIModelEntity | null = null;
    public ParentRun: MJAIPromptRunEntityExtended | null = null;

    /** @deprecated Use {@link ParentRun}. */
    public get parentRun(): MJAIPromptRunEntityExtended | null {
      return this.ParentRun;
    }
    /** @deprecated Use {@link ParentRun}. */
    public set parentRun(value: MJAIPromptRunEntityExtended | null) {
      this.ParentRun = value;
    }
    public ChildRuns: MJAIPromptRunEntityExtended[] = [];

    /** @deprecated Use {@link ChildRuns}. */
    public get childRuns(): MJAIPromptRunEntityExtended[] {
      return this.ChildRuns;
    }
    /** @deprecated Use {@link ChildRuns}. */
    public set childRuns(value: MJAIPromptRunEntityExtended[]) {
      this.ChildRuns = value;
    }
    
    // UI state
    public IsLoadingRelatedData = false;

    /** @deprecated Use {@link IsLoadingRelatedData}. */
    public get isLoadingRelatedData() {
      return this.IsLoadingRelatedData;
    }
    /** @deprecated Use {@link IsLoadingRelatedData}. */
    public set isLoadingRelatedData(value) {
      this.IsLoadingRelatedData = value;
    }
    public IsParsingMessages = false;

    /** @deprecated Use {@link IsParsingMessages}. */
    public get isParsingMessages() {
      return this.IsParsingMessages;
    }
    /** @deprecated Use {@link IsParsingMessages}. */
    public set isParsingMessages(value) {
      this.IsParsingMessages = value;
    } // Will be set to true in ngOnInit if there are messages
    public InputExpanded = true;

    /** @deprecated Use {@link InputExpanded}. */
    public get inputExpanded() {
      return this.InputExpanded;
    }
    /** @deprecated Use {@link InputExpanded}. */
    public set inputExpanded(value) {
      this.InputExpanded = value;
    } // Start open as users want to see this
    public MessagesExpanded = true;

    /** @deprecated Use {@link MessagesExpanded}. */
    public get messagesExpanded() {
      return this.MessagesExpanded;
    }
    /** @deprecated Use {@link MessagesExpanded}. */
    public set messagesExpanded(value) {
      this.MessagesExpanded = value;
    }
    public DataExpanded = false;

    /** @deprecated Use {@link DataExpanded}. */
    public get dataExpanded() {
      return this.DataExpanded;
    }
    /** @deprecated Use {@link DataExpanded}. */
    public set dataExpanded(value) {
      this.DataExpanded = value;
    } // Changed to false - often blank
    public RawExpanded = false;

    /** @deprecated Use {@link RawExpanded}. */
    public get rawExpanded() {
      return this.RawExpanded;
    }
    /** @deprecated Use {@link RawExpanded}. */
    public set rawExpanded(value) {
      this.RawExpanded = value;
    }
    public ResultExpanded = false;

    /** @deprecated Use {@link ResultExpanded}. */
    public get resultExpanded() {
      return this.ResultExpanded;
    }
    /** @deprecated Use {@link ResultExpanded}. */
    public set resultExpanded(value) {
      this.ResultExpanded = value;
    } // Start closed for lazy loading
    public MetricsExpanded = false;

    /** @deprecated Use {@link MetricsExpanded}. */
    public get metricsExpanded() {
      return this.MetricsExpanded;
    }
    /** @deprecated Use {@link MetricsExpanded}. */
    public set metricsExpanded(value) {
      this.MetricsExpanded = value;
    }
    public HierarchyExpanded = false;

    /** @deprecated Use {@link HierarchyExpanded}. */
    public get hierarchyExpanded() {
      return this.HierarchyExpanded;
    }
    /** @deprecated Use {@link HierarchyExpanded}. */
    public set hierarchyExpanded(value) {
      this.HierarchyExpanded = value;
    }
    public ValidationExpanded = false;

    /** @deprecated Use {@link ValidationExpanded}. */
    public get validationExpanded() {
      return this.ValidationExpanded;
    }
    /** @deprecated Use {@link ValidationExpanded}. */
    public set validationExpanded(value) {
      this.ValidationExpanded = value;
    } // Start closed for lazy loading
    public ModelSpecificExpanded = false;

    /** @deprecated Use {@link ModelSpecificExpanded}. */
    public get modelSpecificExpanded() {
      return this.ModelSpecificExpanded;
    }
    /** @deprecated Use {@link ModelSpecificExpanded}. */
    public set modelSpecificExpanded(value) {
      this.ModelSpecificExpanded = value;
    } // Start closed for lazy loading
    
    // Track what has been loaded
    private hasLoadedInput = false;
    private hasLoadedResult = false;
    private hasLoadedValidation = false;
    private hasLoadedMetrics = false;
    private hasLoadedModelSpecific = false;
    
    // Formatted values
    public FormattedMessages = '';

    /** @deprecated Use {@link FormattedMessages}. */
    public get formattedMessages() {
      return this.FormattedMessages;
    }
    /** @deprecated Use {@link FormattedMessages}. */
    public set formattedMessages(value) {
      this.FormattedMessages = value;
    }
    public FormattedResult = '';

    /** @deprecated Use {@link FormattedResult}. */
    public get formattedResult() {
      return this.FormattedResult;
    }
    /** @deprecated Use {@link FormattedResult}. */
    public set formattedResult(value) {
      this.FormattedResult = value;
    }
    public FormattedValidationSummary = '';

    /** @deprecated Use {@link FormattedValidationSummary}. */
    public get formattedValidationSummary() {
      return this.FormattedValidationSummary;
    }
    /** @deprecated Use {@link FormattedValidationSummary}. */
    public set formattedValidationSummary(value) {
      this.FormattedValidationSummary = value;
    }
    public FormattedValidationAttempts = '';

    /** @deprecated Use {@link FormattedValidationAttempts}. */
    public get formattedValidationAttempts() {
      return this.FormattedValidationAttempts;
    }
    /** @deprecated Use {@link FormattedValidationAttempts}. */
    public set formattedValidationAttempts(value) {
      this.FormattedValidationAttempts = value;
    }
    public FormattedData = '';

    /** @deprecated Use {@link FormattedData}. */
    public get formattedData() {
      return this.FormattedData;
    }
    /** @deprecated Use {@link FormattedData}. */
    public set formattedData(value) {
      this.FormattedData = value;
    }
    public FormattedModelSelection = '';

    /** @deprecated Use {@link FormattedModelSelection}. */
    public get formattedModelSelection() {
      return this.FormattedModelSelection;
    }
    /** @deprecated Use {@link FormattedModelSelection}. */
    public set formattedModelSelection(value) {
      this.FormattedModelSelection = value;
    }
    public FormattedErrorDetails = '';

    /** @deprecated Use {@link FormattedErrorDetails}. */
    public get formattedErrorDetails() {
      return this.FormattedErrorDetails;
    }
    /** @deprecated Use {@link FormattedErrorDetails}. */
    public set formattedErrorDetails(value) {
      this.FormattedErrorDetails = value;
    }
    public FormattedModelSpecificResponseDetails = '';

    /** @deprecated Use {@link FormattedModelSpecificResponseDetails}. */
    public get formattedModelSpecificResponseDetails() {
      return this.FormattedModelSpecificResponseDetails;
    }
    /** @deprecated Use {@link FormattedModelSpecificResponseDetails}. */
    public set formattedModelSpecificResponseDetails(value) {
      this.FormattedModelSpecificResponseDetails = value;
    }
    
    // Parsed input data
    public ChatMessages: ChatMessage[] = [];

    /** @deprecated Use {@link ChatMessages}. */
    public get chatMessages(): ChatMessage[] {
      return this.ChatMessages;
    }
    /** @deprecated Use {@link ChatMessages}. */
    public set chatMessages(value: ChatMessage[]) {
      this.ChatMessages = value;
    }
    public InputData: any = null;

    /** @deprecated Use {@link InputData}. */
    public get inputData(): any {
      return this.InputData;
    }
    /** @deprecated Use {@link InputData}. */
    public set inputData(value: any) {
      this.InputData = value;
    }
    
    // Validation data
    public ValidationAttempts: any[] = [];

    /** @deprecated Use {@link ValidationAttempts}. */
    public get validationAttempts(): any[] {
      return this.ValidationAttempts;
    }
    /** @deprecated Use {@link ValidationAttempts}. */
    public set validationAttempts(value: any[]) {
      this.ValidationAttempts = value;
    }
    public ValidationSummary: any = null;

    /** @deprecated Use {@link ValidationSummary}. */
    public get validationSummary(): any {
      return this.ValidationSummary;
    }
    /** @deprecated Use {@link ValidationSummary}. */
    public set validationSummary(value: any) {
      this.ValidationSummary = value;
    }

    // Full-screen overlay state
    public FullScreenContent: string | null = null;
    public FullScreenLanguage = 'json';
    public FullScreenTitle = '';

    // Field injections
    private testHarnessWindowService = inject(TestHarnessWindowManagerService);
    private viewContainerRef = inject(ViewContainerRef);
    
    async ngOnInit() {
        await super.ngOnInit();
        if (this.record?.ID) {
            // Set loading state immediately if input panel will be loaded and has messages
            if (this.InputExpanded && this.record.Messages && this.record.Messages.trim() !== '') {
                this.IsParsingMessages = true;
                this.cdr.detectChanges(); // Force immediate update to show spinner
            }
            
            // Load related entities
            await this.loadRelatedData();
            
            // Format ALL JSON fields immediately on load - it's inexpensive
            console.log('🚀 Formatting all JSON fields on init...');
            this.formatAllJsonFields();
            
            // Mark all data as loaded since we're doing it all upfront
            this.hasLoadedInput = true;
            this.hasLoadedResult = true;
            this.hasLoadedValidation = true;
            this.hasLoadedMetrics = true;
            this.hasLoadedModelSpecific = true;
            
            this.IsParsingMessages = false;
            this.cdr.detectChanges();
        }
    }
    
    ngAfterViewInit() {
        // Force change detection to ensure expansion panels render correctly
        setTimeout(() => {
            this.cdr.detectChanges();
        }, 0);
    }
    
    ngOnDestroy() {
        // Clean up any resources
        // Currently no subscriptions or timers to clean up
        // This is here for future use and to complete the lifecycle
    }
    
    OnInputPanelToggle(event: any) {
        const expanded = event as boolean;
        this.InputExpanded = expanded;
        // Data is already formatted on init, no need to do anything
    }

    /** @deprecated Use {@link OnInputPanelToggle}. */
    onInputPanelToggle(event: any) {
      return this.OnInputPanelToggle(event);
    }
    
    OnResultPanelToggle(event: any) {
        const expanded = event as boolean;
        this.ResultExpanded = expanded;
        // Data is already formatted on init, no need to do anything
    }

    /** @deprecated Use {@link OnResultPanelToggle}. */
    onResultPanelToggle(event: any) {
      return this.OnResultPanelToggle(event);
    }
    
    OnValidationPanelToggle(event: any) {
        const expanded = event as boolean;
        this.ValidationExpanded = expanded;
        // Data is already formatted on init, no need to do anything
    }

    /** @deprecated Use {@link OnValidationPanelToggle}. */
    onValidationPanelToggle(event: any) {
      return this.OnValidationPanelToggle(event);
    }
    
    OnMetricsPanelToggle(event: any) {
        const expanded = event as boolean;
        this.MetricsExpanded = expanded;
        // Data is already formatted on init, no need to do anything
    }

    /** @deprecated Use {@link OnMetricsPanelToggle}. */
    onMetricsPanelToggle(event: any) {
      return this.OnMetricsPanelToggle(event);
    }
    
    OnModelSpecificPanelToggle(event: any) {
        const expanded = event as boolean;
        this.ModelSpecificExpanded = expanded;
        // Data is already formatted on init, no need to do anything
    }

    /** @deprecated Use {@link OnModelSpecificPanelToggle}. */
    onModelSpecificPanelToggle(event: any) {
      return this.OnModelSpecificPanelToggle(event);
    }
    
    OnModelSelectionPanelToggle(event: any) {
        const expanded = event as boolean;
        // Data is already formatted on init, no need to do anything
    }

    /** @deprecated Use {@link OnModelSelectionPanelToggle}. */
    onModelSelectionPanelToggle(event: any) {
      return this.OnModelSelectionPanelToggle(event);
    }
    
    private async loadRelatedData() {
        this.IsLoadingRelatedData = true;
        try {
            const md = this.ProviderToUse;
            
            // Load prompt
            if (this.record.PromptID) {
                this.Prompt = await md.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
                if (this.Prompt) {
                    await this.Prompt.Load(this.record.PromptID);
                }
            }
            
            // Load model
            if (this.record.ModelID) {
                this.model = await md.GetEntityObject<MJAIModelEntity>('MJ: AI Models');
                if (this.model) {
                    await this.model.Load(this.record.ModelID);
                }
            }
            
            // Load parent run if exists
            if (this.record.ParentID) {
                this.ParentRun = await md.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs');
                if (this.ParentRun) {
                    await this.ParentRun.Load(this.record.ParentID);
                }
            }
            
            // Load child runs
            await this.loadChildRuns();
        } catch (error) {
            console.error('Error loading related data:', error);
        } finally {
            this.IsLoadingRelatedData = false;
        }
    }
    
    private async loadChildRuns() {
        if (!this.record.ID) return;
        
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<MJAIPromptRunEntityExtended>({
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `ParentID='${this.record.ID}'`,
            OrderBy: 'ExecutionOrder ASC, RunAt DESC',
            ResultType: 'entity_object'
        });
        
        if (result.Success) {
            this.ChildRuns = result.Results || [];
        }
    }
    
    private formatAllJsonFields() {
        if (!this.record) {
            console.warn('formatAllJsonFields called but record is not available');
            return;
        }
        
        console.log('📄 Formatting input data...');
        // Format input/messages data
        const messageData = this.record.ParseMessagesData();
        this.ChatMessages = messageData.chatMessages;
        this.InputData = messageData.inputData;
        this.FormattedMessages = messageData.formattedMessages;
        this.FormattedData = messageData.formattedData;
        console.log('📄 Input data formatted. Chat messages:', this.ChatMessages.length, 'Input data exists:', !!this.InputData);
        
        console.log('📊 Formatting result data...');
        // Format result data
        this.FormattedResult = this.record.GetFormattedResult();
        console.log('📊 Result formatted:', !!this.FormattedResult, 'Length:', this.FormattedResult?.length);
        
        console.log('🔍 Formatting validation data...');
        // Format validation data
        this.loadValidationData();
        
        console.log('📈 Formatting metrics data...');
        // Format metrics data (ModelSelection, ErrorDetails)
        this.formatMetricsData();
        
        console.log('🔧 Formatting model specific data...');
        // Format model specific response details
        this.formatModelSpecificResponseDetails();
        
        // Format error details if available
        if (this.record.ErrorDetails && !this.FormattedErrorDetails) {
            console.log('⚠️ Formatting error details...');
            this.formatErrorDetails();
        }
        
        console.log('✅ All JSON fields formatted');
    }
    
    
    private formatMetricsData() {
        // Format v2.78 JSON fields related to metrics
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };
        
        // Format ModelSelection
        if (this.record.ModelSelection) {
            try {
                const modelSelection = JSON.parse(this.record.ModelSelection);
                const parsed = ParseJSONRecursive(modelSelection, parseOptions);
                this.FormattedModelSelection = JSON.stringify(parsed, null, 2);
            } catch (error) {
                this.FormattedModelSelection = this.record.ModelSelection;
            }
        }
        
        // Format ErrorDetails
        if (this.record.ErrorDetails) {
            try {
                const errorDetails = JSON.parse(this.record.ErrorDetails);
                const parsed = ParseJSONRecursive(errorDetails, parseOptions);
                this.FormattedErrorDetails = JSON.stringify(parsed, null, 2);
            } catch (error) {
                this.FormattedErrorDetails = this.record.ErrorDetails;
            }
        }
        
        // Note: ModelSpecificResponseDetails is now formatted in its own panel toggle method
    }
    
    private formatErrorDetails() {
        if (!this.record.ErrorDetails) {
            this.FormattedErrorDetails = '';
            return;
        }
        
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };
        
        try {
            const errorDetails = JSON.parse(this.record.ErrorDetails);
            const parsed = ParseJSONRecursive(errorDetails, parseOptions);
            this.FormattedErrorDetails = JSON.stringify(parsed, null, 2);
        } catch (error) {
            this.FormattedErrorDetails = this.record.ErrorDetails;
        }
    }
    
    private formatModelSpecificResponseDetails() {
        if (!this.record.ModelSpecificResponseDetails) {
            this.FormattedModelSpecificResponseDetails = '';
            return;
        }
        
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };
        
        try {
            const modelDetails = JSON.parse(this.record.ModelSpecificResponseDetails);
            const parsed = ParseJSONRecursive(modelDetails, parseOptions);
            this.FormattedModelSpecificResponseDetails = JSON.stringify(parsed, null, 2);
        } catch (error) {
            this.FormattedModelSpecificResponseDetails = this.record.ModelSpecificResponseDetails;
        }
    }
    
    GetStatusColor(): string {
        if (!this.record) return '#6c757d';

        if (!this.record.CompletedAt) {
            return '#ffc107'; // Yellow (still running — CompletedAt is the authority)
        } else if (this.record.Success === true) {
            return '#28a745'; // Green
        } else if (this.record.Success === false) {
            return '#dc3545'; // Red
        } else {
            return '#17a2b8'; // Blue (completed but no success flag)
        }
    }

    /** @deprecated Use {@link GetStatusColor}. */
    getStatusColor(): string {
      return this.GetStatusColor();
    }

    GetStatusIcon(): string {
        if (!this.record) return 'fa-circle';

        if (!this.record.CompletedAt) {
            return 'fa-spinner fa-spin';
        } else if (this.record.Success === true) {
            return 'fa-check-circle';
        } else if (this.record.Success === false) {
            return 'fa-times-circle';
        } else {
            return 'fa-info-circle';
        }
    }

    /** @deprecated Use {@link GetStatusIcon}. */
    getStatusIcon(): string {
      return this.GetStatusIcon();
    }

    GetStatusText(): string {
        if (!this.record) return 'Unknown';

        if (!this.record.CompletedAt) {
            return 'Running';
        } else if (this.record.Success === true) {
            return 'Success';
        } else if (this.record.Success === false) {
            return 'Failed';
        } else {
            return 'Completed';
        }
    }

    /** @deprecated Use {@link GetStatusText}. */
    getStatusText(): string {
      return this.GetStatusText();
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
    
    FormatCost(cost: number | null): string {
        if (!cost) return '-';
        return `$${cost.toFixed(4)}`;
    }

    /** @deprecated Use {@link FormatCost}. */
    formatCost(cost: number | null): string {
      return this.FormatCost(cost);
    }
    
    FormatTokens(tokens: number | null): string {
        if (!tokens) return '-';
        return tokens.toLocaleString();
    }

    /** @deprecated Use {@link FormatTokens}. */
    formatTokens(tokens: number | null): string {
      return this.FormatTokens(tokens);
    }

    /**
     * Total tokens the provider actually processed = uncached (TokensUsed = prompt+completion) PLUS
     * the cache buckets. TokensUsed alone excludes cache by design, so a heavily-cached run looks
     * tiny; this is the real throughput figure for the headline. Equals TokensUsed when no caching.
     */
    get TotalTokensProcessed(): number {
        const r = this.record;
        if (!r) return 0;
        return (r.TokensUsed ?? 0) + (r.TokensCacheRead ?? 0) + (r.TokensCacheWrite ?? 0);
    }

    /** Sum of cache read + write tokens for this run (the cached portion of TotalTokensProcessed). */
    get CachedTokens(): number {
        const r = this.record;
        if (!r) return 0;
        return (r.TokensCacheRead ?? 0) + (r.TokensCacheWrite ?? 0);
    }

    /**
     * Full prompt/input token count = uncached (net) prompt PLUS the cache buckets. TokensPrompt is
     * stored net (cache-read subtracted out by the provider-normalization layer), so on a cached run
     * the raw field understates the real input; this reconstructs the true input the headline should
     * show, with {@link CachedTokens} surfaced as the cached subset. Equals TokensPrompt when no cache.
     */
    get FullPromptTokens(): number {
        const r = this.record;
        if (!r) return 0;
        return (r.TokensPrompt ?? 0) + (r.TokensCacheRead ?? 0) + (r.TokensCacheWrite ?? 0);
    }

    /** Percentage of this run's input tokens served from the provider's prompt cache. */
    get CacheHitRatePct(): number {
        const read = this.record?.TokensCacheRead ?? 0;
        const write = this.record?.TokensCacheWrite ?? 0;
        const totalInput = (this.record?.TokensPrompt ?? 0) + read + write;
        return totalInput > 0 ? (read / totalInput) * 100 : 0;
    }
    
    GetRunTypeIcon(runType: string | null): string {
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

    /** @deprecated Use {@link GetRunTypeIcon}. */
    getRunTypeIcon(runType: string | null): string {
      return this.GetRunTypeIcon(runType);
    }
    
    GetRunTypeColor(runType: string | null): string {
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

    /** @deprecated Use {@link GetRunTypeColor}. */
    getRunTypeColor(runType: string | null): string {
      return this.GetRunTypeColor(runType);
    }
    
    NavigateToEntity(entityName: string, recordId: string | null) {
        if (!recordId) return;
        
        SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(entityName), recordId));
    }

    /** @deprecated Use {@link NavigateToEntity}. */
    navigateToEntity(entityName: string, recordId: string | null) {
      return this.NavigateToEntity(entityName, recordId);
    }
    
    NavigateToOriginalRun() {
        if (this.record?.RerunFromPromptRunID) {
            SharedService.Instance.OpenEntityRecord('MJ: AI Prompt Runs', CompositeKey.FromID(this.record.RerunFromPromptRunID));
        }
    }

    /** @deprecated Use {@link NavigateToOriginalRun}. */
    navigateToOriginalRun() {
      return this.NavigateToOriginalRun();
    }
    
    ReRunPrompt() {
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
            title: `Re-Run: ${this.Prompt?.Name || 'Prompt'}`,
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

    /** @deprecated Use {@link ReRunPrompt}. */
    reRunPrompt() {
      return this.ReRunPrompt();
    }
    
    CopyToClipboard(text: string, fieldName: string) {
        navigator.clipboard.writeText(text).then(() => {
            // Just show a console log for now, as ShowSimpleNotification may not exist
            console.log(`${fieldName} copied to clipboard`);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    /** @deprecated Use {@link CopyToClipboard}. */
    copyToClipboard(text: string, fieldName: string) {
      return this.CopyToClipboard(text, fieldName);
    }
    
    async RefreshData() {
        console.log('🔄 refreshData called');
        if (this.record?.ID) {
            console.log('🔄 Reloading record and formatting all data...');
            
            await this.record.Load(this.record.ID);
            await this.loadRelatedData();
            console.log('🔄 Record reloaded. Result field exists:', !!this.record.Result);
            
            // Format all JSON fields again
            this.formatAllJsonFields();
            
            this.cdr.detectChanges();
        }
    }

    /** @deprecated Use {@link RefreshData}. */
    async refreshData() {
      return this.RefreshData();
    }
    
    public OpenFullScreen(content: string, language: string, title: string): void {
        this.FullScreenContent = content;
        this.FullScreenLanguage = language;
        this.FullScreenTitle = title;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenFullScreen}. */
    public openFullScreen(content: string, language: string, title: string): void {
      return this.OpenFullScreen(content, language, title);
    }

    public CloseFullScreen(): void {
        this.FullScreenContent = null;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseFullScreen}. */
    public closeFullScreen(): void {
      return this.CloseFullScreen();
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
                this.ValidationAttempts = JSON.parse(this.record.ValidationAttempts);
                const recursivelyParsed = ParseJSONRecursive(this.ValidationAttempts, parseOptions);
                this.FormattedValidationAttempts = JSON.stringify(recursivelyParsed, null, 2);
            } catch (error) {
                console.error('Error parsing ValidationAttempts:', error);
                this.ValidationAttempts = [];
                this.FormattedValidationAttempts = '';
            }
        } else {
            this.ValidationAttempts = [];
            this.FormattedValidationAttempts = '';
        }
        
        // Parse validation summary if available
        if (this.record.ValidationSummary) {
            try {
                this.ValidationSummary = JSON.parse(this.record.ValidationSummary);
                const recursivelyParsed = ParseJSONRecursive(this.ValidationSummary, parseOptions);
                this.FormattedValidationSummary = JSON.stringify(recursivelyParsed, null, 2);
            } catch (error) {
                console.error('Error parsing ValidationSummary:', error);
                this.ValidationSummary = null;
                this.FormattedValidationSummary = '';
            }
        } else {
            this.ValidationSummary = null;
            this.FormattedValidationSummary = '';
        }
        
        // Don't auto-expand validation panel anymore - let user expand when needed
    }
}