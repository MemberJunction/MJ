import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { LogError, RunView } from '@memberjunction/core';
import { DashboardEngine, MJApplicationEntity, MJDashboardEntityExtended, MJDashboardUserPreferenceEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { HomeDashboardTabsService } from '@memberjunction/ng-shared';

export interface DashboardPreferencesResult {
  saved: boolean;
  preferences?: MJDashboardUserPreferenceEntity[];
}

/**
 * Edits an ordered list of dashboards stored as MJ: Dashboard User Preferences.
 * In Global scope and personal mode the list is the user's Home tabs; an Owner can switch to the
 * Global system defaults. Lists only Config dashboards the user can read.
 */
@Component({
  standalone: false,
  selector: 'mj-dashboard-preferences-dialog',
  templateUrl: './dashboard-preferences-dialog.component.html',
  styleUrls: ['./dashboard-preferences-dialog.component.css']
})
export class DashboardPreferencesDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  @Input() public ApplicationId: string | null = null;

  /** @deprecated Use {@link ApplicationId}. */
  @Input() public set applicationId(value: string | null) {
    this.ApplicationId = value;
  }
  /** @deprecated Use {@link ApplicationId}. */
  public get applicationId(): string | null {
    return this.ApplicationId;
  }
  @Input() public Scope: MJDashboardUserPreferenceEntity['Scope'] = 'Global';

  /** @deprecated Use {@link Scope}. */
  @Input() public set scope(value: MJDashboardUserPreferenceEntity['Scope']) {
    this.Scope = value;
  }
  /** @deprecated Use {@link Scope}. */
  public get scope(): MJDashboardUserPreferenceEntity['Scope'] {
    return this.Scope;
  }
  @Output() public Result = new EventEmitter<DashboardPreferencesResult>();

  /**
   * @deprecated Use {@link Result}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (result) keeps working. Must stay AFTER Result: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() public result = this.Result;

  public AvailableDashboards: MJDashboardEntityExtended[] = [];

  /** @deprecated Use {@link AvailableDashboards}. */
  public get availableDashboards(): MJDashboardEntityExtended[] {
    return this.AvailableDashboards;
  }
  /** @deprecated Use {@link AvailableDashboards}. */
  public set availableDashboards(value: MJDashboardEntityExtended[]) {
    this.AvailableDashboards = value;
  }
  public ConfiguredDashboards: MJDashboardEntityExtended[] = [];

  /** @deprecated Use {@link ConfiguredDashboards}. */
  public get configuredDashboards(): MJDashboardEntityExtended[] {
    return this.ConfiguredDashboards;
  }
  /** @deprecated Use {@link ConfiguredDashboards}. */
  public set configuredDashboards(value: MJDashboardEntityExtended[]) {
    this.ConfiguredDashboards = value;
  }
  public ApplicationName: string = '';

  /** @deprecated Use {@link ApplicationName}. */
  public get applicationName(): string {
    return this.ApplicationName;
  }
  /** @deprecated Use {@link ApplicationName}. */
  public set applicationName(value: string) {
    this.ApplicationName = value;
  }
  public Loading: boolean = true;

  /** @deprecated Use {@link Loading}. */
  public get loading(): boolean {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value: boolean) {
    this.Loading = value;
  }
  public saving: boolean = false;
  public error: string | null = null;
  public HasChanges: boolean = false;

  /** @deprecated Use {@link HasChanges}. */
  public get hasChanges(): boolean {
    return this.HasChanges;
  }
  /** @deprecated Use {@link HasChanges}. */
  public set hasChanges(value: boolean) {
    this.HasChanges = value;
  }
  public IsSysAdmin: boolean = false;

  /** @deprecated Use {@link IsSysAdmin}. */
  public get isSysAdmin(): boolean {
    return this.IsSysAdmin;
  }
  /** @deprecated Use {@link IsSysAdmin}. */
  public set isSysAdmin(value: boolean) {
    this.IsSysAdmin = value;
  }
  public PreferenceMode: 'personal' | 'system' = 'personal';

  /** @deprecated Use {@link PreferenceMode}. */
  public get preferenceMode(): 'personal' | 'system' {
    return this.PreferenceMode;
  }
  /** @deprecated Use {@link PreferenceMode}. */
  public set preferenceMode(value: 'personal' | 'system') {
    this.PreferenceMode = value;
  }

  private cdr = inject(ChangeDetectorRef);
  private homeTabs = inject(HomeDashboardTabsService);
  private originalConfiguredIds: string[] = [];
  private allAvailableDashboards: MJDashboardEntityExtended[] = [];
  private errorTimer: ReturnType<typeof setTimeout> | null = null;

  /** The dialog title. In Global scope the list is the Home tabs. */
  public get DialogTitle(): string {
    return this.Scope === 'Global' ? 'Manage home dashboards' : 'Dashboard Preferences';
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.loadData();
    } catch (error) {
      LogError('Error initializing dashboard preferences dialog', null, error);
      this.error = 'Failed to load dashboard preferences';
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.clearErrorTimer();
  }

  private async loadData(): Promise<void> {
    const provider = this.ProviderToUse;
    this.IsSysAdmin = provider.CurrentUser.Type.trim().toLowerCase() === 'owner';
    this.PreferenceMode = 'personal';

    if (this.Scope === 'App' && this.ApplicationId) {
      await this.loadApplicationName();
    }

    const engine = this.dashboardEngine;
    await engine.Config(false, provider.CurrentUser, provider);
    this.allAvailableDashboards = engine
      .GetAccessibleDashboards(provider.CurrentUser.ID)
      .filter(d => this.isListable(d));

    await this.loadConfiguredList();
  }

  private async loadApplicationName(): Promise<void> {
    if (!this.ApplicationId) return;

    try {
      const md = this.ProviderToUse;
      const ds = await md.GetAndCacheDatasetByName("MJ_Metadata");
      const appList = ds.Results.find(r => r.Code === 'Applications');
      if (appList) {
        const app = appList.Results.find((a: MJApplicationEntity) => UUIDsEqual(a.ID, this.ApplicationId));
        this.ApplicationName = app?.Name || 'Unknown Application';
      }
    } catch (error) {
      LogError('Error loading application name', null, error);
      this.ApplicationName = 'Unknown Application';
    }
  }

  /** True for the dashboards the dialog can list: Config dashboards, and in App scope only those of the application. */
  private isListable(dashboard: MJDashboardEntityExtended): boolean {
    if (dashboard.Type !== 'Config') return false;
    return this.Scope === 'Global' || UUIDsEqual(dashboard.ApplicationID, this.ApplicationId);
  }

  /** Loads the list the current mode edits, splits the dashboards into the two panels, and resets change tracking. */
  private async loadConfiguredList(): Promise<void> {
    const configuredIds = await this.loadConfiguredIds();
    this.splitDashboards(configuredIds);
    this.originalConfiguredIds = this.ConfiguredDashboards.map(d => d.ID);
    this.HasChanges = false;
  }

  /**
   * The dashboard IDs of the list the current mode edits, in display order. For the Home tabs these
   * are the tabs Home shows (HomeDashboardTabsService.Tabs), so a user who sees the system defaults
   * starts from them.
   */
  private async loadConfiguredIds(): Promise<string[]> {
    if (this.editsHomeTabs) {
      return this.homeTabs.Tabs().map(d => d.ID);
    }
    const rows = await this.loadStoredRows('DisplayOrder');
    return rows.map(r => r.DashboardID);
  }

  private splitDashboards(configuredIds: string[]): void {
    const configured: MJDashboardEntityExtended[] = [];
    for (const id of configuredIds) {
      const dashboard = this.allAvailableDashboards.find(d => UUIDsEqual(d.ID, id));
      if (dashboard && !configured.includes(dashboard)) configured.push(dashboard);
    }
    this.ConfiguredDashboards = configured;
    this.AvailableDashboards = this.allAvailableDashboards
      .filter(d => !configured.includes(d))
      .sort((a, b) => a.Name.localeCompare(b.Name));
  }

  public OnDrop(event: CdkDragDrop<MJDashboardEntityExtended[]>): void {
    try {
      if (event.previousContainer === event.container) {
        // Reordering within the same list
        moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      } else {
        // Moving between lists
        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex
        );

        // If moving to configured dashboards, sort the available list
        if (event.container.data === this.ConfiguredDashboards) {
          this.AvailableDashboards.sort((a, b) => a.Name.localeCompare(b.Name));
        }
      }

      this.checkForChanges();
    } catch (error) {
      LogError('Error in drag drop operation', null, error);
      this.showTransientError('Error reordering dashboards. Please try again.', 3000);
    }
  }

  /** @deprecated Use {@link OnDrop}. */
  public onDrop(event: CdkDragDrop<MJDashboardEntityExtended[]>): void {
    return this.OnDrop(event);
  }

  public AddDashboard(dashboard: MJDashboardEntityExtended): void {
    try {
      const index = this.AvailableDashboards.findIndex(d => UUIDsEqual(d.ID, dashboard.ID));
      if (index !== -1) {
        this.AvailableDashboards.splice(index, 1);
        this.ConfiguredDashboards.push(dashboard);
        this.checkForChanges();
      }
    } catch (error) {
      LogError('Error adding dashboard', null, error);
      this.showTransientError('Error adding dashboard. Please try again.', 3000);
    }
  }

  /** @deprecated Use {@link AddDashboard}. */
  public addDashboard(dashboard: MJDashboardEntityExtended): void {
    return this.AddDashboard(dashboard);
  }

  public RemoveDashboard(dashboard: MJDashboardEntityExtended): void {
    try {
      const index = this.ConfiguredDashboards.findIndex(d => UUIDsEqual(d.ID, dashboard.ID));
      if (index !== -1) {
        this.ConfiguredDashboards.splice(index, 1);
        this.AvailableDashboards.push(dashboard);
        this.AvailableDashboards.sort((a, b) => a.Name.localeCompare(b.Name));
        this.checkForChanges();
      }
    } catch (error) {
      LogError('Error removing dashboard', null, error);
      this.showTransientError('Error removing dashboard. Please try again.', 3000);
    }
  }

  /** @deprecated Use {@link RemoveDashboard}. */
  public removeDashboard(dashboard: MJDashboardEntityExtended): void {
    return this.RemoveDashboard(dashboard);
  }

  public async OnPreferenceModeChange(): Promise<void> {
    try {
      this.Loading = true;
      this.error = null;
      await this.loadConfiguredList();
    } catch (error) {
      LogError('Error changing preference mode', null, error);
      this.error = 'Error loading preferences. Please try again.';
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link OnPreferenceModeChange}. */
  public async onPreferenceModeChange(): Promise<void> {
    return this.OnPreferenceModeChange();
  }

  private checkForChanges(): void {
    const currentConfiguredIds = this.ConfiguredDashboards.map(d => d.ID);
    this.HasChanges = currentConfiguredIds.length !== this.originalConfiguredIds.length ||
                      currentConfiguredIds.some((id, index) => !UUIDsEqual(id, this.originalConfiguredIds[index]));
  }

  /**
   * Saves the configured list. For the Home tabs it then marks the user customized, so an empty
   * list stays empty instead of falling back to the system defaults.
   */
  public async OnSave(): Promise<void> {
    if (this.saving || !this.HasChanges) {
      return;
    }

    try {
      this.saving = true;
      const preferences = await this.saveConfiguredList();
      if (this.editsHomeTabs) {
        await this.homeTabs.MarkCustomized();
      }
      this.Result.emit({ saved: true, preferences });
    } catch (error) {
      LogError('Error saving dashboard preferences', null, error);
      this.showTransientError(`Failed to save preferences: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link OnSave}. */
  public async onSave(): Promise<void> {
    return this.OnSave();
  }

  /** Writes one row per configured dashboard with DisplayOrder 1..n and returns the rows in that order. */
  private async saveConfiguredList(): Promise<MJDashboardUserPreferenceEntity[]> {
    const existing = await this.loadStoredRows();
    await this.deleteRemovedRows(existing);

    const saved: MJDashboardUserPreferenceEntity[] = [];
    for (let i = 0; i < this.ConfiguredDashboards.length; i++) {
      const dashboard = this.ConfiguredDashboards[i];
      const row = existing.find(p => UUIDsEqual(p.DashboardID, dashboard.ID)) ?? await this.newPreferenceRow(dashboard.ID);
      row.DisplayOrder = i + 1;
      if (!await row.Save()) {
        throw new Error(`Failed to save preference for dashboard ${dashboard.Name}: ${row.LatestResult?.CompleteMessage ?? 'Unknown error'}`);
      }
      saved.push(row);
    }
    return saved;
  }

  /**
   * Deletes the stored rows of dashboards the user removed from the list. Rows for dashboards the
   * dialog does not list (not readable, or not Config) stay as they are.
   */
  private async deleteRemovedRows(existing: MJDashboardUserPreferenceEntity[]): Promise<void> {
    const removed = existing.filter(p =>
      this.allAvailableDashboards.some(d => UUIDsEqual(d.ID, p.DashboardID)) &&
      !this.ConfiguredDashboards.some(d => UUIDsEqual(d.ID, p.DashboardID))
    );
    for (const row of removed) {
      if (!await row.Delete()) {
        throw new Error(`Failed to delete preference: ${row.LatestResult?.CompleteMessage ?? 'Unknown error'}`);
      }
    }
  }

  private async newPreferenceRow(dashboardId: string): Promise<MJDashboardUserPreferenceEntity> {
    const provider = this.ProviderToUse;
    const row = await provider.GetEntityObject<MJDashboardUserPreferenceEntity>('MJ: Dashboard User Preferences', provider.CurrentUser);
    row.UserID = this.editsSystemDefaults ? null : provider.CurrentUser.ID;
    row.DashboardID = dashboardId;
    row.Scope = this.Scope;
    row.ApplicationID = this.Scope === 'App' ? this.ApplicationId : null;
    return row;
  }

  /** The stored rows of the list the current mode edits. Throws when they cannot be read. */
  private async loadStoredRows(orderBy?: string): Promise<MJDashboardUserPreferenceEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJDashboardUserPreferenceEntity>({
      EntityName: 'MJ: Dashboard User Preferences',
      ExtraFilter: this.storedRowsFilter(),
      OrderBy: orderBy,
      ResultType: 'entity_object',
    });
    if (!result.Success) {
      throw new Error(result.ErrorMessage || 'Could not read the dashboard preferences');
    }
    return result.Results ?? [];
  }

  private storedRowsFilter(): string {
    const userFilter = this.editsSystemDefaults
      ? 'UserID IS NULL'
      : `UserID='${EscapeSQLString(this.ProviderToUse.CurrentUser.ID)}'`;
    const scopeFilter = this.Scope === 'Global'
      ? `Scope='Global' AND ApplicationID IS NULL`
      : `Scope='App' AND ApplicationID='${EscapeSQLString(this.ApplicationId)}'`;
    return `${userFilter} AND ${scopeFilter}`;
  }

  /** True when an Owner edits the Global system defaults (rows with no user). */
  private get editsSystemDefaults(): boolean {
    return this.IsSysAdmin && this.Scope === 'Global' && this.PreferenceMode === 'system';
  }

  /** True when the dialog edits the current user's Home tabs: Global scope in personal mode. */
  private get editsHomeTabs(): boolean {
    return this.Scope === 'Global' && !this.editsSystemDefaults;
  }

  /** The DashboardEngine for an explicitly set provider, else the global instance. */
  private get dashboardEngine(): DashboardEngine {
    return this.Provider
      ? DashboardEngine.GetProviderInstance<DashboardEngine>(this.Provider, DashboardEngine) as DashboardEngine
      : DashboardEngine.Instance;
  }

  /** Shows an error message that clears itself after the given time. */
  private showTransientError(message: string, durationMs: number): void {
    this.clearErrorTimer();
    this.error = message;
    this.cdr.markForCheck();
    this.errorTimer = setTimeout(() => {
      this.errorTimer = null;
      this.error = null;
      this.cdr.markForCheck();
    }, durationMs);
  }

  private clearErrorTimer(): void {
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
  }

  public onCancel(): void {
    this.Result.emit({ saved: false });
  }
}
