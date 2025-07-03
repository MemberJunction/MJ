import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, map, distinctUntilChanged, shareReplay } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { AIAgentRunEntity, AIAgentRunStepEntity, ActionExecutionLogEntity, AIPromptRunEntity, AIAgentEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TimelineItem } from './ai-agent-run-timeline.component';
import { AIAgentRunFormComponent } from '../../generated/Entities/AIAgentRun/aiagentrun.form.component';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';

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
  selectedItemJsonString = '{}';
  
  agent: AIAgentEntity | null = null;

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    protected router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }
  
  async ngOnInit() {
    await super.ngOnInit();
    
    if (this.record) {
      await this.loadAgent();
    }
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
    this.selectedItemJsonString = this.getSelectedItemJson();
    this.jsonPanelExpanded = true;
    this.cdr.detectChanges();
  }
  
  closeJsonPanel() {
    this.selectedTimelineItem = null;
    this.selectedItemJsonString = '{}';
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
    // Timeline component will handle its own refresh
  }
  
  getSelectedItemJson(): string {
    if (!this.selectedTimelineItem) return '{}';
    
    // Get all the data from the entity
    // first check to see if the item is an AIAgentRunStepEntity
    let data;
    if (this.selectedTimelineItem.data instanceof AIAgentRunStepEntity) {
      // If it's a step entity, we need to get the full run data
      data = this.selectedTimelineItem.data.GetAll();
    }
    else {
      data = this.selectedTimelineItem.data;
    }
    
    // Apply recursive JSON parsing to the entire data object with inline extraction
    // This will handle any JSON strings regardless of property names
    // and extract embedded JSON from text strings
    const parseOptions: ParseJSONOptions = {
      extractInlineJson: true,
      maxDepth: 100,
      debug: false // Disable debug logging - regex issue fixed
    };
    const parsedData = ParseJSONRecursive(data, parseOptions);
    
    return JSON.stringify(parsedData, null, 2);
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
}


// Loader function for AIAgentRunFormComponent
export function LoadAIAgentRunFormComponent() {
    // This function is called to ensure the form is loaded
}