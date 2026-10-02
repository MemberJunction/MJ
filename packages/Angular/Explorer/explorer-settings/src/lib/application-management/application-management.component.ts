import { ChangeDetectorRef, Component, NgZone, OnDestroy } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata, EntityInfo } from '@memberjunction/core';
import { MJApplicationEntity, MJApplicationEntityEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
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
  styleUrls: ['../shared/styles/_admin-patterns.css', './application-management.component.css']
})
@RegisterClass(BaseDashboard, 'ApplicationManagement')
export class ApplicationManagementComponent extends BaseDashboard implements OnDestroy {
  // State management
  public Applications: MJApplicationEntity[] = [];

  /** @deprecated Use {@link Applications}. */
  public get applications(): MJApplicationEntity[] {
    return this.Applications;
  }
  /** @deprecated Use {@link Applications}. */
  public set applications(value: MJApplicationEntity[]) {
    this.Applications = value;
  }
  public FilteredApplications: MJApplicationEntity[] = [];

  /** @deprecated Use {@link FilteredApplications}. */
  public get filteredApplications(): MJApplicationEntity[] {
    return this.FilteredApplications;
  }
  /** @deprecated Use {@link FilteredApplications}. */
  public set filteredApplications(value: MJApplicationEntity[]) {
    this.FilteredApplications = value;
  }
  public SelectedApp: MJApplicationEntity | null = null;

  /** @deprecated Use {@link SelectedApp}. */
  public get selectedApp(): MJApplicationEntity | null {
    return this.SelectedApp;
  }
  /** @deprecated Use {@link SelectedApp}. */
  public set selectedApp(value: MJApplicationEntity | null) {
    this.SelectedApp = value;
  }
  public isLoading = false;
  public error: string | null = null;

  // Application entities mapping
  public AppEntities: Map<string, MJApplicationEntityEntity[]> = new Map();

  /** @deprecated Use {@link AppEntities}. */
  public get appEntities(): Map<string, MJApplicationEntityEntity[]> {
    return this.AppEntities;
  }
  /** @deprecated Use {@link AppEntities}. */
  public set appEntities(value: Map<string, MJApplicationEntityEntity[]>) {
    this.AppEntities = value;
  }

  // Stats
  public Stats: AppStats = {
    totalApplications: 0,
    activeApplications: 0,
    totalEntities: 0,
    publicEntities: 0
  };

  /** @deprecated Use {@link Stats}. */
  public get stats(): AppStats {
    return this.Stats;
  }
  /** @deprecated Use {@link Stats}. */
  public set stats(value: AppStats) {
    this.Stats = value;
  }

  // Filters
  public Filters$ = new BehaviorSubject<FilterOptions>({
    status: 'all',
    search: ''
  });

  /** @deprecated Use {@link Filters$}. */
  public get filters$() {
    return this.Filters$;
  }
  /** @deprecated Use {@link Filters$}. */
  public set filters$(value) {
    this.Filters$ = value;
  }

  // UI State
  public ShowApplicationDialog = false;

  /** @deprecated Use {@link ShowApplicationDialog}. */
  public get showApplicationDialog() {
    return this.ShowApplicationDialog;
  }
  /** @deprecated Use {@link ShowApplicationDialog}. */
  public set showApplicationDialog(value) {
    this.ShowApplicationDialog = value;
  }
  public ApplicationDialogData: ApplicationDialogData | null = null;

  /** @deprecated Use {@link ApplicationDialogData}. */
  public get applicationDialogData(): ApplicationDialogData | null {
    return this.ApplicationDialogData;
  }
  /** @deprecated Use {@link ApplicationDialogData}. */
  public set applicationDialogData(value: ApplicationDialogData | null) {
    this.ApplicationDialogData = value;
  }
  public ShowDeleteConfirm = false;

  /** @deprecated Use {@link ShowDeleteConfirm}. */
  public get showDeleteConfirm() {
    return this.ShowDeleteConfirm;
  }
  /** @deprecated Use {@link ShowDeleteConfirm}. */
  public set showDeleteConfirm(value) {
    this.ShowDeleteConfirm = value;
  }
  public ExpandedAppId: string | null = null;

  /** @deprecated Use {@link ExpandedAppId}. */
  public get expandedAppId(): string | null {
    return this.ExpandedAppId;
  }
  /** @deprecated Use {@link ExpandedAppId}. */
  public set expandedAppId(value: string | null) {
    this.ExpandedAppId = value;
  }

