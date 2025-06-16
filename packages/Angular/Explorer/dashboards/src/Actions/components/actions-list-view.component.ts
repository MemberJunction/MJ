import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { RunView, LogError } from '@memberjunction/core';
import { ActionEntity, ActionCategoryEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'mj-actions-list-view',
  templateUrl: './actions-list-view.component.html',
  styleUrls: ['./actions-list-view.component.scss']
})
export class ActionsListViewComponent implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();

  public isLoading = true;
  public actions: ActionEntity[] = [];
  public filteredActions: ActionEntity[] = [];
  public categories: Map<string, ActionCategoryEntity> = new Map();

  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedStatus$ = new BehaviorSubject<string>('all');
  public selectedType$ = new BehaviorSubject<string>('all');
  public selectedCategory$ = new BehaviorSubject<string>('all');

  public statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Pending', value: 'Pending' },
    { text: 'Disabled', value: 'Disabled' }
  ];

  public typeOptions = [
    { text: 'All Types', value: 'all' },
    { text: 'AI Generated', value: 'Generated' },
    { text: 'Custom', value: 'Custom' }
  ];

  public categoryOptions: Array<{text: string; value: string}> = [
    { text: 'All Categories', value: 'all' }
  ];

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
      this.selectedType$.pipe(distinctUntilChanged()),
      this.selectedCategory$.pipe(distinctUntilChanged())
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
      const [actionsResult, categoriesResult] = await rv.RunViews([
        {
          EntityName: 'Actions',
          ExtraFilter: '',
          OrderBy: 'Name',
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
        }
      ]);
      
      if (!actionsResult.Success || !categoriesResult.Success) {
        throw new Error('Failed to load data');
      }
      
      const actions = actionsResult.Results as ActionEntity[];
      const categories = categoriesResult.Results as ActionCategoryEntity[];

      this.actions = actions;
      this.populateCategoriesMap(categories);
      this.buildCategoryOptions(categories);
      this.applyFilters();

    } catch (error) {
      LogError('Failed to load actions list data', undefined, error);
    } finally {
      this.isLoading = false;
    }
  }


  private populateCategoriesMap(categories: ActionCategoryEntity[]): void {
    this.categories.clear();
    categories.forEach(category => {
      this.categories.set(category.ID, category);
    });
  }

  private buildCategoryOptions(categories: ActionCategoryEntity[]): void {
    this.categoryOptions = [
      { text: 'All Categories', value: 'all' },
      ...categories.map(category => ({
        text: category.Name,
        value: category.ID
      }))
    ];
  }

  private applyFilters(): void {
    let filtered = [...this.actions];

    // Apply search filter
    const searchTerm = this.searchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(action => 
        action.Name.toLowerCase().includes(searchTerm) ||
        (action.Description || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply status filter
    const status = this.selectedStatus$.value;
    if (status !== 'all') {
      filtered = filtered.filter(action => action.Status === status);
    }

    // Apply type filter
    const type = this.selectedType$.value;
    if (type !== 'all') {
      filtered = filtered.filter(action => action.Type === type);
    }

    // Apply category filter
    const categoryId = this.selectedCategory$.value;
    if (categoryId !== 'all') {
      filtered = filtered.filter(action => action.CategoryID === categoryId);
    }

    this.filteredActions = filtered;
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

  public onCategoryFilterChange(categoryId: string): void {
    this.selectedCategory$.next(categoryId);
  }

  public openAction(action: ActionEntity): void {
    this.openEntityRecord.emit({
      entityName: 'Actions',
      recordId: action.ID
    });
  }

  public getCategoryName(categoryId: string | null): string {
    if (!categoryId) return 'No Category';
    return this.categories.get(categoryId)?.Name || 'Unknown Category';
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
}