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
      
      if (this.autoRefresh) {
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
    const [stepsResult, subRunsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${this.aiAgentRunId}'`,
        OrderBy: 'StepNumber',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ParentRunID='${this.aiAgentRunId}'`,
        OrderBy: 'StartedAt',
        ResultType: 'entity_object'
      }
    ]);
    
    if (stepsResult.Success) {
      const steps = stepsResult.Results as AIAgentRunStepEntity[] || [];
      this.stepsSubject$.next(steps);
      
      // Load action logs for action steps
      const actionSteps = steps.filter(s => s.StepType === 'action' || s.StepType === 'tool');
      if (actionSteps.length > 0) {
        await this.loadActionLogs(actionSteps);
      }
      
      // Load prompt runs for prompt steps
      const promptSteps = steps.filter(s => s.StepType === 'prompt');
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
      OrderBy: 'StartedAt',
      ResultType: 'entity_object'
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
      OrderBy: '__mj_CreatedAt',
      ResultType: 'entity_object'
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
    
    // Build main timeline from steps
    steps.forEach(step => {
      const item = this.createTimelineItemFromStep(step, 0);
      
      // Add sub-runs as children
      if (step.StepType === 'subagent') {
        const relatedSubRuns = subRuns.filter(sr => {
          // Match sub-runs that started during this step's execution
          return sr.StartedAt >= step.StartedAt && 
                 (!step.CompletedAt || sr.StartedAt <= step.CompletedAt);
        });
        
        item.children = relatedSubRuns.map(sr => {
          const subRunItem = this.createTimelineItemFromSubRun(sr, 1);
          subRunItem.parentId = item.id;
          return subRunItem;
        });
      }
      
      // Add action logs
      if ((step.StepType === 'tool' || step.StepType === 'action') && step.TargetID) {
        const relatedLogs = actionLogs.filter(log => log.ActionID === step.TargetID);
        item.children = relatedLogs.map(log => {
          const logItem = this.createTimelineItemFromActionLog(log, 1);
          logItem.parentId = item.id;
          return logItem;
        });
      }
      
      // Add prompt runs
      if (step.StepType === 'prompt' && step.TargetID) {
        const relatedPrompts = promptRuns.filter(pr => pr.ID === step.TargetID);
        item.children = relatedPrompts.map(pr => {
          const promptItem = this.createTimelineItemFromPromptRun(pr, 1);
          promptItem.parentId = item.id;
          return promptItem;
        });
      }
      
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
      'prompt': 'fa-microchip',
      'tool': 'fa-tools',
      'subagent': 'fa-robot',
      'decision': 'fa-code-branch',
      'action': 'fa-cog'
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
  
  toggleItemExpansion(item: TimelineItem, event: Event) {
    event.stopPropagation();
    console.log('🔄 Timeline: Toggling expansion for item:', {
      id: item.id,
      type: item.type,
      title: item.title,
      wasExpanded: item.isExpanded,
      willBeExpanded: !item.isExpanded,
      hasData: !!item.data,
      dataId: item.data?.ID
    });
    item.isExpanded = !item.isExpanded;
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