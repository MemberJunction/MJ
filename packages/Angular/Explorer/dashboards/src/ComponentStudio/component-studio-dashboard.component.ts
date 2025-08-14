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

@Component({
  selector: 'mj-component-studio-dashboard',
  templateUrl: './component-studio-dashboard.component.html',
  styleUrls: ['./component-studio-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'ComponentStudioDashboard')
export class ComponentStudioDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  
  // Component data
  public components: ComponentEntity[] = [];
  public filteredComponents: ComponentEntity[] = [];
  public selectedComponent: ComponentEntity | null = null;
  public expandedComponent: ComponentEntity | null = null; // Track which card is expanded
  public componentSpec: ComponentSpec | null = null;
  public isLoading = false;
  public searchQuery = '';
  public isRunning = false; // Track if component is currently running
  
  // Error handling
  public currentError: { type: string; message: string; technicalDetails?: any } | null = null;
  
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
        this.filterComponents();
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
    this.filterComponents();
  }

  private filterComponents(): void {
    // Note: this.components already filtered to HasCustomProps = 0 in loadData
    if (!this.searchQuery) {
      this.filteredComponents = [...this.components];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredComponents = this.components.filter(c =>
        c.Name?.toLowerCase().includes(query) ||
        c.Description?.toLowerCase().includes(query) ||
        c.Type?.toLowerCase().includes(query)
      );
    }
  }

  public toggleComponentExpansion(component: ComponentEntity): void {
    // Toggle expansion - if clicking the same component, collapse it
    if (this.expandedComponent?.ID === component.ID) {
      this.expandedComponent = null;
    } else {
      this.expandedComponent = component;
    }
    this.cdr.detectChanges();
  }

  public runComponent(component: ComponentEntity): void {
    // If another component is running, stop it first then start the new one
    if (this.isRunning && this.selectedComponent?.ID !== component.ID) {
      console.log('Switching from', this.selectedComponent?.Name, 'to', component.Name);
      // Clear the current component state
      this.isRunning = false;
      this.selectedComponent = null;
      this.componentSpec = null;
      this.currentError = null;
      this.cdr.detectChanges();
      
      // Small delay to ensure React component cleanup, then start new component
      setTimeout(() => {
        this.startComponent(component);
      }, 100);
    } else {
      this.startComponent(component);
    }
  }

  private startComponent(component: ComponentEntity): void {
    this.selectedComponent = component;
    this.componentSpec = JSON.parse(component.Specification);
    this.isRunning = true;
    this.currentError = null; // Clear any previous errors
    console.log('Running component:', component.Name);
    this.cdr.detectChanges();
  }

  public stopComponent(): void {
    this.isRunning = false;
    this.selectedComponent = null;
    this.componentSpec = null;
    this.currentError = null;
    this.cdr.detectChanges();
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
Component: ${this.selectedComponent?.Name}
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

  public getComponentTypeIcon(type: string | null): string {
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

  public getComponentTypeColor(type: string | null): string {
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