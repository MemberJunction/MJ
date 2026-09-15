import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { MJActionEntity, MJActionCategoryEntity, MJActionExecutionLogEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { ValidateEnumParam, BoundNameList } from '../../shared/agent-tool-validation';
import { FindByIdOrError, FindByIdOrNameOrError } from '../agent-tool-helpers';
interface ActionMetrics {
  totalActions: number;
  activeActions: number;
  pendingActions: number;
  disabledActions: number;
  totalExecutions: number;
  recentExecutions: number;
  successRate: number;
  totalCategories: number;
  aiGeneratedActions: number;
  customActions: number;
}

interface CategoryStats {
  categoryId: string;
  categoryName: string;
  actionCount: number;
  executionCount: number;
  successRate: number;
}

interface ExecutionWithExpanded extends MJActionExecutionLogEntity {
  isExpanded?: boolean;
}

/**
 * Actions Overview Resource - displays action management dashboard
 */
@RegisterClass(BaseResourceComponent, 'ActionsOverviewResource')
@Component({
  standalone: false,
  selector: 'mj-actions-overview',
  templateUrl: './actions-overview.component.html',
  styleUrls: ['./actions-overview.component.css']
})
export class ActionsOverviewComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  public isLoading: boolean = true;
  public Metrics: ActionMetrics = {
    totalActions: 0,
    activeActions: 0,
    pendingActions: 0,
    disabledActions: 0,
    totalExecutions: 0,
    recentExecutions: 0,
    successRate: 0,
    totalCategories: 0,
    aiGeneratedActions: 0,
    customActions: 0
  };

  /** @deprecated Use {@link Metrics}. */
  public get metrics(): ActionMetrics {
    return this.Metrics;
  }
  /** @deprecated Use {@link Metrics}. */
  public set metrics(value: ActionMetrics) {
    this.Metrics = value;
  }

  public CategoryStats: CategoryStats[] = [];

  /** @deprecated Use {@link CategoryStats}. */
  public get categoryStats(): CategoryStats[] {
    return this.CategoryStats;
  }
  /** @deprecated Use {@link CategoryStats}. */
  public set categoryStats(value: CategoryStats[]) {
    this.CategoryStats = value;
  }
  public RecentActions: MJActionEntity[] = [];

  /** @deprecated Use {@link RecentActions}. */
  public get recentActions(): MJActionEntity[] {
    return this.RecentActions;
  }
  /** @deprecated Use {@link RecentActions}. */
  public set recentActions(value: MJActionEntity[]) {
    this.RecentActions = value;
  }
  public RecentExecutions: ExecutionWithExpanded[] = [];

  /** @deprecated Use {@link RecentExecutions}. */
  public get recentExecutions(): ExecutionWithExpanded[] {
    return this.RecentExecutions;
  }
  /** @deprecated Use {@link RecentExecutions}. */
  public set recentExecutions(value: ExecutionWithExpanded[]) {
    this.RecentExecutions = value;
  }
  public TopCategories: MJActionCategoryEntity[] = [];

  /** @deprecated Use {@link TopCategories}. */
  public get topCategories(): MJActionCategoryEntity[] {
    return this.TopCategories;
  }
  /** @deprecated Use {@link TopCategories}. */
  public set topCategories(value: MJActionCategoryEntity[]) {
    this.TopCategories = value;
  }

  /** Full (un-sliced) collections retained so agent tools can resolve any id, not just the visible top-10. */
  private allActions: MJActionEntity[] = [];
  private allExecutions: MJActionExecutionLogEntity[] = [];
  private allCategories: MJActionCategoryEntity[] = [];

  /** Last action the agent (or user) selected/opened — surfaced in context as id + name. */
  private selectedAction: MJActionEntity | null = null;

  public SearchTerm$ = new BehaviorSubject<string>('');

  /** @deprecated Use {@link SearchTerm$}. */
  public get searchTerm$() {
    return this.SearchTerm$;
  }
  /** @deprecated Use {@link SearchTerm$}. */
  public set searchTerm$(value) {
    this.SearchTerm$ = value;
  }
  public SelectedStatus$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedStatus$}. */
  public get selectedStatus$() {
    return this.SelectedStatus$;
  }
  /** @deprecated Use {@link SelectedStatus$}. */
  public set selectedStatus$(value) {
    this.SelectedStatus$ = value;
  }
  public SelectedType$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedType$}. */
  public get selectedType$() {
    return this.SelectedType$;
  }
  /** @deprecated Use {@link SelectedType$}. */
  public set selectedType$(value) {
    this.SelectedType$ = value;
  }

  /** Allowed status filter values (mirrors the Filter popover dropdown). */
  private readonly statusFilterValues = ['all', 'Active', 'Pending', 'Disabled'] as const;
  /** Allowed type filter values (mirrors the Filter popover dropdown). */
  private readonly typeFilterValues = ['all', 'Generated', 'Custom'] as const;
  /** Allowed sort fields for the visible-actions list. */
  private readonly sortFieldValues = ['name', 'status', 'type', 'updated'] as const;
  /** Allowed sort directions. */
  private readonly sortDirectionValues = ['asc', 'desc'] as const;

  protected override destroy$ = new Subject<void>();

  constructor(private cdr: ChangeDetectorRef ) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.setupFilters();
    this.registerAgentTools();
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
      this.SelectedStatus$.pipe(distinctUntilChanged()),
      this.SelectedType$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadFilteredData();
      this.publishAgentContext();
    });
  }

  // ================================================================
  // AI Agent context + client tools
  //
  // 🚨 SAFETY BOUNDARY: The Actions app executes actions with real side
  // effects (data mutation, emails, integrations). Action EXECUTION is
  // intentionally NOT exposed to the agent here — no RunAction, no execute
  // path. The agent may only FIND / FILTER / NAVIGATE actions and view run
  // history. Every Handler is tolerant (never throws; returns a structured
  // failure on bad input).
  // ================================================================

  /** Publish the current overview state to the agent. Called on load and on every filter change.
   *  Deep context: counts by status/type, success rate, all filter state, the visible
   *  (bounded) action + category names, and the currently selected action (id + name). */
  private publishAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      // Action counts by status
      TotalActionCount: this.Metrics.totalActions,
      ActiveActionCount: this.Metrics.activeActions,
      PendingActionCount: this.Metrics.pendingActions,
      DisabledActionCount: this.Metrics.disabledActions,
      // Action counts by type
      AIGeneratedActionCount: this.Metrics.aiGeneratedActions,
      CustomActionCount: this.Metrics.customActions,
      // Execution metrics
      TotalExecutionCount: this.Metrics.totalExecutions,
      RecentExecutionCount: this.Metrics.recentExecutions,
      SuccessRate: this.Metrics.successRate,
      // Category metrics
      TotalCategoryCount: this.Metrics.totalCategories,
      // Filter / search state
      CurrentSearchTerm: this.SearchTerm$.value,
      CurrentStatusFilter: this.SelectedStatus$.value,
      CurrentTypeFilter: this.SelectedType$.value,
      // What the user is looking at — bounded name lists so the agent can pick by name
      VisibleActionCount: this.RecentActions.length,
      VisibleActionNames: BoundNameList(this.RecentActions.map(a => a.Name)),
      TopCategoryNames: BoundNameList(this.TopCategories.map(c => c.Name)),
      // Current selection (id + NAME)
      SelectedActionId: this.selectedAction?.ID ?? null,
      SelectedActionName: this.selectedAction?.Name ?? null,
    });
  }

  /** Register the read-only / navigational client tools the agent can invoke on this surface. */
  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SearchActions',
        Description: 'Search the actions list by a free-text term (matches name and description).',
        ParameterSchema: { type: 'object', properties: { searchTerm: { type: 'string' } }, required: ['searchTerm'] },
        Handler: async (params) => {
          const term = typeof params['searchTerm'] === 'string' ? params['searchTerm'] : '';
          this.OnSearchChange(term);
          return { Success: true };
        },
      },
      {
        Name: 'FilterActionsByStatus',
        Description: 'Filter actions by status. Allowed: all, Active, Pending, Disabled.',
        ParameterSchema: { type: 'object', properties: { status: { type: 'string', enum: [...this.statusFilterValues] } }, required: ['status'] },
        Handler: async (params) => {
          const v = ValidateEnumParam(params['status'], this.statusFilterValues, 'status');
          if (!v.ok) return v.result;
          this.OnStatusFilterChange(v.value);
          return { Success: true };
        },
      },
      {
        Name: 'FilterActionsByType',
        Description: 'Filter actions by type. Allowed: all, Generated (AI-generated), Custom.',
        ParameterSchema: { type: 'object', properties: { type: { type: 'string', enum: [...this.typeFilterValues] } }, required: ['type'] },
        Handler: async (params) => {
          const v = ValidateEnumParam(params['type'], this.typeFilterValues, 'type');
          if (!v.ok) return v.result;
          this.OnTypeFilterChange(v.value);
          return { Success: true };
        },
      },
      {
        Name: 'ClearAllFilters',
        Description: 'Reset the status and type filters back to "all".',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.ResetFilters();
          return { Success: true };
        },
      },
      {
        Name: 'SortVisibleActions',
        Description: 'Sort the visible recent-actions list. field: name, status, type, updated. direction: asc, desc (default asc).',
        ParameterSchema: {
          type: 'object',
          properties: {
            field: { type: 'string', enum: [...this.sortFieldValues] },
            direction: { type: 'string', enum: [...this.sortDirectionValues] },
          },
          required: ['field'],
        },
        Handler: async (params) => {
          const f = ValidateEnumParam(params['field'], this.sortFieldValues, 'field');
          if (!f.ok) return f.result;
          let direction: 'asc' | 'desc' = 'asc';
          if (params['direction'] !== undefined) {
            const d = ValidateEnumParam(params['direction'], this.sortDirectionValues, 'direction');
            if (!d.ok) return d.result;
            direction = d.value;
          }
          this.sortVisibleActions(f.value, direction);
          return { Success: true };
        },
      },
      {
        Name: 'OpenActionDetail',
        Description: 'Open the detail record for an action by its id OR its name (navigation only — does NOT run the action). Name matching is case-insensitive (exact then contains).',
        ParameterSchema: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] },
        Handler: async (params) => {
          const found = FindByIdOrNameOrError(params['action'], this.allActions, 'action');
          if (!found.ok) return found.result;
          this.OpenAction(found.value);
          return { Success: true, Data: { Id: found.value.ID, Name: found.value.Name } };
        },
      },
      {
        Name: 'OpenCategoryDetail',
        Description: 'Open the detail record for an action category by its id OR its name (navigation only). Name matching is case-insensitive (exact then contains).',
        ParameterSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
        Handler: async (params) => {
          const found = FindByIdOrNameOrError(params['category'], this.allCategories, 'category');
          if (!found.ok) return found.result;
          this.OpenCategory(found.value.ID);
          return { Success: true, Data: { Id: found.value.ID, Name: found.value.Name } };
        },
      },
      {
        Name: 'OpenExecutionDetail',
        Description: 'Open the detail record for an action execution log by its id (view-only run history).',
        ParameterSchema: { type: 'object', properties: { executionId: { type: 'string' } }, required: ['executionId'] },
        Handler: async (params) => {
          const found = FindByIdOrError(params['executionId'], this.allExecutions, 'execution');
          if (!found.ok) return found.result;
          this.OpenExecution(found.value);
          return { Success: true };
        },
      },
      {
        Name: 'RefreshOverviewData',
        Description: 'Reload the actions overview data (metrics, categories, recent items).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.loadData();
          return { Success: true };
        },
      },
    ]);
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.cdr.detectChanges();

      // Load all data in a single batch using RunViews
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      const [actionsResult, categoriesResult, executionsResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Actions', 
          OrderBy: '__mj_UpdatedAt DESC' 
        },
        {
          EntityName: 'MJ: Action Categories', 
          OrderBy: 'Name' 
        },
        {
          EntityName: 'MJ: Action Execution Logs', 
          OrderBy: 'StartedAt DESC', 
        }
      ]);
      
      if (!actionsResult.Success || !categoriesResult.Success || !executionsResult.Success) {
        const errors = [];
        if (!actionsResult.Success) errors.push('Actions: ' + actionsResult.ErrorMessage);
        if (!categoriesResult.Success) errors.push('Categories: ' + categoriesResult.ErrorMessage);
        if (!executionsResult.Success) errors.push('Executions: ' + executionsResult.ErrorMessage);
        throw new Error('Failed to load data: ' + errors.join(', '));
      }
      
      const actions = (actionsResult.Results || []) as MJActionEntity[];
      const categories = (categoriesResult.Results || []) as MJActionCategoryEntity[];
      const executions = (executionsResult.Results || []) as MJActionExecutionLogEntity[];

      this.allActions = actions;
      this.allExecutions = executions;
      this.allCategories = categories;
      this.calculateMetrics(actions, categories, executions);
      this.calculateCategoryStats(actions, categories, executions);
      this.RecentActions = actions.slice(0, 10);
      this.RecentExecutions = executions.slice(0, 10).map(e => ({ ...e, isExpanded: false } as ExecutionWithExpanded));
      this.TopCategories = categories.slice(0, 5);
      this.publishAgentContext();
    } catch (error) {
      console.error('Error loading actions overview data:', error);
      LogError('Failed to load actions overview data', undefined, error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
      this.NotifyLoadComplete();
    }
  }

  private calculateMetrics(
    actions: MJActionEntity[], 
    categories: MJActionCategoryEntity[], 
    executions: MJActionExecutionLogEntity[]
  ): void {
    this.Metrics = {
      totalActions: actions.length,
      activeActions: actions.filter(a => a.Status === 'Active').length,
      pendingActions: actions.filter(a => a.Status === 'Pending').length,
      disabledActions: actions.filter(a => a.Status === 'Disabled').length,
      totalExecutions: executions.length,
      recentExecutions: executions.filter(e => {
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        return e.StartedAt && new Date(e.StartedAt) > dayAgo;
      }).length,
      successRate: this.calculateSuccessRate(executions),
      totalCategories: categories.length,
      aiGeneratedActions: actions.filter(a => a.Type === 'Generated').length,
      customActions: actions.filter(a => a.Type === 'Custom').length
    };
  }

  private calculateSuccessRate(executions: MJActionExecutionLogEntity[]): number {
    if (!executions || executions.length === 0) return 0;
    // Check for success based on result code - Actions may use different success codes
    const successful = executions.filter(e => {
      const code = e.ResultCode?.toLowerCase();
      return code === 'success' || code === 'ok' || code === 'completed' || code === '200';
    }).length;
    return Math.round((successful / executions.length) * 100);
  }

  private calculateCategoryStats(
    actions: MJActionEntity[], 
    categories: MJActionCategoryEntity[], 
    executions: MJActionExecutionLogEntity[]
  ): void {
    this.CategoryStats = categories.map(category => {
      const categoryActions = actions.filter(a => UUIDsEqual(a.CategoryID, category.ID));
      const categoryExecutions = executions.filter(e => 
        categoryActions.some(a => UUIDsEqual(a.ID, e.ActionID))
      );
      
      return {
        categoryId: category.ID,
        categoryName: category.Name,
        actionCount: categoryActions.length,
        executionCount: categoryExecutions.length,
        successRate: this.calculateSuccessRate(categoryExecutions)
      };
    });
  }

  private async loadFilteredData(): Promise<void> {
    // Implement filtered data loading based on current filter values
    const searchTerm = this.SearchTerm$.value;
    const status = this.SelectedStatus$.value;
    const type = this.SelectedType$.value;

    let extraFilter = '';
    const filters: string[] = [];

    if (status !== 'all') {
      filters.push(`Status = '${status}'`);
    }

    if (type !== 'all') {
      filters.push(`Type = '${type}'`);
    }

    if (filters.length > 0) {
      extraFilter = filters.join(' AND ');
    }

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView({
        EntityName: 'MJ: Actions',
        ExtraFilter: extraFilter,
        OrderBy: '__mj_UpdatedAt DESC',
        UserSearchString: searchTerm,
        IgnoreMaxRows: false,
        MaxRows: 1000
      });
      
      this.RecentActions = ((result.Results || []) as MJActionEntity[]).slice(0, 10);
    } catch (error) {
      LogError('Failed to load filtered actions', undefined, error);
    }
  }

  public OnSearchChange(searchTerm: string): void {
    this.SearchTerm$.next(searchTerm);
  }

  /** @deprecated Use {@link OnSearchChange}. */
  public onSearchChange(searchTerm: string): void {
    return this.OnSearchChange(searchTerm);
  }

  public OnStatusFilterChange(status: string): void {
    this.SelectedStatus$.next(status);
  }

  /** @deprecated Use {@link OnStatusFilterChange}. */
  public onStatusFilterChange(status: string): void {
    return this.OnStatusFilterChange(status);
  }

  public OnTypeFilterChange(type: string): void {
    this.SelectedType$.next(type);
  }

  /** @deprecated Use {@link OnTypeFilterChange}. */
  public onTypeFilterChange(type: string): void {
    return this.OnTypeFilterChange(type);
  }

  // ───── Filter-popover plumbing for the [actions] slot ─────

  public get FilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'status',
        type: 'dropdown',
        label: 'Status',
        icon: 'fa-solid fa-circle-info',
        placeholder: 'All Statuses',
        options: [
          { text: 'All Statuses', value: 'all' },
          { text: 'Active', value: 'Active' },
          { text: 'Pending', value: 'Pending' },
          { text: 'Disabled', value: 'Disabled' }
        ]
      },
      {
        key: 'type',
        type: 'dropdown',
        label: 'Type',
        icon: 'fa-solid fa-shapes',
        placeholder: 'All Types',
        options: [
          { text: 'All Types', value: 'all' },
          { text: 'AI Generated', value: 'Generated' },
          { text: 'Custom', value: 'Custom' }
        ]
      }
    ];
  }
  public get FilterValues(): Record<string, unknown> {
    return { status: this.SelectedStatus$.value, type: this.SelectedType$.value };
  }
  public get ActiveFilterCount(): number {
    let n = 0;
    if (this.SelectedStatus$.value !== 'all') n++;
    if (this.SelectedType$.value !== 'all') n++;
    return n;
  }
  public OnFilterValuesChange(v: Record<string, unknown>): void {
    const next = (v ?? {}) as { status?: string; type?: string };
    if ((next.status ?? 'all') !== this.SelectedStatus$.value) {
      this.OnStatusFilterChange(next.status ?? 'all');
    }
    if ((next.type ?? 'all') !== this.SelectedType$.value) {
      this.OnTypeFilterChange(next.type ?? 'all');
    }
  }

  /** @deprecated Use {@link OnFilterValuesChange}. */
  public onFilterValuesChange(v: Record<string, unknown>): void {
    return this.OnFilterValuesChange(v);
  }
  public ResetFilters(): void {
    if (this.SelectedStatus$.value !== 'all') this.OnStatusFilterChange('all');
    if (this.SelectedType$.value !== 'all') this.OnTypeFilterChange('all');
  }

  /** @deprecated Use {@link ResetFilters}. */
  public resetFilters(): void {
    return this.ResetFilters();
  }

  public OpenAction(action: MJActionEntity): void {
    this.selectedAction = action;
    this.publishAgentContext();
    this.navigationService.OpenEntityRecord('MJ: Actions', CompositeKey.FromID(action.ID));
  }

  /** @deprecated Use {@link OpenAction}. */
  public openAction(action: MJActionEntity): void {
    return this.OpenAction(action);
  }

  /** Sort the visible recent-actions list in place (agent tool — view-only). */
  private sortVisibleActions(field: 'name' | 'status' | 'type' | 'updated', direction: 'asc' | 'desc'): void {
    const dir = direction === 'asc' ? 1 : -1;
    const sorted = [...this.RecentActions].sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case 'name': cmp = (a.Name || '').localeCompare(b.Name || ''); break;
        case 'status': cmp = (a.Status || '').localeCompare(b.Status || ''); break;
        case 'type': cmp = (a.Type || '').localeCompare(b.Type || ''); break;
        case 'updated': {
          const da = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
          const db = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
          cmp = da - db;
          break;
        }
      }
      return cmp * dir;
    });
    this.RecentActions = sorted;
    this.publishAgentContext();
    this.cdr.detectChanges();
  }

  public OpenCategory(categoryId: string): void {
    this.navigationService.OpenEntityRecord('MJ: Action Categories', CompositeKey.FromID(categoryId));
  }

  /** @deprecated Use {@link OpenCategory}. */
  public openCategory(categoryId: string): void {
    return this.OpenCategory(categoryId);
  }

  public OpenExecution(execution: MJActionExecutionLogEntity): void {
    const key = CompositeKey.FromID(execution.ID);
    this.navigationService.OpenEntityRecord('MJ: Action Execution Logs', key);
  }

  /** @deprecated Use {@link OpenExecution}. */
  public openExecution(execution: MJActionExecutionLogEntity): void {
    return this.OpenExecution(execution);
  }

  public IsExecutionSuccess(execution: MJActionExecutionLogEntity): boolean {
    const code = execution.ResultCode?.toLowerCase();
    return code === 'success' || code === 'ok' || code === 'completed' || code === '200';
  }

  /** @deprecated Use {@link IsExecutionSuccess}. */
  public isExecutionSuccess(execution: MJActionExecutionLogEntity): boolean {
    return this.IsExecutionSuccess(execution);
  }

  public GetStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' {
    switch (status) {
      case 'Active': return 'success';
      case 'Pending': return 'warning';
      case 'Disabled': return 'error';
      default: return 'info';
    }
  }

  /** @deprecated Use {@link GetStatusColor}. */
  public getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' {
    return this.GetStatusColor(status);
  }

  public GetTypeIcon(type: string): string {
    switch (type) {
      case 'Generated': return 'fa-solid fa-robot';
      case 'Custom': return 'fa-solid fa-code';
      default: return 'fa-solid fa-cog';
    }
  }

  /** @deprecated Use {@link GetTypeIcon}. */
  public getTypeIcon(type: string): string {
    return this.GetTypeIcon(type);
  }

  // Metric card click handlers - these now filter the current view
  public OnTotalActionsClick(): void {
    // Reset filters to show all actions
    this.SelectedStatus$.next('all');
    this.SelectedType$.next('all');
  }

  /** @deprecated Use {@link OnTotalActionsClick}. */
  public onTotalActionsClick(): void {
    return this.OnTotalActionsClick();
  }

  public OnExecutionsClick(): void {
    // This would navigate to execution monitoring resource
  }

  /** @deprecated Use {@link OnExecutionsClick}. */
  public onExecutionsClick(): void {
    return this.OnExecutionsClick();
  }

  public OnCategoriesClick(): void {
    // This would navigate to categories view
  }

  /** @deprecated Use {@link OnCategoriesClick}. */
  public onCategoriesClick(): void {
    return this.OnCategoriesClick();
  }

  public OnAIGeneratedClick(): void {
    // Filter to show AI generated actions in the current view
    this.SelectedType$.next('Generated');
  }

  /** @deprecated Use {@link OnAIGeneratedClick}. */
  public onAIGeneratedClick(): void {
    return this.OnAIGeneratedClick();
  }

  public OnActionGalleryClick(): void {
    // This would navigate to action gallery view
  }

  /** @deprecated Use {@link OnActionGalleryClick}. */
  public onActionGalleryClick(): void {
    return this.OnActionGalleryClick();
  }

  public FormatJsonParams(params: string | null): string {
    if (!params) return '{}';
    try {
      // Try to parse and reformat
      const parsed = JSON.parse(params);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If parse fails, return as is
      return params;
    }
  }

  /** @deprecated Use {@link FormatJsonParams}. */
  public formatJsonParams(params: string | null): string {
    return this.FormatJsonParams(params);
  }

  /**
   * Gets the icon class for an action
   * Falls back to type-based icon if no IconClass is set
   */
  public GetActionIcon(action: MJActionEntity): string {
    return action?.IconClass || this.GetTypeIcon(action.Type);
  }

  /** @deprecated Use {@link GetActionIcon}. */
  public getActionIcon(action: MJActionEntity): string {
    return this.GetActionIcon(action);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Actions Overview';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-bolt';
  }
}