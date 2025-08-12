import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { 
  ComponentEntity, 
  ComponentRegistryEntity, 
  ComponentLibraryEntity,
  ComponentDependencyEntity,
  ComponentLibraryLinkEntity 
} from '@memberjunction/core-entities';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

interface ComponentStudioState {
  activeTab: string;
  selectedComponentId: string | null;
  filterState: ComponentFilterState;
  searchQuery: string;
  viewMode: 'grid' | 'list';
  previewState: ComponentPreviewState;
}

interface ComponentFilterState {
  types: string[];
  statuses: string[];
  sources: string[];
  namespaces: string[];
}

interface ComponentPreviewState {
  componentId: string | null;
  isLoading: boolean;
  error: string | null;
  testData: any;
}

interface ComponentWithMetadata extends ComponentEntity {
  dependencies?: ComponentDependencyEntity[];
  libraries?: ComponentLibraryEntity[];
  registry?: ComponentRegistryEntity;
}

@Component({
  selector: 'mj-component-studio-dashboard',
  templateUrl: './component-studio-dashboard.component.html',
  styleUrls: ['./component-studio-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'ComponentStudioDashboard')
export class ComponentStudioDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  
  // State management
  public isLoading = false;
  public activeTab = 'browse'; // Default tab
  public viewMode: 'grid' | 'list' = 'grid';
  public selectedComponentId: string | null = null;
  public showFilterPanel = true;
  public showPreviewPanel = false;
  
  // Data
  public components$ = new BehaviorSubject<ComponentWithMetadata[]>([]);
  public filteredComponents$ = new BehaviorSubject<ComponentWithMetadata[]>([]);
  public registries$ = new BehaviorSubject<ComponentRegistryEntity[]>([]);
  public libraries$ = new BehaviorSubject<ComponentLibraryEntity[]>([]);
  
  // Filters
  public searchQuery$ = new BehaviorSubject<string>('');
  public selectedTypes$ = new BehaviorSubject<Set<string>>(new Set());
  public selectedStatuses$ = new BehaviorSubject<Set<string>>(new Set(['Published'])); // Default to published
  public selectedSources$ = new BehaviorSubject<Set<string>>(new Set());
  public selectedNamespaces$ = new BehaviorSubject<Set<string>>(new Set());
  
  // Component types for filtering
  public componentTypes = ['Report', 'Dashboard', 'Form', 'Table', 'Chart', 'Navigation', 'Search', 'Widget', 'Utility', 'Other'];
  public componentStatuses = ['Draft', 'Published', 'Deprecated'];
  
  // Preview
  public selectedComponent: ComponentWithMetadata | null = null;
  public componentSpec: ComponentSpec | null = null;
  public previewError: string | null = null;
  
  // Navigation items for bottom navigation
  public navigationItems: string[] = ['browse', 'preview', 'dependencies', 'settings'];
  
  public navigationConfig = [
    { text: 'Browse', icon: 'fa-solid fa-th', selected: true },
    { text: 'Preview', icon: 'fa-solid fa-eye', selected: false },
    { text: 'Dependencies', icon: 'fa-solid fa-sitemap', selected: false },
    { text: 'Settings', icon: 'fa-solid fa-cog', selected: false }
  ];

  private destroy$ = new Subject<void>();
  private stateChangeSubject = new Subject<ComponentStudioState>();

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit(): void {
    this.initDashboard();
    this.loadData();
    this.emitStateChange();
    this.updateNavigationSelection();
    
    // Force change detection
    this.cdr.detectChanges();
  }

  protected initDashboard(): void {
    // Initialize dashboard - called once when dashboard is created
    this.setupStateManagement();
    this.setupFilterSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stateChangeSubject.complete();
  }

  protected async loadData(): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    
    try {
      const rv = new RunView();
      
      // Load all data in parallel using RunViews
      const [componentsResult, registriesResult, librariesResult] = await rv.RunViews([
        {
          EntityName: 'Components',
          ExtraFilter: '',
          OrderBy: 'Name',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Component Registries',
          ExtraFilter: '',
          OrderBy: 'Name',
          MaxRows: 100,
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Component Libraries',
          ExtraFilter: '',
          OrderBy: 'Name',
          MaxRows: 500,
          ResultType: 'entity_object'
        }
      ]);

      if (componentsResult.Success) {
        const components = componentsResult.Results as ComponentEntity[];
        
        // Load dependencies for each component if needed
        // For now, just set the basic data
        this.components$.next(components as ComponentWithMetadata[]);
        this.applyFilters();
      }

      if (registriesResult.Success) {
        this.registries$.next(registriesResult.Results as ComponentRegistryEntity[]);
      }

      if (librariesResult.Success) {
        this.libraries$.next(librariesResult.Results as ComponentLibraryEntity[]);
      }

    } catch (error) {
      console.error('Failed to load component data:', error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private setupFilterSubscriptions(): void {
    // Combine all filter observables and apply filters when any change
    combineLatest([
      this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()),
      this.selectedTypes$,
      this.selectedStatuses$,
      this.selectedSources$,
      this.selectedNamespaces$,
      this.components$
    ])
    .pipe(takeUntil(this.destroy$))
    .subscribe(([search, types, statuses, sources, namespaces, components]) => {
      this.applyFiltersWithCriteria(search, types, statuses, sources, namespaces, components);
    });
  }

  private applyFilters(): void {
    const search = this.searchQuery$.value;
    const types = this.selectedTypes$.value;
    const statuses = this.selectedStatuses$.value;
    const sources = this.selectedSources$.value;
    const namespaces = this.selectedNamespaces$.value;
    const components = this.components$.value;
    
    this.applyFiltersWithCriteria(search, types, statuses, sources, namespaces, components);
  }

  private applyFiltersWithCriteria(
    search: string,
    types: Set<string>,
    statuses: Set<string>,
    sources: Set<string>,
    namespaces: Set<string>,
    components: ComponentWithMetadata[]
  ): void {
    let filtered = [...components];
    
    // Search filter
    if (search) {
      const query = search.toLowerCase();
      filtered = filtered.filter(c => 
        c.Name?.toLowerCase().includes(query) ||
        c.Description?.toLowerCase().includes(query) ||
        c.Namespace?.toLowerCase().includes(query) ||
        c.DeveloperName?.toLowerCase().includes(query) ||
        c.DeveloperOrganization?.toLowerCase().includes(query)
      );
    }
    
    // Type filter
    if (types.size > 0) {
      filtered = filtered.filter(c => c.Type && types.has(c.Type));
    }
    
    // Status filter
    if (statuses.size > 0) {
      filtered = filtered.filter(c => c.Status && statuses.has(c.Status));
    }
    
    // Source filter (Local vs Registry)
    if (sources.size > 0) {
      filtered = filtered.filter(c => {
        const isLocal = !c.SourceRegistryID;
        return (sources.has('Local') && isLocal) || (sources.has('Registry') && !isLocal);
      });
    }
    
    // Namespace filter
    if (namespaces.size > 0) {
      filtered = filtered.filter(c => {
        if (!c.Namespace) return false;
        // Check if namespace starts with any selected namespace
        return Array.from(namespaces).some(ns => c.Namespace?.startsWith(ns));
      });
    }
    
    this.filteredComponents$.next(filtered);
    this.cdr.markForCheck();
  }

  public onTabChange(tabId: string): void {
    this.activeTab = tabId;
    this.updateNavigationSelection();
    
    // Trigger resize for rendering issues
    setTimeout(() => {
      SharedService.Instance.InvokeManualResize();
    }, 100);
    
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public onNavigationChange(event: any): void {
    const index = event.index;
    if (index >= 0 && index < this.navigationItems.length) {
      this.activeTab = this.navigationItems[index];
      this.updateNavigationSelection();
      this.emitStateChange();
      
      setTimeout(() => {
        SharedService.Instance.InvokeManualResize();
      }, 100);
      
      this.cdr.markForCheck();
    }
  }

  private updateNavigationSelection(): void {
    this.navigationConfig.forEach((item, index) => {
      item.selected = this.navigationItems[index] === this.activeTab;
    });
  }

  public toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public toggleFilterPanel(): void {
    this.showFilterPanel = !this.showFilterPanel;
    this.cdr.markForCheck();
  }

  public async selectComponent(component: ComponentWithMetadata | null): Promise<void> {
    if (!component) return;
    
    this.selectedComponent = component;
    this.selectedComponentId = component.ID;
    
    // Load component details if in preview mode
    if (this.activeTab === 'preview') {
      await this.loadComponentDetails(component);
    }
    
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  private async loadComponentDetails(component: ComponentWithMetadata): Promise<void> {
    try {
      // TODO: Load component spec from storage
      // For now, we'll need to implement storage of ComponentSpec
      this.componentSpec = null;
      this.previewError = null;
    } catch (error) {
      this.previewError = 'Failed to load component details';
      console.error('Error loading component details:', error);
    }
  }

  public onSearchChange(query: string): void {
    this.searchQuery$.next(query);
  }

  public onTypeFilterChange(type: string, checked: boolean): void {
    const types = new Set(this.selectedTypes$.value);
    if (checked) {
      types.add(type);
    } else {
      types.delete(type);
    }
    this.selectedTypes$.next(types);
  }

  public onStatusFilterChange(status: string, checked: boolean): void {
    const statuses = new Set(this.selectedStatuses$.value);
    if (checked) {
      statuses.add(status);
    } else {
      statuses.delete(status);
    }
    this.selectedStatuses$.next(statuses);
  }

  public onSourceFilterChange(source: string, checked: boolean): void {
    const sources = new Set(this.selectedSources$.value);
    if (checked) {
      sources.add(source);
    } else {
      sources.delete(source);
    }
    this.selectedSources$.next(sources);
  }

  public clearFilters(): void {
    this.searchQuery$.next('');
    this.selectedTypes$.next(new Set());
    this.selectedStatuses$.next(new Set(['Published']));
    this.selectedSources$.next(new Set());
    this.selectedNamespaces$.next(new Set());
  }

  public onOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entityName,
      RecordPKey: event.key
    });
  }

  public async refreshData(): Promise<void> {
    await this.loadData();
  }

  private setupStateManagement(): void {
    this.stateChangeSubject.pipe(
      debounceTime(50),
      takeUntil(this.destroy$)
    ).subscribe(state => {
      this.UserStateChanged.emit(state);
    });
  }

  private emitStateChange(): void {
    const state: ComponentStudioState = {
      activeTab: this.activeTab,
      selectedComponentId: this.selectedComponentId,
      filterState: {
        types: Array.from(this.selectedTypes$.value),
        statuses: Array.from(this.selectedStatuses$.value),
        sources: Array.from(this.selectedSources$.value),
        namespaces: Array.from(this.selectedNamespaces$.value)
      },
      searchQuery: this.searchQuery$.value,
      viewMode: this.viewMode,
      previewState: {
        componentId: this.selectedComponentId,
        isLoading: false,
        error: this.previewError,
        testData: null
      }
    };

    this.stateChangeSubject.next(state);
  }

  // Helper methods for template
  public getComponentTypeColor(type: string): string {
    const colors: Record<string, string> = {
      'Report': '#3B82F6',     // Blue
      'Dashboard': '#8B5CF6',  // Purple
      'Form': '#10B981',       // Green
      'Chart': '#F97316',      // Orange
      'Table': '#06B6D4',      // Cyan
      'Widget': '#EC4899',     // Pink
      'Navigation': '#6366F1', // Indigo
      'Search': '#14B8A6',     // Teal
      'Utility': '#64748B',    // Slate
      'Other': '#9CA3AF'       // Gray
    };
    return colors[type] || colors['Other'];
  }

  public getStatusBadgeClass(status: string): string {
    const classes: Record<string, string> = {
      'Draft': 'badge-draft',
      'Published': 'badge-published',
      'Deprecated': 'badge-deprecated'
    };
    return classes[status] || 'badge-default';
  }
}

/**
 * Function to prevent tree shaking of the ComponentStudioDashboardComponent.
 * This is called in public-api.ts to ensure the component is included in the build.
 */
export function LoadComponentStudioDashboard() {
  // This function doesn't need to do anything, it just needs to exist
  // to create a reference to the component that prevents tree shaking
}