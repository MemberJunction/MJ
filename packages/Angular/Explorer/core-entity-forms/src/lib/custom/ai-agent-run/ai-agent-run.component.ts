import { Component, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { AIAgentRunEntityExtended, AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { TimelineItem, AIAgentRunTimelineComponent } from './ai-agent-run-timeline.component';
import { MJAIAgentRunFormComponent } from '../../generated/Entities/MJAIAgentRun/mjaiagentrun.form.component';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { AIAgentRunAnalyticsComponent } from './ai-agent-run-analytics.component';
import { AIAgentRunVisualizationComponent } from './ai-agent-run-visualization.component';
import { AIAgentRunCostService, AgentRunCostMetrics } from './ai-agent-run-cost.service';
import { AIAgentRunDataHelper } from './ai-agent-run-data.service';
import { ApplicationManager } from '@memberjunction/ng-base-application';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs') 
@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-form',
  templateUrl: './ai-agent-run.component.html',
  styleUrls: ['./ai-agent-run.component.css']
})
export class AIAgentRunFormComponentExtended extends MJAIAgentRunFormComponent implements OnInit, OnDestroy {
  public record!: AIAgentRunEntityExtended;
  
  private destroy$ = new Subject<void>();
  
  // UI state
  activeTab = 'timeline';
  selectedTimelineItem: TimelineItem | null = null;
  jsonPanelExpanded = false;
  loading = false;
  error: string | null = null;
  analyticsLoaded = false;
  visualizationLoaded = false;
  
  agent: AIAgentEntityExtended | null = null;
  
  // Cost metrics using shared service
  costMetrics: AgentRunCostMetrics | null = null;
  
  // Cached parsed results to prevent redundant JSON parsing
  private _cachedParsedResult: string | null = null;
  private _cachedParsedStartingPayload: string | null = null;
  private _cachedParsedFinalPayload: string | null = null;
  private _cachedParsedData: string | null = null;
  
  // Simple parsing state - true when all parsing is complete
  private _allParsingComplete = false;
  
  @ViewChild(AIAgentRunTimelineComponent) timelineComponent?: AIAgentRunTimelineComponent;
  @ViewChild(AIAgentRunAnalyticsComponent) analyticsComponent?: AIAgentRunAnalyticsComponent;
  @ViewChild(AIAgentRunVisualizationComponent) visualizationComponent?: AIAgentRunVisualizationComponent;

  // Field injections
  private navigationService = inject(NavigationService);
  private costService = inject(AIAgentRunCostService);
  private appManager = inject(ApplicationManager);

  // Instance of data helper per component
  public dataHelper = new AIAgentRunDataHelper();
  
  async ngOnInit() {
    await super.ngOnInit();
    
    if (this.record && this.record.ID) {
      await this.dataHelper.loadAgentRunData(this.record.ID);
      await this.loadAgent();
      await this.loadCostMetrics();
      
      // Parse all JSON fields on form load for instant access later
      this.parseAllFields();
    }
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearParsedCache();
    this.dataHelper.clearData();
    this.costMetrics = null;
    this.agent = null;
  }
  
  private async loadAgent() {
    if (!this.record?.AgentID) return;
    
    try {
      const md = new Metadata();
      const agent = await md.GetEntityObject<AIAgentEntityExtended>('MJ: AI Agents');
      if (agent && await agent.Load(this.record.AgentID)) {
        this.agent = agent;
      }
    } catch (error) {
      console.error('Error loading agent:', error);
    }
  }

  private async loadCostMetrics() {
    if (!this.record?.ID) return;
    
    try {
      this.costMetrics = await this.costService.getAgentRunCostMetrics(this.record.ID);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading cost metrics:', error);
      this.costMetrics = {
        totalCost: 0,
        totalPrompts: 0,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        isLoading: false,
        error: 'Failed to load cost data'
      };
    }
  }
  
  changeTab(tab: string) {
    this.activeTab = tab;
    
    // Lazy load visualization when the tab is first accessed
    if (tab === 'visualization' && !this.visualizationLoaded) {
      this.visualizationLoaded = true;
      this.cdr.markForCheck();
    }
    
    // Lazy load analytics when the tab is first accessed
    if (tab === 'analytics' && !this.analyticsLoaded) {
      this.analyticsLoaded = true;
      this.cdr.markForCheck();
    }
  }
  
  
  calculateDuration(start: Date, end?: Date | null): string {
    if (!end) return 'Running...';
    
    const ms = end.getTime() - start.getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }
  
  selectTimelineItem(item: TimelineItem) {
    this.selectedTimelineItem = item;
    this.jsonPanelExpanded = true;
    this.cdr.markForCheck();
  }
  
