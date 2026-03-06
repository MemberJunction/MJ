import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView, LogError } from '@memberjunction/core';
import { MJActionEntity, MJActionCategoryEntity, MJActionExecutionLogEntity, ResourceData } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
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

  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedStatus$ = new BehaviorSubject<string>('all');
  public selectedType$ = new BehaviorSubject<string>('all');

  private destroy$ = new Subject<void>();

  constructor(private navigationService: NavigationService, 
              private cdr: ChangeDetectorRef ) {
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
      this.selectedStatus$.pipe(distinctUntilChanged()),
      this.selectedType$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadFilteredData();
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.cdr.detectChanges();

      // Load all data in a single batch using RunViews
      const rv = new RunView();
      
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

      this.calculateMetrics(actions, categories, executions);
      this.calculateCategoryStats(actions, categories, executions);
      this.recentActions = actions.slice(0, 10);
      this.recentExecutions = executions.slice(0, 10).map(e => ({ ...e, isExpanded: false } as ExecutionWithExpanded));
      this.topCategories = categories.slice(0, 5);
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
      const rv = new RunView();
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

  public openAction(action: MJActionEntity): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: action.ID }]);
    this.navigationService.OpenEntityRecord('MJ: Actions', key);
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