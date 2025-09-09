import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseNavigationComponent, SharedService } from '@memberjunction/ng-shared';
import { QueryEntity, QueryCategoryEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

interface CategoryWithCount extends QueryCategoryEntity {
  QueryCount?: number;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

type ViewMode = 'category' | 'list' | 'panel';
type SortOption = 'name-asc' | 'name-desc' | 'updated-desc' | 'updated-asc' | 'status';

@Component({
  selector: 'mj-query-browser',
  templateUrl: './query-browser.component.html',
  styleUrls: ['./query-browser.component.css', '../../shared/first-tab-styles.css']
})
@RegisterClass(BaseNavigationComponent, 'Queries')
export class QueryBrowserComponent extends BaseNavigationComponent implements OnInit, OnDestroy {
  // View mode state
  public viewMode: ViewMode = 'list';
  
  // Data
  public allQueries: QueryEntity[] = [];
  public allCategories: QueryCategoryEntity[] = [];
  public filteredQueries: QueryEntity[] = [];
  public filteredCategories: CategoryWithCount[] = [];
  
  // Selection state
  public selectedQuery: QueryEntity | null = null;
  public currentCategoryId: string | null = null;
  public currentCategoryPath: BreadcrumbItem[] = [];
  
  // Filter state
  public searchText: string = '';
  public selectedStatus: string = 'all';
  public selectedSort: SortOption = 'updated-desc';
  public activeFilters: string[] = [];
  
  // Loading state
  public isLoading: boolean = false;
  
  // Category counts cache
  private categoryCounts = new Map<string, number>();
  
  // Options for dropdowns
  public readonly statusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Pending', value: 'Pending' },
    { text: 'Approved', value: 'Approved' },
    { text: 'Rejected', value: 'Rejected' },
    { text: 'Expired', value: 'Expired' }
  ];
  
  public readonly sortOptions = [
    { text: 'Name (A-Z)', value: 'name-asc' },
    { text: 'Name (Z-A)', value: 'name-desc' },
    { text: 'Recently Updated', value: 'updated-desc' },
    { text: 'Oldest Updated', value: 'updated-asc' },
    { text: 'Status', value: 'status' }
  ];
  
  // Search debouncing
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private sharedService: SharedService
  ) {
    super();
  }

  async ngOnInit(): Promise<void> {
    // Set up search debouncing
    this.searchSubject
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(searchText => {
        this.performSearch(searchText);
      });
    
    // Load initial data
    await this.loadData();
    
    // Check for view mode from route params
    this.route.queryParams.subscribe(params => {
      if (params['view'] && ['category', 'list', 'panel'].includes(params['view'])) {
        this.viewMode = params['view'] as ViewMode;
        // Reapply filters when view mode changes from route
        this.applyFilters();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    
    try {
      const md = new Metadata();
      const rv = new RunView();
      
      // Load queries and categories in parallel
      const [queriesResult, categoriesResult] = await Promise.all([
        rv.RunView<QueryEntity>({
          EntityName: 'Queries',
          OrderBy: '__mj_UpdatedAt DESC',
          ResultType: 'entity_object'
        }),
        rv.RunView<QueryCategoryEntity>({
          EntityName: 'Query Categories',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        })
      ]);
      
      if (queriesResult.Success) {
        this.allQueries = queriesResult.Results || [];
      }
      
      if (categoriesResult.Success) {
        this.allCategories = categoriesResult.Results || [];
        this.calculateCategoryCounts();
      }
      
      // Apply initial filters
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading data:', error);
      this.sharedService.CreateSimpleNotification('Error loading queries', 'error', 3000);
    } finally {
      this.isLoading = false;
    }
  }

  calculateCategoryCounts(): void {
    // Count queries per category
    const counts = new Map<string, number>();
    
    for (const query of this.allQueries) {
      if (query.CategoryID) {
        const current = counts.get(query.CategoryID) || 0;
        counts.set(query.CategoryID, current + 1);
      }
    }
    
    // Count queries recursively for each category (including subcategories)
    const getRecursiveCount = (categoryId: string): number => {
      let count = counts.get(categoryId) || 0;
      
      // Add counts from all child categories
      const children = this.allCategories.filter(c => c.ParentID === categoryId);
      for (const child of children) {
        count += getRecursiveCount(child.ID);
      }
      
      return count;
    };
    
    // Don't set filteredCategories here - let applyFilters handle it
    // Just store the counts for later use
    this.categoryCounts = new Map<string, number>();
    for (const cat of this.allCategories) {
      this.categoryCounts.set(cat.ID, getRecursiveCount(cat.ID));
    }
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    
    // Update URL with view mode
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: mode },
      queryParamsHandling: 'merge'
    });
    
    // Reapply filters to update the view
    this.applyFilters();
  }

  onSearchChange(searchText: string): void {
    this.searchSubject.next(searchText);
  }

  performSearch(searchText: string): void {
    this.searchText = searchText;
    this.applyFilters();
  }

  // New clean filter/sort handlers
  getSelectedStatusOption(): any {
    return this.statusOptions.find(opt => opt.value === this.selectedStatus) || this.statusOptions[0];
  }
  
  getSelectedSortOption(): any {
    return this.sortOptions.find(opt => opt.value === this.selectedSort) || this.sortOptions[2];
  }
  
  handleStatusChange(option: any): void {
    if (option && option.value !== undefined) {
      this.selectedStatus = option.value;
      this.applyFilters();
    }
  }
  
  handleSortChange(option: any): void {
    if (option && option.value !== undefined) {
      this.selectedSort = option.value as SortOption;
      this.applySortAndFilter();
    }
  }
  
  hasActiveFilters(): boolean {
    return this.searchText !== '' || this.selectedStatus !== 'all';
  }
  
  clearAllFilters(): void {
    this.searchText = '';
    this.selectedStatus = 'all';
    this.applyFilters();
  }

  applyFilters(): void {
    // Start with all queries
    let filtered = [...this.allQueries];
    
    // Clear active filters tracking
    this.activeFilters = [];
    
    // 1. Apply search filter if present
    if (this.searchText && this.searchText.trim() !== '') {
      const searchLower = this.searchText.toLowerCase().trim();
      filtered = filtered.filter(q => {
        const nameMatch = q.Name?.toLowerCase().includes(searchLower) || false;
        const descMatch = q.Description?.toLowerCase().includes(searchLower) || false;
        const sqlMatch = q.SQL?.toLowerCase().includes(searchLower) || false;
        return nameMatch || descMatch || sqlMatch;
      });
      this.activeFilters.push(`Search: ${this.searchText}`);
    }
    
    // 2. Apply status filter if not "all"
    if (this.selectedStatus && this.selectedStatus !== 'all') {
      filtered = filtered.filter(q => q.Status === this.selectedStatus);
      this.activeFilters.push(`Status: ${this.selectedStatus}`);
    }
    
    // 3. Apply category-based filtering in category view mode
    if (this.viewMode === 'category') {
      filtered = filtered.filter(q => {
        if (this.currentCategoryId === null) {
          // At root: show only queries without a category
          return !q.CategoryID || q.CategoryID === null || q.CategoryID === '';
        } else {
          // Inside a category: show only queries in this specific category
          return q.CategoryID === this.currentCategoryId;
        }
      });
    }
    
    // Set the filtered queries
    this.filteredQueries = filtered;
    
    // Update categories for category view
    this.updateFilteredCategories();
    
    // Apply sorting to the filtered results
    this.applySort();
  }

  updateFilteredCategories(): void {
    // Filter categories based on current parent
    let filtered = this.allCategories.filter(cat => {
      if (this.currentCategoryId === null) {
        // At root: show categories with no parent
        return !cat.ParentID;
      } else {
        // In a category: show child categories
        return cat.ParentID === this.currentCategoryId;
      }
    });
    
    // Apply search to categories if in category mode
    if (this.searchText && this.viewMode === 'category') {
      const search = this.searchText.toLowerCase();
      filtered = filtered.filter(cat =>
        cat.Name?.toLowerCase().includes(search) ||
        cat.Description?.toLowerCase().includes(search)
      );
    }
    
    // Convert to CategoryWithCount and use cached counts
    this.filteredCategories = filtered.map(cat => {
      const count = this.categoryCounts.get(cat.ID) || 0;
      return {
        ...cat.GetAll(), // Use GetAll() to get plain object with all properties
        QueryCount: count
      } as CategoryWithCount;
    });
  }

  applySort(): void {
    // Create a copy to avoid mutation issues
    const queries = [...this.filteredQueries];
    
    switch (this.selectedSort) {
      case 'name-asc':
        queries.sort((a, b) => {
          const nameA = a.Name || '';
          const nameB = b.Name || '';
          return nameA.localeCompare(nameB);
        });
        break;
        
      case 'name-desc':
        queries.sort((a, b) => {
          const nameA = a.Name || '';
          const nameB = b.Name || '';
          return nameB.localeCompare(nameA);
        });
        break;
        
      case 'updated-desc':
        queries.sort((a, b) => {
          const dateA = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
          const dateB = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
        
      case 'updated-asc':
        queries.sort((a, b) => {
          const dateA = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
          const dateB = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
          return dateA - dateB;
        });
        break;
        
      case 'status':
        queries.sort((a, b) => {
          const statusA = a.Status || 'Pending';
          const statusB = b.Status || 'Pending';
          return statusA.localeCompare(statusB);
        });
        break;
        
      default:
        // Default to recent updates
        queries.sort((a, b) => {
          const dateA = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
          const dateB = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
    }
    
    // Assign the sorted array
    this.filteredQueries = queries;
  }

  // Helper to apply both sort and filter
  private applySortAndFilter(): void {
    this.applyFilters(); // This calls applySort internally
  }

  navigateToRoot(): void {
    this.currentCategoryId = null;
    this.currentCategoryPath = [];
    this.applyFilters();
  }

  navigateToCategory(categoryId: string | null): void {
    if (categoryId === null) {
      this.navigateToRoot();
      return;
    }
    
    this.currentCategoryId = categoryId;
    this.buildBreadcrumb(categoryId);
    this.applyFilters();
  }

  buildBreadcrumb(categoryId: string): void {
    const path: BreadcrumbItem[] = [];
    let currentId: string | null = categoryId;
    
    while (currentId) {
      const category = this.allCategories.find(c => c.ID === currentId);
      if (category) {
        path.unshift({
          id: category.ID,
          name: category.Name
        });
        currentId = category.ParentID;
      } else {
        break;
      }
    }
    
    this.currentCategoryPath = path;
  }

  selectQuery(query: QueryEntity): void {
    // Strip quotes from ID if present
    let queryId = query.ID;
    if (queryId && typeof queryId === 'string') {
      queryId = queryId.replace(/^['"]|['"]$/g, '');
    }
    
    // Navigate to the entity form using the resource/record pattern
    // Format: /resource/record/ID|{queryId}?Entity=Queries
    const routeSegment = `ID|${queryId}`;
    this.router.navigate(['resource', 'record', routeSegment], { 
      queryParams: { 
        Entity: 'Queries',
        viewMode: this.viewMode // Preserve the current view mode
      } 
    });
  }


  async runQuery(query: QueryEntity, event: Event): Promise<void> {
    event.stopPropagation();
    
    let queryId = query.ID;
    if (queryId && typeof queryId === 'string') {
      queryId = queryId.replace(/^['\"]|['\"]$/g, '');
    }
    
    // Navigate to the query form with run=true parameter
    // This will trigger the run dialog in the query form component
    const routeSegment = `ID|${queryId}`;
    this.router.navigate(['resource', 'record', routeSegment], { 
      queryParams: { 
        Entity: 'Queries',
        run: 'true'  // This will trigger the run dialog to open
      } 
    });
  }

  async deleteQuery(query: QueryEntity, event: Event): Promise<void> {
    event.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete "${query.Name}"?`)) {
      return;
    }
    
    try {
      let result = false;
      
      // First try to delete directly if the query has a Delete method
      if (query && typeof query.Delete === 'function') {
        result = await query.Delete();
      } else {
        // If not, load the entity properly and then delete
        const md = new Metadata();
        const queryEntity = await md.GetEntityObject<QueryEntity>('Queries');
        
        // Load the existing record
        const loaded = await queryEntity.Load(query.ID);
        
        if (!loaded) {
          this.sharedService.CreateSimpleNotification('Query not found', 'error', 3000);
          return;
        }
        
        // Now delete the loaded entity
        result = await queryEntity.Delete();
      }
      
      if (result) {
        this.sharedService.CreateSimpleNotification('Query deleted successfully', 'success', 3000);
        await this.loadData();
      } else {
        // Check if there's a specific error message
        const errorMsg = query.LatestResult?.Message || 'Failed to delete query';
        this.sharedService.CreateSimpleNotification(errorMsg, 'error', 5000);
        console.error('Delete failed:', query.LatestResult);
      }
    } catch (error) {
      console.error('Error deleting query:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error deleting query';
      this.sharedService.CreateSimpleNotification(errorMessage, 'error', 5000);
    }
  }

  async createNewQuery(): Promise<void> {
    // Navigate to the query form with an empty primary key for new record
    // Using empty string as the third parameter to match MJ's convention
    const queryParams: any = { 
      Entity: 'Queries'
    };
    
    // Include category context if we're in category view
    // This can be used to pre-populate the CategoryID field
    if (this.viewMode === 'category' && this.currentCategoryId) {
      // Pass initial field values in query params
      queryParams.NewRecordValues = `CategoryID|${this.currentCategoryId}`;
    }
    
    // Navigate with empty string as third param for new record
    this.router.navigate(
      ['resource', 'record', ''], // Empty string indicates new record
      { queryParams }
    );
  }

  getCategoryName(categoryId: string | null): string {
    if (!categoryId) return '';
    const category = this.allCategories.find(c => c.ID === categoryId);
    return category?.Name || '';
  }

  formatDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    
    // Format as MM/DD/YYYY HH:MM
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getQueryPreview(sql: string | null | undefined): string {
    if (!sql) return 'No SQL query defined';
    
    // Get first 3 lines or 150 characters, whichever is shorter
    const lines = sql.split('\n').slice(0, 3);
    let preview = lines.join('\n');
    
    if (preview.length > 150) {
      preview = preview.substring(0, 150) + '...';
    } else if (sql.length > preview.length) {
      preview += '\n...';
    }
    
    return preview;
  }
}