import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { ApplicationEntity, ApplicationEntityEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { ApplicationDialogData, ApplicationDialogResult } from './application-dialog/application-dialog.component';

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
  standalone: false,
  selector: 'mj-application-management',
  templateUrl: './application-management.component.html',
  styleUrls: ['./application-management.component.css']
})
@RegisterClass(BaseDashboard, 'ApplicationManagement')
export class ApplicationManagementComponent extends BaseDashboard implements OnDestroy {
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
  public showApplicationDialog = false;
  public applicationDialogData: ApplicationDialogData | null = null;
  public showDeleteConfirm = false;
  public expandedAppId: string | null = null;

  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Application Management"
  }

  protected initDashboard(): void {
    this.setupFilterSubscription();
  }

  protected loadData(): void {
    this.loadInitialData();
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
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
    this.cdr.detectChanges();
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
    this.applicationDialogData = {
      mode: 'create'
    };
    this.showApplicationDialog = true;
  }
  
  public editApplication(app: ApplicationEntity): void {
    this.applicationDialogData = {
      application: app,
      mode: 'edit'
    };
    this.showApplicationDialog = true;
  }
  
  public confirmDeleteApplication(app: ApplicationEntity): void {
    this.selectedApp = app;
    this.showDeleteConfirm = true;
  }
  
  public async deleteApplication(): Promise<void> {
    if (!this.selectedApp) return;
    
    try {
      this.isLoading = true;
      this.error = null;

      // Delete the application
      const deleteResult = await this.selectedApp.Delete();
      if (!deleteResult) {
        throw new Error(this.selectedApp.LatestResult?.Message || 'Failed to delete application');
      }

      this.showDeleteConfirm = false;
      this.selectedApp = null;
      await this.loadInitialData();
    } catch (error: any) {
      console.error('Error deleting application:', error);
      this.error = error.message || 'Failed to delete application';
    } finally {
      this.isLoading = false;
    }
  }

  public onApplicationDialogResult(result: ApplicationDialogResult): void {
    this.showApplicationDialog = false;
    this.applicationDialogData = null;

    if (result.action === 'save') {
      // Refresh the application list after save
      this.loadInitialData();
    }
  }
  
  public getAppIcon(app: ApplicationEntity): string {
    // Map application names to appropriate icons based on their purpose
    const name = (app.Name || '').toLowerCase();

    // Common application type mappings
    if (name.includes('admin') || name.includes('management')) {
      return 'fa-cog';
    }
    if (name.includes('report') || name.includes('analytics') || name.includes('dashboard')) {
      return 'fa-chart-line';
    }
    if (name.includes('user') || name.includes('people') || name.includes('employee')) {
      return 'fa-users';
    }
    if (name.includes('settings') || name.includes('config')) {
      return 'fa-sliders';
    }
    if (name.includes('data') || name.includes('database')) {
      return 'fa-database';
    }
    if (name.includes('file') || name.includes('document')) {
      return 'fa-file-alt';
    }
    if (name.includes('mail') || name.includes('email') || name.includes('message')) {
      return 'fa-envelope';
    }
    if (name.includes('search') || name.includes('explorer')) {
      return 'fa-search';
    }
    if (name.includes('calendar') || name.includes('schedule') || name.includes('event')) {
      return 'fa-calendar';
    }
    if (name.includes('security') || name.includes('auth') || name.includes('permission')) {
      return 'fa-shield-alt';
    }
    if (name.includes('integration') || name.includes('api') || name.includes('connect')) {
      return 'fa-plug';
    }
    if (name.includes('workflow') || name.includes('process') || name.includes('automation')) {
      return 'fa-project-diagram';
    }
    if (name.includes('ai') || name.includes('intelligence') || name.includes('machine')) {
      return 'fa-brain';
    }
    if (name.includes('home') || name.includes('main') || name.includes('default')) {
      return 'fa-home';
    }

    // Default icon for applications
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