  closeJsonPanel() {
    this.selectedTimelineItem = null;
    this.cdr.markForCheck();
  }
  
  navigateToSubRun(runId: string) {
    SharedService.Instance.OpenEntityRecord("MJ: AI Agent Runs", CompositeKey.FromID(runId));
  }

  navigateToParentRun() {
    if (this.record.ParentRunID) {
      SharedService.Instance.OpenEntityRecord("MJ: AI Agent Runs", CompositeKey.FromID(this.record.ParentRunID));
    }
  }
  
  navigateToActionLog(logId: string) {
    SharedService.Instance.OpenEntityRecord("MJ: Action Execution Logs", CompositeKey.FromID(logId));
  }
  
  openEntityRecord(entityName: string, recordId: string | null) {
    if (recordId) {
      SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }
  }
  
  navigateToEntityRecord(event: { entityName: string; recordId: string }) {
    SharedService.Instance.OpenEntityRecord(event.entityName, CompositeKey.FromID(event.recordId));
  }

  /**
   * Navigate to the conversation in the Chat application
   */
  navigateToConversation() {
    if (!this.record?.ConversationID) return;

    // Find the Chat app
    const chatApp = this.appManager.GetAllApps().find(app => app.Name === 'Chat');
    if (!chatApp) {
      console.warn('Chat application not found');
      return;
    }

    // Navigate to the Conversations nav item with the conversationId parameter
    this.navigationService.OpenNavItemByName(
      'Conversations',
      { conversationId: this.record.ConversationID },
      chatApp.ID
    );
  }
  
