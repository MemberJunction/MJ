import { Component, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, takeUntil, startWith } from 'rxjs';
import { RunView, Metadata } from '@memberjunction/core';
import { MJActionEntity, MJActionCategoryEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
export interface CategoryTreeNode {
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  count: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  icon: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  children?: CategoryTreeNode[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  expanded?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface ActionDisplayItem extends MJActionEntity {
  Selected: boolean;
  CategoryName?: string;
}

/**
 * Modern, clean dialog for selecting actions to add to an AI Agent.
 * Features searchable action list, category filtering, and multi-select capability.
 */
@Component({
  standalone: false,
  selector: 'mj-add-action-dialog',
  templateUrl: './add-action-dialog.component.html',
  styleUrls: ['./add-action-dialog.component.css']
})
export class AddActionDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  
  // Input properties set by service
  AgentId: string = '';

  /** @deprecated Use {@link AgentId}. */
  get agentId(): string {
    return this.AgentId;
  }
  /** @deprecated Use {@link AgentId}. */
  set agentId(value: string) {
    this.AgentId = value;
  }
  AgentName: string = '';

  /** @deprecated Use {@link AgentName}. */
  get agentName(): string {
    return this.AgentName;
  }
  /** @deprecated Use {@link AgentName}. */
  set agentName(value: string) {
    this.AgentName = value;
  }
  ExistingActionIds: string[] = [];

  /** @deprecated Use {@link ExistingActionIds}. */
  get existingActionIds(): string[] {
    return this.ExistingActionIds;
  }
  /** @deprecated Use {@link ExistingActionIds}. */
  set existingActionIds(value: string[]) {
    this.ExistingActionIds = value;
  }

  // Reactive state management
  private destroy$ = new Subject<void>();
  public Result = new Subject<MJActionEntity[]>();

  /** @deprecated Use {@link Result}. */
  public get result() {
    return this.Result;
  }
  /** @deprecated Use {@link Result}. */
  public set result(value) {
    this.Result = value;
  }
  
  // Data streams
  AllActions$ = new BehaviorSubject<ActionDisplayItem[]>([]);

  /** @deprecated Use {@link AllActions$}. */
  get allActions$() {
    return this.AllActions$;
  }
  /** @deprecated Use {@link AllActions$}. */
  set allActions$(value) {
    this.AllActions$ = value;
  }
  Categories$ = new BehaviorSubject<MJActionCategoryEntity[]>([]);

  /** @deprecated Use {@link Categories$}. */
  get categories$() {
    return this.Categories$;
  }
  /** @deprecated Use {@link Categories$}. */
  set categories$(value) {
    this.Categories$ = value;
  }
  FilteredActions$ = new BehaviorSubject<ActionDisplayItem[]>([]);

  /** @deprecated Use {@link FilteredActions$}. */
  get filteredActions$() {
    return this.FilteredActions$;
  }
  /** @deprecated Use {@link FilteredActions$}. */
  set filteredActions$(value) {
    this.FilteredActions$ = value;
  }
  CategoryTree$ = new BehaviorSubject<CategoryTreeNode[]>([]);

  /** @deprecated Use {@link CategoryTree$}. */
  get categoryTree$() {
    return this.CategoryTree$;
  }
  /** @deprecated Use {@link CategoryTree$}. */
  set categoryTree$(value) {
    this.CategoryTree$ = value;
  }
  SelectedActions$ = new BehaviorSubject<Set<string>>(new Set());

  /** @deprecated Use {@link SelectedActions$}. */
  get selectedActions$() {
    return this.SelectedActions$;
  }
  /** @deprecated Use {@link SelectedActions$}. */
  set selectedActions$(value) {
    this.SelectedActions$ = value;
  }
  IsLoading$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }
  /** @deprecated Use {@link IsLoading$}. */
  set isLoading$(value) {
    this.IsLoading$ = value;
  }
  
  // UI state
  SearchControl = new FormControl('');

  /** @deprecated Use {@link SearchControl}. */
  get searchControl() {
    return this.SearchControl;
  }
  /** @deprecated Use {@link SearchControl}. */
  set searchControl(value) {
    this.SearchControl = value;
  }
  SelectedCategoryId$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedCategoryId$}. */
  get selectedCategoryId$() {
    return this.SelectedCategoryId$;
  }
  /** @deprecated Use {@link SelectedCategoryId$}. */
  set selectedCategoryId$(value) {
    this.SelectedCategoryId$ = value;
  }
  ViewMode$ = new BehaviorSubject<'grid' | 'list'>('grid');

  /** @deprecated Use {@link ViewMode$}. */
  get viewMode$() {
    return this.ViewMode$;
  }
  /** @deprecated Use {@link ViewMode$}. */
  set viewMode$(value) {
    this.ViewMode$ = value;
  }
  ExpandedCategories = new Set<string>();

  /** @deprecated Use {@link ExpandedCategories}. */
  get expandedCategories() {
    return this.ExpandedCategories;
  }
  /** @deprecated Use {@link ExpandedCategories}. */
  set expandedCategories(value) {
    this.ExpandedCategories = value;
  }

  // Computed values
  get SelectedCount(): number {
    return this.SelectedActions$.value.size;
  }

  /** @deprecated Use {@link SelectedCount}. */
  get selectedCount(): number {
    return this.SelectedCount;
  }

  get TotalActionCount(): number {
    return this.AllActions$.value.length;
  }

  /** @deprecated Use {@link TotalActionCount}. */
  get totalActionCount(): number {
    return this.TotalActionCount;
  }

  get FilteredCount(): number {
    return this.FilteredActions$.value.length;
  }

  /** @deprecated Use {@link FilteredCount}. */
  get filteredCount(): number {
    return this.FilteredCount;
  }

  @Output() DialogClose = new EventEmitter<void>();

  constructor(
    private cdr: ChangeDetectorRef
  ) {
    super();}

  ngOnInit() {
    this.initializeData();
    this.setupFiltering();
    this.preselectExistingActions();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async initializeData() {
    this.IsLoading$.next(true);
    
    try {
      await this.loadActionsAndCategories();
      this.buildCategoryTree();
    } catch (error) {
      console.error('Error loading dialog data:', error);
    } finally {
      this.IsLoading$.next(false);
    }
  }

  private async loadActionsAndCategories() {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    
    const [actionsResult, categoriesResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Actions',
        ExtraFilter: 'Status = \'Active\'',
        OrderBy: 'Category, Name',
        ResultType: 'entity_object',
        MaxRows: 5000
      },
      {
        EntityName: 'MJ: Action Categories',
        ExtraFilter: 'Status = \'Active\'',
        OrderBy: 'Name',
        ResultType: 'entity_object',
        MaxRows: 1000
      }
    ]);

    if (actionsResult.Success) {
      const actions = (actionsResult.Results as MJActionEntity[] || []).map(action => ({
        ...action.GetAll(),
        Selected: false,
        CategoryName: action.Category || 'Uncategorized'
      } as ActionDisplayItem));
      
      this.AllActions$.next(actions);
    }

    if (categoriesResult.Success) {
      this.Categories$.next(categoriesResult.Results as MJActionCategoryEntity[] || []);
    }
  }

  private buildCategoryTree() {
    const actions = this.AllActions$.value;
    const categories = this.Categories$.value;
    
    // Count actions per category
    const categoryCounts = new Map<string, number>();
    actions.forEach(action => {
      const categoryName = action.CategoryName || 'Uncategorized';
      categoryCounts.set(categoryName, (categoryCounts.get(categoryName) || 0) + 1);
    });

    // Build tree nodes
    const treeNodes: CategoryTreeNode[] = [
      {
        id: 'all',
        name: 'All Actions',
        count: actions.length,
        icon: 'fa-th'
      }
    ];

    // Add category nodes
    categories.forEach(category => {
      const count = categoryCounts.get(category.Name) || 0;
      if (count > 0) {
        treeNodes.push({
          id: category.ID,
          name: category.Name,
          count,
          icon: this.getCategoryIcon(category.Name)
        });
      }
    });

    // Add uncategorized if needed
    const uncategorizedCount = categoryCounts.get('Uncategorized') || 0;
    if (uncategorizedCount > 0) {
      treeNodes.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        count: uncategorizedCount,
        icon: 'fa-question-circle'
      });
    }

    this.CategoryTree$.next(treeNodes);
  }

  private getCategoryIcon(categoryName: string): string {
    const iconMap: { [key: string]: string } = {
      'Data': 'fa-database',
      'Communication': 'fa-envelope',
      'Integration': 'fa-plug',
      'Security': 'fa-shield-alt',
      'Workflow': 'fa-project-diagram',
      'AI': 'fa-brain',
      'Files': 'fa-file-alt',
      'Utilities': 'fa-tools',
      'System': 'fa-cog',
      'Analytics': 'fa-chart-line'
    };
    return iconMap[categoryName] || 'fa-folder';
  }

  private setupFiltering() {
    combineLatest([
      this.AllActions$,
      this.SearchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged(),
        startWith('')  // Emit initial empty value
      ),
      this.SelectedCategoryId$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([actions, searchTerm, categoryId]) => {
      this.filterActions(actions, searchTerm || '', categoryId);
    });
  }

  private filterActions(actions: ActionDisplayItem[], searchTerm: string, categoryId: string) {
    let filtered = [...actions];

    // Category filter
    if (categoryId !== 'all') {
      if (categoryId === 'uncategorized') {
        filtered = filtered.filter(action => !action.Category);
      } else {
        const categoryName = this.getCategoryNameById(categoryId);
        filtered = filtered.filter(action => action.CategoryName === categoryName);
      }
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(action =>
        action.Name.toLowerCase().includes(term) ||
        (action.Description && action.Description.toLowerCase().includes(term)) ||
        (action.CategoryName && action.CategoryName.toLowerCase().includes(term))
      );
    }

    this.FilteredActions$.next(filtered);
  }

  private getCategoryNameById(categoryId: string): string {
    const category = this.Categories$.value.find(c => UUIDsEqual(c.ID, categoryId));
    return category?.Name || '';
  }

  private preselectExistingActions() {
    if (this.ExistingActionIds.length > 0) {
      const selected = new Set(this.ExistingActionIds);
      this.SelectedActions$.next(selected);
      
      // Update action selection state
      const actions = this.AllActions$.value;
      actions.forEach(action => {
        action.Selected = selected.has(action.ID);
      });
      this.AllActions$.next(actions);
    }
  }

  // === UI Event Handlers ===

  SelectCategory(categoryId: string) {
    this.SelectedCategoryId$.next(categoryId);
  }

  /** @deprecated Use {@link SelectCategory}. */
  selectCategory(categoryId: string) {
    return this.SelectCategory(categoryId);
  }

  ToggleViewMode() {
    const currentMode = this.ViewMode$.value;
    this.ViewMode$.next(currentMode === 'grid' ? 'list' : 'grid');
  }

  /** @deprecated Use {@link ToggleViewMode}. */
  toggleViewMode() {
    return this.ToggleViewMode();
  }

  ToggleActionSelection(action: ActionDisplayItem) {
    const selected = this.SelectedActions$.value;
    const actions = this.AllActions$.value;
    
    // Find the action and toggle its selection
    const actionToUpdate = actions.find(a => UUIDsEqual(a.ID, action.ID));
    if (actionToUpdate) {
      actionToUpdate.Selected = !actionToUpdate.Selected;
      
      if (actionToUpdate.Selected) {
        selected.add(action.ID);
      } else {
        selected.delete(action.ID);
      }
      
      this.SelectedActions$.next(new Set(selected));
      this.AllActions$.next(actions);
      
      // Update filtered actions to reflect selection state
      const filtered = this.FilteredActions$.value;
      const filteredAction = filtered.find(a => UUIDsEqual(a.ID, action.ID));
      if (filteredAction) {
        filteredAction.Selected = actionToUpdate.Selected;
        this.FilteredActions$.next(filtered);
      }
    }
  }

  /** @deprecated Use {@link ToggleActionSelection}. */
  toggleActionSelection(action: ActionDisplayItem) {
    return this.ToggleActionSelection(action);
  }

  // Backs the no-results empty-state "Clear Filters" CTA: resets every dimension
  // the list narrows on — search AND the category filter — so the CTA actually
  // returns results instead of appearing to do nothing.
  ClearSearch() {
    this.SearchControl.reset();
    this.SelectedCategoryId$.next('all');
  }

  /** @deprecated Use {@link ClearSearch}. */
  clearSearch() {
    return this.ClearSearch();
  }

  GetActionIcon(action: ActionDisplayItem): string {
    // Return custom icon if set
    if (action.IconClass) {
      return action.IconClass;
    }

    // Fallback icon mapping based on action name/type
    const name = action.Name.toLowerCase();
    if (name.includes('create') || name.includes('add')) return 'fa-plus-circle';
    if (name.includes('update') || name.includes('edit')) return 'fa-edit';
    if (name.includes('delete') || name.includes('remove')) return 'fa-trash';
    if (name.includes('email') || name.includes('send')) return 'fa-envelope';
    if (name.includes('export')) return 'fa-file-export';
    if (name.includes('import')) return 'fa-file-import';
    if (name.includes('report')) return 'fa-file-alt';
    if (name.includes('api')) return 'fa-plug';
    
    return 'fa-bolt'; // Default action icon
  }

  /** @deprecated Use {@link GetActionIcon}. */
  getActionIcon(action: ActionDisplayItem): string {
    return this.GetActionIcon(action);
  }

  // === Dialog Actions ===

  cancel() {
    this.Result.next([]);
    this.DialogClose.emit();
  }

  AddSelectedActions() {
    const selectedIds = this.SelectedActions$.value;
    const allActions = this.AllActions$.value;

    // Get the selected action display items (excluding existing ones)
    const selectedDisplayItems = allActions
      .filter(action => selectedIds.has(action.ID) && !this.ExistingActionIds.some(id => UUIDsEqual(id, action.ID)));

    // Convert ActionDisplayItem to MJActionEntity by casting (they have the same structure)
    const selectedActions: MJActionEntity[] = selectedDisplayItems.map(item => item as MJActionEntity);

    this.Result.next(selectedActions);
    this.DialogClose.emit();
  }

  /** @deprecated Use {@link AddSelectedActions}. */
  addSelectedActions() {
    return this.AddSelectedActions();
  }
}