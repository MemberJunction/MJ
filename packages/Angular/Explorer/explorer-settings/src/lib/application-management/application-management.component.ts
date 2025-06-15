import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { ApplicationEntity, ApplicationEntityEntity } from '@memberjunction/core-entities';
import { SharedSettingsModule } from '../shared/shared-settings.module';

interface AppStats {
  totalApplications: number;
  activeApplications: number;
  totalEntities: number;
  publicEntities: number;
}

interface FilterOptions {
  status: 'all' | 'active' | 'inactive';
  search: string;
}

@Component({
  selector: 'mj-application-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SharedSettingsModule
  ],
  templateUrl: './application-management.component.html',
  styleUrls: ['./application-management.component.scss']
})
export class ApplicationManagementComponent implements OnInit, OnDestroy {
  // State management
  public applications: ApplicationEntity[] = [];
  public filteredApplications: ApplicationEntity[] = [];
  public selectedApp: ApplicationEntity | null = null;
  public isLoading = false;
  public error: string | null = null;
  
  // Application entities mapping
  public appEntities: Map<string, ApplicationEntityEntity[]> = new Map();
  
  // Stats
  public stats: AppStats = {
    totalApplications: 0,
    activeApplications: 0,
    totalEntities: 0,
    publicEntities: 0
  };
  
  // Filters
  public filters$ = new BehaviorSubject<FilterOptions>({
    status: 'all',
    search: ''
  });
  
  // UI State
  public showCreateDialog = false;
  public showEditDialog = false;
  public showDeleteConfirm = false;
  public expandedAppId: string | null = null;
  
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();
  
  constructor() {}
  
  ngOnInit(): void {
    this.loadInitialData();
    this.setupFilterSubscription();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  public async loadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load applications and their entities
      const [apps, appEntities] = await Promise.all([
        this.loadApplications(),
        this.loadApplicationEntities()
      ]);
      
      this.applications = apps;
      this.processApplicationEntities(appEntities);
      this.calculateStats();
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading application data:', error);
      this.error = 'Failed to load application data. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
  
  private async loadApplications(): Promise<ApplicationEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<ApplicationEntity>({
      EntityName: 'Applications',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC'
    });
    
    return result.Success ? result.Results : [];
  }
  
  private async loadApplicationEntities(): Promise<ApplicationEntityEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<ApplicationEntityEntity>({
      EntityName: 'Application Entities',
      ResultType: 'entity_object',
      OrderBy: 'ApplicationID, Sequence'
    });
    
    return result.Success ? result.Results : [];
  }
  
  private processApplicationEntities(appEntities: ApplicationEntityEntity[]): void {
    this.appEntities.clear();
    
    for (const appEntity of appEntities) {
      const appId = appEntity.ApplicationID;
      if (!this.appEntities.has(appId)) {
        this.appEntities.set(appId, []);
      }
      this.appEntities.get(appId)!.push(appEntity);
    }
  }
  
  private setupFilterSubscription(): void {
    this.filters$
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.applyFilters();
      });
  }
  
  private applyFilters(): void {
    const filters = this.filters$.value;
    let filtered = [...this.applications];
    
    // Apply status filter - for now, all applications are considered active
    // In the future, we might add an IsActive field to the Applications table
    if (filters.status === 'inactive') {
      // Currently no way to determine inactive apps
      filtered = [];
    }
    
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(app =>
        app.Name?.toLowerCase().includes(searchLower) ||
        app.Description?.toLowerCase().includes(searchLower)
      );
    }
    
    this.filteredApplications = filtered;
  }
  
  private calculateStats(): void {
    // For now, consider all applications as active
    const activeApps = this.applications;
    let totalEntities = 0;
    let publicEntities = 0;
    
    for (const [, entities] of this.appEntities) {
      totalEntities += entities.length;
      publicEntities += entities.filter(e => e.DefaultForNewUser).length;
    }
    
    this.stats = {
      totalApplications: this.applications.length,
      activeApplications: activeApps.length,
      totalEntities,
      publicEntities
    };
  }
  
  // Public methods for template
  public onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateFilter({ search: value });
  }
  
  public onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.updateFilter({ status });
  }
  
  public updateFilter(partial: Partial<FilterOptions>): void {
    this.filters$.next({
      ...this.filters$.value,
      ...partial
    });
  }
  
  public toggleAppExpansion(appId: string): void {
    this.expandedAppId = this.expandedAppId === appId ? null : appId;
  }
  
  public isAppExpanded(appId: string): boolean {
    return this.expandedAppId === appId;
  }
  
  public getAppEntities(appId: string): ApplicationEntityEntity[] {
    return this.appEntities.get(appId) || [];
  }
  
  public getEntityInfo(entityId: string): any {
    return this.metadata.Entities.find(e => e.ID === entityId);
  }
  
  public createNewApplication(): void {
    this.selectedApp = null;
    this.showCreateDialog = true;
  }
  
  public editApplication(app: ApplicationEntity): void {
    this.selectedApp = app;
    this.showEditDialog = true;
  }
  
  public confirmDeleteApplication(app: ApplicationEntity): void {
    this.selectedApp = app;
    this.showDeleteConfirm = true;
  }
  
  public async deleteApplication(): Promise<void> {
    if (!this.selectedApp) return;
    
    try {
      // Implement application deletion logic
      this.showDeleteConfirm = false;
      await this.loadInitialData();
    } catch (error) {
      console.error('Error deleting application:', error);
      this.error = 'Failed to delete application';
    }
  }
  
  public getAppIcon(app: ApplicationEntity): string {
    // You can customize icons based on app type or name
    return 'fa-grid-2';
  }
  
  public getAppStatusClass(app: ApplicationEntity): string {
    // For now, all apps are considered active
    return 'status-active';
  }
  
  public getAppStatusLabel(app: ApplicationEntity): string {
    // For now, all apps are considered active
    return 'Active';
  }
  
  public refreshData(): void {
    this.loadInitialData();
  }
}