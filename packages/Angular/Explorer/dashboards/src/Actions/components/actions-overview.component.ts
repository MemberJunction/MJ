import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { MJActionEntity, MJActionCategoryEntity, MJActionExecutionLogEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { validateEnumParam, boundNameList } from '../../shared/agent-tool-validation';
import { findByIdOrError, findByIdOrNameOrError } from '../agent-tool-helpers';
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
  public metrics: ActionMetrics = {
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

  public categoryStats: CategoryStats[] = [];
  public recentActions: MJActionEntity[] = [];
  public recentExecutions: ExecutionWithExpanded[] = [];
  public topCategories: MJActionCategoryEntity[] = [];

  /** Full (un-sliced) collections retained so agent tools can resolve any id, not just the visible top-10. */
  private allActions: MJActionEntity[] = [];
  private allExecutions: MJActionExecutionLogEntity[] = [];
  private allCategories: MJActionCategoryEntity[] = [];

  /** Last action the agent (or user) selected/opened — surfaced in context as id + name. */
  private selectedAction: MJActionEntity | null = null;

  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedStatus$ = new BehaviorSubject<string>('all');
  public selectedType$ = new BehaviorSubject<string>('all');

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
      this.searchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.selectedStatus$.pipe(distinctUntilChanged()),
      this.selectedType$.pipe(distinctUntilChanged())
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
      TotalActionCount: this.metrics.totalActions,
      ActiveActionCount: this.metrics.activeActions,
      PendingActionCount: this.metrics.pendingActions,
      DisabledActionCount: this.metrics.disabledActions,
      // Action counts by type
      AIGeneratedActionCount: this.metrics.aiGeneratedActions,
      CustomActionCount: this.metrics.customActions,
      // Execution metrics
      TotalExecutionCount: this.metrics.totalExecutions,
      RecentExecutionCount: this.metrics.recentExecutions,
      SuccessRate: this.metrics.successRate,
      // Category metrics
      TotalCategoryCount: this.metrics.totalCategories,
      // Filter / search state
      CurrentSearchTerm: this.searchTerm$.value,
      CurrentStatusFilter: this.selectedStatus$.value,
      CurrentTypeFilter: this.selectedType$.value,
      // What the user is looking at — bounded name lists so the agent can pick by name
      VisibleActionCount: this.recentActions.length,
      VisibleActionNames: boundNameList(this.recentActions.map(a => a.Name)),
      TopCategoryNames: boundNameList(this.topCategories.map(c => c.Name)),
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
          this.onSearchChange(term);
          return { Success: true };
        },
      },
      {
        Name: 'FilterActionsByStatus',
        Description: 'Filter actions by status. Allowed: all, Active, Pending, Disabled.',
        ParameterSchema: { type: 'object', properties: { status: { type: 'string', enum: [...this.statusFilterValues] } }, required: ['status'] },
        Handler: async (params) => {
          const v = validateEnumParam(params['status'], this.statusFilterValues, 'status');
          if (!v.ok) return v.result;
          this.onStatusFilterChange(v.value);
          return { Success: true };
        },
      },
      {
        Name: 'FilterActionsByType',
        Description: 'Filter actions by type. Allowed: all, Generated (AI-generated), Custom.',
        ParameterSchema: { type: 'object', properties: { type: { type: 'string', enum: [...this.typeFilterValues] } }, required: ['type'] },
        Handler: async (params) => {
          const v = validateEnumParam(params['type'], this.typeFilterValues, 'type');
          if (!v.ok) return v.result;
          this.onTypeFilterChange(v.value);
          return { Success: true };
        },
      },
      {
        Name: 'ClearAllFilters',
        Description: 'Reset the status and type filters back to "all".',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.resetFilters();
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
          const f = validateEnumParam(params['field'], this.sortFieldValues, 'field');
          if (!f.ok) return f.result;
          let direction: 'asc' | 'desc' = 'asc';
          if (params['direction'] !== undefined) {
            const d = validateEnumParam(params['direction'], this.sortDirectionValues, 'direction');
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
          const found = findByIdOrNameOrError(params['action'], this.allActions, 'action');
          if (!found.ok) return found.result;
          this.openAction(found.value);
          return { Success: true, Data: { Id: found.value.ID, Name: found.value.Name } };
        },
      },
      {
        Name: 'OpenCategoryDetail',
        Description: 'Open the detail record for an action category by its id OR its name (navigation only). Name matching is case-insensitive (exact then contains).',
        ParameterSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] },
        Handler: async (params) => {
          const found = findByIdOrNameOrError(params['category'], this.allCategories, 'category');
          if (!found.ok) return found.result;
          this.openCategory(found.value.ID);
          return { Success: true, Data: { Id: found.value.ID, Name: found.value.Name } };
        },
      },
      {
        Name: 'OpenExecutionDetail',
        Description: 'Open the detail record for an action execution log by its id (view-only run history).',
        ParameterSchema: { type: 'object', properties: { executionId: { type: 'string' } }, required: ['executionId'] },
        Handler: async (params) => {
          const found = findByIdOrError(params['executionId'], this.allExecutions, 'execution');
          if (!found.ok) return found.result;
          this.openExecution(found.value);
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
      this.recentActions = actions.slice(0, 10);
      this.recentExecutions = executions.slice(0, 10).map(e => ({ ...e, isExpanded: false } as ExecutionWithExpanded));
      this.topCategories = categories.slice(0, 5);
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
    this.metrics = {
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
    this.categoryStats = categories.map(category => {
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
    const searchTerm = this.searchTerm$.value;
    const status = this.selectedStatus$.value;
    const type = this.selectedType$.value;

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
      
      this.recentActions = ((result.Results || []) as MJActionEntity[]).slice(0, 10);
    } catch (error) {
      LogError('Failed to load filtered actions', undefined, error);
    }
  }

  public onSearchChange(searchTerm: string): void {
    this.searchTerm$.next(searchTerm);
  }

  public onStatusFilterChange(status: string): void {
    this.selectedStatus$.next(status);
  }

  public onTypeFilterChange(type: string): void {
    this.selectedType$.next(type);
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
    return { status: this.selectedStatus$.value, type: this.selectedType$.value };
  }
  public get ActiveFilterCount(): number {
    let n = 0;
    if (this.selectedStatus$.value !== 'all') n++;
    if (this.selectedType$.value !== 'all') n++;
    return n;
  }
  public onFilterValuesChange(v: Record<string, unknown>): void {
    const next = (v ?? {}) as { status?: string; type?: string };
    if ((next.status ?? 'all') !== this.selectedStatus$.value) {
      this.onStatusFilterChange(next.status ?? 'all');
    }
    if ((next.type ?? 'all') !== this.selectedType$.value) {
      this.onTypeFilterChange(next.type ?? 'all');
    }
  }
  public resetFilters(): void {
    if (this.selectedStatus$.value !== 'all') this.onStatusFilterChange('all');
    if (this.selectedType$.value !== 'all') this.onTypeFilterChange('all');
  }

  public openAction(action: MJActionEntity): void {
    this.selectedAction = action;
    this.publishAgentContext();
    const key = new CompositeKey([{ FieldName: 'ID', Value: action.ID }]);
    this.navigationService.OpenEntityRecord('MJ: Actions', key);
  }

  /** Sort the visible recent-actions list in place (agent tool — view-only). */
  private sortVisibleActions(field: 'name' | 'status' | 'type' | 'updated', direction: 'asc' | 'desc'): void {
    const dir = direction === 'asc' ? 1 : -1;
    const sorted = [...this.recentActions].sort((a, b) => {
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
    this.recentActions = sorted;
    this.publishAgentContext();
    this.cdr.detectChanges();
  }

  public openCategory(categoryId: string): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: categoryId }]);
    this.navigationService.OpenEntityRecord('MJ: Action Categories', key);
  }

  public openExecution(execution: MJActionExecutionLogEntity): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: execution.ID }]);
    this.navigationService.OpenEntityRecord('MJ: Action Execution Logs', key);
  }

  public isExecutionSuccess(execution: MJActionExecutionLogEntity): boolean {
    const code = execution.ResultCode?.toLowerCase();
    return code === 'success' || code === 'ok' || code === 'completed' || code === '200';
  }

  public getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' {
    switch (status) {
      case 'Active': return 'success';
      case 'Pending': return 'warning';
      case 'Disabled': return 'error';
      default: return 'info';
    }
  }

  public getTypeIcon(type: string): string {
    switch (type) {
      case 'Generated': return 'fa-solid fa-robot';
      case 'Custom': return 'fa-solid fa-code';
      default: return 'fa-solid fa-cog';
    }
  }

  // Metric card click handlers - these now filter the current view
  public onTotalActionsClick(): void {
    // Reset filters to show all actions
    this.selectedStatus$.next('all');
    this.selectedType$.next('all');
  }

  public onExecutionsClick(): void {
    // This would navigate to execution monitoring resource
  }

  public onCategoriesClick(): void {
    // This would navigate to categories view
  }

  public onAIGeneratedClick(): void {
    // Filter to show AI generated actions in the current view
    this.selectedType$.next('Generated');
  }

  public onActionGalleryClick(): void {
    // This would navigate to action gallery view
  }

  public toggleExecutionExpanded(execution: ExecutionWithExpanded): void {
    execution.isExpanded = !execution.isExpanded;
  }

  public formatJsonParams(params: string | null): string {
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

  /**
   * Gets the icon class for an action
   * Falls back to type-based icon if no IconClass is set
   */
  public getActionIcon(action: MJActionEntity): string {
    return action?.IconClass || this.getTypeIcon(action.Type);
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Actions Overview';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-bolt';
  }
}