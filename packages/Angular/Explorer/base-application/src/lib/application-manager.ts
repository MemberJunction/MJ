import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MJGlobal, MJEventType, UUIDsEqual } from '@memberjunction/global';
import { Metadata, ApplicationInfo, LogError, LogStatus, StartupManager, IMetadataProvider, PermissionConstrainedError } from '@memberjunction/core';
import { MJUserApplicationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseApplication } from './base-application';

/**
 * Represents a user's application configuration including visibility and order
 */
export interface UserAppConfig {
  app: BaseApplication;
  userAppId: string;
  sequence: number;
  isActive: boolean;
}

/**
 * Manages application instances and active application state.
 *
 * Loads applications filtered by the user's UserApplication records.
 * If user has no UserApplication records, auto-creates them from DefaultForNewUser apps.
 * Orders applications by UserApplication.Sequence.
 */
@Injectable({
  providedIn: 'root'
})
export class ApplicationManager {
  private static _recoveryAttempted = false;
  private applications$ = new BehaviorSubject<BaseApplication[]>([]);
  private allApplications$ = new BehaviorSubject<BaseApplication[]>([]);
  private userAppConfigs$ = new BehaviorSubject<UserAppConfig[]>([]);
  private activeApp$ = new BehaviorSubject<BaseApplication | null>(null);
  private loading$ = new BehaviorSubject<boolean>(false);
  private initialized = false;

  /** Resolves when loadApplications() has completed successfully */
  private _readyResolve!: () => void;
  private _readyPromise = new Promise<void>(resolve => { this._readyResolve = resolve; });

  /**
   * Returns a promise that resolves when applications have been loaded and the manager is ready.
   * Safe to call multiple times — returns the same promise.
   */
  WhenReady(): Promise<void> {
    return this._readyPromise;
  }

  /**
   * Observable of user's active applications (filtered and ordered by UserApplication)
   */
  get Applications(): Observable<BaseApplication[]> {
    return this.applications$.asObservable();
  }

  /**
   * Observable of ALL applications in the system (unfiltered)
   */
  get AllApplications(): Observable<BaseApplication[]> {
    return this.allApplications$.asObservable();
  }

  /**
   * Observable of user's application configurations (includes sequence, isActive)
   */
  get UserAppConfigs(): Observable<UserAppConfig[]> {
    return this.userAppConfigs$.asObservable();
  }

  /**
   * Observable of the currently active application
   */
  get ActiveApp(): Observable<BaseApplication | null> {
    return this.activeApp$.asObservable();
  }

  /**
   * Observable of loading state
   */
  get Loading(): Observable<boolean> {
    return this.loading$.asObservable();
  }

  /**
   * Get user's active applications synchronously (filtered and ordered)
   */
  GetAllApps(): BaseApplication[] {
    return this.applications$.value;
  }

  /**
   * Get ALL applications synchronously (unfiltered)
   */
  GetAllSystemApps(): BaseApplication[] {
    return this.allApplications$.value;
  }

  /**
   * Get all applications the current user's roles grant access to.
   * Filters out apps where ApplicationRole records exist but the user's roles lack CanAccess.
   */
  GetAuthorizedSystemApps(): BaseApplication[] {
    const engine = UserInfoEngine.Instance;
    return this.allApplications$.value.filter(app => engine.UserHasApplicationAccess(app.ID));
  }

  /**
   * Get user's application configurations synchronously
   */
  GetUserAppConfigs(): UserAppConfig[] {
    return this.userAppConfigs$.value;
  }

  /**
   * Get active application synchronously
   */
  GetActiveApp(): BaseApplication | null {
    return this.activeApp$.value;
  }

  /**
   * Optional explicit metadata provider. When set, all provider lookups
   * use this instead of falling back to `Metadata.Provider`. This is the
   * threading point for multi-provider Angular apps — the shell calls
   * `setProvider(this.ProviderToUse)` after the manager is acquired from DI.
   */
  private _provider: IMetadataProvider | null = null;

  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  constructor() {
    this.Initialize();
  }

  /**
   * Initialize the application manager by subscribing to the LoggedIn event.
   * Applications are loaded when the event fires, ensuring metadata is ready.
   * Also subscribes to UserInfoEngine data changes to auto-sync when user apps change.
   */
  Initialize(): void {
    if (this.initialized) {
      return;
    }

    // Subscribe with replay (true) to catch the event even if it already fired
    MJGlobal.Instance.GetEventListener(true).subscribe(async (event) => {
      if (event.event === MJEventType.LoggedIn) {
        await StartupManager.Instance.Startup() // make sure this is done
        this.loadApplications();
        this.subscribeToEngineChanges();
      }
    });
  }

