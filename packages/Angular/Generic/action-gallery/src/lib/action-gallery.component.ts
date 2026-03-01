import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
export class ActionGalleryComponent implements OnInit, OnDestroy {
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
  
  @Input() preSelectedActions: string[] = [];
  @Output() actionSelected = new EventEmitter<MJActionEntity>();
  @Output() actionsSelected = new EventEmitter<MJActionEntity[]>();
  @Output() actionTestRequested = new EventEmitter<MJActionEntity>();
  
  @ViewChild('searchInput', { static: false }) searchInput: ElementRef<HTMLInputElement>;
  
  // State management
  private destroy$ = new Subject<void>();
  actions$ = new BehaviorSubject<ActionWithDetails[]>([]);
  categories$ = new BehaviorSubject<MJActionCategoryEntity[]>([]);
  filteredActions$ = new BehaviorSubject<ActionWithDetails[]>([]);
  categoryTree$ = new BehaviorSubject<CategoryNode[]>([]);
  selectedCategory$ = new BehaviorSubject<string>('all');
  viewMode$ = new BehaviorSubject<'grid' | 'list'>('grid');
  isLoading$ = new BehaviorSubject<boolean>(false);
  selectedActions$ = new BehaviorSubject<Set<string>>(new Set());
  
  // Form controls
  searchControl = new FormControl('');
  
  // UI state
  expandedCategories = new Set<string>();
  hoveredAction: string | null = null;
  animateCards = false;
  
  // Statistics
  totalActions = 0;
  categoryCounts = new Map<string, number>();
  
  constructor() {}
  
  ngOnInit() {
    // Set initial view mode
    this.viewMode$.next(this.config.defaultView || 'grid');
    
    // Load data
    this.loadData();
    
    // Set up filtering
    combineLatest([
      this.actions$,
      this.searchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ),
      this.selectedCategory$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([actions, searchTerm, category]) => {
      this.filterActions(actions, searchTerm || '', category);
    });
    
    // Initialize with pre-selected actions
    if (this.preSelectedActions.length > 0) {
      this.selectedActions$.next(new Set(this.preSelectedActions));
    }
    
    // Enable animations after initial load
    setTimeout(() => {
      this.animateCards = true;
    }, 100);
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  async loadData() {
    this.isLoading$.next(true);
    
    try {
      const rv = new RunView();
      
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
          selected: this.preSelectedActions.includes(action.ID)
        } as ActionWithDetails));
        
        this.actions$.next(actionsWithDetails);
        this.totalActions = actions.length;
        
        // Process categories
        this.categories$.next(categories);
        this.buildCategoryTree(categories, actions);
        
        // Initial filter
        this.filterActions(actionsWithDetails, '', 'all');
      }
    } catch (error) {
      console.error('Error loading gallery data:', error);
    } finally {
      this.isLoading$.next(false);
    }
  }
  
  private buildCategoryTree(categories: MJActionCategoryEntity[], actions: MJActionEntity[]) {
    // Count actions per category
    this.categoryCounts.clear();
    actions.forEach(action => {
      const count = this.categoryCounts.get(action.Category || 'Uncategorized') || 0;
      this.categoryCounts.set(action.Category || 'Uncategorized', count + 1);
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
        count: this.categoryCounts.get(cat.Name) || 0,
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
      count: this.totalActions,
      icon: 'fa-th'
    };
    
    // Add "Uncategorized" if needed
    const uncategorizedCount = this.categoryCounts.get('Uncategorized') || 0;
    if (uncategorizedCount > 0) {
      const uncategorizedNode: CategoryNode = {
        id: 'uncategorized',
        name: 'Uncategorized',
        count: uncategorizedCount,
        icon: 'fa-question-circle'
      };
      rootNodes.push(uncategorizedNode);
    }
    
    this.categoryTree$.next([allNode, ...rootNodes]);
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
  
  getCategoryIconClass(category: CategoryNode): string {
    // Ensure we have a valid icon
    if (!category.icon) {
      return 'fa-solid fa-folder category-icon';
    }
    return `fa-solid ${category.icon} category-icon`;
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
    
    this.filteredActions$.next(filtered);
  }
  
  private getCategoryName(categoryId: string): string {
    const category = this.categories$.value.find(c => UUIDsEqual(c.ID, categoryId));
    return category?.Name || '';
  }
  
  selectCategory(categoryId: string) {
    this.selectedCategory$.next(categoryId);
  }
  
  toggleCategoryExpanded(categoryId: string) {
    if (this.expandedCategories.has(categoryId)) {
      this.expandedCategories.delete(categoryId);
    } else {
      this.expandedCategories.add(categoryId);
    }
  }
  
  toggleViewMode() {
    const currentMode = this.viewMode$.value;
    this.viewMode$.next(currentMode === 'grid' ? 'list' : 'grid');
  }
  
  async toggleActionExpanded(action: ActionWithDetails) {
    action.expanded = !action.expanded;
    
    // Load details if expanding and not already loaded
    if (action.expanded && !action.parameters) {
      await this.loadActionDetails(action);
    }
  }
  
  async loadActionDetails(action: ActionWithDetails) {
    const rv = new RunView();
    
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
  
  toggleActionSelection(action: ActionWithDetails) {
    if (!this.config.selectionMode) return;
    
    const selected = this.selectedActions$.value;
    
    if (!this.config.multiSelect) {
      // Single select mode
      selected.clear();
      if (!action.selected) {
        selected.add(action.ID);
        action.selected = true;
        this.actionSelected.emit(action);
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
    
    this.selectedActions$.next(new Set(selected));
    
    if (this.config.multiSelect) {
      const selectedActions = this.actions$.value.filter(a => selected.has(a.ID));
      this.actionsSelected.emit(selectedActions);
    }
  }
  
  testAction(action: MJActionEntity, event: Event) {
    event.stopPropagation();
    
    if (this.config.enableQuickTest) {
      // TODO: Implement test harness integration
      console.log('Test action:', action.Name);
    }
    
    this.actionTestRequested.emit(action);
  }
  
  clearSearch() {
    this.searchControl.reset();
    if (this.searchInput) {
      this.searchInput.nativeElement.focus();
    }
  }
  
  getSelectedActions(): MJActionEntity[] {
    const selected = this.selectedActions$.value;
    return this.actions$.value.filter(a => selected.has(a.ID));
  }
  
  getActionIcon(action: MJActionEntity): string {
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
}