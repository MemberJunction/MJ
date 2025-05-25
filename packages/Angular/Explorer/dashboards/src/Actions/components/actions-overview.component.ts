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
  public recentExecutions: ActionExecutionLogEntity[] = [];
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
      
      // Load all data in parallel
      const [actions, categories, executions] = await Promise.all([
        this.loadActions(),
        this.loadCategories(),
        this.loadExecutions()
      ]);

      this.calculateMetrics(actions, categories, executions);
      this.calculateCategoryStats(actions, categories, executions);
      this.recentActions = actions.slice(0, 10);
      this.recentExecutions = executions.slice(0, 10);
      this.topCategories = categories.slice(0, 5);

    } catch (error) {
      LogError('Failed to load actions overview data', undefined, error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadActions(): Promise<ActionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Actions',
      ExtraFilter: '',
      OrderBy: 'UpdatedAt DESC',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as ActionEntity[];
    } else {
      throw new Error('Failed to load actions');
    }
  }

  private async loadCategories(): Promise<ActionCategoryEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Action Categories',
      ExtraFilter: '',
      OrderBy: 'Name',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as ActionCategoryEntity[];
    } else {
      throw new Error('Failed to load action categories');
    }
  }

  private async loadExecutions(): Promise<ActionExecutionLogEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView({
      EntityName: 'Action Execution Logs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      UserSearchString: '',
      IgnoreMaxRows: false,
      MaxRows: 1000
    });
    
    if (result && result.Success && result.Results) {
      return result.Results as ActionExecutionLogEntity[];
    } else {
      throw new Error('Failed to load action execution logs');
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
    this.metrics = {
      totalActions: actions.length,
      activeActions: actions.filter(a => a.Status === 'Active').length,
      pendingActions: actions.filter(a => a.Status === 'Pending').length,
      disabledActions: actions.filter(a => a.Status === 'Disabled').length,
      totalExecutions: executions.length,
      recentExecutions: executions.filter(e => {
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        return new Date(e.StartedAt!) > dayAgo;
      }).length,
      successRate: this.calculateSuccessRate(executions),
      totalCategories: categories.length,
      aiGeneratedActions: actions.filter(a => a.Type === 'Generated').length,
      customActions: actions.filter(a => a.Type === 'Custom').length
    };
  }

  private calculateSuccessRate(executions: ActionExecutionLogEntity[]): number {
    if (executions.length === 0) return 0;
    const successful = executions.filter(e => e.ResultCode === 'Success').length;
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
      
      this.recentActions = (result.Results as ActionEntity[]).slice(0, 10);
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
}