  /**
   * Subscribe to UserInfoEngine data changes to automatically sync our observables
   * when UserApplication records are modified.
   *
   * Match on EntityName (the stable public identifier) rather than PropertyName —
   * PropertyName is the engine's internal backing-field name (e.g. `_UserApplications`
   * with an underscore prefix), which is an implementation detail that has bitten
   * consumers before. EntityName is the documented contract on every config and
   * never changes shape.
   */
  private subscribeToEngineChanges(): void {
    const engine = UserInfoEngine.Instance;
    engine.DataChange$.subscribe(event => {
      // When UserApplications data changes in the engine, sync our observables
      if (event.config.EntityName?.trim().toLowerCase() === 'mj: user applications') {
        this.syncFromEngine();
      }
    });
  }

  /**
   * Sync our BehaviorSubjects with the current data from UserInfoEngine.
   * Called when the engine emits a data change event for UserApplications.
   */
  private syncFromEngine(): void {
    const allApps = this.allApplications$.value;
    const engine = UserInfoEngine.Instance;
    if (engine.IsPermissionConstrained) return; // No data available — nothing to sync
    const userApps = engine.UserApplications;

    // Build a map for quick lookup
    const appMap = new Map<string, BaseApplication>();
    for (const app of allApps) {
      appMap.set(app.ID, app);
    }

    // Build user's filtered and ordered app list
    const userAppConfigs: UserAppConfig[] = [];
    const activeApps: BaseApplication[] = [];

    for (const userApp of userApps) {
      const app = appMap.get(userApp.ApplicationID);
      if (app && userApp.IsActive && engine.UserHasApplicationAccess(userApp.ApplicationID)) {
        userAppConfigs.push({
          app,
          userAppId: userApp.ID,
          sequence: userApp.Sequence,
          isActive: userApp.IsActive
        });
        activeApps.push(app);
      }
    }

    this.userAppConfigs$.next(userAppConfigs);
    this.applications$.next(activeApps);
  }

  /**
   * Reload the user's application configuration.
   * Call this after changes to UserApplication records to refresh the app list.
   *
   * Reads engine.UserApplications and rebuilds our derived observables. The engine's
   * own event-driven refresh (via subscribeToEngineChanges + the UserApplications
   * config's short DebounceTime) keeps the underlying data fresh — we no longer need
   * a synchronous force-refresh here, which previously triggered NG0100 in callers
   * with `@if`/`@for` bindings whose values mutate during their save loop.
   */
  async ReloadUserApplications(): Promise<void> {
    this.loading$.next(true);

    try {
      await this.loadUserApplicationConfig();
    } finally {
      this.loading$.next(false);
    }
  }