  protected override destroy$ = new Subject<void>();
  private get metadata() { return this.ProviderToUse; }
  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Application Management"
  }

  protected initDashboard(): void {
    this.setupFilterSubscription();
  }

  protected loadData(): void {
    this.LoadInitialData();
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }
  
  public async LoadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load applications and their entities
      const [apps, appEntities] = await Promise.all([
        this.loadApplications(),
        this.loadApplicationEntities()
      ]);
      
      this.Applications = apps;
      this.processApplicationEntities(appEntities);
      this.calculateStats();
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading application data:', error);
      this.error = 'Failed to load application data. Please try again.';
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link LoadInitialData}. */
  public async loadInitialData(): Promise<void> {
    return this.LoadInitialData();
  }

  private async loadApplications(): Promise<MJApplicationEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJApplicationEntity>({
      EntityName: 'MJ: Applications',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC'
    });
    
    return result.Success ? result.Results : [];
  }
  
  private async loadApplicationEntities(): Promise<MJApplicationEntityEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJApplicationEntityEntity>({
      EntityName: 'MJ: Application Entities',
      ResultType: 'entity_object',
      OrderBy: 'ApplicationID, Sequence'
    });
    
    return result.Success ? result.Results : [];
  }
  
  private processApplicationEntities(appEntities: MJApplicationEntityEntity[]): void {
    this.AppEntities.clear();
    
    for (const appEntity of appEntities) {
      const appId = appEntity.ApplicationID;
      if (!this.AppEntities.has(appId)) {
        this.AppEntities.set(appId, []);
      }
      this.AppEntities.get(appId)!.push(appEntity);
    }
  }
  
  private setupFilterSubscription(): void {
    this.Filters$
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
    const filters = this.Filters$.value;
    let filtered = [...this.Applications];
    
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
    
    this.FilteredApplications = filtered;
    this.cdr.detectChanges();
  }
  
  private calculateStats(): void {
    // For now, consider all applications as active
    const activeApps = this.Applications;
    let totalEntities = 0;
    let publicEntities = 0;
    
    for (const [, entities] of this.AppEntities) {
      totalEntities += entities.length;
      publicEntities += entities.filter(e => e.DefaultForNewUser).length;
    }
    
    this.Stats = {
      totalApplications: this.Applications.length,
      activeApplications: activeApps.length,
      totalEntities,
      publicEntities
    };
  }
  
  // Public methods for template
  public OnStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.UpdateFilter({ status });
  }

  /** @deprecated Use {@link OnStatusFilterChange}. */
  public onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    return this.OnStatusFilterChange(status);
  }
  
  public UpdateFilter(partial: Partial<FilterOptions>): void {
    this.Filters$.next({
      ...this.Filters$.value,
      ...partial
    });
    // Discrete changes (chips) apply immediately. Text search still goes
    // through the 300ms debounce in setupFilterSubscription.
    if (!('search' in partial)) {
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link UpdateFilter}. */
  public updateFilter(partial: Partial<FilterOptions>): void {
    return this.UpdateFilter(partial);
  }

  // -- Concise chrome: one Filter popover (Status) + applied-filter chips -----

  public get FilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'status',
        type: 'chips',
        label: 'Status',
        chipOptions: [
          { text: 'All', value: 'all' },
          { text: 'Active', value: 'active' },
          { text: 'Inactive', value: 'inactive' },
        ],
      },
    ];
  }

  /** @deprecated Use {@link FilterFields}. */
  public get filterFields(): FilterFieldConfig[] {
    return this.FilterFields;
  }

  public get FilterValues(): Record<string, unknown> {
    return { status: this.Filters$.value.status };
  }

  /** @deprecated Use {@link FilterValues}. */
  public get filterValues(): Record<string, unknown> {
    return this.FilterValues;
  }

  /** Total active filters (Status) — drives the Filter button badge. */
  public get TotalActiveFilterCount(): number {
    return this.Filters$.value.status !== 'all' ? 1 : 0;
  }

  public OnFilterPanelChange(values: Record<string, unknown>): void {
    if ('status' in values) {
      this.UpdateFilter({ status: (values['status'] as FilterOptions['status']) || 'all' });
    }
  }

  /** @deprecated Use {@link OnFilterPanelChange}. */
  public onFilterPanelChange(values: Record<string, unknown>): void {
    return this.OnFilterPanelChange(values);
  }

  /** Clear all filters (Status); search persists. */
  public ClearAllAppliedFilters(): void {
    this.UpdateFilter({ status: 'all' });
  }

  /** @deprecated Use {@link ClearAllAppliedFilters}. */
  public clearAllAppliedFilters(): void {
    return this.ClearAllAppliedFilters();
  }

  /** True when search and/or panel filters are narrowing the list — gates the
   *  no-results empty-state "Reset filters" CTA. */
  public get IsListNarrowed(): boolean {
    return this.Filters$.value.search !== '' || this.TotalActiveFilterCount > 0;
  }

  /** Reset everything narrowing the list (search + Status) and refresh
   *  immediately. Wired to the no-results empty-state CTA. Unlike
   *  clearAllAppliedFilters(), this also clears the search box. */
  public ResetAllFiltersAndSearch(): void {
    this.Filters$.next({ status: 'all', search: '' });
    this.applyFilters();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ResetAllFiltersAndSearch}. */
  public resetAllFiltersAndSearch(): void {
    return this.ResetAllFiltersAndSearch();
  }
  
  public ToggleAppExpansion(appId: string): void {
    this.ExpandedAppId = this.ExpandedAppId === appId ? null : appId;
  }

  /** @deprecated Use {@link ToggleAppExpansion}. */
  public toggleAppExpansion(appId: string): void {
    return this.ToggleAppExpansion(appId);
  }
  
  public IsAppExpanded(appId: string): boolean {
    return this.ExpandedAppId === appId;
  }

  /** @deprecated Use {@link IsAppExpanded}. */
  public isAppExpanded(appId: string): boolean {
    return this.IsAppExpanded(appId);
  }
  
  public GetAppEntities(appId: string): MJApplicationEntityEntity[] {
    return this.AppEntities.get(appId) || [];
  }

  /** @deprecated Use {@link GetAppEntities}. */
  public getAppEntities(appId: string): MJApplicationEntityEntity[] {
    return this.GetAppEntities(appId);
  }
  
  public GetEntityInfo(entityId: string): EntityInfo | undefined {
    return this.metadata.Entities.find(e => UUIDsEqual(e.ID, entityId));
  }

  /** @deprecated Use {@link GetEntityInfo}. */
  public getEntityInfo(entityId: string): EntityInfo | undefined {
    return this.GetEntityInfo(entityId);
  }
  
  public CreateNewApplication(): void {
    this.ApplicationDialogData = {
      mode: 'create'
    };
    this.ShowApplicationDialog = true;
  }

  /** @deprecated Use {@link CreateNewApplication}. */
  public createNewApplication(): void {
    return this.CreateNewApplication();
  }
  
  public EditApplication(app: MJApplicationEntity): void {
    this.ApplicationDialogData = {
      application: app,
      mode: 'edit'
    };
    this.ShowApplicationDialog = true;
  }

  /** @deprecated Use {@link EditApplication}. */
  public editApplication(app: MJApplicationEntity): void {
    return this.EditApplication(app);
  }
  
  public ConfirmDeleteApplication(app: MJApplicationEntity): void {
    this.SelectedApp = app;
    this.ShowDeleteConfirm = true;
  }

  /** @deprecated Use {@link ConfirmDeleteApplication}. */
  public confirmDeleteApplication(app: MJApplicationEntity): void {
    return this.ConfirmDeleteApplication(app);
  }
  
  public async DeleteApplication(): Promise<void> {
    if (!this.SelectedApp) return;
    
    try {
      this.isLoading = true;
      this.error = null;

      // Delete the application
      const deleteResult = await this.SelectedApp.Delete();
      if (!deleteResult) {
        throw new Error(this.SelectedApp.LatestResult?.Message || 'Failed to delete application');
      }

      this.ShowDeleteConfirm = false;
      this.SelectedApp = null;
      await this.LoadInitialData();
    } catch (error: unknown) {
      console.error('Error deleting application:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'Failed to delete application';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link DeleteApplication}. */
  public async deleteApplication(): Promise<void> {
    return this.DeleteApplication();
  }

  public OnApplicationDialogResult(result: ApplicationDialogResult): void {
    this.ShowApplicationDialog = false;
    this.ApplicationDialogData = null;

    if (result.action === 'save') {
      // Refresh the application list after save
      this.LoadInitialData();
    }
  }

  /** @deprecated Use {@link OnApplicationDialogResult}. */
  public onApplicationDialogResult(result: ApplicationDialogResult): void {
    return this.OnApplicationDialogResult(result);
  }
  
  public GetAppIcon(app: MJApplicationEntity): string {
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

  /** @deprecated Use {@link GetAppIcon}. */
  public getAppIcon(app: MJApplicationEntity): string {
    return this.GetAppIcon(app);
  }
  
  public GetAppStatusClass(app: MJApplicationEntity): string {
    // For now, all apps are considered active
    return 'status-active';
  }

  /** @deprecated Use {@link GetAppStatusClass}. */
  public getAppStatusClass(app: MJApplicationEntity): string {
    return this.GetAppStatusClass(app);
  }
  
  public GetAppStatusLabel(app: MJApplicationEntity): string {
    // For now, all apps are considered active
    return 'Active';
  }

  /** @deprecated Use {@link GetAppStatusLabel}. */
  public getAppStatusLabel(app: MJApplicationEntity): string {
    return this.GetAppStatusLabel(app);
  }
  
  public RefreshData(): void {
    this.LoadInitialData();
  }

  /** @deprecated Use {@link RefreshData}. */
  public refreshData(): void {
    return this.RefreshData();
  }
}