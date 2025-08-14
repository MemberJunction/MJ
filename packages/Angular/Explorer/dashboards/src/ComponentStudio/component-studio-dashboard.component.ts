import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { RunView, CompositeKey } from '@memberjunction/core';
import { ComponentEntity } from '@memberjunction/core-entities';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ReactComponentEvent } from '@memberjunction/ng-react';
import { SharedService } from '@memberjunction/ng-shared';

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
type DisplayComponent = (ComponentEntity & { isFileLoaded?: false }) | FileLoadedComponent;

@Component({
  selector: 'mj-component-studio-dashboard',
  templateUrl: './component-studio-dashboard.component.html',
  styleUrls: ['./component-studio-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'ComponentStudioDashboard')
export class ComponentStudioDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  
  // Component data
  public components: ComponentEntity[] = [];
  public fileLoadedComponents: FileLoadedComponent[] = []; // Components loaded from files
  public allComponents: DisplayComponent[] = []; // Combined list
  public filteredComponents: DisplayComponent[] = [];
  public selectedComponent: DisplayComponent | null = null;
  public expandedComponent: DisplayComponent | null = null; // Track which card is expanded
  public componentSpec: ComponentSpec | null = null;
  public isLoading = false;
  public searchQuery = '';
  public isRunning = false; // Track if component is currently running
  
  // Error handling
  public currentError: { type: string; message: string; technicalDetails?: any } | null = null;
  
  // File input element reference
  @ViewChild('fileInput', { static: false }) fileInput?: ElementRef<HTMLInputElement>;
  
  private destroy$ = new Subject<void>();

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit(): void {
    this.initDashboard();
    this.loadData();
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
      const result = await rv.RunView<ComponentEntity>({
        EntityName: 'MJ: Components',
        ExtraFilter: 'HasCustomProps = 0', // Only load components without custom props
        OrderBy: 'Name',
        MaxRows: 1000,
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.components = result.Results || [];
        this.combineAndFilterComponents();
      } else {
        console.error('Failed to load components:', result.ErrorMessage);
      }
    } catch (error) {
      console.error('Error loading components:', error);
    } finally {
      this.isLoading = false;
    }
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

    // Apply search filter
    if (!this.searchQuery) {
      this.filteredComponents = [...this.allComponents];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredComponents = this.allComponents.filter(c => {
        const name = this.getComponentName(c)?.toLowerCase() || '';
        const description = this.getComponentDescription(c)?.toLowerCase() || '';
        const type = this.getComponentType(c)?.toLowerCase() || '';
        return name.includes(query) || description.includes(query) || type.includes(query);
      });
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
    this.selectedComponent = component;
    this.componentSpec = this.getComponentSpec(component);
    this.isRunning = true;
    this.currentError = null; // Clear any previous errors
    console.log('Running component:', this.getComponentName(component));
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

  // File upload handling methods
  public triggerFileInput(): void {
    this.fileInput?.nativeElement.click();
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
}

/**
 * Function to prevent tree shaking of the ComponentStudioDashboardComponent.
 */
export function LoadComponentStudioDashboard() {
  // This function doesn't need to do anything
}