  /**
   * Load applications from metadata, filtered and ordered by user's UserApplication records.
   * If user has no UserApplication records, auto-creates them from DefaultForNewUser apps.
   */
  private async loadApplications(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.loading$.next(true);

    try {
      const md = this.Provider;
      const appInfoList: ApplicationInfo[] = md.Applications;

      // First, create BaseApplication instances for ALL apps
      const allApps: BaseApplication[] = [];

      for (const appInfo of appInfoList) {
        // Only create instances for Active applications
        if (appInfo.Status !== 'Active') {
          continue;
        }

        const args = {
          ID: appInfo.ID,
          Name: appInfo.Name,
          Description: appInfo.Description || '',
          Icon: appInfo.Icon || '',
          Color: appInfo.Color,
          DefaultNavItems: appInfo.DefaultNavItems,
          ClassName: appInfo.ClassName,
          DefaultSequence: appInfo.DefaultSequence,
          Status: appInfo.Status,
          NavigationStyle: appInfo.NavigationStyle,
          TopNavLocation: appInfo.TopNavLocation,
          HideNavBarIconWhenActive: appInfo.HideNavBarIconWhenActive,
          Path: appInfo.Path || '',
          AutoUpdatePath: appInfo.AutoUpdatePath
        };

        let app: BaseApplication | null;
        if (appInfo.ClassName && appInfo.ClassName.trim().length > 0) {
          app = await MJGlobal.Instance.ClassFactory.CreateInstanceAsync<BaseApplication>(
            BaseApplication,
            appInfo.ClassName,
            args
          );
        }
        else {
          // no class provided in app definition.
          app = new BaseApplication(args)
        }

        if (app) {
          // should always get here unless failure to load registered sub-class but CreateInstance has
          // fallback to base class anyway so should always get here
          if (this._provider) {
            app.Provider = this._provider;
          }
          allApps.push(app);
        }
      }

      this.allApplications$.next(allApps);

      // Load and apply user's app configuration
      await this.loadUserApplicationConfig();

      // Recovery check: if no active apps but metadata has Active applications,
      // the engine may have failed to load UserApplications (e.g., cache corruption).
      // Attempt one recovery by force-refreshing UserInfoEngine before giving up.
      const activeApps = this.applications$.value;
      const hasMetadataApps = md.Applications.some(a => a.Status === 'Active');
      if (activeApps.length === 0 && hasMetadataApps && !ApplicationManager._recoveryAttempted) {
        ApplicationManager._recoveryAttempted = true;
        const activeAppCount = md.Applications.filter(a => a.Status === 'Active').length;
        const engineHealthy = UserInfoEngine.Instance.AllPropertiesLoadedSuccessfully;
        const userAppCount = UserInfoEngine.Instance.UserApplications?.length ?? 0;
        LogStatus(
          `ApplicationManager: Recovery triggered — ` +
          `activeApps=0, metadataActiveApps=${activeAppCount}, ` +
          `engineHealthy=${engineHealthy}, userAppRecords=${userAppCount}`
        );
        await this.attemptRecovery();
      }

      this.initialized = true;
      this._readyResolve();

    } catch (error) {
      // Resolve even on failure so waiters don't hang forever — they'll see initialized=false
      this._readyResolve();
      LogError('Failed to load applications:', undefined, error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.loading$.next(false);
    }
  }

  /**
   * Load user's UserApplication records and update the filtered/ordered app list.
   * This can be called to refresh after configuration changes.
   */
  private async loadUserApplicationConfig(): Promise<void> {
    const md = this.Provider;
    const allApps = this.allApplications$.value;

    // Build a map for quick lookup
    const appMap = new Map<string, BaseApplication>();
    for (const app of allApps) {
      appMap.set(app.ID, app);
    }

    // Load user's UserApplication records using UserInfoEngine for caching
    const engine = UserInfoEngine.Instance;

    // If the engine can't read user application data, skip the self-healing path —
    // a permission-denied user is NOT the same as a new user with no records.
    if (engine.IsPermissionConstrained) {
      LogStatus(`${this.constructor.name}: UserInfoEngine is permission-constrained, skipping application config load`);
      this.userAppConfigs$.next([]);
      this.applications$.next([]);
      return;
    }

    let userApps: MJUserApplicationEntity[] = engine.UserApplications;

    // Self-healing: If user has no UserApplication records, create from DefaultForNewUser apps
    if (userApps.length === 0) {
      LogStatus(`User ${md.CurrentUser.Name} has no UserApplication records, creating from DefaultForNewUser apps`);
      userApps = await this.createDefaultUserApplications();
    }

    // Build user's filtered and ordered app list
    const userAppConfigs: UserAppConfig[] = [];
    const activeApps: BaseApplication[] = [];

    for (const userApp of userApps) {
      const app = appMap.get(userApp.ApplicationID);
      if (app && userApp.IsActive && engine.UserHasApplicationAccess(userApp.ApplicationID)) {
        userAppConfigs.push({
          app,
          userAppId: userApp.ID,
          sequence: userApp.Sequence,
          isActive: userApp.IsActive
        });
        activeApps.push(app);
      }
    }

    this.userAppConfigs$.next(userAppConfigs);
    this.applications$.next(activeApps);
  }

  /**
   * Creates UserApplication records for apps with DefaultForNewUser=true and Status='Active'.
   * Called when a user has no existing UserApplication records (self-healing).
   * Delegates to UserInfoEngine for the actual creation.
   */
  private async createDefaultUserApplications(): Promise<MJUserApplicationEntity[]> {
    const engine = UserInfoEngine.Instance;
    return await engine.CreateDefaultApplications();
  }

  /**
   * One-shot recovery attempt when the initial load produces zero apps despite
   * Active applications existing in metadata. Force-refreshes UserInfoEngine
   * to bypass any corrupted cache, then re-runs the user app configuration
   * (which includes the self-healing path for new users).
   */
  private async attemptRecovery(): Promise<void> {
    try {
      const engine = UserInfoEngine.Instance;
      await engine.Config(true);
      await this.loadUserApplicationConfig();

      const recoveredCount = this.applications$.value.length;
      const engineHealthy = engine.AllPropertiesLoadedSuccessfully;
      if (recoveredCount > 0) {
        LogStatus(`ApplicationManager: Recovery succeeded — ${recoveredCount} apps loaded, engineHealthy=${engineHealthy}`);
      } else {
        LogError(`ApplicationManager: Recovery completed but still 0 apps — engineHealthy=${engineHealthy}`);
      }
    } catch (error) {
      LogError('ApplicationManager: Recovery attempt failed:', undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Set the active application by ID
   */
  async SetActiveApp(appId: string): Promise<void> {
    const currentApp = this.activeApp$.value;
    const newApp = this.applications$.value.find(a => UUIDsEqual(a.ID, appId));

    if (!newApp) {
      return;
    }

    if (UUIDsEqual(currentApp?.ID, appId)) {
      return; // Already active
    }

    // Deactivate current app
    if (currentApp) {
      await currentApp.OnDeactivate();
    }

    // Activate new app
    await newApp.OnActivate();
    this.activeApp$.next(newApp);
  }

  /**
   * Get application by ID
   */
  GetAppById(appId: string): BaseApplication | undefined {
    return this.applications$.value.find(a => UUIDsEqual(a.ID, appId));
  }

  /**
   * Canonical `/app/:slug` URL for an application. Uses the app's `Path`
   * (what {@link GetAppByPath} matches on), falling back to `Name`, and
   * url-encodes the segment. This is the single source of truth for app URLs —
   * never hand-roll a slug from `Name` (e.g. spaces→hyphens), because a custom
   * `Path` would then diverge from the URL and `GetAppByPath` would fail to
   * resolve it (broken navigation / redirect loops).
   */
  GetAppUrl(app: BaseApplication): string {
    return `/app/${encodeURIComponent(app.Path || app.Name)}`;
  }

  /**
   * Get application by name
   */
  GetAppByName(name: string): BaseApplication | undefined {
    return this.applications$.value.find(a => a.Name === name);
  }

  /**
   * Get application by URL path slug.
   * Matches case-insensitively against the app's Path property.
   * Falls back to Name match if Path is not found (for backwards compatibility).
   */
  GetAppByPath(path: string): BaseApplication | undefined {
    const normalizedPath = path.trim().toLowerCase();

    // First try exact path match
    const pathMatch = this.applications$.value.find(a =>
      a.Path?.toLowerCase() === normalizedPath
    );

    if (pathMatch) {
      return pathMatch;
    }

    // Fallback: try matching by name (for backwards compatibility with old URLs)
    return this.applications$.value.find(a =>
      a.Name.trim().toLowerCase() === normalizedPath
    );
  }

  /**
   * Get applications that should appear in the Nav Bar (NavigationStyle = 'Nav Bar' or 'Both')
   * filtered by TopNavLocation.
   */
  GetNavBarApps(location: 'Left of App Switcher' | 'Left of User Menu'): BaseApplication[] {
    return this.applications$.value.filter(app =>
      (app.NavigationStyle === 'Nav Bar' || app.NavigationStyle === 'Both') &&
      app.TopNavLocation === location
    );
  }

  /**
   * Get applications that should appear in the App Switcher (NavigationStyle = 'App Switcher' or 'Both')
   */
  GetAppSwitcherApps(): BaseApplication[] {
    return this.applications$.value.filter(app =>
      app.NavigationStyle === 'App Switcher' || app.NavigationStyle === 'Both'
    );
  }

  /**
   * Check if an app exists in the system by path or name (case-insensitive).
   * Returns the app from allApplications$ if found, regardless of user access.
   */
  GetSystemAppByPath(path: string): BaseApplication | undefined {
    const normalizedPath = path.trim().toLowerCase();

    // First try exact path match
    const pathMatch = this.allApplications$.value.find(a =>
      a.Path?.toLowerCase() === normalizedPath
    );

    if (pathMatch) {
      return pathMatch;
    }

    // Fallback: try matching by name
    return this.allApplications$.value.find(a =>
      a.Name.trim().toLowerCase() === normalizedPath
    );
  }

  /**
   * Check if a system app is inactive (Status !== 'Active').
   * Delegates to UserInfoEngine for the metadata lookup.
   */
  IsAppInactive(path: string): boolean {
    const engine = UserInfoEngine.Instance;
    const appInfo = engine.FindApplicationByPathOrName(path);
    return appInfo != null && engine.IsApplicationInactive(appInfo.ID);
  }

  /**
   * Determine why a user cannot access an app by its URL path.
   * Uses UserInfoEngine for core access checking logic.
   * Returns detailed access information for error handling.
   */
  CheckAppAccess(path: string): AppAccessResult {
    const engine = UserInfoEngine.Instance;

    // Step 1: Check if app exists in metadata at all
    const appInfo = engine.FindApplicationByPathOrName(path);

    if (!appInfo) {
      return {
        status: 'not_found',
        message: `The application "${path}" does not exist.`,
        appName: path
      };
    }

    // Step 2: Check if app is inactive
    if (engine.IsApplicationInactive(appInfo.ID)) {
      return {
        status: 'inactive',
        message: `The application "${appInfo.Name}" is currently inactive.`,
        appName: appInfo.Name,
        appId: appInfo.ID
      };
    }

    // Step 3: Check user's access status via engine
    const accessStatus = engine.CheckUserApplicationAccess(appInfo.ID);

    switch (accessStatus) {
      case 'installed_active': {
        // User has access - find the BaseApplication instance
        const baseApp = this.applications$.value.find(a => UUIDsEqual(a.ID, appInfo.ID));
        return {
          status: 'accessible',
          message: 'User has access to this app',
          appName: appInfo.Name,
          appId: appInfo.ID,
          app: baseApp
        };
      }

      case 'not_authorized':
        return {
          status: 'not_authorized',
          message: `You do not have the required role to access "${appInfo.Name}".`,
          appName: appInfo.Name,
          appId: appInfo.ID,
          canInstall: false
        };

      case 'installed_inactive':
        return {
          status: 'disabled',
          message: `You have disabled "${appInfo.Name}" in your app configuration.`,
          appName: appInfo.Name,
          appId: appInfo.ID,
          canInstall: true
        };

      case 'not_installed':
      default:
        return {
          status: 'not_installed',
          message: `You don't have "${appInfo.Name}" installed.`,
          appName: appInfo.Name,
          appId: appInfo.ID,
          canInstall: true
        };
    }
  }

  /**
   * Install an application for the current user by creating a UserApplication record.
   * Delegates to UserInfoEngine for the actual installation.
   * Returns the newly created UserApplication entity.
   */
  async InstallAppForUser(appId: string): Promise<MJUserApplicationEntity | null> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity save triggers a refresh,
    // which our subscribeToEngineChanges() handler will pick up and call syncFromEngine()
    return await engine.InstallApplication(appId);
  }

  /**
   * Enable an existing but disabled UserApplication record.
   * Delegates to UserInfoEngine for the actual enabling.
   * Sync happens automatically via DataChange$ subscription.
   */
  async EnableAppForUser(appId: string): Promise<boolean> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity save triggers a refresh
    return await engine.EnableApplication(appId);
  }

  /**
   * Disable an application for the current user.
   * Delegates to UserInfoEngine for the actual disabling.
   * Sync happens automatically via DataChange$ subscription.
   */
  async DisableAppForUser(appId: string): Promise<boolean> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity save triggers a refresh
    return await engine.DisableApplication(appId);
  }

  /**
   * Uninstall an application for the current user.
   * Delegates to UserInfoEngine for the actual uninstallation.
   * Sync happens automatically via DataChange$ subscription.
   */
  async UninstallAppForUser(appId: string): Promise<boolean> {
    const engine = UserInfoEngine.Instance;
    // The engine will emit DataChange$ after the entity delete triggers a refresh
    return await engine.UninstallApplication(appId);
  }
}

/**
 * Result of checking a user's access to an application
 */
export interface AppAccessResult {
  /** Status of the access check */
  status: 'accessible' | 'not_found' | 'inactive' | 'not_installed' | 'disabled' | 'not_authorized';
  /** Human-readable message describing the access status */
  message: string;
  /** Name of the application (if found) */
  appName: string;
  /** ID of the application (if found) */
  appId?: string;
  /** The BaseApplication instance (if accessible) */
  app?: BaseApplication;
  /** Whether the user can install/enable this app */
  canInstall?: boolean;
}
