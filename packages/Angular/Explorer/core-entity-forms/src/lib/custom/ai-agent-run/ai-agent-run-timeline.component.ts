import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { Subject, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, map, shareReplay } from 'rxjs/operators';
import { Router } from '@angular/router';
import { Metadata, RunView } from '@memberjunction/core';
import { AIAgentRunEntity, AIAgentRunStepEntity, ActionExecutionLogEntity, AIPromptRunEntity, AIAgentEntity } from '@memberjunction/core-entities';

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

  // Public observables
  steps$ = this.stepsSubject$.asObservable();
  subRuns$ = this.subRunsSubject$.asObservable();
  actionLogs$ = this.actionLogsSubject$.asObservable();
  promptRuns$ = this.promptRunsSubject$.asObservable();
  
  timelineItems$: Observable<TimelineItem[]>;
  
  loading = false;
  error: string | null = null;
  selectedItem: TimelineItem | null = null;
  
  constructor(private router: Router) {
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
    const [stepsResult, subRunsResult, runResult] = await rv.RunViews([
      {
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${this.aiAgentRunId}'`,
        OrderBy: 'StepNumber' 
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ParentRunID='${this.aiAgentRunId}'`,
        OrderBy: 'StartedAt' 
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID='${this.aiAgentRunId}'`,
        ResultType: 'entity_object'
      }
    ]);
    
    if (stepsResult.Success) {
      const steps = stepsResult.Results as AIAgentRunStepEntity[] || [];
      this.stepsSubject$.next(steps);
      
      // Load action logs for action steps
      const actionSteps = steps.filter(s => s.StepType === 'Actions');
      if (actionSteps.length > 0) {
        await this.loadActionLogs(actionSteps);
      }
      
      // Load prompt runs for prompt steps
      const promptSteps = steps.filter(s => s.StepType === 'Prompt');
      if (promptSteps.length > 0) {
        await this.loadPromptRuns(promptSteps);
      }
    }
    
    if (subRunsResult.Success) {
      const subRuns = subRunsResult.Results as AIAgentRunEntity[] || [];
      this.subRunsSubject$.next(subRuns);
      
      // For each sub-run that has its own sub-runs, we'll need to handle that in the component
      // This creates the hierarchical structure
    }

    if (runResult.Success) {
      this._agentRun = runResult.Results[0] as AIAgentRunEntity;
    }
  }
  
  private async loadActionLogs(steps: AIAgentRunStepEntity[]) {
    const actionIds = steps
      .map(s => s.TargetID)
      .filter(id => id != null);
      
    if (actionIds.length === 0) return;
    
    const rv = new RunView();
    const result = await rv.RunView<ActionExecutionLogEntity>({
      EntityName: 'Action Execution Logs',
      ExtraFilter: `ActionID IN ('${actionIds.join("','")}')`,
      OrderBy: 'StartedAt' 
    });
    
    if (result.Success) {
      this.actionLogsSubject$.next(result.Results || []);
    }
  }
  
  private async loadPromptRuns(steps: AIAgentRunStepEntity[]) {
    const promptIds = steps
      .map(s => s.TargetID)
      .filter(id => id != null);
      
    if (promptIds.length === 0) return;
    
    const rv = new RunView();
    const result = await rv.RunView<AIPromptRunEntity>({
      EntityName: 'MJ: AI Prompt Runs',
      ExtraFilter: `ID IN ('${promptIds.join("','")}')`,
      OrderBy: '__mj_CreatedAt' 
    });
    
    if (result.Success) {
      this.promptRunsSubject$.next(result.Results || []);
    }
  }
  
  private buildTimelineItems(
    steps: AIAgentRunStepEntity[],
    subRuns: AIAgentRunEntity[],
    actionLogs: ActionExecutionLogEntity[],
    promptRuns: AIPromptRunEntity[]
  ): TimelineItem[] {
    const items: TimelineItem[] = [];
    
    console.log('🔍 Timeline: Building items with:', {
      stepsCount: steps.length,
      subRunsCount: subRuns.length,
      actionLogsCount: actionLogs.length,
      promptRunsCount: promptRuns.length
    });
    
    // Build main timeline from steps
    steps.forEach(step => {
      const item = this.createTimelineItemFromStep(step, 0);
      
      // Don't load children immediately for sub-agents
      // They will be loaded on demand when expanded
      
      items.push(item);
    });
    
    return items;
  }
  
  private createTimelineItemFromStep(step: AIAgentRunStepEntity, level: number): TimelineItem {
    return {
      id: step.ID,
      type: 'step',
      title: step.StepName || `Step ${step.StepNumber}`,
      subtitle: `Type: ${step.StepType}`,
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
  
  private createTimelineItemFromSubRun(run: AIAgentRunEntity, level: number): TimelineItem {
    return {
      id: run.ID,
      type: 'subrun',
      title: `Sub-Agent Run`,
      subtitle: `Agent: ${run.Agent || 'Unknown'}`,
      status: run.Status,
      startTime: run.StartedAt,
      endTime: run.CompletedAt || undefined,
      duration: this.calculateDuration(run.StartedAt, run.CompletedAt),
      icon: 'fa-robot',
      color: this.getStatusColor(run.Status),
      data: run,
      level,
      isExpanded: false
    };
  }
  
  private createTimelineItemFromActionLog(log: ActionExecutionLogEntity, level: number): TimelineItem {
    return {
      id: log.ID,
      type: 'action',
      title: log.Action || 'Action',
      subtitle: `Code: ${log.ResultCode || 'N/A'}`,
      status: log.ResultCode === 'Success' ? 'Completed' : 'Failed',
      startTime: log.StartedAt,
      endTime: log.EndedAt || undefined,
      duration: this.calculateDuration(log.StartedAt, log.EndedAt),
      icon: 'fa-cog',
      color: log.ResultCode === 'Success' ? 'success' : 'error',
      data: log,
      level
    };
  }
  
  private createTimelineItemFromPromptRun(run: AIPromptRunEntity, level: number): TimelineItem {
    return {
      id: run.ID,
      type: 'prompt',
      title: run.Prompt || 'Prompt Run',
      subtitle: `Model: ${run.Model || 'Unknown'}`,
      status: 'Completed',
      startTime: run.__mj_CreatedAt,
      endTime: run.__mj_UpdatedAt,
      duration: this.calculateDuration(run.__mj_CreatedAt, run.__mj_UpdatedAt),
      icon: 'fa-microchip',
      color: 'info',
      data: run,
      level
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
    console.log('🔄 Timeline: Toggling expansion for item:', {
      id: item.id,
      type: item.type,
      title: item.title,
      wasExpanded: item.isExpanded,
      willBeExpanded: !item.isExpanded,
      hasData: !!item.data,
      dataId: item.data?.ID,
      childrenLoaded: item.childrenLoaded
    });
    
    // Toggle expansion state
    item.isExpanded = !item.isExpanded;
    
    // If expanding and children not loaded yet, load them
    if (item.isExpanded && !item.childrenLoaded && item.type === 'step' && item.data?.StepType === 'Sub-Agent') {
      await this.loadSubAgentChildren(item);
    }
  }
  
  private async loadSubAgentChildren(item: TimelineItem) {
    console.log('🔄 Timeline: Loading children for sub-agent step:', {
      id: item.id,
      targetId: item.data?.TargetID,
      targetLogId: item.data?.TargetLogID,
      stepType: item.data?.StepType
    });
    
    try {
      const rv = new RunView();
      
      // For a sub-agent step, the TargetLogID contains the ID of the sub-agent run
      // TargetID is the agent itself, TargetLogID is the actual run instance
      const subAgentRunId = item.data?.TargetLogID;
      
      if (!subAgentRunId) {
        console.log('🔄 Timeline: No TargetLogID found for sub-agent step');
        item.hasNoChildren = true;
        item.children = [];
        item.childrenLoaded = true;
        return;
      }
      
      // Load steps only from the specific sub-agent run
      const stepsResult = await rv.RunView<AIAgentRunStepEntity>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID = '${subAgentRunId}'`,
        OrderBy: 'StepNumber' 
      });
      
      if (stepsResult.Success && stepsResult.Results && stepsResult.Results.length > 0) {
        console.log(`🔄 Timeline: Found ${stepsResult.Results.length} steps for sub-agent run ${subAgentRunId}`);
        
        // Create timeline items directly from steps
        item.children = stepsResult.Results.map(step => 
          this.createTimelineItemFromStep(step, item.level + 1)
        );
      } else {
        console.log('🔄 Timeline: No steps found for sub-agent run');
        item.hasNoChildren = true;
        item.children = [];
      }
      
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