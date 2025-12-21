import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { RunView, LogError } from '@memberjunction/core';
import { ActionEntity, ActionCategoryEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';

interface CategoryTreeNode {
  category: ActionCategoryEntity;
  children: CategoryTreeNode[];
  level: number;
}

@Component({
  standalone: false,
  selector: 'mj-actions-list-view',
  templateUrl: './actions-list-view.component.html',
  styleUrls: ['./actions-list-view.component.css']
})
export class ActionsListViewComponent implements OnInit, OnDestroy {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();

  public isLoading = true;
  public actions: ActionEntity[] = [];
  public filteredActions: ActionEntity[] = [];
  public categories: Map<string, ActionCategoryEntity> = new Map();
  public categoryTree: CategoryTreeNode[] = [];
  public categoryDescendants: Map<string, Set<string>> = new Map();

  public searchTerm$ = new BehaviorSubject<string>('');
  public selectedStatus$ = new BehaviorSubject<string>('all');
  public selectedType$ = new BehaviorSubject<string>('all');
  public selectedCategory$ = new BehaviorSubject<string>('all');
  public expandedCategories: Set<string> = new Set();

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
          OrderBy: 'Name'
        },
        {
          EntityName: 'Action Categories',
          OrderBy: 'Name'
        }
      ]);
      
      if (!actionsResult.Success || !categoriesResult.Success) {
        const errors = [];
        if (!actionsResult.Success) 
          errors.push('Actions: ' + actionsResult.ErrorMessage);
        if (!categoriesResult.Success) 
          errors.push('Categories: ' + categoriesResult.ErrorMessage);
        throw new Error('Failed to load data: ' + errors.join(', '));
      }
      
      const actions = (actionsResult.Results || []) as ActionEntity[];
      const categories = (categoriesResult.Results || []) as ActionCategoryEntity[];
       
      this.actions = actions;
      this.populateCategoriesMap(categories);
      this.buildCategoryOptions(categories);
      this.applyFilters();

    } catch (error) {
      console.error('Error loading actions list data:', error);
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
    
    // Build the category tree
    this.buildCategoryTree(categories);
    
    // Build descendant mapping for efficient filtering
    this.buildDescendantMapping(categories);
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

  private buildCategoryTree(categories: ActionCategoryEntity[]): void {
    const categoryMap = new Map<string, CategoryTreeNode>();
    
    // First pass: create all nodes
    categories.forEach(category => {
      categoryMap.set(category.ID, {
        category,
        children: [],
        level: 0
      });
    });
    
    // Second pass: build tree structure
    const rootNodes: CategoryTreeNode[] = [];
    categoryMap.forEach(node => {
      const parentId = node.category.ParentID;
      if (parentId && categoryMap.has(parentId)) {
        const parent = categoryMap.get(parentId)!;
        parent.children.push(node);
        node.level = parent.level + 1;
      } else {
        rootNodes.push(node);
      }
    });
    
    // Sort children at each level by name
    const sortChildren = (nodes: CategoryTreeNode[]) => {
      nodes.sort((a, b) => a.category.Name.localeCompare(b.category.Name));
      nodes.forEach(node => sortChildren(node.children));
    };
    sortChildren(rootNodes);
    
    this.categoryTree = rootNodes;
  }

  private buildDescendantMapping(categories: ActionCategoryEntity[]): void {
    this.categoryDescendants.clear();
    
    // Initialize each category with itself
    categories.forEach(category => {
      this.categoryDescendants.set(category.ID, new Set([category.ID]));
    });
    
    // Build descendant sets
    const addDescendants = (categoryId: string, descendantId: string) => {
      const descendants = this.categoryDescendants.get(categoryId);
      if (descendants) {
        descendants.add(descendantId);
      }
    };
    
    categories.forEach(category => {
      if (category.ParentID) {
        // Add this category as a descendant of all its ancestors
        let currentParentId: string | null = category.ParentID;
        while (currentParentId) {
          addDescendants(currentParentId, category.ID);
          const parent = this.categories.get(currentParentId);
          currentParentId = parent?.ParentID || null;
        }
      }
    });
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

    // Apply category filter (includes descendants)
    const categoryId = this.selectedCategory$.value;
    if (categoryId !== 'all') {
      const descendantIds = this.categoryDescendants.get(categoryId);
      if (descendantIds) {
        // Filter actions that belong to the selected category or any of its descendants
        filtered = filtered.filter(action => 
          action.CategoryID && descendantIds.has(action.CategoryID)
        );
      } else {
        console.warn(`Category ID ${categoryId} not found in category hierarchy`);
        filtered = [];
      }
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

  /**
   * Gets the icon class for an action
   * Falls back to type-based icon if no IconClass is set
   */
  public getActionIcon(action: ActionEntity): string {
    return action?.IconClass || this.getTypeIcon(action.Type);
  }

  // Tree view methods
  public toggleCategoryExpanded(categoryId: string): void {
    if (this.expandedCategories.has(categoryId)) {
      this.expandedCategories.delete(categoryId);
    } else {
      this.expandedCategories.add(categoryId);
    }
  }

  public isCategoryExpanded(categoryId: string): boolean {
    return this.expandedCategories.has(categoryId);
  }

  public selectCategory(categoryId: string): void {
    this.selectedCategory$.next(categoryId);
  }

  public getCategoryActionCount(categoryId: string): number {
    const descendantIds = this.categoryDescendants.get(categoryId);
    if (!descendantIds) return 0;
    
    return this.actions.filter(action => 
      action.CategoryID && descendantIds.has(action.CategoryID)
    ).length;
  }

  public showCategoryTree = false;

  public toggleCategoryTree(): void {
    this.showCategoryTree = !this.showCategoryTree;
  }
}