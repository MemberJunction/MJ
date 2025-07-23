import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { Subject, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, map, shareReplay } from 'rxjs/operators';
import { RunView } from '@memberjunction/core';
import { AIAgentRunEntity, AIAgentRunStepEntity, ActionExecutionLogEntity, AIPromptRunEntity } from '@memberjunction/core-entities';

export interface TimelineItem {
  id: string;
  type: 'step' | 'subrun' | 'action' | 'prompt';
  title: string;
  subtitle: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  duration?: string;
  icon: string;
  color: string;
  data: any;
  children?: TimelineItem[];
  level: number;
  parentId?: string;
  isExpanded?: boolean;
  childrenLoaded?: boolean;
  hasNoChildren?: boolean;
}

@Component({
  selector: 'mj-ai-agent-run-timeline',
  templateUrl: './ai-agent-run-timeline.component.html',
  styleUrls: ['./ai-agent-run-timeline.component.css']
})
export class AIAgentRunTimelineComponent implements OnInit, OnDestroy {
  @Input() aiAgentRunId!: string;
  @Input() autoRefresh = false;
  @Input() refreshInterval = 5000;
  @Output() itemSelected = new EventEmitter<TimelineItem>();
  @Output() navigateToEntity = new EventEmitter<{ entityName: string; recordId: string }>();

  private destroy$ = new Subject<void>();
  
  // Observable subjects
  private stepsSubject$ = new BehaviorSubject<AIAgentRunStepEntity[]>([]);
  private subRunsSubject$ = new BehaviorSubject<AIAgentRunEntity[]>([]);
  private actionLogsSubject$ = new BehaviorSubject<ActionExecutionLogEntity[]>([]);
  private promptRunsSubject$ = new BehaviorSubject<AIPromptRunEntity[]>([]);
  
  private _agentRun: AIAgentRunEntity | null = null;
  
  // Cache for sub-agent data to avoid re-loading
  private subAgentDataCache = new Map<string, {
    steps: AIAgentRunStepEntity[];
    promptRuns: AIPromptRunEntity[];
  }>();

  // Public observables
  steps$ = this.stepsSubject$.asObservable();
  subRuns$ = this.subRunsSubject$.asObservable();
  actionLogs$ = this.actionLogsSubject$.asObservable();
  promptRuns$ = this.promptRunsSubject$.asObservable();
  
  timelineItems$: Observable<TimelineItem[]>;
  
  loading = false;
  error: string | null = null;
  selectedItem: TimelineItem | null = null;
  
  constructor() {
    // Combine all data sources to build timeline
    this.timelineItems$ = combineLatest([
      this.steps$,
      this.subRuns$,
      this.actionLogs$,
      this.promptRuns$
    ]).pipe(
      map(([steps, subRuns, actionLogs, promptRuns]) => 
        this.buildTimelineItems(steps, subRuns, actionLogs, promptRuns)
      ),
      shareReplay(1)
    );
  }
  
  ngOnInit() {
    if (this.aiAgentRunId) {
      this.loadData();
      
      if (this.autoRefresh && this._agentRun?.Status == 'Running') {
        this.startAutoRefresh();
      }
    }
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.subAgentDataCache.clear();
  }
  
  private startAutoRefresh() {
    const interval = setInterval(() => {
      this.loadData();
      if (this._agentRun?.Status !== 'Running') {
        clearInterval(interval);
      }
    }, this.refreshInterval);
    
    this.destroy$.subscribe(() => clearInterval(interval));
  }
  
  async loadData() {
    if (!this.aiAgentRunId) return;
    
    this.loading = true;
    this.error = null;
    
    // Clear cache when reloading data
    this.subAgentDataCache.clear();
    
    try {
      await this.loadStepsAndSubRuns();
    } catch (error) {
      this.error = 'Failed to load timeline data';
      console.error('Error loading timeline:', error);
    } finally {
      this.loading = false;
    }
  }
  
