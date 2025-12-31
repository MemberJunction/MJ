import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { RunView, CompositeKey, Metadata } from '@memberjunction/core';
import {
  ComponentEntityExtended,
  ArtifactVersionEntity,
  ResourceData
} from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ReactComponentEvent, MJReactComponent } from '@memberjunction/ng-react';
import { SharedService } from '@memberjunction/ng-shared';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { TextImportDialogComponent } from './components/text-import-dialog.component';
import { ArtifactSelectionDialogComponent, ArtifactSelectionResult } from './components/artifact-selection-dialog.component';
import { ArtifactLoadDialogComponent, ArtifactLoadResult } from './components/artifact-load-dialog.component';
import { MJNotificationService } from '@memberjunction/ng-notifications';

// Interface for components loaded from files (not from database)
interface FileLoadedComponent {
  id: string; // Generated UUID for React key
  name: string;
  description?: string;
  specification: ComponentSpec;
  filename: string;
  loadedAt: Date;
  isFileLoaded: true; // Flag to differentiate from DB components
  type?: string;
  status?: string;
}

// Union type for both database and file-loaded components
type DisplayComponent = (ComponentEntityExtended & { isFileLoaded?: false }) | FileLoadedComponent;

// Modern category interface
interface Category {
  name: string;
  count: number;
  color: string;
  isActive?: boolean;
}

