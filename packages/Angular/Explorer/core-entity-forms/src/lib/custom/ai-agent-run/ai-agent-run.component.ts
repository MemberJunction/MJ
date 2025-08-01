import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { CompositeKey, Metadata } from '@memberjunction/core';
import { AIAgentRunEntity, AIAgentRunStepEntity, AIAgentEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TimelineItem, AIAgentRunTimelineComponent } from './ai-agent-run-timeline.component';
import { AIAgentRunFormComponent } from '../../generated/Entities/AIAgentRun/aiagentrun.form.component';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { AIAgentRunAnalyticsComponent } from './ai-agent-run-analytics.component';
import { AIAgentRunVisualizationComponent } from './ai-agent-run-visualization.component';
import { AIAgentRunCostService, AgentRunCostMetrics } from './ai-agent-run-cost.service';
import { AIAgentRunDataService } from './ai-agent-run-data.service';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs') 
@Component({
  selector: 'mj-ai-agent-run-form',
  templateUrl: './ai-agent-run.component.html',
  styleUrls: ['./ai-agent-run.component.css']
})
export class AIAgentRunFormComponentExtended extends AIAgentRunFormComponent implements OnInit, OnDestroy {
  public record!: AIAgentRunEntity;
  
  private destroy$ = new Subject<void>();
  
  // UI state
  activeTab = 'timeline';
  selectedTimelineItem: TimelineItem | null = null;
  jsonPanelExpanded = false;
  loading = false;
  error: string | null = null;
  analyticsLoaded = false;
  visualizationLoaded = false;
  
  agent: AIAgentEntity | null = null;
  
  // Cost metrics using shared service
  costMetrics: AgentRunCostMetrics | null = null;
  
  @ViewChild(AIAgentRunTimelineComponent) timelineComponent?: AIAgentRunTimelineComponent;
  @ViewChild(AIAgentRunAnalyticsComponent) analyticsComponent?: AIAgentRunAnalyticsComponent;
  @ViewChild(AIAgentRunVisualizationComponent) visualizationComponent?: AIAgentRunVisualizationComponent;

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    protected router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef,
    private costService: AIAgentRunCostService,
    private dataService: AIAgentRunDataService
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }
  
  async ngOnInit() {
    await super.ngOnInit();
    
    if (this.record && this.record.ID) {
      // Load all data through the service
      await this.dataService.loadAgentRunData(this.record.ID);
      await this.loadAgent();
      await this.loadCostMetrics();
    }
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    // Clear data when component is destroyed
    this.dataService.clearData();
  }
  
  private async loadAgent() {
    if (!this.record?.AgentID) return;
    
    try {
      const md = new Metadata();
      const agent = await md.GetEntityObject<AIAgentEntity>('AI Agents');
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
      this.cdr.detectChanges();
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
      this.cdr.detectChanges();
    }
    
    // Lazy load analytics when the tab is first accessed
    if (tab === 'analytics' && !this.analyticsLoaded) {
      this.analyticsLoaded = true;
      // The component will load data in its ngOnInit
      this.cdr.detectChanges();
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
    this.cdr.detectChanges();
  }
  
  closeJsonPanel() {
    this.selectedTimelineItem = null;
    this.cdr.detectChanges();
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
    SharedService.Instance.OpenEntityRecord("Action Execution Logs", CompositeKey.FromID(logId));
  }
  
  openEntityRecord(entityName: string, recordId: string | null) {
    if (recordId) {
      SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }
  }
  
  navigateToEntityRecord(event: { entityName: string; recordId: string }) {
    SharedService.Instance.OpenEntityRecord(event.entityName, CompositeKey.FromID(event.recordId));
  }
  
  refreshData() {
    // Reload the agent run record to get latest status
    if (this.record?.ID) {
      this.record.Load(this.record.ID).then(() => {
        // Clear cost cache and reload
        this.costService.clearCache(this.record.ID);
        this.loadCostMetrics();
        
        // Reload data through service - this will update all components
        this.dataService.loadAgentRunData(this.record.ID);
        
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
    this.cdr.detectChanges();
    
    // Reload the full record to get updated data
    this.refreshData();
  }
  
  /**
   * Get the Result field with recursive JSON parsing applied
   */
  get parsedResult(): string {
    if (!this.record?.Result) return '';
    
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
      const parsed = ParseJSONRecursive(resultData, parseOptions);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return this.record.Result;
    }
  }
  
  /**
   * Get the Starting Payload field with recursive JSON parsing applied
   */
  get parsedStartingPayload(): string {
    if (!this.record?.StartingPayload) return '';
    
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
      const parsed = ParseJSONRecursive(payloadData, parseOptions);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return this.record.StartingPayload;
    }
  }

  /**
   * Get the Final Payload (state) field with recursive JSON parsing applied
   */
  get parsedFinalPayload(): string {
    if (!this.record?.FinalPayload) return '';
    
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
      const parsed = ParseJSONRecursive(payloadData, parseOptions);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return this.record.FinalPayload;
    }
  }

  /**
   * Get the Data field with recursive JSON parsing applied
   */
  get parsedData(): string {
    if (!this.record?.Data) return '';
    
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
      const parsed = ParseJSONRecursive(data, parseOptions);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return this.record.Data;
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
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
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
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }
}


// Loader function for AIAgentRunFormComponent
export function LoadAIAgentRunFormComponent() {
    // This function is called to ensure the form is loaded
}