  refreshData() {
    // Reload the agent run record to get latest status
    if (this.record?.ID) {
      // Clear parsed cache when refreshing data
      this.clearParsedCache();
      
      // No panel states to reset in simplified approach
      
      this.record.Load(this.record.ID).then(() => {
        // Clear cost cache and reload
        this.costService.clearCache(this.record.ID);
        this.loadCostMetrics();
        
        // Reload data through helper - this will update all components (force reload for refresh)
        this.dataHelper.loadAgentRunData(this.record.ID, true);
        
        // Trigger analytics refresh
        if (this.analyticsComponent) {
          this.analyticsComponent.loadData();
        }
      });
    }
  }
  
  
  getStatusIcon(status: string): string {
    const iconMap: Record<string, string> = {
      'Running': 'fa-circle-notch fa-spin',
      'Completed': 'fa-check-circle',
      'Failed': 'fa-times-circle',
      'Cancelled': 'fa-ban',
      'Paused': 'fa-pause-circle'
    };
    return iconMap[status] || 'fa-question-circle';
  }
  
  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      // Could show a toast notification here
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }
  
  onAgentRunCompleted(status: string) {
    // Update the record status
    this.record.Status = status as 'Running' | 'Completed' | 'Failed' | 'Cancelled' | 'Paused';
    this.cdr.markForCheck();
    
    // Reload the full record to get updated data
    this.refreshData();
  }
  
  /**
   * Get the Result field with recursive JSON parsing applied
   */
  get parsedResult(): string {
    if (!this.record?.Result) {
      return '';
    }
    
    // Return cached result if available
    if (this._cachedParsedResult !== null) {
      return this._cachedParsedResult;
    }
    
    
    try {
      // First, check if Result is a JSON string that needs to be parsed
      let resultData = this.record.Result;
      try {
        // If Result is a JSON string, parse it first
        resultData = JSON.parse(this.record.Result);
      } catch {
        // If it's not valid JSON, use it as-is
        resultData = this.record.Result;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false // Disable debug logging - regex issue fixed
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(resultData, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedResult = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.Result;
      this._cachedParsedResult = fallbackResult;
      return fallbackResult;
    }
  }
  
  /**
   * Get the Starting Payload field with recursive JSON parsing applied
   */
  get parsedStartingPayload(): string {
    if (!this.record?.StartingPayload) {
      return '';
    }
    
    // Return cached result if available
    if (this._cachedParsedStartingPayload !== null) {
      return this._cachedParsedStartingPayload;
    }
    
    
    try {
      // First, check if StartingPayload is a JSON string that needs to be parsed
      let payloadData = this.record.StartingPayload;
      try {
        // If StartingPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.StartingPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.StartingPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(payloadData, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedStartingPayload = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.StartingPayload;
      this._cachedParsedStartingPayload = fallbackResult;
      return fallbackResult;
    }
  }

  /**
   * Get the Final Payload (state) field with recursive JSON parsing applied
   */
  get parsedFinalPayload(): string {
    if (!this.record?.FinalPayload) return '';
    
    // Return cached result if available
    if (this._cachedParsedFinalPayload !== null) {
      return this._cachedParsedFinalPayload;
    }
    
    try {
      // First, check if FinalPayload is a JSON string that needs to be parsed
      let payloadData = this.record.FinalPayload;
      try {
        // If FinalPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.FinalPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.FinalPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false // Disable debug logging - regex issue fixed
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(payloadData, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedFinalPayload = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.FinalPayload;
      this._cachedParsedFinalPayload = fallbackResult;
      return fallbackResult;
    }
  }

  /**
   * Get the Data field with recursive JSON parsing applied
   */
  get parsedData(): string {
    if (!this.record?.Data) return '';
    
    // Return cached result if available
    if (this._cachedParsedData !== null) {
      return this._cachedParsedData;
    }
    
    try {
      // First, check if Data is a JSON string that needs to be parsed
      let data = this.record.Data;
      try {
        // If Data is a JSON string, parse it first
        data = JSON.parse(this.record.Data);
      } catch {
        // If it's not valid JSON, use it as-is
        data = this.record.Data;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(data, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedData = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.Data;
      this._cachedParsedData = fallbackResult;
      return fallbackResult;
    }
  }
  
  /**
   * Get parsed Starting Payload as an object for deep diff
   */
  get startingPayloadObject(): any {
    if (!this.record?.StartingPayload) return null;
    
    try {
      // First, check if StartingPayload is a JSON string that needs to be parsed
      let payloadData = this.record.StartingPayload;
      try {
        // If StartingPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.StartingPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.StartingPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get parsed Final Payload as an object for deep diff
   */
  get finalPayloadObject(): any {
    if (!this.record?.FinalPayload) return null;
    
    try {
      // First, check if FinalPayload is a JSON string that needs to be parsed
      let payloadData = this.record.FinalPayload;
      try {
        // If FinalPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.FinalPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.FinalPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear all cached parsed results
   */
  private clearParsedCache(): void {
    this._cachedParsedResult = null;
    this._cachedParsedStartingPayload = null;
    this._cachedParsedFinalPayload = null;
    this._cachedParsedData = null;
    this._allParsingComplete = false;
  }
  
  /**
   * Parse all JSON fields at once and cache results
   */
  private parseAllFields(): void {
    try {
      let parsedCount = 0;
      
      // Parse all fields that exist
      if (this.record?.Result) {
        this.parsedResult; // Triggers parsing and caching
        parsedCount++;
      }
      
      if (this.record?.StartingPayload) {
        this.parsedStartingPayload; // Triggers parsing and caching
        parsedCount++;
      }
      
      if (this.record?.FinalPayload) {
        this.parsedFinalPayload; // Triggers parsing and caching
        parsedCount++;
      }
      
      if (this.record?.Data) {
        this.parsedData; // Triggers parsing and caching
        parsedCount++;
      }
      
      this._allParsingComplete = true;
      
    } catch (error) {
      console.error('Error during JSON parsing:', error);
    }
  }
  
  /**
   * Check if all parsing is complete - used by template
   */
  get isParsingComplete(): boolean {
    return this._allParsingComplete;
  }

  /**
   * Check if we have both payloads to show diff
   */
  get showPayloadDiff(): boolean {
    return !!(this.record?.StartingPayload && this.record?.FinalPayload);
  }

  /**
   * Check if selected timeline item is a step with payload changes
   */
  get showStepPayloadDiff(): boolean {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return false;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (stepData && (stepData.PayloadAtStart?.trim().length > 0 
                 || stepData.PayloadAtEnd?.trim().length > 0)) {
      return stepData.PayloadAtStart !== stepData.PayloadAtEnd;
    }
    else {
      return false;
    }
  }

  /**
   * Get parsed PayloadAtStart for the selected step
   */
  get stepPayloadAtStartObject(): any {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return null;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (!stepData || !stepData.PayloadAtStart) {
      return null;
    }
    
    try {
      let payloadData = stepData.PayloadAtStart;
      try {
        payloadData = JSON.parse(stepData.PayloadAtStart);
      } catch {
        payloadData = stepData.PayloadAtStart;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get parsed PayloadAtEnd for the selected step
   */
  get stepPayloadAtEndObject(): any {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return null;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (!stepData || !stepData.PayloadAtEnd) {
      return null;
    }
    
    try {
      let payloadData = stepData.PayloadAtEnd;
      try {
        payloadData = JSON.parse(stepData.PayloadAtEnd);
      } catch {
        payloadData = stepData.PayloadAtEnd;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }
}