@Component({
  selector: 'mj-component-studio-dashboard',
  templateUrl: './component-studio-dashboard.component.html',
  styleUrls: ['./component-studio-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'ComponentStudioDashboard')
export class ComponentStudioDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  
  // Component data
  public components: ComponentEntityExtended[] = [];
  public fileLoadedComponents: FileLoadedComponent[] = []; // Components loaded from files
  public allComponents: DisplayComponent[] = []; // Combined list
  public filteredComponents: DisplayComponent[] = [];
  public selectedComponent: DisplayComponent | null = null;
  public expandedComponent: DisplayComponent | null = null; // Track which card is expanded
  public componentSpec: ComponentSpec | null = null;
  public isLoading = true; // Start as true to show loading state initially
  public searchQuery = '';
  public isRunning = false; // Track if component is currently running
  
  // View and filtering
  public selectedCategories: Set<string> = new Set();
  public availableCategories: { name: string; count: number; color: string }[] = [];
  public showAllCategories = false; // Show only top categories by default
  
  // Favorites
  public favoriteComponents: Set<string> = new Set(); // Set of component IDs
  public showOnlyFavorites = false; // Filter to show only favorites
  public showDeprecatedComponents = false; // Filter to show/hide deprecated components
  private metadata: Metadata = new Metadata();
  
  // Error handling
  public currentError: { type: string; message: string; technicalDetails?: any } | null = null;
  
  // Tab management
  public activeTab = 0; // 0 = Spec, 1 = Code
  
  // Splitter state
  public isDetailsPaneCollapsed = true; // Start with details collapsed
  
  // Editor content
  public editableSpec = ''; // JSON string for spec editor
  public editableCode = ''; // JavaScript code for code editor
  public codeSections: Array<{ title: string; code: string; expanded: boolean; isDependency?: boolean; index?: number }> = [];
  public isEditingSpec = false;
  public isEditingCode = false;
  private lastEditSource: 'spec' | 'code' | null = null;

  // File input element reference
  @ViewChild('fileInput', { static: false }) fileInput?: ElementRef<HTMLInputElement>;
  
  // Dropdown states
  public importDropdownOpen = false;
  public exportDropdownOpen = false;

  // Filter panel state
  public isFilterPanelExpanded = false;
  
  // Text import dialog reference
  private textImportDialog?: DialogRef;
  
  private destroy$ = new Subject<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private dialogService: DialogService,
    private notificationService: MJNotificationService
  ) {
    super();
  }


  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Component Studio"
  }

  async ngAfterViewInit() {
    this.initDashboard();
    await this.loadData();
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected initDashboard(): void {
    // Initialize dashboard
  }

  protected async loadData(): Promise<void> {
    this.isLoading = true;

    try {
      const rv = new RunView();
      const result = await rv.RunView<ComponentEntityExtended>({
        EntityName: 'MJ: Components',
        ExtraFilter: 'HasRequiredCustomProps = 0', // Only load components without required custom props
        OrderBy: 'Name',
        MaxRows: 1000,
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.components = result.Results || [];

        // Display components immediately - don't wait for favorites
        this.combineAndFilterComponents();
        this.isLoading = false;

        // Load favorites in background (non-blocking)
        this.loadFavorites();
      } else {
        console.error('Failed to load components:', result.ErrorMessage);
        this.isLoading = false;
      }
    } catch (error) {
      console.error('Error loading components:', error);
      this.isLoading = false;
    }
  }

  /**
   * Load favorite status for all components in parallel
   */
  private async loadFavorites(): Promise<void> {
    const md = new Metadata();
    const currentUserId = md.CurrentUser?.ID;
    if (!currentUserId) return;

    this.favoriteComponents.clear();

    // Load all favorite statuses in parallel for better performance
    const favoritePromises = this.components.map(component =>
      this.metadata.GetRecordFavoriteStatus(
        currentUserId,
        'MJ: Components',
        CompositeKey.FromID(component.ID)
      )
        .then(isFavorite => ({ componentId: component.ID, isFavorite }))
        .catch(error => {
          console.error(`Error loading favorite status for component ${component.ID}:`, error);
          return { componentId: component.ID, isFavorite: false };
        })
    );

    // Wait for all favorites to load
    const results = await Promise.all(favoritePromises);

    // Update the favorites set
    for (const result of results) {
      if (result.isFavorite) {
        this.favoriteComponents.add(result.componentId);
      }
    }

    // Trigger change detection to update favorite icons in UI
    this.cdr.detectChanges();
  }

  /**
   * Toggle favorite status for a component
   */
  public async toggleFavorite(component: DisplayComponent, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation(); // Prevent card expansion
    }
    const md = new Metadata();
    const currentUserId = md.CurrentUser?.ID;
    if (!currentUserId) return;
    
    // File-loaded components can't be favorited
    if (this.isFileLoadedComponent(component)) {
      return;
    }
    
    const componentId = this.getComponentId(component);
    const isFavorite = this.favoriteComponents.has(componentId);
    
    try {
      await this.metadata.SetRecordFavoriteStatus(
        currentUserId,
        'MJ: Components',
        CompositeKey.FromID(componentId),
        !isFavorite
      );
      
      // Update local state
      if (isFavorite) {
        this.favoriteComponents.delete(componentId);
      } else {
        this.favoriteComponents.add(componentId);
      }
      
      // Trigger change detection
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error toggling favorite status:', error);
    }
  }

  /**
   * Check if component is favorited
   */
  public isFavorite(component: DisplayComponent): boolean {
    if (this.isFileLoadedComponent(component)) {
      return false;
    }
    return this.favoriteComponents.has(this.getComponentId(component));
  }

  /**
   * Toggle showing only favorites
   */
  public toggleShowOnlyFavorites(): void {
    this.showOnlyFavorites = !this.showOnlyFavorites;
    this.combineAndFilterComponents();
  }

  /**
   * Toggle showing deprecated components
   */
  public toggleShowDeprecatedComponents(): void {
    this.showDeprecatedComponents = !this.showDeprecatedComponents;
    this.combineAndFilterComponents();
  }

  /**
   * Get count of deprecated components
   */
  public getDeprecatedCount(): number {
    return this.allComponents.filter(c =>
      this.getComponentStatus(c) === 'Deprecated'
    ).length;
  }

  /**
   * Toggle filter panel expanded/collapsed
   */
  public ToggleFilterPanel(): void {
    this.isFilterPanelExpanded = !this.isFilterPanelExpanded;
  }

  /**
   * Get count of active filters
   */
  public GetActiveFilterCount(): number {
    let count = 0;
    if (this.showOnlyFavorites) count++;
    if (this.showDeprecatedComponents) count++;
    count += this.selectedCategories.size;
    return count;
  }

  /**
   * Clear all filters
   */
  public ClearAllFilters(): void {
    this.clearCategoryFilters();
    this.showOnlyFavorites = false;
    this.showDeprecatedComponents = false;
    this.combineAndFilterComponents();
  }

  public onSearchChange(query: string): void {
    this.searchQuery = query;
    this.combineAndFilterComponents();
  }

  private combineAndFilterComponents(): void {
    // Combine database components with file-loaded components
    this.allComponents = [
      ...this.fileLoadedComponents,
      ...this.components
    ] as DisplayComponent[];

    // Build available categories from all components
    this.buildCategories();

    // Apply filters
    let filtered = [...this.allComponents];

    // Filter out deprecated components unless explicitly shown
    if (!this.showDeprecatedComponents) {
      filtered = filtered.filter(c => {
        const status = this.getComponentStatus(c);
        return status !== 'Deprecated';
      });
    }

    // Apply favorites filter if enabled
    if (this.showOnlyFavorites) {
      filtered = filtered.filter(c => this.isFavorite(c));
    }

    // Apply category filter
    if (this.selectedCategories.size > 0) {
      filtered = filtered.filter(c => {
        const namespace = this.getComponentNamespace(c) || 'Uncategorized';
        const category = this.extractCategoryFromNamespace(namespace);
        return this.selectedCategories.has(category);
      });
    }

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const name = this.getComponentName(c)?.toLowerCase() || '';
        const description = this.getComponentDescription(c)?.toLowerCase() || '';
        const type = this.getComponentType(c)?.toLowerCase() || '';
        const namespace = this.getComponentNamespace(c)?.toLowerCase() || '';
        return name.includes(query) || description.includes(query) || type.includes(query) || namespace.includes(query);
      });
    }

    this.filteredComponents = filtered;
  }

  /**
   * Build categories from components
   */
  private buildCategories(): void {
    const categoryMap = new Map<string, number>();
    const allNamespaces = new Set<string>();
    
    // Count components per top-level category and track all namespaces
    for (const component of this.allComponents) {
      const namespace = this.getComponentNamespace(component) || 'Uncategorized';
      const category = this.extractCategoryFromNamespace(namespace);
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      
      // Track full namespace paths for better display
      if (namespace && namespace !== 'Uncategorized') {
        allNamespaces.add(namespace);
      }
    }

    // Convert to array and sort by count
    this.availableCategories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        color: this.getCategoryColor(name)
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Extract main category from namespace
   */
  private extractCategoryFromNamespace(namespace: string): string {
    if (!namespace || namespace === 'Uncategorized') return 'Uncategorized';
    
    // Get the first part of the namespace path
    const parts = namespace.split('/').filter(p => p.length > 0);
    return parts[0] || 'Uncategorized';
  }

  /**
   * Get color for category
   */
  private getCategoryColor(category: string): string {
    const colors = [
      '#3B82F6', // blue
      '#8B5CF6', // purple
      '#10B981', // green
      '#F97316', // orange
      '#06B6D4', // cyan
      '#EC4899', // pink
      '#6366F1', // indigo
      '#14B8A6', // teal
      '#EAB308', // yellow
      '#EF4444', // red
    ];
    
    // Use hash of category name to get consistent color
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      hash = category.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get color for a full namespace path
   */
  public getNamespaceColor(namespace: string | undefined): string {
    if (!namespace || namespace === 'Uncategorized') {
      return '#6C757D'; // Gray for uncategorized
    }
    
    // Extract the main category (first part) for consistent coloring
    const category = this.extractCategoryFromNamespace(namespace);
    return this.getCategoryColor(category);
  }

  /**
   * Format namespace for display (handle long paths)
   */
  public formatNamespace(namespace: string | undefined): string {
    if (!namespace || namespace === 'Uncategorized') {
      return 'Uncategorized';
    }
    
    const parts = namespace.split('/').filter(p => p.length > 0);
    
    // If it's really long, show abbreviated version
    if (parts.length > 3) {
      return `${parts[0]} / ... / ${parts[parts.length - 1]}`;
    }
    
    // Otherwise show full path with spacing
    return parts.join(' / ');
  }

  /**
   * Toggle category filter
   */
  public toggleCategory(category: string): void {
    if (this.selectedCategories.has(category)) {
      this.selectedCategories.delete(category);
    } else {
      this.selectedCategories.add(category);
    }
    this.combineAndFilterComponents();
  }

  /**
   * Clear all category filters
   */
  public clearCategoryFilters(): void {
    this.selectedCategories.clear();
    this.combineAndFilterComponents();
  }

  /**
   * Check if category is selected
   */
  public isCategorySelected(category: string): boolean {
    return this.selectedCategories.has(category);
  }

  /**
   * Get visible categories (top 5 or all)
   */
  public getVisibleCategories(): Category[] {
    return this.showAllCategories ? this.availableCategories : this.availableCategories.slice(0, 5);
  }

  /**
   * Toggle showing all categories
   */
  public toggleShowAllCategories(): void {
    this.showAllCategories = !this.showAllCategories;
  }

  /**
   * Get component namespace
   */
  public getComponentNamespace(component: DisplayComponent): string | undefined {
    if (component.isFileLoaded) {
      // File-loaded components might not have namespace
      return (component as FileLoadedComponent).specification.namespace;
    } else {
      return (component as ComponentEntityExtended).Namespace || undefined;
    }
  }

  // Helper methods to get properties from union type
  public getComponentName(component: DisplayComponent): string {
    return component.isFileLoaded ? component.name : component.Name;
  }

  public getComponentDescription(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.description : (component.Description || undefined);
  }

  public getComponentType(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.type : (component.Type || undefined);
  }

  public getComponentStatus(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.status : (component.Status || undefined);
  }

  public getComponentVersion(component: DisplayComponent): string {
    return component.isFileLoaded ? '1.0.0' : (component.Version || '1.0.0');
  }

  public getComponentSpec(component: DisplayComponent): ComponentSpec {
    return component.isFileLoaded ? component.specification : JSON.parse(component.Specification);
  }

  public getComponentId(component: DisplayComponent): string {
    return component.isFileLoaded ? component.id : component.ID;
  }

  public isFileLoadedComponent(component: DisplayComponent): boolean {
    return component.isFileLoaded === true;
  }

  public getComponentFilename(component: DisplayComponent): string | undefined {
    return component.isFileLoaded ? component.filename : undefined;
  }

  public getComponentLoadedAt(component: DisplayComponent): Date | undefined {
    return component.isFileLoaded ? component.loadedAt : undefined;
  }

  public getComponentUpdatedAt(component: DisplayComponent): Date | undefined {
    return !component.isFileLoaded && component.__mj_UpdatedAt ? component.__mj_UpdatedAt : undefined;
  }

  public toggleComponentExpansion(component: DisplayComponent): void {
    // Toggle expansion - if clicking the same component, collapse it
    const componentId = this.getComponentId(component);
    const expandedId = this.expandedComponent ? this.getComponentId(this.expandedComponent) : null;
    
    if (expandedId === componentId) {
      this.expandedComponent = null;
    } else {
      this.expandedComponent = component;
    }
    this.cdr.detectChanges();
  }

  public runComponent(component: DisplayComponent): void {
    // If another component is running, stop it first then start the new one
    const componentId = this.getComponentId(component);
    const selectedId = this.selectedComponent ? this.getComponentId(this.selectedComponent) : null;
    
    if (this.isRunning && selectedId !== componentId) {
      this.stopComponent();
      this.startComponent(component);
    } 
    else {
      this.startComponent(component);
    }
  }

  private startComponent(component: DisplayComponent): void {
    // Clear registries BEFORE starting new component for fresh load
    if (!this.isRunning) {
      // Only clear if not already running (switching components handles this in stopComponent)
      MJReactComponent.forceClearRegistries();
    }
    
    this.selectedComponent = component;
    this.componentSpec = this.getComponentSpec(component);
    this.isRunning = true;
    this.currentError = null; // Clear any previous errors
    this.isDetailsPaneCollapsed = true; // Start with details collapsed
    this.initializeEditors(); // Initialize spec and code editors
    console.log('Running component (fresh):', this.getComponentName(component));
    try {
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error with cdr.detectChanges():', error);
    }
  }

  public stopComponent(): void {
    this.isRunning = false;
    this.selectedComponent = null;
    this.componentSpec = null;
    this.currentError = null;
    
    // CLEAR ALL REGISTRIES for fresh component loads
    MJReactComponent.forceClearRegistries();
    console.log('Component Studio: Cleared all registries for fresh component testing');
    
    try {
      this.cdr.detectChanges();
    }
    catch (error) {
      console.error('Error with cdr.detectChanges():', error);
    }
  }

  /**
   * Handle component events from React components
   */
  public onComponentEvent(event: ReactComponentEvent): void {
    if (event.type === 'error') {
      this.currentError = {
        type: event.payload?.source || 'Component Error',
        message: event.payload?.error || 'An error occurred while rendering the component',
        technicalDetails: event.payload?.errorInfo || event.payload
      };
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle open entity record event from React components
   */
  public onOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
    // Use SharedService to open the entity record in a new window/tab
    SharedService.Instance.OpenEntityRecord(event.entityName, event.key);
  }

  /**
   * Retry running the current component
   */
  public retryComponent(): void {
    if (this.selectedComponent) {
      this.currentError = null;
      this.isRunning = false;
      this.cdr.detectChanges();
      // Small delay to reset the component
      setTimeout(() => {
        this.runComponent(this.selectedComponent!);
      }, 100);
    }
  }

  /**
   * Copy error details to clipboard
   */
  public async copyErrorToClipboard(): Promise<void> {
    if (!this.currentError) return;
    
    const errorText = `
Component Error Report
${'='.repeat(50)}
Component: ${this.selectedComponent ? this.getComponentName(this.selectedComponent) : 'Unknown'}
Error Type: ${this.currentError.type}
Message: ${this.currentError.message}
${this.currentError.technicalDetails ? '\nTechnical Details:\n' + JSON.stringify(this.currentError.technicalDetails, null, 2) : ''}
`;
    
    try {
      await navigator.clipboard.writeText(errorText);
      console.log('Error details copied to clipboard');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  /**
   * Format technical details for display
   */
  public formatTechnicalDetails(details: any): string {
    if (typeof details === 'string') {
      return details;
    }
    return JSON.stringify(details, null, 2);
  }

  public async refreshData(): Promise<void> {
    await this.loadData();
  }

  // Import handling methods
  public toggleImportDropdown(): void {
    this.importDropdownOpen = !this.importDropdownOpen;
    // Close export dropdown if open
    if (this.importDropdownOpen) {
      this.exportDropdownOpen = false;
    }
  }

  public toggleExportDropdown(): void {
    this.exportDropdownOpen = !this.exportDropdownOpen;
    // Close import dropdown if open
    if (this.exportDropdownOpen) {
      this.importDropdownOpen = false;
    }
  }
  
  public closeImportDropdown(): void {
    this.importDropdownOpen = false;
  }
  
  @HostListener('document:click', ['$event'])
  public onDocumentClick(event: MouseEvent): void {
    // Close dropdowns if clicking outside
    const target = event.target as HTMLElement;
    
    // Check import dropdown
    const importDropdown = target.closest('.import-dropdown');
    if (!importDropdown && this.importDropdownOpen) {
      this.importDropdownOpen = false;
    }
    
    // Check export dropdown
    const exportDropdown = target.closest('.export-dropdown');
    if (!exportDropdown && this.exportDropdownOpen) {
      this.exportDropdownOpen = false;
    }
  }
  
  public importFromFile(): void {
    this.closeImportDropdown();
    this.fileInput?.nativeElement.click();
  }
  
  public importFromText(): void {
    this.closeImportDropdown();
    this.openTextImportDialog();
  }

  public async importFromArtifact(): Promise<void> {
    this.closeImportDropdown();

    // Small delay to ensure dropdown is closed before opening dialog
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const dialogRef = this.dialogService.open({
        content: ArtifactLoadDialogComponent,
        width: 1200,
        height: 700
      });

      const result = await dialogRef.result.toPromise() as ArtifactLoadResult | undefined;

      if (!result) {
        // User cancelled
        return;
      }

      // Create file-loaded component from artifact
      const artifactComponent: FileLoadedComponent = {
        id: this.generateId(),
        name: result.spec.name,
        description: result.spec.description,
        specification: result.spec,
        filename: `${result.artifactName} (v${result.versionNumber})`,
        loadedAt: new Date(),
        isFileLoaded: true,
        type: result.spec.type || 'Component',
        status: 'Artifact'
      };

      // Store source reference for potential re-save
      (artifactComponent as any).sourceArtifactID = result.artifactID;
      (artifactComponent as any).sourceVersionID = result.versionID;

      // Add to list
      this.fileLoadedComponents.push(artifactComponent);
      this.combineAndFilterComponents();

      // Auto-select and run
      this.expandedComponent = artifactComponent;
      this.runComponent(artifactComponent);

      console.log(`✅ Loaded component "${result.spec.name}" from artifact version ${result.versionNumber}`);

      this.notificationService.CreateSimpleNotification(
        `Loaded component "${result.spec.name}" from artifact`,
        'success',
        3000
      );

    } catch (error) {
      // Only show error if it's actually an error (not a cancel)
      console.error('Error loading from artifact:', error);

      // Check if this is a real error or just a dialog dismissal
      if (error && error !== 'cancel' && error !== undefined) {
        this.notificationService.CreateSimpleNotification(
          'Failed to load component from artifact',
          'error'
        );
      }
    }
  }
  
  private openTextImportDialog(): void {
    this.textImportDialog = this.dialogService.open({
      content: TextImportDialogComponent,
      width: 700,
      height: 600,
      minWidth: 500,
      title: '',  // Title is in the component
      actions: []  // Actions are in the component
    });
    
    // Handle the import event from the dialog component
    const dialogComponentRef = this.textImportDialog.content.instance as TextImportDialogComponent;
    
    // Subscribe to import event
    dialogComponentRef.importSpec.subscribe((spec: ComponentSpec) => {
      this.handleTextImport(spec);
      this.textImportDialog?.close();
    });
    
    // Subscribe to cancel event
    dialogComponentRef.cancelDialog.subscribe(() => {
      this.textImportDialog?.close();
    });
  }
  
  private async handleTextImport(spec: ComponentSpec): Promise<void> {
    // Create a file-loaded component (reusing the same structure)
    const textComponent: FileLoadedComponent = {
      id: this.generateId(),
      name: spec.name,
      description: spec.description,
      specification: spec,
      filename: 'text-import.json',
      loadedAt: new Date(),
      isFileLoaded: true,
      type: spec.type || 'Component',
      status: 'Text'
    };
    
    // Add to the list and refresh
    this.fileLoadedComponents.push(textComponent);
    this.combineAndFilterComponents();
    
    console.log(`Loaded component "${spec.name}" from text input`);
    
    // Automatically select and run the newly loaded component
    this.expandedComponent = textComponent;
    this.runComponent(textComponent);
  }

  public async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    // Only accept JSON files
    if (!file.name.endsWith('.json')) {
      console.error('Please select a JSON file');
      // Could add a toast notification here
      return;
    }
    
    try {
      const fileContent = await this.readFile(file);
      const spec = JSON.parse(fileContent) as ComponentSpec;
      
      // Validate the spec has required fields
      if (!spec.name || !spec.code) {
        console.error('Invalid component specification: missing required fields (name, code)');
        return;
      }
      
      // Create a file-loaded component
      const fileComponent: FileLoadedComponent = {
        id: this.generateId(),
        name: spec.name,
        description: spec.description,
        specification: spec,
        filename: file.name,
        loadedAt: new Date(),
        isFileLoaded: true,
        type: spec.type || 'Component',
        status: 'File'
      };
      
      // Add to the list and refresh
      this.fileLoadedComponents.push(fileComponent);
      this.combineAndFilterComponents();
      
      console.log(`Loaded component "${spec.name}" from ${file.name}`);
      
      // Automatically select and run the newly loaded component
      this.expandedComponent = fileComponent;
      this.runComponent(fileComponent);
      
      // Clear the input for future uploads
      input.value = '';
      
    } catch (error) {
      console.error('Error loading component file:', error);
    }
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private generateId(): string {
    return 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  public removeFileComponent(component: FileLoadedComponent): void {
    const index = this.fileLoadedComponents.indexOf(component);
    if (index > -1) {
      this.fileLoadedComponents.splice(index, 1);
      
      // If this was the selected component, clear it
      if (this.selectedComponent === component) {
        this.stopComponent();
      }
      
      // If this was the expanded component, clear it
      if (this.expandedComponent === component) {
        this.expandedComponent = null;
      }
      
      this.combineAndFilterComponents();
    }
  }

  public getComponentTypeIcon(type: string | null | undefined): string {
    const icons: Record<string, string> = {
      'Report': 'fa-file-alt',
      'Dashboard': 'fa-tachometer-alt',
      'Form': 'fa-edit',
      'Chart': 'fa-chart-bar',
      'Table': 'fa-table',
      'Widget': 'fa-cube',
      'Navigation': 'fa-compass',
      'Search': 'fa-search',
      'Utility': 'fa-cog'
    };
    return icons[type || ''] || 'fa-puzzle-piece';
  }

  public getComponentTypeColor(type: string | null | undefined): string {
    const colors: Record<string, string> = {
      'Report': '#3B82F6',
      'Dashboard': '#8B5CF6',
      'Form': '#10B981',
      'Chart': '#F97316',
      'Table': '#06B6D4',
      'Widget': '#EC4899',
      'Navigation': '#6366F1',
      'Search': '#14B8A6',
      'Utility': '#64748B'
    };
    return colors[type || ''] || '#9CA3AF';
  }

  /**
   * Initialize the spec and code editors when a component is selected
   */
  public initializeEditors(): void {
    if (this.selectedComponent) {
      const spec = this.getComponentSpec(this.selectedComponent);
      
      // Deep parse the spec for better readability
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      const parsed = ParseJSONRecursive(spec, parseOptions);
      this.editableSpec = JSON.stringify(parsed, null, 2);
      
      // Extract code from spec
      this.editableCode = spec.code || '// No code available';
      
      // Build code sections array
      this.buildCodeSections();
      
      // Reset editing flags
      this.isEditingSpec = false;
      this.isEditingCode = false;
      this.lastEditSource = null;
    }
  }

  /**
   * Handle spec editor changes
   */
  public onSpecChange(newSpec: string): void {
    this.editableSpec = newSpec;
    this.isEditingSpec = true;
    this.lastEditSource = 'spec';
  }

  /**
   * Handle code editor changes
   */
  public onCodeChange(newCode: string): void {
    this.editableCode = newCode;
    this.isEditingCode = true;
    this.lastEditSource = 'code';
  }

  /**
   * Apply spec changes and update the code tab
   */
  public applySpecChanges(): void {
    try {
      const parsed = JSON.parse(this.editableSpec);
      
      // Update the component spec
      if (this.selectedComponent) {
        if (this.isFileLoadedComponent(this.selectedComponent)) {
          // Update file-loaded component
          (this.selectedComponent as FileLoadedComponent).specification = parsed;
        } else {
          // Update database component's Specification field in memory only
          (this.selectedComponent as ComponentEntityExtended).Specification = JSON.stringify(parsed);
        }
        
        // Update the runtime spec
        this.componentSpec = parsed;
        
        // Update the code editor with new code from spec
        this.editableCode = parsed.code || '// No code available';
        
        // Rebuild code sections from updated spec
        this.buildCodeSections();
        
        // Clear registries to ensure fresh component load
        MJReactComponent.forceClearRegistries();
        console.log('Cleared registries after applying spec changes');
        
        // If component is running, update it without full refresh
        if (this.isRunning) {
          this.updateRunningComponent();
        }
        
        this.isEditingSpec = false;
      }
    } catch (error) {
      console.error('Invalid JSON in spec editor:', error);
      // Could show a toast notification here
    }
  }

  /**
   * Apply code changes and update the spec
   */
  public applyCodeChanges(): void {
    if (this.selectedComponent) {
      try {
        // Parse the current spec
        const spec = JSON.parse(this.editableSpec);
        
        // Update main code and dependencies from code sections
        if (this.codeSections.length > 0) {
          // First section is always the main component
          spec.code = this.codeSections[0].code;
          
          // Update dependencies if any
          if (this.codeSections.length > 1 && spec.dependencies) {
            for (let i = 1; i < this.codeSections.length; i++) {
              const section = this.codeSections[i];
              if (section.index !== undefined && spec.dependencies[section.index]) {
                spec.dependencies[section.index].code = section.code;
              }
            }
          }
        }
        
        // Update the spec editor
        const parseOptions: ParseJSONOptions = {
          extractInlineJson: true,
          maxDepth: 100,
          debug: false
        };
        const parsed = ParseJSONRecursive(spec, parseOptions);
        this.editableSpec = JSON.stringify(parsed, null, 2);
        
        // Update the component entity in memory
        if (this.isFileLoadedComponent(this.selectedComponent)) {
          (this.selectedComponent as FileLoadedComponent).specification = spec;
        } else {
          // Update database component's Specification field in memory only
          (this.selectedComponent as ComponentEntityExtended).Specification = JSON.stringify(spec);
        }
        
        // Update the runtime spec
        this.componentSpec = spec;
        
        // Clear registries to ensure fresh component load
        MJReactComponent.forceClearRegistries();
        console.log('Cleared registries after applying code changes');
        
        // If component is running, update it without full refresh
        if (this.isRunning) {
          this.updateRunningComponent();
        }
        
        this.isEditingCode = false;
      } catch (error) {
        console.error('Error applying code changes:', error);
      }
    }
  }

  /**
   * Refresh the running component with new spec/code (in-place update)
   */
  public refreshComponent(): void {
    if (this.selectedComponent && this.isRunning) {
      // Use the same in-place update logic as Apply Changes
      this.updateRunningComponent();
    }
  }

  /**
   * Update the running component without full refresh
   */
  private updateRunningComponent(): void {
    if (this.selectedComponent && this.isRunning) {
      // Get the updated spec
      const spec = this.getComponentSpec(this.selectedComponent);
      
      // Temporarily set to null to force React to re-render
      this.componentSpec = null;
      this.cdr.detectChanges();
      
      // Then set the new spec
      setTimeout(() => {
        this.componentSpec = spec;
        try {
          this.cdr.detectChanges();
        } catch (error) {
          console.error('Error with cdr.detectChanges():', error);
        }
      }, 10);
    }
  }

  /**
   * Build code sections array from spec
   */
  private buildCodeSections(): void {
    if (!this.selectedComponent) {
      this.codeSections = [];
      return;
    }
    
    const spec = this.getComponentSpec(this.selectedComponent);
    const sections = [];
    
    // Main component code
    sections.push({
      title: spec.name || 'Main Component',
      code: spec.code || '// No code available',
      expanded: true,
      isDependency: false
    });
    
    // Add dependent components if any
    if (spec.dependencies && Array.isArray(spec.dependencies)) {
      spec.dependencies.forEach((dep: ComponentSpec, index: number) => {
        sections.push({
          title: dep.name || `Dependency ${index + 1}`,
          code: dep.code || '// No code available',
          expanded: false,
          isDependency: true,
          index: index
        });
      });
    }
    
    this.codeSections = sections;
  }

  /**
   * Get component code sections for panel bar
   */
  public getComponentCodeSections(): any[] {
    return this.codeSections;
  }

  /**
   * Handle code section changes
   */
  public onCodeSectionChange(newCode: string, sectionIndex: number): void {
    if (this.codeSections[sectionIndex]) {
      this.codeSections[sectionIndex].code = newCode;
      this.isEditingCode = true;
      this.lastEditSource = 'code';
    }
  }

  /**
   * Toggle the details pane (spec/code editors)
   */
  public toggleDetailsPane(): void {
    this.isDetailsPaneCollapsed = !this.isDetailsPaneCollapsed;
    this.cdr.detectChanges();
  }

  /**
   * Handle tab selection
   */
  public onTabSelect(event: any): void {
    this.activeTab = event.index;
    
    // Initialize editors when switching to spec or code tabs
    // Both tabs now need initialization since there's no separate Run tab
    this.initializeEditors();
  }

  /**
   * Export the current component to an artifact
   */
  public async exportToArtifact(): Promise<void> {
    console.log('exportToArtifact called');
    
    if (!this.selectedComponent || !this.componentSpec) {
      console.error('No component selected or spec available');
      return;
    }

    console.log('Component and spec available, proceeding...');

    // Close the dropdown
    this.exportDropdownOpen = false;
    
    // Small delay to ensure dropdown is closed before opening dialog
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get the current spec - use edited version if available
    let currentSpec: ComponentSpec;
    
    // Check if user has made edits
    if (this.isEditingSpec || this.isEditingCode) {
      // Parse the edited spec to get the latest version
      try {
        currentSpec = JSON.parse(this.editableSpec);
      } catch (parseError) {
        console.error('Invalid JSON in spec editor, using original spec');
        currentSpec = this.componentSpec;
      }
    } else {
      currentSpec = this.componentSpec;
    }

    // Open the artifact selection dialog
    console.log('Opening artifact selection dialog...');
    
    let result: ArtifactSelectionResult | undefined;
    
    try {
      const dialogRef = this.dialogService.open({
        content: ArtifactSelectionDialogComponent,
        width: 1200, // Increased from 1000px by 200px
        height: 900 // Keep same height
      });

      console.log('Dialog opened, waiting for result...');
      result = await dialogRef.result.toPromise() as ArtifactSelectionResult | undefined;
      console.log('Dialog result:', result);
    } catch (error) {
      console.error('Error opening dialog:', error);
      return;
    }
    
    if (!result || !result.action) {
      console.log('User cancelled dialog');
      // User cancelled
      return;
    }

    try {
      const artifact = result.artifact;
      let version: ArtifactVersionEntity;

      if (result.action === 'update-version' && result.versionToUpdate) {
        // Update existing version
        version = result.versionToUpdate;
      } else {
        // Create new version
        version = await this.metadata.GetEntityObject<ArtifactVersionEntity>('MJ: Artifact Versions');
        version.ArtifactID = artifact.ID;
        version.UserID = this.metadata.CurrentUser.ID; // Required field

        // Get next version number
        const rv = new RunView();
        const versionsResult = await rv.RunView<ArtifactVersionEntity>({
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID = '${artifact.ID}'`,
          OrderBy: 'VersionNumber DESC',
          MaxRows: 1,
          ResultType: 'entity_object'
        });

        if (versionsResult.Success && versionsResult.Results && versionsResult.Results.length > 0) {
          version.VersionNumber = versionsResult.Results[0].VersionNumber + 1;
        } else {
          // This is the first version
          version.VersionNumber = 1;
        }
      }

      // Store the component spec in Content field
      version.Content = JSON.stringify(currentSpec, null, 2);

      // Generate SHA-256 hash for content
      version.ContentHash = await this.generateSHA256Hash(version.Content);

      // Set metadata
      version.Name = currentSpec.name;
      version.Description = currentSpec.description || null;

      // Add version comments
      const timestamp = new Date().toISOString();
      const actionText = result.action === 'update-version' ? 'Updated' : 'Created';
      version.Comments = `${actionText} from Component Studio at ${timestamp}`;

      const versionSaveResult = await version.Save();
      if (versionSaveResult) {
        const componentName = this.getComponentName(this.selectedComponent);
        console.log(`✅ Saved ${componentName} as artifact version ${version.VersionNumber}`);

        this.notificationService.CreateSimpleNotification(
          `Component saved as artifact version ${version.VersionNumber}`,
          'success',
          3000
        );
      }
      else {
        console.error('Failed to save artifact version - Full LatestResult:', version.LatestResult);
        this.notificationService.CreateSimpleNotification(
          'Failed to save artifact version',
          'error'
        );
      }

    } catch (error) {
      console.error('Error saving to artifact:', error);
      this.notificationService.CreateSimpleNotification(
        'Error saving component to artifact',
        'error'
      );
    }
  }

  /**
   * Generate SHA-256 hash for content
   */
  private async generateSHA256Hash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Export the current component to a file
   */
  public exportToFile(): void {
    if (!this.selectedComponent || !this.componentSpec) {
      console.error('No component selected or spec available');
      return;
    }

    // Close the dropdown
    this.exportDropdownOpen = false;

    // Get the current spec - use edited version if available
    let currentSpec: ComponentSpec;
    
    if (this.isEditingSpec || this.isEditingCode) {
      try {
        currentSpec = JSON.parse(this.editableSpec);
      } catch (parseError) {
        console.error('Invalid JSON in spec editor, using original spec');
        currentSpec = this.componentSpec;
      }
    } else {
      currentSpec = this.componentSpec;
    }

    // Create filename from component name - replace spaces and special chars with dashes
    const componentName = this.getComponentName(this.selectedComponent);
    const filename = componentName.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/gi, '-').toLowerCase() + '.json';

    // Create a blob with the JSON content
    const jsonContent = JSON.stringify(currentSpec, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Exported ${componentName} to ${filename}`);
  }

  /**
   * Export the current component to clipboard
   */
  public async exportToClipboard(): Promise<void> {
    if (!this.selectedComponent || !this.componentSpec) {
      console.error('No component selected or spec available');
      return;
    }

    // Close the dropdown
    this.exportDropdownOpen = false;

    // Get the current spec - use edited version if available
    let currentSpec: ComponentSpec;
    
    if (this.isEditingSpec || this.isEditingCode) {
      try {
        currentSpec = JSON.parse(this.editableSpec);
      } catch (parseError) {
        console.error('Invalid JSON in spec editor, using original spec');
        currentSpec = this.componentSpec;
      }
    } else {
      currentSpec = this.componentSpec;
    }

    // Copy to clipboard
    const jsonContent = JSON.stringify(currentSpec, null, 2);
    
    try {
      await navigator.clipboard.writeText(jsonContent);
      
      const componentName = this.getComponentName(this.selectedComponent);
      console.log(`✅ Copied ${componentName} spec to clipboard`);
      
      // Show success message (you could add a toast/notification here)
      alert('Component specification copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard. Please try again.');
    }
  }
}

/**
 * Function to prevent tree shaking of the ComponentStudioDashboardComponent.
 */
export function LoadComponentStudioDashboard() {
  // This function doesn't need to do anything
}