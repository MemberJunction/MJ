import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FormControl } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJActionEntity, MJActionCategoryEntity, MJActionParamEntity, MJActionResultCodeEntity } from '@memberjunction/core-entities';

export interface ActionGalleryConfig {
  selectionMode?: boolean;
  multiSelect?: boolean;
  showCategories?: boolean;
  showSearch?: boolean;
  defaultView?: 'grid' | 'list';
  gridColumns?: number;
  enableQuickTest?: boolean;
  theme?: 'light' | 'dark';
}

export interface CategoryNode {
  id: string;
  name: string;
  parent?: string;
  children?: CategoryNode[];
  count?: number;
  icon?: string;
}

export interface ActionWithDetails extends MJActionEntity {
  parameters?: MJActionParamEntity[];
  resultCodes?: MJActionResultCodeEntity[];
  expanded?: boolean;
  selected?: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-action-gallery',
  templateUrl: './action-gallery.component.html',
  styleUrls: ['./action-gallery.component.css']
})
export class ActionGalleryComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() config: ActionGalleryConfig = {
    selectionMode: false,
    multiSelect: false,
    showCategories: true,
    showSearch: true,
    defaultView: 'grid',
    gridColumns: 3,
    enableQuickTest: true,
    theme: 'light'
  };
  
  @Input() PreSelectedActions: string[] = [];

  /** @deprecated Use {@link PreSelectedActions}. */
  @Input() set preSelectedActions(value: string[]) {
    this.PreSelectedActions = value;
  }
  /** @deprecated Use {@link PreSelectedActions}. */
  get preSelectedActions(): string[] {
    return this.PreSelectedActions;
  }
  @Output() ActionSelected = new EventEmitter<MJActionEntity>();

  /**
   * @deprecated Use {@link ActionSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (actionSelected) keeps working. Must stay AFTER ActionSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() actionSelected = this.ActionSelected;
  @Output() ActionsSelected = new EventEmitter<MJActionEntity[]>();

  /**
   * @deprecated Use {@link ActionsSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (actionsSelected) keeps working. Must stay AFTER ActionsSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() actionsSelected = this.ActionsSelected;
  @Output() ActionTestRequested = new EventEmitter<MJActionEntity>();

  /**
   * @deprecated Use {@link ActionTestRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (actionTestRequested) keeps working. Must stay AFTER ActionTestRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() actionTestRequested = this.ActionTestRequested;
  
  @ViewChild('searchInput', { static: false }) SearchInput: ElementRef<HTMLInputElement>;

  /** @deprecated Use {@link SearchInput}. */
  get searchInput(): ElementRef<HTMLInputElement> {
    return this.SearchInput;
  }
  /** @deprecated Use {@link SearchInput}. */
  set searchInput(value: ElementRef<HTMLInputElement>) {
    this.SearchInput = value;
  }
  
  // State management
  private destroy$ = new Subject<void>();
  Actions$ = new BehaviorSubject<ActionWithDetails[]>([]);

  /** @deprecated Use {@link Actions$}. */
  get actions$() {
    return this.Actions$;
  }
  /** @deprecated Use {@link Actions$}. */
  set actions$(value) {
    this.Actions$ = value;
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
  FilteredActions$ = new BehaviorSubject<ActionWithDetails[]>([]);

  /** @deprecated Use {@link FilteredActions$}. */
  get filteredActions$() {
    return this.FilteredActions$;
  }
  /** @deprecated Use {@link FilteredActions$}. */
  set filteredActions$(value) {
    this.FilteredActions$ = value;
  }
  CategoryTree$ = new BehaviorSubject<CategoryNode[]>([]);

  /** @deprecated Use {@link CategoryTree$}. */
  get categoryTree$() {
    return this.CategoryTree$;
  }
  /** @deprecated Use {@link CategoryTree$}. */
  set categoryTree$(value) {
    this.CategoryTree$ = value;
  }
  SelectedCategory$ = new BehaviorSubject<string>('all');

  /** @deprecated Use {@link SelectedCategory$}. */
  get selectedCategory$() {
    return this.SelectedCategory$;
  }
  /** @deprecated Use {@link SelectedCategory$}. */
  set selectedCategory$(value) {
    this.SelectedCategory$ = value;
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
  IsLoading$ = new BehaviorSubject<boolean>(false);

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }
  /** @deprecated Use {@link IsLoading$}. */
  set isLoading$(value) {
    this.IsLoading$ = value;
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
  
  // Form controls
  SearchControl = new FormControl('');

  /** @deprecated Use {@link SearchControl}. */
  get searchControl() {
    return this.SearchControl;
  }
  /** @deprecated Use {@link SearchControl}. */
  set searchControl(value) {
    this.SearchControl = value;
  }
  
  // UI state
  ExpandedCategories = new Set<string>();

  /** @deprecated Use {@link ExpandedCategories}. */
  get expandedCategories() {
    return this.ExpandedCategories;
  }
  /** @deprecated Use {@link ExpandedCategories}. */
  set expandedCategories(value) {
    this.ExpandedCategories = value;
  }
  HoveredAction: string | null = null;

  /** @deprecated Use {@link HoveredAction}. */
  get hoveredAction(): string | null {
    return this.HoveredAction;
  }
  /** @deprecated Use {@link HoveredAction}. */
  set hoveredAction(value: string | null) {
    this.HoveredAction = value;
  }
  AnimateCards = false;

  /** @deprecated Use {@link AnimateCards}. */
  get animateCards() {
    return this.AnimateCards;
  }
  /** @deprecated Use {@link AnimateCards}. */
  set animateCards(value) {
    this.AnimateCards = value;
  }
  
  // Statistics
  TotalActions = 0;

  /** @deprecated Use {@link TotalActions}. */
  get totalActions() {
    return this.TotalActions;
  }
  /** @deprecated Use {@link TotalActions}. */
  set totalActions(value) {
    this.TotalActions = value;
  }
  CategoryCounts = new Map<string, number>();

  /** @deprecated Use {@link CategoryCounts}. */
  get categoryCounts() {
    return this.CategoryCounts;
  }
  /** @deprecated Use {@link CategoryCounts}. */
  set categoryCounts(value) {
    this.CategoryCounts = value;
  }
  
  constructor() {
        super();}
  
  ngOnInit() {
    // Set initial view mode
    this.ViewMode$.next(this.config.defaultView || 'grid');
    
    // Load data
    this.loadData();
    
    // Set up filtering
    combineLatest([
      this.Actions$,
      this.SearchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ),
      this.SelectedCategory$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([actions, searchTerm, category]) => {
      this.filterActions(actions, searchTerm || '', category);
    });
    
    // Initialize with pre-selected actions
    if (this.PreSelectedActions.length > 0) {
      this.SelectedActions$.next(new Set(this.PreSelectedActions));
    }
    
    // Enable animations after initial load
    setTimeout(() => {
      this.AnimateCards = true;
    }, 100);
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  async loadData() {
    this.IsLoading$.next(true);
    
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      
      // Load actions and categories in parallel
      const [actionsResult, categoriesResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Actions',
          ResultType: 'entity_object',
          OrderBy: 'Category, Name',
          MaxRows: 5000
        },
        {
          EntityName: 'MJ: Action Categories',
          ResultType: 'entity_object',
          OrderBy: 'Name',
          MaxRows: 1000
        }
      ]);
      
      if (actionsResult.Success && categoriesResult.Success) {
        const actions = actionsResult.Results as MJActionEntity[] || [];
        const categories = categoriesResult.Results as MJActionCategoryEntity[] || [];
        
        // Process actions
        const actionsWithDetails = actions.map(action => ({
          ...action,
          expanded: false,
          selected: this.PreSelectedActions.some(id => UUIDsEqual(id, action.ID))
        } as ActionWithDetails));
        
        this.Actions$.next(actionsWithDetails);
        this.TotalActions = actions.length;
        
        // Process categories
        this.Categories$.next(categories);
        this.buildCategoryTree(categories, actions);
        
        // Initial filter
        this.filterActions(actionsWithDetails, '', 'all');
      }
    } catch (error) {
      console.error('Error loading gallery data:', error);
    } finally {
      this.IsLoading$.next(false);
    }
  }
  
  private buildCategoryTree(categories: MJActionCategoryEntity[], actions: MJActionEntity[]) {
    // Count actions per category
    this.CategoryCounts.clear();
    actions.forEach(action => {
      const count = this.CategoryCounts.get(action.Category || 'Uncategorized') || 0;
      this.CategoryCounts.set(action.Category || 'Uncategorized', count + 1);
    });
    
    // Build tree structure
    const nodeMap = new Map<string, CategoryNode>();
    const rootNodes: CategoryNode[] = [];
    
    // Create nodes
    categories.forEach(cat => {
      const node: CategoryNode = {
        id: cat.ID,
        name: cat.Name,
        parent: cat.ParentID || undefined,
        children: [],
        count: this.CategoryCounts.get(cat.Name) || 0,
        icon: this.getCategoryIcon(cat.Name)
      };
      nodeMap.set(cat.ID, node);
    });
    
    // Build hierarchy
    nodeMap.forEach(node => {
      if (node.parent && nodeMap.has(node.parent)) {
        const parent = nodeMap.get(node.parent)!;
        parent.children!.push(node);
        // Accumulate counts up the tree
        parent.count = (parent.count || 0) + (node.count || 0);
      } else {
        rootNodes.push(node);
      }
    });
    
    // Add "All" category at the top
    const allNode: CategoryNode = {
      id: 'all',
      name: 'All Actions',
      count: this.TotalActions,
      icon: 'fa-th'
    };
    
    // Add "Uncategorized" if needed
    const uncategorizedCount = this.CategoryCounts.get('Uncategorized') || 0;
    if (uncategorizedCount > 0) {
      const uncategorizedNode: CategoryNode = {
        id: 'uncategorized',
        name: 'Uncategorized',
        count: uncategorizedCount,
        icon: 'fa-question-circle'
      };
      rootNodes.push(uncategorizedNode);
    }
    
    this.CategoryTree$.next([allNode, ...rootNodes]);
  }
  
  private getCategoryIcon(categoryName: string): string {
    const iconMap: { [key: string]: string } = {
      'Data': 'fa-database',
      'Communication': 'fa-envelope',
      'Integration': 'fa-plug',
      'Security': 'fa-shield',
      'Workflow': 'fa-project-diagram',
      'AI': 'fa-brain',
      'Files': 'fa-file',
      'Utilities': 'fa-tools',
      'System': 'fa-cog',
      'Analytics': 'fa-chart-line'
    };
    
    return iconMap[categoryName] || 'fa-folder';
  }
  
  GetCategoryIconClass(category: CategoryNode): string {
    // Ensure we have a valid icon
    if (!category.icon) {
      return 'fa-solid fa-folder category-icon';
    }
    return `fa-solid ${category.icon} category-icon`;
  }

  /** @deprecated Use {@link GetCategoryIconClass}. */
  getCategoryIconClass(category: CategoryNode): string {
    return this.GetCategoryIconClass(category);
  }
  
  private filterActions(actions: ActionWithDetails[], searchTerm: string, category: string) {
    let filtered = [...actions];
    
    // Category filter
    if (category && category !== 'all') {
      if (category === 'uncategorized') {
        filtered = filtered.filter(a => !a.Category);
      } else {
        const categoryName = this.getCategoryName(category);
        filtered = filtered.filter(a => a.Category === categoryName);
      }
    }
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(action => 
        action.Name.toLowerCase().includes(term) ||
        action.Description?.toLowerCase().includes(term) ||
        action.Category?.toLowerCase().includes(term)
      );
    }
    
    this.FilteredActions$.next(filtered);
  }
  
  private getCategoryName(categoryId: string): string {
    const category = this.Categories$.value.find(c => UUIDsEqual(c.ID, categoryId));
    return category?.Name || '';
  }
  
  SelectCategory(categoryId: string) {
    this.SelectedCategory$.next(categoryId);
  }

  /** @deprecated Use {@link SelectCategory}. */
  selectCategory(categoryId: string) {
    return this.SelectCategory(categoryId);
  }
  
  ToggleCategoryExpanded(categoryId: string) {
    if (this.ExpandedCategories.has(categoryId)) {
      this.ExpandedCategories.delete(categoryId);
    } else {
      this.ExpandedCategories.add(categoryId);
    }
  }

  /** @deprecated Use {@link ToggleCategoryExpanded}. */
  toggleCategoryExpanded(categoryId: string) {
    return this.ToggleCategoryExpanded(categoryId);
  }
  
  ToggleViewMode() {
    const currentMode = this.ViewMode$.value;
    this.ViewMode$.next(currentMode === 'grid' ? 'list' : 'grid');
  }

  /** @deprecated Use {@link ToggleViewMode}. */
  toggleViewMode() {
    return this.ToggleViewMode();
  }
  
  async ToggleActionExpanded(action: ActionWithDetails) {
    action.expanded = !action.expanded;
    
    // Load details if expanding and not already loaded
    if (action.expanded && !action.parameters) {
      await this.LoadActionDetails(action);
    }
  }

  /** @deprecated Use {@link ToggleActionExpanded}. */
  async toggleActionExpanded(action: ActionWithDetails) {
    return this.ToggleActionExpanded(action);
  }
  
  async LoadActionDetails(action: ActionWithDetails) {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    
    try {
      const [paramsResult, resultCodesResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Action Params',
          ExtraFilter: `ActionID='${action.ID}'`,
          OrderBy: 'Sequence',
          ResultType: 'entity_object',
          MaxRows: 100
        },
        {
          EntityName: 'MJ: Action Result Codes',
          ExtraFilter: `ActionID='${action.ID}'`,
          OrderBy: 'ResultCode',
          ResultType: 'entity_object',
          MaxRows: 100
        }
      ]);
      
      if (paramsResult.Success) {
        action.parameters = paramsResult.Results as MJActionParamEntity[] || [];
      }
      
      if (resultCodesResult.Success) {
        action.resultCodes = resultCodesResult.Results as MJActionResultCodeEntity[] || [];
      }
    } catch (error) {
      console.error('Error loading action details:', error);
    }
  }

  /** @deprecated Use {@link LoadActionDetails}. */
  async loadActionDetails(action: ActionWithDetails) {
    return this.LoadActionDetails(action);
  }
  
  ToggleActionSelection(action: ActionWithDetails) {
    if (!this.config.selectionMode) return;
    
    const selected = this.SelectedActions$.value;
    
    if (!this.config.multiSelect) {
      // Single select mode
      selected.clear();
      if (!action.selected) {
        selected.add(action.ID);
        action.selected = true;
        this.ActionSelected.emit(action);
      }
    } else {
      // Multi-select mode
      if (action.selected) {
        selected.delete(action.ID);
        action.selected = false;
      } else {
        selected.add(action.ID);
        action.selected = true;
      }
    }
    
    this.SelectedActions$.next(new Set(selected));
    
    if (this.config.multiSelect) {
      const selectedActions = this.Actions$.value.filter(a => selected.has(a.ID));
      this.ActionsSelected.emit(selectedActions);
    }
  }

  /** @deprecated Use {@link ToggleActionSelection}. */
  toggleActionSelection(action: ActionWithDetails) {
    return this.ToggleActionSelection(action);
  }
  
  TestAction(action: MJActionEntity, event: Event) {
    event.stopPropagation();
    
    if (this.config.enableQuickTest) {
      // TODO: Implement test harness integration
      console.log('Test action:', action.Name);
    }
    
    this.ActionTestRequested.emit(action);
  }

  /** @deprecated Use {@link TestAction}. */
  testAction(action: MJActionEntity, event: Event) {
    return this.TestAction(action, event);
  }
  
  // Backs the no-results empty-state "Clear Filters" CTA: resets every dimension
  // the list narrows on — search AND the selected category — so the CTA actually
  // returns results instead of appearing to do nothing.
  ClearSearch() {
    this.SearchControl.reset();
    this.SelectedCategory$.next('all');
    if (this.SearchInput) {
      this.SearchInput.nativeElement.focus();
    }
  }

  /** @deprecated Use {@link ClearSearch}. */
  clearSearch() {
    return this.ClearSearch();
  }
  
  GetSelectedActions(): MJActionEntity[] {
    const selected = this.SelectedActions$.value;
    return this.Actions$.value.filter(a => selected.has(a.ID));
  }

  /** @deprecated Use {@link GetSelectedActions}. */
  getSelectedActions(): MJActionEntity[] {
    return this.GetSelectedActions();
  }
  
  GetActionIcon(action: MJActionEntity): string {
    const typeIcons: { [key: string]: string } = {
      'Create': 'fa-plus-circle',
      'Update': 'fa-edit',
      'Delete': 'fa-trash',
      'Query': 'fa-search',
      'Process': 'fa-cogs',
      'Email': 'fa-envelope',
      'Report': 'fa-file-alt',
      'Export': 'fa-file-export',
      'Import': 'fa-file-import',
      'API': 'fa-plug',
      'Script': 'fa-code'
    };
    
    for (const [key, icon] of Object.entries(typeIcons)) {
      if (action.Name.toLowerCase().includes(key.toLowerCase()) || 
          action.Type?.toLowerCase().includes(key.toLowerCase())) {
        return icon;
      }
    }
    
    return 'fa-bolt';
  }

  /** @deprecated Use {@link GetActionIcon}. */
  getActionIcon(action: MJActionEntity): string {
    return this.GetActionIcon(action);
  }
}