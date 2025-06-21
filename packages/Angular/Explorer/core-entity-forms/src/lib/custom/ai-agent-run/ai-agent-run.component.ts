import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, map, distinctUntilChanged, shareReplay } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import { AIAgentRunEntity, AIAgentRunStepEntity, ActionExecutionLogEntity, AIPromptRunEntity, AIAgentEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';

interface TimelineItem {
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
}

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs') 
@Component({
  selector: 'mj-ai-agent-run-form',
  templateUrl: './ai-agent-run.component.html',
  styleUrls: ['./ai-agent-run.component.css']
})
export class AIAgentRunFormComponent extends BaseFormComponent implements OnInit, OnDestroy {
  public record!: AIAgentRunEntity;
  
  private destroy$ = new Subject<void>();
  
  // Observable subjects
  private stepsSubject$ = new BehaviorSubject<AIAgentRunStepEntity[]>([]);
  private subRunsSubject$ = new BehaviorSubject<AIAgentRunEntity[]>([]);
  private actionLogsSubject$ = new BehaviorSubject<ActionExecutionLogEntity[]>([]);
  private promptRunsSubject$ = new BehaviorSubject<AIPromptRunEntity[]>([]);
  private selectedItemSubject$ = new BehaviorSubject<TimelineItem | null>(null);
  
  // Public observables
  steps$ = this.stepsSubject$.asObservable();
  subRuns$ = this.subRunsSubject$.asObservable();
  actionLogs$ = this.actionLogsSubject$.asObservable();
  promptRuns$ = this.promptRunsSubject$.asObservable();
  selectedItem$ = this.selectedItemSubject$.asObservable();
  
  timelineItems$: Observable<TimelineItem[]>;
  
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
    router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
    
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
  
  async ngOnInit() {
    await super.ngOnInit();
    
    if (this.record) {
      await this.loadRelatedData();
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
  
  private async loadRelatedData() {
    if (!this.record?.ID) return;
    
    this.loading = true;
    this.error = null;
    
    try {
      const rv = new RunView();
      
      // Load all related data in parallel
      const [stepsResult, subRunsResult, promptRunsResult] = await rv.RunViews([
        {
          EntityName: 'MJ: AI Agent Run Steps',
          ExtraFilter: `AgentRunID='${this.record.ID}'`,
          OrderBy: 'StepNumber',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: `ParentRunID='${this.record.ID}'`,
          OrderBy: 'StartedAt',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: AI Prompt Runs',
          ExtraFilter: `AgentRunID='${this.record.ID}'`,
          OrderBy: '__mj_CreatedAt',
          ResultType: 'entity_object'
        }
      ]);
      
      if (stepsResult.Success) {
        const steps = stepsResult.Results as AIAgentRunStepEntity[] || [];
        this.stepsSubject$.next(steps);
        
        // Load action logs for action steps
        const actionSteps = steps.filter(s => s.StepType === 'tool');
        if (actionSteps.length > 0) {
          await this.loadActionLogs(actionSteps);
        }
      }
      
      if (subRunsResult.Success) {
        this.subRunsSubject$.next(subRunsResult.Results as AIAgentRunEntity[] || []);
      }
      
      if (promptRunsResult.Success) {
        this.promptRunsSubject$.next(promptRunsResult.Results as AIPromptRunEntity[] || []);
      }
      
    } catch (error) {
      this.error = 'Failed to load related data';
      console.error('Error loading related data:', error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
  
  private async loadActionLogs(actionSteps: AIAgentRunStepEntity[]) {
    const rv = new RunView();
    const startTime = this.record!.StartedAt;
    const endTime = this.record!.CompletedAt || new Date();
    
    const result = await rv.RunView<ActionExecutionLogEntity>({
      EntityName: 'Action Execution Logs',
      ExtraFilter: `StartedAt >= '${startTime.toISOString()}' AND StartedAt <= '${endTime.toISOString()}'`,
      OrderBy: 'StartedAt',
      ResultType: 'entity_object'
    });
    
    if (result.Success) {
      this.actionLogsSubject$.next(result.Results || []);
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
        const relatedSubRuns = subRuns.filter(sr => 
          sr.StartedAt >= step.StartedAt && 
          (!step.CompletedAt || sr.StartedAt <= step.CompletedAt)
        );
        item.children = relatedSubRuns.map(sr => this.createTimelineItemFromSubRun(sr, 1));
      }
      
      // Add action logs
      if (step.StepType === 'tool' && step.TargetID) {
        const relatedLogs = actionLogs.filter(log => 
          log.ActionID === step.TargetID &&
          log.StartedAt >= step.StartedAt &&
          (!step.CompletedAt || log.StartedAt <= step.CompletedAt)
        );
        item.children = relatedLogs.map(log => this.createTimelineItemFromActionLog(log, 1));
      }
      
      // Add prompt runs
      if (step.StepType === 'prompt') {
        const relatedPrompts = promptRuns.filter(pr => 
          pr.__mj_CreatedAt >= step.StartedAt &&
          (!step.CompletedAt || pr.__mj_CreatedAt <= step.CompletedAt)
        );
        item.children = relatedPrompts.map(pr => this.createTimelineItemFromPromptRun(pr, 1));
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
      level
    };
  }
  
  private createTimelineItemFromSubRun(run: AIAgentRunEntity, level: number): TimelineItem {
    return {
      id: run.ID,
      type: 'subrun',
      title: `Sub-Agent Run`,
      subtitle: `Agent ID: ${run.AgentID}`,
      status: run.Status,
      startTime: run.StartedAt,
      endTime: run.CompletedAt || undefined,
      duration: this.calculateDuration(run.StartedAt, run.CompletedAt),
      icon: 'fa-robot',
      color: this.getStatusColor(run.Status),
      data: run,
      level
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
    
    const ms = end.getTime() - start.getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }
  
  selectTimelineItem(item: TimelineItem) {
    this.selectedTimelineItem = item;
    this.selectedItemSubject$.next(item);
    this.selectedItemJsonString = this.getSelectedItemJson();
    this.jsonPanelExpanded = true;
    this.cdr.detectChanges();
  }
  
  closeJsonPanel() {
    this.selectedTimelineItem = null;
    this.selectedItemSubject$.next(null);
    this.selectedItemJsonString = '{}';
    this.cdr.detectChanges();
  }
  
  navigateToSubRun(runId: string) {
    this.router.navigate(['/entities', 'MJ: AI Agent Runs', runId]);
  }
  
  navigateToActionLog(logId: string) {
    this.router.navigate(['/entities', 'Action Execution Logs', logId]);
  }
  
  refreshData() {
    this.loadRelatedData();
  }
  
  getSelectedItemJson(): string {
    if (!this.selectedTimelineItem) return '{}';
    return JSON.stringify(this.selectedTimelineItem.data.GetAll(), null, 2);
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
}