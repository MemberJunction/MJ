import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { RunView, LogError } from '@memberjunction/core';
import { MJActionEntity, MJActionCategoryEntity } from '@memberjunction/core-entities';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

interface CategoryTreeNode {
  category: MJActionCategoryEntity;
  children: CategoryTreeNode[];
  level: number;
}

@Component({
  standalone: false,
  selector: 'mj-actions-list-view',
  templateUrl: './actions-list-view.component.html',
  styleUrls: ['./actions-list-view.component.css']
})
export class ActionsListViewComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Output() OpenEntityRecord = new EventEmitter<{entityName: string; recordId: string}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;

  public isLoading = true;
  public Actions: MJActionEntity[] = [];

  /** @deprecated Use {@link Actions}. */
  public get actions(): MJActionEntity[] {
    return this.Actions;
  }
  /** @deprecated Use {@link Actions}. */
  public set actions(value: MJActionEntity[]) {
    this.Actions = value;
  }
  public FilteredActions: MJActionEntity[] = [];

  /** @deprecated Use {@link FilteredActions}. */
  public get filteredActions(): MJActionEntity[] {
    return this.FilteredActions;
  }
  /** @deprecated Use {@link FilteredActions}. */
  public set filteredActions(value: MJActionEntity[]) {
    this.FilteredActions = value;
  }
  public Categories: Map<string, MJActionCategoryEntity> = new Map();

  /** @deprecated Use {@link Categories}. */
  public get categories(): Map<string, MJActionCategoryEntity> {
    return this.Categories;
  }
  /** @deprecated Use {@link Categories}. */
  public set categories(value: Map<string, MJActionCategoryEntity>) {
    this.Categories = value;
  }
  public CategoryTree: CategoryTreeNode[] = [];

  /** @deprecated Use {@link CategoryTree}. */
  public get categoryTree(): CategoryTreeNode[] {
    return this.CategoryTree;
  }
  /** @deprecated Use {@link CategoryTree}. */
  public set categoryTree(value: CategoryTreeNode[]) {
    this.CategoryTree = value;
  }
  public CategoryDescendants: Map<string, Set<string>> = new Map();

  /** @deprecated Use {@link CategoryDescendants}. */
  public get categoryDescendants(): Map<string, Set<string>> {
    return this.CategoryDescendants;
  }
  /** @deprecated Use {@link CategoryDescendants}. */
  public set categoryDescendants(value: Map<string, Set<string>>) {
    this.CategoryDescendants = value;
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
  public SelectedCategory$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedCategory$}. */
  public get selectedCategory$() {
    return this.SelectedCategory$;
  }
  /** @deprecated Use {@link SelectedCategory$}. */
  public set selectedCategory$(value) {
    this.SelectedCategory$ = value;
  }
  public ExpandedCategories: Set<string> = new Set();

  /** @deprecated Use {@link ExpandedCategories}. */
  public get expandedCategories(): Set<string> {
    return this.ExpandedCategories;
  }
  /** @deprecated Use {@link ExpandedCategories}. */
  public set expandedCategories(value: Set<string>) {
    this.ExpandedCategories = value;
  }

  public StatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active', value: 'Active' },
    { text: 'Pending', value: 'Pending' },
    { text: 'Disabled', value: 'Disabled' }
  ];

  /** @deprecated Use {@link StatusOptions}. */
  public get statusOptions() {
    return this.StatusOptions;
  }
  /** @deprecated Use {@link StatusOptions}. */
  public set statusOptions(value) {
    this.StatusOptions = value;
  }

  public TypeOptions = [
    { text: 'All Types', value: 'all' },
    { text: 'AI Generated', value: 'Generated' },
    { text: 'Custom', value: 'Custom' }
  ];

  /** @deprecated Use {@link TypeOptions}. */
  public get typeOptions() {
    return this.TypeOptions;
  }
  /** @deprecated Use {@link TypeOptions}. */
  public set typeOptions(value) {
    this.TypeOptions = value;
  }

  public CategoryOptions: Array<{text: string; value: string}> = [
    { text: 'All Categories', value: 'all' }
  ];

  /** @deprecated Use {@link CategoryOptions}. */
  public get categoryOptions(): Array<{text: string; value: string}> {
    return this.CategoryOptions;
  }
  /** @deprecated Use {@link CategoryOptions}. */
  public set categoryOptions(value: Array<{text: string; value: string}>) {
    this.CategoryOptions = value;
  }

  private destroy$ = new Subject<void>();

  constructor() { super(); }

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
      this.SearchTerm$.pipe(debounceTime(300), distinctUntilChanged()),
      this.SelectedStatus$.pipe(distinctUntilChanged()),
      this.SelectedType$.pipe(distinctUntilChanged()),
      this.SelectedCategory$.pipe(distinctUntilChanged())
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      const [actionsResult, categoriesResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Actions',
          OrderBy: 'Name'
        },
        {
          EntityName: 'MJ: Action Categories',
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
      
      const actions = (actionsResult.Results || []) as MJActionEntity[];
      const categories = (categoriesResult.Results || []) as MJActionCategoryEntity[];
       
      this.Actions = actions;
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


  private populateCategoriesMap(categories: MJActionCategoryEntity[]): void {
    this.Categories.clear();
    categories.forEach(category => {
      this.Categories.set(category.ID, category);
    });
    
    // Build the category tree
    this.buildCategoryTree(categories);
    
    // Build descendant mapping for efficient filtering
    this.buildDescendantMapping(categories);
  }

  private buildCategoryOptions(categories: MJActionCategoryEntity[]): void {
    this.CategoryOptions = [
      { text: 'All Categories', value: 'all' },
      ...categories.map(category => ({
        text: category.Name,
        value: category.ID
      }))
    ];
  }

  private buildCategoryTree(categories: MJActionCategoryEntity[]): void {
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
    
    this.CategoryTree = rootNodes;
  }

  private buildDescendantMapping(categories: MJActionCategoryEntity[]): void {
    this.CategoryDescendants.clear();
    
    // Initialize each category with itself
    categories.forEach(category => {
      this.CategoryDescendants.set(category.ID, new Set([category.ID]));
    });
    
    // Build descendant sets
    const addDescendants = (categoryId: string, descendantId: string) => {
      const descendants = this.CategoryDescendants.get(categoryId);
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
          const parent = this.Categories.get(currentParentId);
          currentParentId = parent?.ParentID || null;
        }
      }
    });
  }

  private applyFilters(): void {
    let filtered = [...this.Actions];

    // Apply search filter
    const searchTerm = this.SearchTerm$.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(action => 
        action.Name.toLowerCase().includes(searchTerm) ||
        (action.Description || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply status filter
    const status = this.SelectedStatus$.value;
    if (status !== 'all') {
      filtered = filtered.filter(action => action.Status === status);
    }

    // Apply type filter
    const type = this.SelectedType$.value;
    if (type !== 'all') {
      filtered = filtered.filter(action => action.Type === type);
    }

    // Apply category filter (includes descendants)
    const categoryId = this.SelectedCategory$.value;
    if (categoryId !== 'all') {
      const descendantIds = this.CategoryDescendants.get(categoryId);
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

    this.FilteredActions = filtered;
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

  public OnCategoryFilterChange(categoryId: string): void {
    this.SelectedCategory$.next(categoryId);
  }

  /** @deprecated Use {@link OnCategoryFilterChange}. */
  public onCategoryFilterChange(categoryId: string): void {
    return this.OnCategoryFilterChange(categoryId);
  }

  public OpenAction(action: MJActionEntity): void {
    this.OpenEntityRecord.emit({
      entityName: 'MJ: Actions',
      recordId: action.ID
    });
  }

  /** @deprecated Use {@link OpenAction}. */
  public openAction(action: MJActionEntity): void {
    return this.OpenAction(action);
  }

  public GetCategoryName(categoryId: string | null): string {
    if (!categoryId) return 'No Category';
    return this.Categories.get(categoryId)?.Name || 'Unknown Category';
  }

  /** @deprecated Use {@link GetCategoryName}. */
  public getCategoryName(categoryId: string | null): string {
    return this.GetCategoryName(categoryId);
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

  // Tree view methods
  public ToggleCategoryExpanded(categoryId: string): void {
    if (this.ExpandedCategories.has(categoryId)) {
      this.ExpandedCategories.delete(categoryId);
    } else {
      this.ExpandedCategories.add(categoryId);
    }
  }

  /** @deprecated Use {@link ToggleCategoryExpanded}. */
  public toggleCategoryExpanded(categoryId: string): void {
    return this.ToggleCategoryExpanded(categoryId);
  }

  public IsCategoryExpanded(categoryId: string): boolean {
    return this.ExpandedCategories.has(categoryId);
  }

  /** @deprecated Use {@link IsCategoryExpanded}. */
  public isCategoryExpanded(categoryId: string): boolean {
    return this.IsCategoryExpanded(categoryId);
  }

  public SelectCategory(categoryId: string): void {
    this.SelectedCategory$.next(categoryId);
  }

  /** @deprecated Use {@link SelectCategory}. */
  public selectCategory(categoryId: string): void {
    return this.SelectCategory(categoryId);
  }

  public GetCategoryActionCount(categoryId: string): number {
    const descendantIds = this.CategoryDescendants.get(categoryId);
    if (!descendantIds) return 0;
    
    return this.Actions.filter(action => 
      action.CategoryID && descendantIds.has(action.CategoryID)
    ).length;
  }

  /** @deprecated Use {@link GetCategoryActionCount}. */
  public getCategoryActionCount(categoryId: string): number {
    return this.GetCategoryActionCount(categoryId);
  }

  public ShowCategoryTree = false;

  /** @deprecated Use {@link ShowCategoryTree}. */
  public get showCategoryTree() {
    return this.ShowCategoryTree;
  }
  /** @deprecated Use {@link ShowCategoryTree}. */
  public set showCategoryTree(value) {
    this.ShowCategoryTree = value;
  }

  public ToggleCategoryTree(): void {
    this.ShowCategoryTree = !this.ShowCategoryTree;
  }

  /** @deprecated Use {@link ToggleCategoryTree}. */
  public toggleCategoryTree(): void {
    return this.ToggleCategoryTree();
  }
}