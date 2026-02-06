import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { ActionExecutionLogEntity, ActionEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';

/**
 * Tree-shaking prevention function
 */
export function LoadActionsMonitorResource() {
  // Force inclusion in production builds
}

interface ExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  executionsToday: number;
  executionsThisWeek: number;
  currentlyRunning: number;
}

interface ExecutionTrend {
  date: string;
  successful: number;
  failed: number;
  total: number;
}

/**
 * Execution Monitoring Resource - displays action execution logs and metrics
 */
@RegisterClass(BaseResourceComponent, 'ActionsMonitorResource')
@Component({
  standalone: false,
  selector: 'mj-execution-monitoring',
  templateUrl: './execution-monitoring.component.html',
  styleUrls: ['./execution-monitoring.component.css']
})
export class ExecutionMonitoringComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  public isLoading = true;
  public executions: ActionExecutionLogEntity[] = [];
  public filteredExecutions: ActionExecutionLogEntity[] = [];
  public actions: Map<string, ActionEntity> = new Map();
  
  public metrics: ExecutionMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageDuration: 0,
    executionsToday: 0,
    executionsThisWeek: 0,
    currentlyRunning: 0
  };

  public executionTrends: ExecutionTrend[] = [];
  
  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedResult$ = new BehaviorSubject<string>('all');
  public selectedTimeRange$ = new BehaviorSubject<string>('7days');
  public selectedAction$ = new BehaviorSubject<string>('all');

  public timeRangeOptions = [
    { text: 'Last 24 Hours', value: '24hours' },
    { text: 'Last 7 Days', value: '7days' },
    { text: 'Last 30 Days', value: '30days' },
    { text: 'Last 90 Days', value: '90days' }
  ];

  public resultOptions = [
    { text: 'All Results', value: 'all' },
    { text: 'Success', value: 'Success' },
    { text: 'Failed', value: 'Failed' },
    { text: 'Error', value: 'Error' },
    { text: 'Running', value: 'Running' }
  ];

  public actionOptions: Array<{text: string; value: string}> = [
    { text: 'All Actions', value: 'all' }
  ];

  private destroy$ = new Subject<void>();

  constructor(private navigationService: NavigationService, private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    this.setupFilters();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFilters(): void {
    combineLatest([
      this.searchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.selectedResult$.pipe(distinctUntilChanged()),
      this.selectedTimeRange$.pipe(distinctUntilChanged()),
      this.selectedAction$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      
      const rv = new RunView();
      const [executionsResult, actionsResult] = await rv.RunViews([
        {
          EntityName: 'Action Execution Logs', 
          OrderBy: 'StartedAt DESC' 
        },
        {
          EntityName: 'Actions', 
          OrderBy: 'Name' 
        }
      ]);
      
      if (!executionsResult.Success || !actionsResult.Success) {
        throw new Error('Failed to load data');
      }
      
      const executions = executionsResult.Results as ActionExecutionLogEntity[];
      const actions = actionsResult.Results as ActionEntity[];

      this.executions = executions;
      this.populateActionsMap(actions);
      this.buildActionOptions(actions);
      this.calculateMetrics();
      this.generateExecutionTrends();
      this.applyFilters();

    } catch (error) {
      LogError('Failed to load execution monitoring data', undefined, error);
    } finally {
      this.isLoading = false;
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }


  private populateActionsMap(actions: ActionEntity[]): void {
    this.actions.clear();
    actions.forEach(action => {
      this.actions.set(action.ID, action);
    });
  }

  private buildActionOptions(actions: ActionEntity[]): void {
    this.actionOptions = [
      { text: 'All Actions', value: 'all' },
      ...actions.map(action => ({
        text: action.Name,
        value: action.ID
      }))
    ];
  }

  private calculateMetrics(): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    this.metrics = {
      totalExecutions: this.executions.length,
      successfulExecutions: this.executions.filter(e => e.ResultCode === 'Success').length,
      failedExecutions: this.executions.filter(e => 
        e.ResultCode && ['Failed', 'Error'].includes(e.ResultCode)
      ).length,
      averageDuration: this.calculateAverageDuration(),
      executionsToday: this.executions.filter(e => 
        new Date(e.StartedAt!) >= today
      ).length,
      executionsThisWeek: this.executions.filter(e => 
        new Date(e.StartedAt!) >= weekAgo
      ).length,
      currentlyRunning: this.executions.filter(e => 
        e.ResultCode === 'Running' || !e.EndedAt
      ).length
    };
  }

  private calculateAverageDuration(): number {
    const completedExecutions = this.executions.filter(e => 
      e.StartedAt && e.EndedAt
    );
    
    if (completedExecutions.length === 0) return 0;

    const totalDuration = completedExecutions.reduce((sum, execution) => {
      const start = new Date(execution.StartedAt!).getTime();
      const end = new Date(execution.EndedAt!).getTime();
      return sum + (end - start);
    }, 0);

    return Math.round(totalDuration / completedExecutions.length / 1000); // Average in seconds
  }

  private generateExecutionTrends(): void {
    const trends = new Map<string, ExecutionTrend>();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    // Initialize trends for last 7 days
    last7Days.forEach(date => {
      trends.set(date, {
        date,
        successful: 0,
        failed: 0,
        total: 0
      });
    });

    // Populate trends with execution data
    this.executions.forEach(execution => {
      if (!execution.StartedAt) return;
      
      const date = new Date(execution.StartedAt).toISOString().split('T')[0];
      const trend = trends.get(date);
      
      if (trend) {
        trend.total++;
        if (execution.ResultCode === 'Success') {
          trend.successful++;
        } else if (execution.ResultCode && ['Failed', 'Error'].includes(execution.ResultCode)) {
          trend.failed++;
        }
      }
    });

    this.executionTrends = Array.from(trends.values());
  }

  private applyFilters(): void {
    let filtered = [...this.executions];

    // Apply time range filter
    const timeRange = this.selectedTimeRange$.value;
    if (timeRange !== 'all') {
      const cutoffDate = this.getTimeRangeCutoff(timeRange);
      filtered = filtered.filter(e => 
        e.StartedAt && new Date(e.StartedAt) >= cutoffDate
      );
    }

    // Apply result filter
    const result = this.selectedResult$.value;
    if (result !== 'all') {
      if (result === 'Running') {
        filtered = filtered.filter(e => !e.EndedAt || e.ResultCode === 'Running');
      } else {
        filtered = filtered.filter(e => e.ResultCode === result);
      }
    }

    // Apply action filter
    const actionId = this.selectedAction$.value;
    if (actionId !== 'all') {
      filtered = filtered.filter(e => e.ActionID === actionId);
    }

    // Apply search filter
    const searchTerm = this.searchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(e => {
        const action = this.actions.get(e.ActionID!);
        return (
          action?.Name.toLowerCase().includes(searchTerm) ||
          e.ResultCode?.toLowerCase().includes(searchTerm) ||
          e.UserID?.toLowerCase().includes(searchTerm)
        );
      });
    }

    this.filteredExecutions = filtered;
  }

  private getTimeRangeCutoff(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case '24hours':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7days':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30days':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90days':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(0);
    }
  }

  public onSearchChange(searchTerm: string): void {
    this.searchTerm$.next(searchTerm);
  }

  public onResultFilterChange(result: string): void {
    this.selectedResult$.next(result);
  }

  public onTimeRangeChange(timeRange: string): void {
    this.selectedTimeRange$.next(timeRange);
  }

  public onActionFilterChange(actionId: string): void {
    this.selectedAction$.next(actionId);
  }

  public openExecution(execution: ActionExecutionLogEntity): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: execution.ID }]);
    this.navigationService.OpenEntityRecord('Action Execution Logs', key);
  }

  public openAction(actionId: string): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: actionId }]);
    this.navigationService.OpenEntityRecord('Actions', key);
  }

  public getActionName(actionId: string): string {
    return this.actions.get(actionId)?.Name || `Action ${actionId}`;
  }

  public getResultColor(resultCode: string | null): 'success' | 'warning' | 'error' | 'info' {
    if (!resultCode) return 'info';
    switch (resultCode.toLowerCase()) {
      case 'success': return 'success';
      case 'failed':
      case 'error': return 'error';
      case 'running': return 'warning';
      default: return 'info';
    }
  }

  public getResultIcon(resultCode: string | null): string {
    if (!resultCode) return 'fa-solid fa-question';
    switch (resultCode.toLowerCase()) {
      case 'success': return 'fa-solid fa-check-circle';
      case 'failed':
      case 'error': return 'fa-solid fa-exclamation-circle';
      case 'running': return 'fa-solid fa-spinner fa-spin';
      default: return 'fa-solid fa-info-circle';
    }
  }

  public getDuration(execution: ActionExecutionLogEntity): string {
    if (!execution.StartedAt || !execution.EndedAt) {
      return execution.EndedAt ? 'Unknown' : 'Running';
    }

    const start = new Date(execution.StartedAt).getTime();
    const end = new Date(execution.EndedAt).getTime();
    const duration = Math.round((end - start) / 1000);

    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.round(duration / 60)}m`;
    return `${Math.round(duration / 3600)}h`;
  }

  public getSuccessRate(): number {
    if (this.metrics.totalExecutions === 0) return 0;
    return Math.round((this.metrics.successfulExecutions / this.metrics.totalExecutions) * 100);
  }

  public refreshData(): void {
    this.loadData();
  }

  // Metric card click handlers
  public onTotalExecutionsClick(): void {
    // Reset filters to show all executions
    this.selectedResult$.next('all');
    this.selectedTimeRange$.next('7days');
    this.selectedAction$.next('all');
  }

  public onSuccessRateClick(): void {
    this.selectedResult$.next('Success');
  }

  public onFailedExecutionsClick(): void {
    this.selectedResult$.next('Failed');
  }

  public onRunningExecutionsClick(): void {
    this.selectedResult$.next('Running');
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Execution Monitoring';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }
}