  private async loadStepsAndSubRuns() {
    const rv = new RunView();
    
    // First, get all steps to determine what additional data we need
    const stepsResult = await rv.RunView<AIAgentRunStepEntity>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID='${this.aiAgentRunId}'`,
      OrderBy: 'StepNumber'
    });
    
    if (!stepsResult.Success) {
      this.error = 'Failed to load agent run steps';
      return;
    }
    
    const steps = stepsResult.Results as AIAgentRunStepEntity[] || [];
    
    // Build filters for batch loading
    const actionLogIds = steps
      .filter(s => s.StepType === 'Actions' && s.TargetLogID)
      .map(s => s.TargetLogID)
      .filter(id => id != null);
      
    const promptRunIds = steps
      .filter(s => s.StepType === 'Prompt' && s.TargetLogID)
      .map(s => s.TargetLogID)
      .filter(id => id != null);
    
    // Build batch queries array
    const batchQueries: any[] = [
      // Sub-runs query
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ParentRunID='${this.aiAgentRunId}'`,
        OrderBy: 'StartedAt'
      },
      // Current run query
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID='${this.aiAgentRunId}'`
      }
    ];
    
    // Add action logs query if needed
    if (actionLogIds.length > 0) {
      batchQueries.push({
        EntityName: 'Action Execution Logs',
        ExtraFilter: `ID IN ('${actionLogIds.join("','")}')`,
        OrderBy: 'StartedAt'
      });
    }
    
    // Add prompt runs query if needed
    if (promptRunIds.length > 0) {
      batchQueries.push({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN ('${promptRunIds.join("','")}')`,
        OrderBy: '__mj_CreatedAt'
      });
    }
    
    // Execute all queries in one batch
    const batchResults = await rv.RunViews(batchQueries);
    
    // Process results
    let resultIndex = 0;
    
    // Sub-runs
    if (batchResults[resultIndex].Success) {
      const subRuns = batchResults[resultIndex].Results as AIAgentRunEntity[] || [];
      this.subRunsSubject$.next(subRuns);
    }
    resultIndex++;
    
    // Current run
    if (batchResults[resultIndex].Success && batchResults[resultIndex].Results.length > 0) {
      this._agentRun = batchResults[resultIndex].Results[0] as AIAgentRunEntity;
    }
    resultIndex++;
    
    // Action logs (if query was included)
    if (actionLogIds.length > 0 && batchResults[resultIndex]?.Success) {
      const actionLogs = batchResults[resultIndex].Results as ActionExecutionLogEntity[] || [];
      this.actionLogsSubject$.next(actionLogs);
      resultIndex++;
    }
    
    // Prompt runs (if query was included)
    if (promptRunIds.length > 0 && batchResults[resultIndex]?.Success) {
      const promptRuns = batchResults[resultIndex].Results as AIPromptRunEntity[] || [];
      this.promptRunsSubject$.next(promptRuns);
    }
    
    // Update steps last to trigger only one timeline rebuild
    this.stepsSubject$.next(steps);
  }
  
  
  private buildTimelineItems(
    steps: AIAgentRunStepEntity[],
    subRuns: AIAgentRunEntity[],
    actionLogs: ActionExecutionLogEntity[],
    promptRuns: AIPromptRunEntity[]
  ): TimelineItem[] {
    const items: TimelineItem[] = [];
    
    
    // Build main timeline from steps
    steps.forEach(step => {
      const item = this.createTimelineItemFromStep(step, 0, promptRuns);
      
      // Don't load children immediately for sub-agents
      // They will be loaded on demand when expanded
      
      items.push(item);
    });
    
    return items;
  }
  
  private createTimelineItemFromStep(step: AIAgentRunStepEntity, level: number, promptRuns?: AIPromptRunEntity[]): TimelineItem {
    let subtitle = `Type: ${step.StepType}`;
    
    // For prompt steps, try to find the associated prompt run to get model/vendor info
    if (step.StepType === 'Prompt' && step.TargetLogID && promptRuns) {
      const promptRun = promptRuns.find(pr => pr.ID === step.TargetLogID);
      if (promptRun) {
        subtitle = `Model: ${promptRun.Model || 'Unknown'} | Vendor: ${promptRun.Vendor || 'Unknown'}`;
      }
    }
    
    return {
      id: step.ID,
      type: 'step',
      title: step.StepName || `Step ${step.StepNumber}`,
      subtitle: subtitle,
      status: step.Status,
      startTime: step.StartedAt,
      endTime: step.CompletedAt || undefined,
      duration: this.calculateDuration(step.StartedAt, step.CompletedAt),
      icon: this.getStepIcon(step.StepType),
      color: this.getStatusColor(step.Status),
      data: step,
      children: [],
      level,
      isExpanded: false
    };
  }
  
  
  private getStepIcon(stepType: string): string {
    const iconMap: Record<string, string> = {
      'Prompt': 'fa-microchip',
      'Tool': 'fa-tools',
      'Sub-Agent': 'fa-robot',
      'Decision': 'fa-code-branch',
      'Actions': 'fa-cog'
    };
    return iconMap[stepType] || 'fa-circle';
  }
  
  private getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      'Running': 'info',
      'Completed': 'success',
      'Failed': 'error',
      'Cancelled': 'warning',
      'Paused': 'secondary'
    };
    return colorMap[status] || 'secondary';
  }
  
  calculateDuration(start: Date, end?: Date | null): string {
    if (!end) return 'Running...';
    
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const duration = endTime - startTime;
    
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    if (duration < 3600000) return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
    return `${Math.floor(duration / 3600000)}h ${Math.floor((duration % 3600000) / 60000)}m`;
  }
  
  selectItem(item: TimelineItem) {
    this.selectedItem = item;
    this.itemSelected.emit(item);
  }
  
  async toggleItemExpansion(item: TimelineItem, event: Event) {
    event.stopPropagation();
    
    // Toggle expansion state
    item.isExpanded = !item.isExpanded;
    
    // If expanding and children not loaded yet, load them
    if (item.isExpanded && !item.childrenLoaded && item.type === 'step' && item.data?.StepType === 'Sub-Agent') {
      await this.loadSubAgentChildren(item);
    }
  }
  
  private async loadSubAgentChildren(item: TimelineItem) {
    
    try {
      const subAgentRunId = item.data?.TargetLogID;
      
      if (!subAgentRunId) {
        item.hasNoChildren = true;
        item.children = [];
        item.childrenLoaded = true;
        return;
      }
      
      // Check cache first
      const cachedData = this.subAgentDataCache.get(subAgentRunId);
      if (cachedData) {
        item.children = cachedData.steps.map(step => 
          this.createTimelineItemFromStep(step, item.level + 1, cachedData.promptRuns)
        );
        item.childrenLoaded = true;
        return;
      }
      
      const rv = new RunView();
      
      // Load steps first to determine what else we need
      const stepsResult = await rv.RunView<AIAgentRunStepEntity>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID = '${subAgentRunId}'`,
        OrderBy: 'StepNumber'
      });
      
      if (!stepsResult.Success || !stepsResult.Results || stepsResult.Results.length === 0) {
        item.hasNoChildren = true;
        item.children = [];
        item.childrenLoaded = true;
        return;
      }
      
      const steps = stepsResult.Results;
      
      // Get prompt run IDs
      const promptRunIds = steps
        .filter(s => s.StepType === 'Prompt' && s.TargetLogID)
        .map(s => s.TargetLogID)
        .filter(id => id != null);
      
      let promptRuns: AIPromptRunEntity[] = [];
      
      // Load prompt runs if needed
      if (promptRunIds.length > 0) {
        const promptResult = await rv.RunView<AIPromptRunEntity>({
          EntityName: 'MJ: AI Prompt Runs',
          ExtraFilter: `ID IN ('${promptRunIds.join("','")}')`,
          OrderBy: '__mj_CreatedAt'
        });
        
        if (promptResult.Success) {
          promptRuns = promptResult.Results || [];
        }
      }
      
      // Cache the data
      this.subAgentDataCache.set(subAgentRunId, { steps, promptRuns });
      
      // Create timeline items
      item.children = steps.map(step => 
        this.createTimelineItemFromStep(step, item.level + 1, promptRuns)
      );
      
      item.childrenLoaded = true;
    } catch (error) {
      console.error('🔄 Timeline: Error loading sub-agent children:', error);
      item.hasNoChildren = true;
      item.childrenLoaded = true;
    }
  }
  
  navigateToSubRun(runId: string, event: Event) {
    event.stopPropagation();
    this.navigateToEntity.emit({ entityName: 'MJ: AI Agent Runs', recordId: runId });
  }
  
  navigateToActionLog(logId: string, event: Event) {
    event.stopPropagation();
    this.navigateToEntity.emit({ entityName: 'Action Execution Logs', recordId: logId });
  }
  
  navigateToPromptRun(runId: string, event: Event) {
    event.stopPropagation();
    this.navigateToEntity.emit({ entityName: 'MJ: AI Prompt Runs', recordId: runId });
  }
}