import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  BaseEntityEvent,
  CompositeKey,
  EntityInfo,
  IMetadataProvider,
  LogError,
  Metadata,
  RunView,
} from '@memberjunction/core';
import {
  MJLearningPathEntity,
  MJLearningPathTourEntity,
  MJTourEntity,
  MJTourRunEntity,
  TourEngine,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { GroupByUUID, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ApplicationManager, BaseApplication, NavItem, WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { NavigationService, ResourceLoadedEvent } from '@memberjunction/ng-shared';
import type { MJTourHostComponent } from '@memberjunction/ng-tours';
import {
  ITourAnchor,
  ITourAnchorDomBridge,
  ITourHost,
  ITourHostAgentBridge,
  LearningPathDefinition,
  TourActiveContextSnapshot,
  TourAgentToolkit,
  TourDefinition,
  TourEligibilityEvaluator,
  TourEntityEventPayload,
  TourHostCapabilities,
  TourLaunchSource,
  TourLocation,
  TourNavigationIntent,
  TourPreferences,
  TourPrincipal,
  TourResolvedAnchorInfo,
  TourRunRecord,
  TourSession,
  TourSessionGuideMode,
  TourSessionView,
  TourSignals,
  TourVisibleAnchorInfo,
} from '@memberjunction/tours-runtime';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  combineLatest,
  firstValueFrom,
  of,
  race,
  timer,
} from 'rxjs';
import { distinctUntilChanged, filter, map, take } from 'rxjs/operators';

/** User setting key for Guided Tour preferences stored via `UserInfoEngine`. */
export const TOUR_PREFERENCES_SETTING_KEY = 'mj.tours.preferences.v1';

/** Default preferences when the user has not saved custom tour settings yet. */
export const DEFAULT_TOUR_PREFERENCES: TourPreferences = {
  OffersEnabled: true,
  PreferredGuideMode: 'Visual',
  ShowBeacons: true,
};

/** Options accepted by {@link ExplorerTourHost.StartTour}. */
export interface ExplorerStartTourOptions {
  Mode?: TourSessionGuideMode;
  LaunchSource?: TourLaunchSource;
  StartAtStepKey?: string;
  /** Optional in-memory tour definition (used by Tour Studio preview before publish). */
  TourOverride?: TourDefinition;
  /** Optional simulated role names for Tour Studio role preview. */
  SimulatedRoles?: string[];
}

/**
 * Learning path summary with live per-user completion progress, used by the Shell
 * "Tours & Help" launcher and the Home learning-path checklist card.
 */
export interface ExplorerLearningPathSummary {
  Path: LearningPathDefinition;
  TotalCount: number;
  CompletedCount: number;
  RequiredTotalCount: number;
  RequiredCompletedCount: number;
  PercentComplete: number;
  NextTourKey: string | null;
  NextTourName: string | null;
  Tours: Array<{
    TourKey: string;
    Name: string;
    Description: string;
    EstimatedMinutes?: number;
    Sequence: number;
    IsRequired: boolean;
    Completed: boolean;
    InProgress: boolean;
  }>;
}

/**
 * MJ Explorer host adapter implementing `ITourHost` (`@memberjunction/tours-runtime`).
 *
 * Bridges:
 * - `Location$` from `ApplicationManager.ActiveApp` + `WorkspaceStateManager.Configuration`
 * - `Navigate(intent)` via `NavigationService` (`SwitchToApp`, `OpenEntityRecord`, `FindNavItem`),
 *   awaiting `NavigationService.ResourceLoaded$` with a bounded timeout fallback
 * - `Principal` from the provider's authenticated `UserInfo` + entity permissions
 * - `AttachAgentBridge(bridge)` wiring `TourAgentToolkit` global + session tools and `AppContextSnapshot`
 * - `BaseEntity` save/delete events -> `TourSession` `EntityEvents$`
 * - User preferences persisted via `UserInfoEngine` (`mj.tours.preferences.v1`)
 */
@Injectable({
  providedIn: 'root',
})
export class ExplorerTourHost implements ITourHost, OnDestroy {
  private readonly appManager = inject(ApplicationManager, { optional: true });
  private readonly workspaceManager = inject(WorkspaceStateManager, { optional: true });
  private readonly navigationService = inject(NavigationService, { optional: true });

  private provider: IMetadataProvider | null = null;
  private toolkit: TourAgentToolkit | null = null;
  private agentBridge: ITourHostAgentBridge | null = null;
  private tourHostComponent: MJTourHostComponent | null = null;
  private attachedAnchorBridge: ITourAnchorDomBridge | null = null;
  private simulatedRolesOverride: string[] | null = null;
  private currentLocationSnapshot: TourLocation = {};
  private sessionViewSub: Subscription | null = null;
  private locationSub: Subscription | null = null;
  private entityEventSub: { unsubscribe: () => void } | null = null;
  private signalSub: Subscription | null = null;

  private readonly eligibilityEvaluator = new TourEligibilityEvaluator();
  private readonly entityEventsSubject = new Subject<TourEntityEventPayload>();
  private readonly activeSessionSubject = new BehaviorSubject<TourSession | null>(null);
  private readonly activeSessionViewSubject = new BehaviorSubject<TourSessionView | null>(null);

  public readonly Capabilities: TourHostCapabilities = {
    Navigation: 'MJ App',
    EntityEvents: true,
    MJForms: true,
    Angular: true,
    Agent: 'Chat and Voice',
    Persistence: 'MJ User',
  };

  public readonly Location$: Observable<TourLocation>;
  public readonly ActiveSession$: Observable<TourSession | null> = this.activeSessionSubject.asObservable();
  public readonly ActiveSessionView$: Observable<TourSessionView | null> = this.activeSessionViewSubject.asObservable();

  constructor() {
    const activeApp$ = this.appManager?.ActiveApp ?? of(null);
    const workspaceConfig$ = this.workspaceManager?.Configuration ?? of(null);
    this.Location$ = combineLatest([activeApp$, workspaceConfig$]).pipe(
      map(([activeApp, config]) => this.buildLocation(activeApp, config?.tabs ?? [], config?.activeTabId ?? null)),
      distinctUntilChanged((a, b) => locationsEqual(a, b)),
    );

    this.locationSub = this.Location$.subscribe((loc) => {
      this.currentLocationSnapshot = loc;
      void this.pushAgentContextSnapshot();
    });

    this.subscribeGlobalEntityEvents();
    this.signalSub = TourSignals.Instance.Signals$.subscribe((evt) => {
      if (evt.SignalKey === 'core.tour.launchRequest' && evt.Payload) {
        const tourKey = typeof evt.Payload['tourKey'] === 'string' ? evt.Payload['tourKey'] : '';
        if (!tourKey) {
          return;
        }
        const mode = evt.Payload['mode'] as TourSessionGuideMode | undefined;
        const launchSource = evt.Payload['launchSource'] as TourLaunchSource | undefined;
        const startAtStepKey = typeof evt.Payload['startAtStepKey'] === 'string' ? evt.Payload['startAtStepKey'] : undefined;
        const tourOverride = evt.Payload['tourOverride'] as TourDefinition | undefined;
        const simulatedRoles = Array.isArray(evt.Payload['simulatedRoles'])
          ? (evt.Payload['simulatedRoles'] as string[])
          : undefined;
        void this.StartTour(tourKey, {
          Mode: mode,
          LaunchSource: launchSource,
          StartAtStepKey: startAtStepKey,
          TourOverride: tourOverride,
          SimulatedRoles: simulatedRoles,
        });
      }
    });
  }

  public ngOnDestroy(): void {
    this.locationSub?.unsubscribe();
    this.sessionViewSub?.unsubscribe();
    this.signalSub?.unsubscribe();
    this.entityEventSub?.unsubscribe();
  }

  /**
   * Thread the active `IMetadataProvider` from the shell / dashboard host so all
   * `TourEngine`, `UserInfoEngine`, and `RunView` lookups respect multi-provider trees.
   */
  public SetProvider(provider: IMetadataProvider): void {
    if (this.provider !== provider) {
      this.provider = provider;
      this.toolkit = null;
      if (this.agentBridge) {
        void this.ensureToolkitAndAttachBridge();
      }
    }
  }

  private get providerToUse(): IMetadataProvider {
    return this.provider ?? Metadata.Provider;
  }

  private get tourEngine(): TourEngine {
    return TourEngine.GetProviderInstance<TourEngine>(this.providerToUse, TourEngine) as TourEngine;
  }

  private get userInfoEngine(): UserInfoEngine {
    return UserInfoEngine.GetProviderInstance<UserInfoEngine>(this.providerToUse, UserInfoEngine) as UserInfoEngine;
  }

  public get Principal(): TourPrincipal {
    const md = this.providerToUse;
    const user = md.CurrentUser;
    if (!user && !this.simulatedRolesOverride) {
      return { Kind: 'Anonymous' };
    }
    const roles = this.simulatedRolesOverride
      ? [...this.simulatedRolesOverride]
      : (user?.UserRoles ?? []).map((r) => r.Role).filter((r): r is string => Boolean(r));
    const permissions: NonNullable<Extract<TourPrincipal, { Kind: 'MJUser' }>['Permissions']> = {};
    if (user) {
      for (const entity of md.Entities ?? []) {
        const perms = entity.GetUserPermisions(user);
        permissions[entity.Name] = {
          CanRead: perms.CanRead,
          CanCreate: perms.CanCreate,
          CanUpdate: perms.CanUpdate,
          CanDelete: perms.CanDelete,
        };
      }
    }
    return {
      Kind: 'MJUser',
      UserId: user?.ID ?? 'preview-user',
      Roles: roles,
      Permissions: permissions,
    };
  }

  public GetCurrentLocation(): TourLocation {
    return this.currentLocationSnapshot;
  }

  public GetInstalledApplications(): string[] {
    return (this.appManager?.GetAllApps() ?? []).map((a) => a.Name);
  }

  /**
   * Carry out a tour navigation intent via `NavigationService` and await `ResourceLoaded$`
   * (with a sensible timeout fallback so `Prepare` resolves reliably even for cached tabs).
   */
  public async Navigate(intent: TourNavigationIntent): Promise<boolean> {
    try {
      const md = this.providerToUse;
      const navService = this.navigationService;

      // 1. Open a specific entity record
      if (intent.EntityName && intent.RecordId && navService) {
        const entityInfo: EntityInfo | undefined = md.EntityByName(intent.EntityName);
        const compositeKey = CompositeKey.FromURLSegment(entityInfo, intent.RecordId);
        const waitForLoad = this.awaitResourceLoaded(
          (evt) => evt.ResourceType.toLowerCase() === 'records' && (!evt.RecordId || evt.RecordId === intent.RecordId),
          4500,
        );
        navService.OpenEntityRecord(intent.EntityName, compositeKey);
        await waitForLoad;
        return true;
      }

      // 2. Switch to an application (and optionally a nav item by stable Key or DriverClass)
      let targetApp: BaseApplication | undefined;
      if (this.appManager) {
        if (intent.ApplicationID) {
          targetApp =
            this.appManager.GetAppById(intent.ApplicationID) ??
            this.appManager.GetAllApps().find((a) => UUIDsEqual(a.ID, intent.ApplicationID));
        } else if (intent.ApplicationName) {
          targetApp = this.appManager.GetAppByName(intent.ApplicationName) ?? undefined;
        } else if (intent.NavItemKey || intent.DriverClass) {
          targetApp = this.appManager.GetActiveApp() ?? undefined;
        }
      }

      if (targetApp && navService) {
        let navItem: NavItem | undefined;
        const lookupKey = intent.NavItemKey || intent.DriverClass;
        if (lookupKey) {
          navItem = await navService.FindNavItem(targetApp.ID, lookupKey);
        }

        const waitForLoad = this.awaitResourceLoaded(
          (evt) =>
            UUIDsEqual(evt.AppId, targetApp?.ID) &&
            (!intent.DriverClass || evt.DriverClass === intent.DriverClass),
          4500,
        );
        await navService.SwitchToApp(targetApp.ID, navItem?.Label, intent.QueryParams);
        await waitForLoad;
        return true;
      }

      // 3. Fallback URL navigation inside Explorer
      if (intent.Url && typeof window !== 'undefined') {
        if (/^https?:\/\//i.test(intent.Url)) {
          window.open(intent.Url, '_blank', 'noopener,noreferrer');
          return true;
        }
        window.history.pushState({}, '', intent.Url);
        return true;
      }

      return false;
    } catch (error) {
      LogError(`ExplorerTourHost.Navigate failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /** Attaches the root `<mj-tour-host>` component and DOM anchor bridge from the browser shell. */
  public AttachTourHostComponent(
    hostComponent: MJTourHostComponent | undefined,
    anchorBridge?: ITourAnchorDomBridge,
  ): void {
    this.tourHostComponent = hostComponent ?? null;
    if (anchorBridge) {
      this.attachedAnchorBridge = anchorBridge;
    }
  }

  /** Syncs active session changes originated directly on `<mj-tour-host>` (e.g., presenter NextTour). */
  public SyncFromTourHostComponent(): void {
    const session = this.tourHostComponent?.ActiveSession ?? null;
    if (session === this.activeSessionSubject.getValue()) {
      return;
    }
    if (this.toolkit) {
      this.toolkit.SetActiveSession(session);
    } else {
      this.handleSessionChanged(session);
    }
  }

  private readonly anchorBridgeDelegate: ITourAnchorDomBridge = {
    ResolveAnchor: async (anchor: ITourAnchor, timeoutMs?: number): Promise<TourResolvedAnchorInfo> =>
      this.attachedAnchorBridge
        ? this.attachedAnchorBridge.ResolveAnchor(anchor, timeoutMs)
        : { Found: false, Resolution: 'Failed' },
    GetVisibleAnchors: (): TourVisibleAnchorInfo[] =>
      this.attachedAnchorBridge ? this.attachedAnchorBridge.GetVisibleAnchors() : [],
    HighlightAnchor: async (anchorKey: string, caption?: string) =>
      this.attachedAnchorBridge?.HighlightAnchor
        ? this.attachedAnchorBridge.HighlightAnchor(anchorKey, caption)
        : { Success: false, ErrorMessage: 'DOM anchor bridge is not attached.' },
    WaitForAnchorInteraction: async (
      anchor: ITourAnchor,
      interaction: 'click' | 'focus' | 'change' | 'input' | 'any',
      signal?: AbortSignal,
    ): Promise<boolean> =>
      this.attachedAnchorBridge?.WaitForAnchorInteraction
        ? this.attachedAnchorBridge.WaitForAnchorInteraction(anchor, interaction, signal)
        : false,
    GetFieldValue: (entityName: string | undefined, fieldName: string): unknown =>
      this.attachedAnchorBridge?.GetFieldValue
        ? this.attachedAnchorBridge.GetFieldValue(entityName, fieldName)
        : undefined,
  };

  public AttachAgentBridge(bridge: ITourHostAgentBridge): void {
    this.agentBridge = bridge;
    void this.ensureToolkitAndAttachBridge();
  }

  /** Lazily initializes `TourAgentToolkit` over `TourEngine` and the attached DOM anchor bridge. */
  public async EnsureToolkit(): Promise<TourAgentToolkit> {
    if (this.toolkit) {
      return this.toolkit;
    }
    const engine = this.tourEngine;
    await engine.Config(false, this.providerToUse.CurrentUser, this.providerToUse).catch(() => undefined);

    this.toolkit = new TourAgentToolkit({
      Host: this,
      DefinitionSource: engine,
      ProgressStore: engine,
      AnchorBridge: this.anchorBridgeDelegate,
      OnSessionChanged: (session) => this.handleSessionChanged(session),
    });
    return this.toolkit;
  }

  private async ensureToolkitAndAttachBridge(): Promise<void> {
    const bridge = this.agentBridge;
    if (!bridge) {
      return;
    }
    const toolkit = await this.EnsureToolkit();
    bridge.RegisterGlobalTools(toolkit.GetGlobalTools());
    await this.pushAgentContextSnapshot();
  }

  private handleSessionChanged(session: TourSession | null): void {
    if (session !== null && session === this.activeSessionSubject.getValue()) {
      return;
    }
    this.sessionViewSub?.unsubscribe();
    this.sessionViewSub = null;
    this.activeSessionSubject.next(session);

    if (!session) {
      this.simulatedRolesOverride = null;
      this.activeSessionViewSubject.next(null);
      this.agentBridge?.ClearSessionTools();
      void this.pushAgentContextSnapshot();
      return;
    }

    this.activeSessionViewSubject.next(session.SessionView);
    this.sessionViewSub = session.SessionView$.subscribe((view) => {
      this.activeSessionViewSubject.next(view);
      if (
        view.Status === 'Completed' ||
        view.Status === 'Dismissed' ||
        view.Status === 'Snoozed' ||
        view.Status === 'Abandoned' ||
        view.Status === 'Failed'
      ) {
        this.simulatedRolesOverride = null;
        this.agentBridge?.ClearSessionTools();
      } else if (this.toolkit) {
        this.agentBridge?.RegisterSessionTools(this.toolkit.GetSessionTools());
      }
      void this.pushAgentContextSnapshot();
    });

    if (this.toolkit) {
      this.agentBridge?.RegisterSessionTools(this.toolkit.GetSessionTools());
    }
    void this.pushAgentContextSnapshot();
  }

  private async pushAgentContextSnapshot(): Promise<void> {
    if (!this.agentBridge?.UpdateContextSnapshot || !this.toolkit) {
      return;
    }
    try {
      const snapshot: TourActiveContextSnapshot = await this.toolkit.BuildActiveTourContextSnapshot();
      this.agentBridge.UpdateContextSnapshot(snapshot);
    } catch {
      // Non-fatal: context snapshot updates are best-effort during boot
    }
  }

  /**
   * Starts a guided tour by `TourKey` (or an explicit `TourOverride` for Tour Studio preview).
   */
  public async StartTour(
    tourKey: string,
    options: ExplorerStartTourOptions = {},
  ): Promise<TourSession | null> {
    const engine = this.tourEngine;
    await engine.Config(false, this.providerToUse.CurrentUser, this.providerToUse).catch(() => undefined);
    const toolkit = await this.EnsureToolkit();

    const location = this.GetCurrentLocation();
    let tour: TourDefinition | null = options.TourOverride ?? null;
    if (!tour) {
      tour =
        (await engine.GetTourByKey?.(tourKey)) ??
        (await engine.GetTours(location)).find((t) => t.TourKey === tourKey) ??
        null;
    }
    if (!tour) {
      return null;
    }

    const prefs = this.GetPreferences();
    const preferredMode: TourSessionGuideMode =
      options.Mode ??
      (tour.DefaultGuideMode === 'Chat' || tour.DefaultGuideMode === 'Voice' || tour.DefaultGuideMode === 'Visual'
        ? tour.DefaultGuideMode
        : prefs.PreferredGuideMode === 'Chat' || prefs.PreferredGuideMode === 'Voice'
          ? prefs.PreferredGuideMode
          : 'Visual');

    if (this.tourHostComponent) {
      this.simulatedRolesOverride = options.SimulatedRoles ?? null;
      const started = await this.tourHostComponent.Start(tour, {
        GuideMode: preferredMode,
        LaunchSource: options.LaunchSource ?? 'Launcher',
        StartAtStepKey: options.StartAtStepKey,
      });
      const session = this.tourHostComponent.ActiveSession;
      if (!started || !session) {
        this.simulatedRolesOverride = null;
        return null;
      }
      toolkit.SetActiveSession(session);
      this.handleSessionChanged(session);
      return session;
    }

    const hostForSession: ITourHost = options.SimulatedRoles
      ? this.createSimulatedRoleHost(options.SimulatedRoles)
      : this;

    const session = new TourSession({
      Tour: tour,
      Host: hostForSession,
      ProgressStore: engine,
      AnchorBridge: this.anchorBridgeDelegate,
      GuideMode: preferredMode,
      LaunchSource: options.LaunchSource ?? 'Launcher',
      InitialStepKey: options.StartAtStepKey,
      Locale: prefs.Locale,
      EntityEvents$: this.entityEventsSubject.asObservable(),
    });

    const directorToken = session.AttachDirector(preferredMode);
    const started = await session.Start();
    if (!started) {
      return null;
    }

    toolkit.SetActiveSession(session, directorToken);
    return session;
  }

  public async PauseActiveTour(): Promise<void> {
    if (this.tourHostComponent?.ActiveSession) {
      await this.tourHostComponent.Pause();
      return;
    }
    await this.activeSessionSubject.getValue()?.Pause();
  }

  public async ResumeActiveTour(): Promise<void> {
    if (this.tourHostComponent?.ActiveSession) {
      await this.tourHostComponent.Resume();
      return;
    }
    await this.activeSessionSubject.getValue()?.Resume();
  }

  public async StopActiveTour(reason?: string): Promise<void> {
    if (this.tourHostComponent?.ActiveSession) {
      await this.tourHostComponent.Stop(reason);
      this.toolkit?.SetActiveSession(null);
      return;
    }
    const session = this.activeSessionSubject.getValue();
    if (!session) {
      return;
    }
    await session.Dismiss(reason);
    this.toolkit?.SetActiveSession(null);
  }

  /** Returns eligible tours for the current location (or all eligible active tours). */
  public async GetEligibleTours(
    forCurrentLocation = true,
  ): Promise<Array<{ Tour: TourDefinition; RecommendedPrerequisites?: string[] }>> {
    const engine = this.tourEngine;
    await engine.Config(false, this.providerToUse.CurrentUser, this.providerToUse).catch(() => undefined);

    const location = this.GetCurrentLocation();
    const tours = await engine.GetTours(location);
    const runs = await engine.GetRuns();

    const ranked = this.eligibilityEvaluator.RankEligibleTours(tours, {
      Host: this,
      Location: location,
      Principal: this.Principal,
      Runs: runs,
      RequestedExplicitly: true,
    });

    const filtered = forCurrentLocation
      ? ranked.filter(({ Tour }) => this.matchesLocation(Tour, location))
      : ranked;

    return filtered.map(({ Tour, Result }) => ({
      Tour,
      RecommendedPrerequisites: Result.RecommendedPrerequisites,
    }));
  }

  /** Returns cached/persisted tour runs for the current user. */
  public async GetRuns(): Promise<TourRunRecord[]> {
    const engine = this.tourEngine;
    await engine.Config(false, this.providerToUse.CurrentUser, this.providerToUse).catch(() => undefined);
    return engine.GetRuns();
  }

  /**
   * Loads active learning paths and computes per-user completion progress using
   * `RunView.FromMetadataProvider(this.providerToUse)` and `TourEngine` runs.
   */
  public async GetLearningPathSummaries(): Promise<ExplorerLearningPathSummary[]> {
    const md = this.providerToUse;
    const rv = RunView.FromMetadataProvider(md);
    const userId = md.CurrentUser?.ID;

    const [pathsResult, pathToursResult, toursResult, runsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Learning Paths',
        ExtraFilter: `Status = 'Active'`,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
      },
      {
        EntityName: 'MJ: Learning Path Tours',
        OrderBy: 'Sequence ASC',
        ResultType: 'entity_object',
      },
      {
        EntityName: 'MJ: Tours',
        ExtraFilter: `Status = 'Active'`,
        ResultType: 'entity_object',
      },
      userId
        ? {
            EntityName: 'MJ: Tour Runs',
            ExtraFilter: `UserID = '${userId}'`,
            ResultType: 'entity_object',
          }
        : {
            EntityName: 'MJ: Tour Runs',
            ExtraFilter: '1 = 0',
            ResultType: 'entity_object',
          },
    ]);

    const paths = (pathsResult?.Results ?? []) as MJLearningPathEntity[];
    const pathTours = (pathToursResult?.Results ?? []) as MJLearningPathTourEntity[];
    const tours = (toursResult?.Results ?? []) as MJTourEntity[];
    const runs = (runsResult?.Results ?? []) as MJTourRunEntity[];

    const tourById = new Map<string, MJTourEntity>();
    for (const t of tours) {
      tourById.set(t.ID.toLowerCase(), t);
    }

    const completedTourIds = new Set<string>();
    const inProgressTourIds = new Set<string>();
    for (const r of runs) {
      const tid = r.TourID.toLowerCase();
      if (r.Status === 'Completed') {
        completedTourIds.add(tid);
      } else if (r.Status === 'In Progress') {
        inProgressTourIds.add(tid);
      }
    }

    const pathToursByPathId = GroupByUUID(pathTours, (pt) => pt.LearningPathID);
    const summaries: ExplorerLearningPathSummary[] = [];
    for (const lp of paths) {
      const members = [...(pathToursByPathId.Get(lp.ID) ?? [])]
        .sort((a, b) => a.Sequence - b.Sequence);

      const resolvedTours: ExplorerLearningPathSummary['Tours'] = [];
      for (const m of members) {
        const tourEntity = tourById.get(m.TourID.toLowerCase());
        if (!tourEntity) {
          continue;
        }
        const tid = tourEntity.ID.toLowerCase();
        resolvedTours.push({
          TourKey: tourEntity.TourKey,
          Name: tourEntity.Name,
          Description: tourEntity.Description ?? '',
          EstimatedMinutes: tourEntity.EstimatedMinutes ?? undefined,
          Sequence: m.Sequence,
          IsRequired: m.IsRequired,
          Completed: completedTourIds.has(tid),
          InProgress: inProgressTourIds.has(tid) && !completedTourIds.has(tid),
        });
      }

      if (resolvedTours.length === 0) {
        continue;
      }

      const completedCount = resolvedTours.filter((t) => t.Completed).length;
      const requiredTours = resolvedTours.filter((t) => t.IsRequired);
      const requiredCompletedCount = requiredTours.filter((t) => t.Completed).length;
      const nextTour =
        requiredTours.find((t) => !t.Completed) ??
        resolvedTours.find((t) => !t.Completed) ??
        null;

      summaries.push({
        Path: {
          ID: lp.ID,
          PathKey: lp.PathKey,
          Name: lp.Name,
          Description: lp.Description ?? undefined,
          ApplicationName: lp.Application ?? null,
          Status: lp.Status,
          Tours: resolvedTours.map((t) => ({
            TourKey: t.TourKey,
            Sequence: t.Sequence,
            IsRequired: t.IsRequired,
          })),
        },
        TotalCount: resolvedTours.length,
        CompletedCount: completedCount,
        RequiredTotalCount: requiredTours.length,
        RequiredCompletedCount: requiredCompletedCount,
        PercentComplete: Math.round((completedCount / resolvedTours.length) * 100),
        NextTourKey: nextTour?.TourKey ?? null,
        NextTourName: nextTour?.Name ?? null,
        Tours: resolvedTours,
      });
    }

    return summaries;
  }

  /** Reads per-user tour preferences from `UserInfoEngine` (`mj.tours.preferences.v1`). */
  public GetPreferences(): TourPreferences {
    const raw = this.userInfoEngine.GetSetting(TOUR_PREFERENCES_SETTING_KEY);
    if (!raw) {
      return { ...DEFAULT_TOUR_PREFERENCES };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<TourPreferences>;
      return {
        OffersEnabled: typeof parsed.OffersEnabled === 'boolean' ? parsed.OffersEnabled : DEFAULT_TOUR_PREFERENCES.OffersEnabled,
        PreferredGuideMode: parsed.PreferredGuideMode ?? DEFAULT_TOUR_PREFERENCES.PreferredGuideMode,
        PreferredVoice: parsed.PreferredVoice,
        Pace: parsed.Pace,
        ShowBeacons: typeof parsed.ShowBeacons === 'boolean' ? parsed.ShowBeacons : DEFAULT_TOUR_PREFERENCES.ShowBeacons,
        Locale: parsed.Locale,
      };
    } catch {
      return { ...DEFAULT_TOUR_PREFERENCES };
    }
  }

  /** Persists per-user tour preferences via `UserInfoEngine` (debounced). */
  public SavePreferences(prefs: TourPreferences): void {
    this.userInfoEngine.SetSettingDebounced(
      TOUR_PREFERENCES_SETTING_KEY,
      JSON.stringify(prefs),
      this.providerToUse.CurrentUser,
    );
  }

  private matchesLocation(tour: TourDefinition, location: TourLocation): boolean {
    const startApp = tour.StartLocation?.ApplicationName ?? tour.ApplicationName;
    if (!startApp) {
      return true;
    }
    if (!location.ApplicationName) {
      return true;
    }
    return startApp.toLowerCase() === location.ApplicationName.toLowerCase();
  }

  private buildLocation(
    activeApp: BaseApplication | null,
    tabs: ReadonlyArray<{ id: string; applicationId: string; configuration?: Record<string, unknown>; resourceRecordId?: string }>,
    activeTabId: string | null,
  ): TourLocation {
    const activeTab = activeTabId ? tabs.find((t) => t.id === activeTabId) : undefined;
    const config = activeTab?.configuration ?? {};
    const driverClass = typeof config['driverClass'] === 'string' ? config['driverClass'] : undefined;
    const entityName =
      typeof config['Entity'] === 'string'
        ? config['Entity']
        : typeof config['entity'] === 'string'
          ? config['entity']
          : undefined;
    const recordId =
      activeTab?.resourceRecordId ||
      (typeof config['recordId'] === 'string' ? config['recordId'] : undefined);
    const navItemKey = typeof config['navItemKey'] === 'string' ? config['navItemKey'] : undefined;

    return {
      ApplicationID: activeApp?.ID,
      ApplicationName: activeApp?.Name,
      NavItemKey: navItemKey,
      DriverClass: driverClass,
      EntityName: entityName,
      RecordId: recordId,
      Url: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
    };
  }

  private async awaitResourceLoaded(
    predicate: (event: ResourceLoadedEvent) => boolean,
    timeoutMs: number,
  ): Promise<void> {
    if (!this.navigationService) {
      return;
    }
    await firstValueFrom(
      race(
        this.navigationService.ResourceLoaded$.pipe(
          filter((evt) => predicate(evt)),
          take(1),
        ),
        timer(timeoutMs),
      ),
    ).catch(() => undefined);
  }

  private createSimulatedRoleHost(roles: string[]): ITourHost {
    const basePrincipal = this.Principal;
    const simulatedPrincipal: TourPrincipal =
      basePrincipal.Kind === 'MJUser'
        ? { ...basePrincipal, Roles: [...roles] }
        : { Kind: 'MJUser', UserId: 'preview-user', Roles: [...roles] };

    return {
      Capabilities: this.Capabilities,
      Location$: this.Location$,
      Navigate: (intent) => this.Navigate(intent),
      Principal: simulatedPrincipal,
      GetCurrentLocation: () => this.GetCurrentLocation(),
      GetInstalledApplications: () => this.GetInstalledApplications(),
    };
  }

  private subscribeGlobalEntityEvents(): void {
    this.entityEventSub = MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
      if (event.event !== MJEventType.ComponentEvent) {
        return;
      }
      const payload = event.args as BaseEntityEvent | undefined;
      if (!payload || !payload.baseEntity?.EntityInfo?.Name) {
        return;
      }
      if (payload.type !== 'save' && payload.type !== 'delete' && payload.type !== 'new_record') {
        return;
      }
      const recordData = payload.baseEntity.GetAll();
      this.entityEventsSubject.next({
        EntityName: payload.baseEntity.EntityInfo.Name,
        EventType: payload.type,
        SaveSubType: payload.saveSubType,
        Record: recordData,
      });
    });
  }
}

function locationsEqual(a: TourLocation, b: TourLocation): boolean {
  return (
    a.ApplicationID === b.ApplicationID &&
    a.ApplicationName === b.ApplicationName &&
    a.NavItemKey === b.NavItemKey &&
    a.DriverClass === b.DriverClass &&
    a.EntityName === b.EntityName &&
    a.RecordId === b.RecordId &&
    a.Url === b.Url
  );
}
