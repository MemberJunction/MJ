import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { RunView, LogError } from '@memberjunction/core';
import { ActionEntity, ActionCategoryEntity, ActionExecutionLogEntity, EntityActionEntity } from '@memberjunction/core-entities';
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

interface ExecutionWithExpanded extends ActionExecutionLogEntity {
  isExpanded?: boolean;
}


@Component({
  selector: 'mj-actions-overview',
  templateUrl: './actions-overview.component.html',
  styleUrls: ['./actions-overview.component.scss']
})
export class ActionsOverviewComponent implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();
  @Output() showActionsListView = new EventEmitter<void>();
  @Output() showExecutionsListView = new EventEmitter<void>();
  @Output() showCategoriesListView = new EventEmitter<void>();

  public isLoading = true;
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
  public recentActions: ActionEntity[] = [];
  public recentExecutions: ExecutionWithExpanded[] = [];
  public topCategories: ActionCategoryEntity[] = [];

  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedStatus$ = new BehaviorSubject<string>('all');
  public selectedType$ = new BehaviorSubject<string>('all');

  private destroy$ = new Subject<void>();

  constructor() {}

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
      
      // Load all data in a single batch using RunViews
      const rv = new RunView();
      console.log('Loading Actions dashboard data...');
      
      const [actionsResult, categoriesResult, executionsResult] = await rv.RunViews([
        {
          EntityName: 'Actions',
          ExtraFilter: '',
          OrderBy: '__mj_UpdatedAt DESC',
          UserSearchString: '',
          IgnoreMaxRows: false,
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Action Categories',
          ExtraFilter: '',
          OrderBy: 'Name',
          UserSearchString: '',
          IgnoreMaxRows: false,
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Action Execution Logs',
          ExtraFilter: '',
          OrderBy: 'StartedAt DESC',
          UserSearchString: '',
          IgnoreMaxRows: false,
          MaxRows: 1000,
          ResultType: 'entity_object'
        }
      ]);
      
      console.log('Actions result:', actionsResult);
      console.log('Categories result:', categoriesResult);
      console.log('Executions result:', executionsResult);
      
      if (!actionsResult.Success || !categoriesResult.Success || !executionsResult.Success) {
        const errors = [];
        if (!actionsResult.Success) errors.push('Actions: ' + actionsResult.ErrorMessage);
        if (!categoriesResult.Success) errors.push('Categories: ' + categoriesResult.ErrorMessage);
        if (!executionsResult.Success) errors.push('Executions: ' + executionsResult.ErrorMessage);
        throw new Error('Failed to load data: ' + errors.join(', '));
      }
      
      const actions = (actionsResult.Results || []) as ActionEntity[];
      const categories = (categoriesResult.Results || []) as ActionCategoryEntity[];
      const executions = (executionsResult.Results || []) as ActionExecutionLogEntity[];
      
      console.log(`Loaded ${actions.length} actions, ${categories.length} categories, ${executions.length} executions`);
      if (actions.length === 0) {
        console.warn('No actions loaded. Check if the Actions entity has data and user has permissions.');
      }
      if (categories.length === 0) {
        console.warn('No categories loaded. Check if Action Categories entity has data and user has permissions.');
      }

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
    }
  }


  private async loadEntityActions(): Promise<EntityActionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Entity Actions',
      ExtraFilter: '',
      OrderBy: 'UpdatedAt DESC',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as EntityActionEntity[];
    } else {
      throw new Error('Failed to load entity actions');
    }
  }

  private calculateMetrics(
    actions: ActionEntity[], 
    categories: ActionCategoryEntity[], 
    executions: ActionExecutionLogEntity[]
  ): void {
    console.log('Calculating metrics for:', { actions, categories, executions });
    
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
    
    console.log('Calculated metrics:', this.metrics);
  }

  private calculateSuccessRate(executions: ActionExecutionLogEntity[]): number {
    if (!executions || executions.length === 0) return 0;
    // Check for success based on result code - Actions may use different success codes
    const successful = executions.filter(e => {
      const code = e.ResultCode?.toLowerCase();
      return code === 'success' || code === 'ok' || code === 'completed' || code === '200';
    }).length;
    return Math.round((successful / executions.length) * 100);
  }

  private calculateCategoryStats(
    actions: ActionEntity[], 
    categories: ActionCategoryEntity[], 
    executions: ActionExecutionLogEntity[]
  ): void {
    this.categoryStats = categories.map(category => {
      const categoryActions = actions.filter(a => a.CategoryID === category.ID);
      const categoryExecutions = executions.filter(e => 
        categoryActions.some(a => a.ID === e.ActionID)
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
        EntityName: 'Actions',
        ExtraFilter: extraFilter,
        OrderBy: 'UpdatedAt DESC',
        UserSearchString: searchTerm,
        IgnoreMaxRows: false,
        MaxRows: 1000
      });
      
      this.recentActions = ((result.Results || []) as ActionEntity[]).slice(0, 10);
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

  public openAction(action: ActionEntity): void {
    this.openEntityRecord.emit({
      entityName: 'Actions',
      recordId: action.ID
    });
  }

  public openCategory(categoryId: string): void {
    this.openEntityRecord.emit({
      entityName: 'Action Categories',
      recordId: categoryId
    });
  }

  public openExecution(execution: ActionExecutionLogEntity): void {
    this.openEntityRecord.emit({
      entityName: 'Action Execution Logs',
      recordId: execution.ID
    });
  }

  public isExecutionSuccess(execution: ActionExecutionLogEntity): boolean {
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

  // Metric card click handlers
  public onTotalActionsClick(): void {
    this.showActionsListView.emit();
  }

  public onExecutionsClick(): void {
    this.showExecutionsListView.emit();
  }

  public onCategoriesClick(): void {
    this.showCategoriesListView.emit();
  }

  public onAIGeneratedClick(): void {
    // Filter to show AI generated actions in the current view
    this.selectedType$.next('Generated');
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
}