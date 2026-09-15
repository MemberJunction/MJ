import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { MJActionExecutionLogEntity, MJActionEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { ValidateEnumParam, BoundNameList } from '../../shared/agent-tool-validation';
import { FindByIdOrError, FindByIdOrNameOrError } from '../agent-tool-helpers';

/** The two agent-tool modes for the execution monitor: the log list, or a single
 *  selected execution. Drives the mode-scoped tool re-registration. */
type MonitorToolMode = 'list' | 'detail';

/** A tool definition in the shape NavigationService.SetAgentClientTools accepts. */
interface MonitorAgentTool {
  Name: string;
  Description: string;
  ParameterSchema: Record<string, unknown>;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
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
export class ActionExecutionMonitoringComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  public isLoading = true;
  public Executions: MJActionExecutionLogEntity[] = [];

  /** @deprecated Use {@link Executions}. */
  public get executions(): MJActionExecutionLogEntity[] {
    return this.Executions;
  }
  /** @deprecated Use {@link Executions}. */
  public set executions(value: MJActionExecutionLogEntity[]) {
    this.Executions = value;
  }
  public FilteredExecutions: MJActionExecutionLogEntity[] = [];

  /** @deprecated Use {@link FilteredExecutions}. */
  public get filteredExecutions(): MJActionExecutionLogEntity[] {
    return this.FilteredExecutions;
  }
  /** @deprecated Use {@link FilteredExecutions}. */
  public set filteredExecutions(value: MJActionExecutionLogEntity[]) {
    this.FilteredExecutions = value;
  }
  public Actions: Map<string, MJActionEntity> = new Map();

  /** @deprecated Use {@link Actions}. */
  public get actions(): Map<string, MJActionEntity> {
    return this.Actions;
  }
  /** @deprecated Use {@link Actions}. */
  public set actions(value: Map<string, MJActionEntity>) {
    this.Actions = value;
  }
  
  public Metrics: ExecutionMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageDuration: 0,
    executionsToday: 0,
    executionsThisWeek: 0,
    currentlyRunning: 0
  };

  /** @deprecated Use {@link Metrics}. */
  public get metrics(): ExecutionMetrics {
    return this.Metrics;
  }
  /** @deprecated Use {@link Metrics}. */
  public set metrics(value: ExecutionMetrics) {
    this.Metrics = value;
  }

  public ExecutionTrends: ExecutionTrend[] = [];

  /** @deprecated Use {@link ExecutionTrends}. */
  public get executionTrends(): ExecutionTrend[] {
    return this.ExecutionTrends;
  }
  /** @deprecated Use {@link ExecutionTrends}. */
  public set executionTrends(value: ExecutionTrend[]) {
    this.ExecutionTrends = value;
  }
  
  public SearchTerm$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link SearchTerm$}. */
  public get searchTerm$() {
    return this.SearchTerm$;
  }
  /** @deprecated Use {@link SearchTerm$}. */
  public set searchTerm$(value) {
    this.SearchTerm$ = value;
  }
  public SelectedResult$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedResult$}. */
  public get selectedResult$() {
    return this.SelectedResult$;
  }
  /** @deprecated Use {@link SelectedResult$}. */
  public set selectedResult$(value) {
    this.SelectedResult$ = value;
  }
  public SelectedTimeRange$ = new BehaviorSubject<string>('7days');

  /** @deprecated Use {@link SelectedTimeRange$}. */
  public get selectedTimeRange$() {
    return this.SelectedTimeRange$;
  }
  /** @deprecated Use {@link SelectedTimeRange$}. */
  public set selectedTimeRange$(value) {
    this.SelectedTimeRange$ = value;
  }
  public SelectedAction$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedAction$}. */
  public get selectedAction$() {
    return this.SelectedAction$;
  }
  /** @deprecated Use {@link SelectedAction$}. */
  public set selectedAction$(value) {
    this.SelectedAction$ = value;
  }

  public TimeRangeOptions = [
    { text: 'Last 24 Hours', value: '24hours' },
    { text: 'Last 7 Days', value: '7days' },
    { text: 'Last 30 Days', value: '30days' },
    { text: 'Last 90 Days', value: '90days' }
  ];

  /** @deprecated Use {@link TimeRangeOptions}. */
  public get timeRangeOptions() {
    return this.TimeRangeOptions;
  }
  /** @deprecated Use {@link TimeRangeOptions}. */
  public set timeRangeOptions(value) {
    this.TimeRangeOptions = value;
  }

  public ResultOptions = [
    { text: 'All Results', value: 'all' },
    { text: 'Success', value: 'Success' },
    { text: 'Failed', value: 'Failed' },
    { text: 'Error', value: 'Error' },
    { text: 'Running', value: 'Running' }
  ];

  /** @deprecated Use {@link ResultOptions}. */
  public get resultOptions() {
    return this.ResultOptions;
  }
  /** @deprecated Use {@link ResultOptions}. */
  public set resultOptions(value) {
    this.ResultOptions = value;
  }

  public ActionOptions: Array<{text: string; value: string}> = [
    { text: 'All Actions', value: 'all' }
  ];

  /** @deprecated Use {@link ActionOptions}. */
  public get actionOptions(): Array<{text: string; value: string}> {
    return this.ActionOptions;
  }
  /** @deprecated Use {@link ActionOptions}. */
  public set actionOptions(value: Array<{text: string; value: string}>) {
    this.ActionOptions = value;
  }

  /** Allowed result-filter values (mirrors `resultOptions`). */
  private readonly resultFilterValues = ['all', 'Success', 'Failed', 'Error', 'Running'] as const;
  /** Allowed time-range values (mirrors `timeRangeOptions`). */
  private readonly timeRangeValues = ['24hours', '7days', '30days', '90days'] as const;

  /** The currently selected execution (set when the agent/user opens one) — surfaced in context + drives the tool mode. */
  private selectedExecution: MJActionExecutionLogEntity | null = null;
  /**
   * Tracks which mode's tool set is currently registered so {@link syncAgentToolsForMode}
   * only calls into NavigationService on the list↔detail transition, not on every filter change.
   */
  private lastRegisteredToolMode: MonitorToolMode | null = null;

  protected override destroy$ = new Subject<void>();

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.setupFilters();
    this.syncAgentToolsForMode();
    this.loadData();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupFilters(): void {
    combineLatest([
      this.SearchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.SelectedResult$.pipe(distinctUntilChanged()),
      this.SelectedTimeRange$.pipe(distinctUntilChanged()),
      this.SelectedAction$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
      this.syncAgentToolsForMode();
      this.publishAgentContext();
    });
  }

  // ================================================================
  // AI Agent context + client tools
  //
  // 🚨 SAFETY BOUNDARY: This is the Actions app. Executing an action has real
  // side effects. This monitor is VIEW-ONLY run history — it exposes only
  // search / filter / sort / navigate / select / refresh tools to the agent. No
  // action execution (RunAction / re-run) is wired anywhere. Every Handler is
  // tolerant (never throws; returns a structured failure on bad input).
  //
  // MODE-SCOPED TOOLS: the monitor has two contexts — the LOG LIST (no execution
  // selected) and a SELECTED EXECUTION (detail). Detail-only tools (open the
  // selected execution, jump to its action, clear the selection) are only
  // registered while an execution is selected, so the agent never sees a tool
  // that can't apply. COMMON tools (search/filter/refresh) are always present.
  // ================================================================

  /** Publish the current monitor state to the agent. Called on load and on every filter change.
   *  Deep context: execution metrics, success rate, all filter state, the selected execution
   *  (id + action NAME + result), and the bounded list of filtered action names in view. */
  private publishAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      // Execution metrics
      TotalExecutionCount: this.Metrics.totalExecutions,
      SuccessfulExecutionCount: this.Metrics.successfulExecutions,
      FailedExecutionCount: this.Metrics.failedExecutions,
      CurrentlyRunningCount: this.Metrics.currentlyRunning,
      ExecutionsTodayCount: this.Metrics.executionsToday,
      ExecutionsThisWeekCount: this.Metrics.executionsThisWeek,
      AverageDurationSeconds: this.Metrics.averageDuration,
      OverallSuccessRate: this.GetSuccessRate(),
      // What's in view after filtering
      FilteredExecutionCount: this.FilteredExecutions.length,
      VisibleActionNames: BoundNameList(this.distinctVisibleActionNames()),
      // Filter / search state
      CurrentSearchTerm: this.SearchTerm$.value,
      CurrentResultFilter: this.SelectedResult$.value,
      CurrentTimeRangeFilter: this.SelectedTimeRange$.value,
      CurrentActionFilter: this.SelectedAction$.value,
      // Mode + selection (id + action NAME + result)
      ToolMode: this.currentToolMode(),
      SelectedExecutionId: this.selectedExecution?.ID ?? null,
      SelectedExecutionActionName: this.selectedExecution ? this.GetActionName(this.selectedExecution.ActionID!) : null,
      SelectedExecutionResult: this.selectedExecution?.ResultCode ?? null,
    });
  }

  /** Distinct action names among the currently-filtered executions (for context). */
  private distinctVisibleActionNames(): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const e of this.FilteredExecutions) {
      const name = this.Actions.get(e.ActionID!)?.Name;
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  /** The current tool mode: 'detail' when an execution is selected, else 'list'. */
  private currentToolMode(): MonitorToolMode {
    return this.selectedExecution ? 'detail' : 'list';
  }

  /**
   * Re-scope the agent's client tools to the CURRENT mode (list vs. selected-execution
   * detail). Guarded on {@link lastRegisteredToolMode} so it only calls NavigationService on
   * the mode flip — `publishAgentContext` fires on every filter change but the tool set only
   * changes when an execution is selected/deselected.
   */
  private syncAgentToolsForMode(): void {
    const mode = this.currentToolMode();
    if (mode === this.lastRegisteredToolMode) {
      return;
    }
    this.lastRegisteredToolMode = mode;
    this.navigationService.SetAgentClientTools(this, [
      ...this.buildCommonTools(),
      ...(mode === 'detail' ? this.buildDetailTools() : this.buildListTools()),
    ]);
  }

  /** COMMON tools — available in BOTH modes (search, filter, sort, refresh, select-by-id/name). */
  private buildCommonTools(): MonitorAgentTool[] {
    return [
      {
        Name: 'SearchExecutions',
        Description: 'Search the execution log by a free-text term (matches action name, result code, user).',
        ParameterSchema: { type: 'object', properties: { searchTerm: { type: 'string' } }, required: ['searchTerm'] },
        Handler: async (params) => {
          const term = typeof params['searchTerm'] === 'string' ? params['searchTerm'] : '';
          this.OnSearchChange(term);
          return { Success: true };
        },
      },
      {
        Name: 'FilterExecutionsByResult',
        Description: 'Filter executions by result. Allowed: all, Success, Failed, Error, Running.',
        ParameterSchema: { type: 'object', properties: { result: { type: 'string', enum: [...this.resultFilterValues] } }, required: ['result'] },
        Handler: async (params) => {
          const v = ValidateEnumParam(params['result'], this.resultFilterValues, 'result');
          if (!v.ok) return v.result;
          this.OnResultFilterChange(v.value);
          return { Success: true };
        },
      },
      {
        Name: 'FilterExecutionsByTimeRange',
        Description: 'Filter executions by time range. Allowed: 24hours, 7days, 30days, 90days.',
        ParameterSchema: { type: 'object', properties: { timeRange: { type: 'string', enum: [...this.timeRangeValues] } }, required: ['timeRange'] },
        Handler: async (params) => {
          const v = ValidateEnumParam(params['timeRange'], this.timeRangeValues, 'timeRange');
          if (!v.ok) return v.result;
          this.OnTimeRangeChange(v.value);
          return { Success: true };
        },
      },
      {
        Name: 'FilterExecutionsByAction',
        Description: 'Filter executions to a single action by its id OR name (case-insensitive), or "all" to clear the action filter.',
        ParameterSchema: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] },
        Handler: async (params) => {
          const raw = params['action'];
          if (typeof raw !== 'string' || raw.trim() === '') {
            return { Success: false, ErrorMessage: 'A non-empty action id or name is required (use "all" to clear).' };
          }
          if (raw.trim().toLowerCase() === 'all') {
            this.OnActionFilterChange('all');
            return { Success: true };
          }
          const found = FindByIdOrNameOrError(raw, Array.from(this.Actions.values()), 'action');
          if (!found.ok) return found.result;
          this.OnActionFilterChange(found.value.ID);
          return { Success: true, Data: { Id: found.value.ID, Name: found.value.Name } };
        },
      },
      {
        Name: 'ClearMonitorFilters',
        Description: 'Reset all execution-monitor filters (result, time range, action) to their defaults.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.ResetFilters();
          return { Success: true };
        },
      },
      {
        Name: 'RefreshMonitorData',
        Description: 'Reload the execution monitoring data (logs, metrics, trends).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.RefreshData();
          return { Success: true };
        },
      },
    ];
  }

  /** LIST-mode tools — only when NO execution is selected: select an execution (which flips to detail mode). */
  private buildListTools(): MonitorAgentTool[] {
    return [
      {
        Name: 'SelectExecution',
        Description: 'Select an execution-log entry by its id and open its detail record (view-only run history). Selecting it reveals the detail tools.',
        ParameterSchema: { type: 'object', properties: { executionId: { type: 'string' } }, required: ['executionId'] },
        Handler: async (params) => {
          const found = FindByIdOrError(params['executionId'], this.FilteredExecutions.length ? this.FilteredExecutions : this.Executions, 'execution');
          if (!found.ok) return found.result;
          this.selectExecution(found.value);
          return { Success: true, Data: { Id: found.value.ID, ActionName: this.GetActionName(found.value.ActionID!) } };
        },
      },
    ];
  }

  /** DETAIL-mode tools — only when an execution IS selected: open it, jump to its action, clear the selection. */
  private buildDetailTools(): MonitorAgentTool[] {
    return [
      {
        Name: 'OpenSelectedExecutionLog',
        Description: 'Open the detail record for the currently selected execution (view-only run history).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          if (!this.selectedExecution) return { Success: false, ErrorMessage: 'No execution is currently selected.' };
          this.OpenExecution(this.selectedExecution);
          return { Success: true };
        },
      },
      {
        Name: 'OpenSelectedExecutionAction',
        Description: 'Open the action record that the currently selected execution ran (related-record navigation — does NOT run the action).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          const actionId = this.selectedExecution?.ActionID;
          if (!actionId) return { Success: false, ErrorMessage: 'No execution is selected, or it has no associated action.' };
          this.OpenAction(actionId);
          return { Success: true, Data: { ActionName: this.GetActionName(actionId) } };
        },
      },
      {
        Name: 'ClearExecutionSelection',
        Description: 'Clear the current execution selection and return to the log-list tools.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.clearExecutionSelection();
          return { Success: true };
        },
      },
    ];
  }

  /** Select an execution (sets selection, re-scopes tools to detail mode, re-publishes context). */
  private selectExecution(execution: MJActionExecutionLogEntity): void {
    this.selectedExecution = execution;
    this.syncAgentToolsForMode();
    this.publishAgentContext();
    this.OpenExecution(execution);
  }

  /** Clear the execution selection (re-scopes tools back to list mode). */
  private clearExecutionSelection(): void {
    this.selectedExecution = null;
    this.syncAgentToolsForMode();
    this.publishAgentContext();
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const [executionsResult, actionsResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Action Execution Logs', 
          OrderBy: 'StartedAt DESC' 
        },
        {
          EntityName: 'MJ: Actions', 
          OrderBy: 'Name' 
        }
      ]);
      
      if (!executionsResult.Success || !actionsResult.Success) {
        throw new Error('Failed to load data');
      }
      
      const executions = executionsResult.Results as MJActionExecutionLogEntity[];
      const actions = actionsResult.Results as MJActionEntity[];

      this.Executions = executions;
      this.populateActionsMap(actions);
      this.buildActionOptions(actions);
      this.calculateMetrics();
      this.generateExecutionTrends();
      this.applyFilters();
      this.publishAgentContext();

    } catch (error) {
      LogError('Failed to load execution monitoring data', undefined, error);
    } finally {
      this.isLoading = false;
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  private populateActionsMap(actions: MJActionEntity[]): void {
    this.Actions.clear();
    actions.forEach(action => {
      this.Actions.set(action.ID, action);
    });
  }

  private buildActionOptions(actions: MJActionEntity[]): void {
    this.ActionOptions = [
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

    this.Metrics = {
      totalExecutions: this.Executions.length,
      successfulExecutions: this.Executions.filter(e => e.ResultCode === 'Success').length,
      failedExecutions: this.Executions.filter(e => 
        e.ResultCode && ['Failed', 'Error'].includes(e.ResultCode)
      ).length,
      averageDuration: this.calculateAverageDuration(),
      executionsToday: this.Executions.filter(e => 
        new Date(e.StartedAt!) >= today
      ).length,
      executionsThisWeek: this.Executions.filter(e => 
        new Date(e.StartedAt!) >= weekAgo
      ).length,
      currentlyRunning: this.Executions.filter(e => 
        e.ResultCode === 'Running' || !e.EndedAt
      ).length
    };
  }

  private calculateAverageDuration(): number {
    const completedExecutions = this.Executions.filter(e => 
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
    this.Executions.forEach(execution => {
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

    this.ExecutionTrends = Array.from(trends.values());
  }

  private applyFilters(): void {
    let filtered = [...this.Executions];

    // Apply time range filter
    const timeRange = this.SelectedTimeRange$.value;
    if (timeRange !== 'all') {
      const cutoffDate = this.getTimeRangeCutoff(timeRange);
      filtered = filtered.filter(e => 
        e.StartedAt && new Date(e.StartedAt) >= cutoffDate
      );
    }

    // Apply result filter
    const result = this.SelectedResult$.value;
    if (result !== 'all') {
      if (result === 'Running') {
        filtered = filtered.filter(e => !e.EndedAt || e.ResultCode === 'Running');
      } else {
        filtered = filtered.filter(e => e.ResultCode === result);
      }
    }

    // Apply action filter
    const actionId = this.SelectedAction$.value;
    if (actionId !== 'all') {
      filtered = filtered.filter(e => UUIDsEqual(e.ActionID, actionId));
    }

    // Apply search filter
    const searchTerm = this.SearchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(e => {
        const action = this.Actions.get(e.ActionID!);
        return (
          action?.Name.toLowerCase().includes(searchTerm) ||
          e.ResultCode?.toLowerCase().includes(searchTerm) ||
          e.UserID?.toLowerCase().includes(searchTerm)
        );
      });
    }

    this.FilteredExecutions = filtered;
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

  public OnSearchChange(searchTerm: string): void {
    this.SearchTerm$.next(searchTerm);
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(searchTerm: string): void {
    return this.OnSearchChange(searchTerm);
  }

  public OnResultFilterChange(result: string): void {
    this.SelectedResult$.next(result);
  }

  /** @deprecated Use {@link OnResultFilterChange}. */
  public onResultFilterChange(result: string): void {
    return this.OnResultFilterChange(result);
  }

  public OnTimeRangeChange(timeRange: string): void {
    this.SelectedTimeRange$.next(timeRange);
  }

  /** @deprecated Use {@link OnTimeRangeChange}. */
  public onTimeRangeChange(timeRange: string): void {
    return this.OnTimeRangeChange(timeRange);
  }

  public OnActionFilterChange(actionId: string): void {
    this.SelectedAction$.next(actionId);
  }

  /** @deprecated Use {@link OnActionFilterChange}. */
  public onActionFilterChange(actionId: string): void {
    return this.OnActionFilterChange(actionId);
  }

  // ───── Filter-popover plumbing for the [actions] slot ─────

  public get FilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'timeRange',
        type: 'dropdown',
        label: 'Time range',
        icon: 'fa-solid fa-clock',
        options: this.TimeRangeOptions
      },
      {
        key: 'result',
        type: 'dropdown',
        label: 'Result',
        icon: 'fa-solid fa-circle-info',
        options: this.ResultOptions
      },
      {
        key: 'action',
        type: 'dropdown',
        label: 'Action',
        icon: 'fa-solid fa-bolt',
        filterable: true,
        options: this.ActionOptions
      }
    ];
  }
  public get FilterValues(): Record<string, unknown> {
    return {
      timeRange: this.SelectedTimeRange$.value,
      result: this.SelectedResult$.value,
      action: this.SelectedAction$.value
    };
  }
  public get ActiveFilterCount(): number {
    let n = 0;
    if (this.SelectedTimeRange$.value !== '7days') n++;
    if (this.SelectedResult$.value !== 'all') n++;
    if (this.SelectedAction$.value !== 'all') n++;
    return n;
  }
  public OnFilterValuesChange(v: Record<string, unknown>): void {
    const next = (v ?? {}) as { timeRange?: string; result?: string; action?: string };
    if ((next.timeRange ?? '7days') !== this.SelectedTimeRange$.value) {
      this.OnTimeRangeChange(next.timeRange ?? '7days');
    }
    if ((next.result ?? 'all') !== this.SelectedResult$.value) {
      this.OnResultFilterChange(next.result ?? 'all');
    }
    if ((next.action ?? 'all') !== this.SelectedAction$.value) {
      this.OnActionFilterChange(next.action ?? 'all');
    }
  }

  /** @deprecated Use {@link OnFilterValuesChange}. */
  public onFilterValuesChange(v: Record<string, unknown>): void {
    return this.OnFilterValuesChange(v);
  }
  public ResetFilters(): void {
    if (this.SelectedTimeRange$.value !== '7days') this.OnTimeRangeChange('7days');
    if (this.SelectedResult$.value !== 'all') this.OnResultFilterChange('all');
    if (this.SelectedAction$.value !== 'all') this.OnActionFilterChange('all');
  }

  /** @deprecated Use {@link ResetFilters}. */
  public resetFilters(): void {
    return this.ResetFilters();
  }

  public OpenExecution(execution: MJActionExecutionLogEntity): void {
    this.navigationService.OpenEntityRecord('MJ: Action Execution Logs', CompositeKey.FromID(execution.ID));
  }

  /** @deprecated Use {@link OpenExecution}. */
  public openExecution(execution: MJActionExecutionLogEntity): void {
    return this.OpenExecution(execution);
  }

  public OpenAction(actionId: string): void {
    const key = CompositeKey.FromID(actionId);
    this.navigationService.OpenEntityRecord('MJ: Actions', key);
  }

  /** @deprecated Use {@link OpenAction}. */
  public openAction(actionId: string): void {
    return this.OpenAction(actionId);
  }

  public GetActionName(actionId: string): string {
    return this.Actions.get(actionId)?.Name || `Action ${actionId}`;
  }

  /** @deprecated Use {@link GetActionName}. */
  public getActionName(actionId: string): string {
    return this.GetActionName(actionId);
  }

  public GetResultColor(resultCode: string | null): 'success' | 'warning' | 'error' | 'info' {
    if (!resultCode) return 'info';
    switch (resultCode.toLowerCase()) {
      case 'success': return 'success';
      case 'failed':
      case 'error': return 'error';
      case 'running': return 'warning';
      default: return 'info';
    }
  }

  /** @deprecated Use {@link GetResultColor}. */
  public getResultColor(resultCode: string | null): 'success' | 'warning' | 'error' | 'info' {
    return this.GetResultColor(resultCode);
  }

  public GetResultIcon(resultCode: string | null): string {
    if (!resultCode) return 'fa-solid fa-question';
    switch (resultCode.toLowerCase()) {
      case 'success': return 'fa-solid fa-check-circle';
      case 'failed':
      case 'error': return 'fa-solid fa-exclamation-circle';
      case 'running': return 'fa-solid fa-spinner fa-spin';
      default: return 'fa-solid fa-info-circle';
    }
  }

  /** @deprecated Use {@link GetResultIcon}. */
  public getResultIcon(resultCode: string | null): string {
    return this.GetResultIcon(resultCode);
  }

  public GetDuration(execution: MJActionExecutionLogEntity): string {
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

  /** @deprecated Use {@link GetDuration}. */
  public getDuration(execution: MJActionExecutionLogEntity): string {
    return this.GetDuration(execution);
  }

  public GetSuccessRate(): number {
    if (this.Metrics.totalExecutions === 0) return 0;
    return Math.round((this.Metrics.successfulExecutions / this.Metrics.totalExecutions) * 100);
  }

  /** @deprecated Use {@link GetSuccessRate}. */
  public getSuccessRate(): number {
    return this.GetSuccessRate();
  }

  public RefreshData(): void {
    this.loadData();
  }

  /** @deprecated Use {@link RefreshData}. */
  public refreshData(): void {
    return this.RefreshData();
  }

  // Metric card click handlers
  public OnTotalExecutionsClick(): void {
    // Reset filters to show all executions
    this.SelectedResult$.next('all');
    this.SelectedTimeRange$.next('7days');
    this.SelectedAction$.next('all');
  }

  /** @deprecated Use {@link OnTotalExecutionsClick}. */
  public onTotalExecutionsClick(): void {
    return this.OnTotalExecutionsClick();
  }

  public OnSuccessRateClick(): void {
    this.SelectedResult$.next('Success');
  }

  /** @deprecated Use {@link OnSuccessRateClick}. */
  public onSuccessRateClick(): void {
    return this.OnSuccessRateClick();
  }

  public OnFailedExecutionsClick(): void {
    this.SelectedResult$.next('Failed');
  }

  /** @deprecated Use {@link OnFailedExecutionsClick}. */
  public onFailedExecutionsClick(): void {
    return this.OnFailedExecutionsClick();
  }

  public OnRunningExecutionsClick(): void {
    this.SelectedResult$.next('Running');
  }

  /** @deprecated Use {@link OnRunningExecutionsClick}. */
  public onRunningExecutionsClick(): void {
    return this.OnRunningExecutionsClick();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Execution Monitoring';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }
}