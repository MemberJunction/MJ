import { Injectable, InjectionToken, OnDestroy, inject } from '@angular/core';
import {
  BaseEntityEvent,
  CompositeKey,
  EntityInfo,
  IMetadataProvider,
  LogError,
  LogStatus,
  Metadata,
  RunView,
} from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
  MJTourEntity,
  MJTourLearningPathEntity,
  MJTourLearningPathTourLinkEntity,
  MJTourRunEntity,
  TourEngine,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import { GroupByUUID, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ApplicationManager, BaseApplication, NavItem, WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { LoadTourChannel, RealtimeSessionService } from '@memberjunction/ng-conversations';
import { NavigationService, ResourceLoadedEvent } from '@memberjunction/ng-shared';
import type { MJTourHostComponent, TourPendingOffer } from '@memberjunction/ng-tours';
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
  TourStepDefinition,
  TourTriggerCoordinator,
  TourVisibleAnchorInfo,
} from '@memberjunction/tours-runtime';

// Preserve TourChannel's @RegisterClass registration under Angular tree-shaking.
LoadTourChannel();

/** Maximum ms to wait for NavigationService.ResourceLoaded$ before resolving Navigate(). */
const TOUR_NAVIGATION_SETTLE_TIMEOUT_MS = 4500;

/** Maximum ms to wait for a step's target anchor element during DemonstrateStep(). */
const DEMONSTRATE_ANCHOR_TIMEOUT_MS = 2500;
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

/** Injection token supplying the browser DOM anchor bridge (`DomTourAnchorBridge`) from `ShellModule`. */
export const EXPLORER_TOUR_ANCHOR_BRIDGE = new InjectionToken<ITourAnchorDomBridge>('EXPLORER_TOUR_ANCHOR_BRIDGE');

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
 * Eligible tours grouped by owning application with per-user completion / progress
 * state, powering the global "All Apps" catalog tab inside the Tours & Help launcher.
 */
export interface ExplorerAppTourGroup {
  ApplicationName: string;
  Tours: Array<{
    Tour: TourDefinition;
    Completed: boolean;
    InProgress: boolean;
    CompletedAt?: string;
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
  private readonly realtimeSession = inject(RealtimeSessionService, { optional: true });

  private provider: IMetadataProvider | null = null;
  private toolkit: TourAgentToolkit | null = null;
  private agentBridge: ITourHostAgentBridge | null = null;
  private tourHostComponent: MJTourHostComponent | null = null;
  private attachedAnchorBridge: ITourAnchorDomBridge | null = inject(EXPLORER_TOUR_ANCHOR_BRIDGE, { optional: true });
  private simulatedRolesOverride: string[] | null = null;
  private currentLocationSnapshot: TourLocation = {};
  private isRealtimeActive = false;
  private pendingVoiceGuideMinimize = false;
  private sessionViewSub: Subscription | null = null;
  private locationSub: Subscription | null = null;
  private realtimeActiveSub: Subscription | null = null;
  private realtimeStartedSub: Subscription | null = null;
  private entityEventSub: { unsubscribe: () => void } | null = null;
  private signalSub: Subscription | null = null;

  private readonly eligibilityEvaluator = new TourEligibilityEvaluator();
  private readonly triggerCoordinator = new TourTriggerCoordinator();
  private readonly entityEventsSubject = new Subject<TourEntityEventPayload>();
  private readonly activeSessionSubject = new BehaviorSubject<TourSession | null>(null);
  private readonly activeSessionViewSubject = new BehaviorSubject<TourSessionView | null>(null);
  private readonly pendingOfferSubject = new BehaviorSubject<TourPendingOffer | null>(null);

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
  public readonly PendingOffer$: Observable<TourPendingOffer | null> = this.pendingOfferSubject.asObservable();
  public readonly VoiceGuideActive$: Observable<boolean>;

  constructor() {
    const activeApp$ = this.appManager?.ActiveApp ?? of(null);
    const workspaceConfig$ = this.workspaceManager?.Configuration ?? of(null);
    this.Location$ = combineLatest([activeApp$, workspaceConfig$]).pipe(
      map(([activeApp, config]) => this.buildLocation(activeApp, config?.tabs ?? [], config?.activeTabId ?? null)),
      distinctUntilChanged((a, b) => locationsEqual(a, b)),
    );

    const realtimeActive$ = this.realtimeSession?.Active$ ?? of(false);
    this.VoiceGuideActive$ = combineLatest([realtimeActive$, this.ActiveSessionView$]).pipe(
      map(([realtimeActive, view]) => realtimeActive && view !== null && view.Status === 'In Progress'),
      distinctUntilChanged(),
    );

    if (this.realtimeSession) {
      this.realtimeActiveSub = this.realtimeSession.Active$.subscribe((active) => {
        const becameActive = active && !this.isRealtimeActive;
        this.isRealtimeActive = active;
        if (becameActive && (this.pendingVoiceGuideMinimize || this.isTourInProgress())) {
          this.realtimeSession?.SetMinimized(true);
        }
      });
      this.realtimeStartedSub = this.realtimeSession.SessionStarted$.subscribe(() => {
        if (this.pendingVoiceGuideMinimize || this.isTourInProgress()) {
          this.realtimeSession?.SetMinimized(true);
        }
      });
    }

    this.locationSub = this.Location$.subscribe((loc) => {
      this.currentLocationSnapshot = loc;
      void this.pushAgentContextSnapshot();
      if (loc.ApplicationName || loc.NavItemKey || loc.EntityName) {
        void this.EvaluateProactiveTriggers();
      }
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
        return;
      }
      void this.EvaluateProactiveTriggers({
        SignalKey: evt.SignalKey,
        SignalPayload: evt.Payload,
      });
    });
  }

  public ngOnDestroy(): void {
    this.locationSub?.unsubscribe();
    this.realtimeActiveSub?.unsubscribe();
    this.realtimeStartedSub?.unsubscribe();
    this.sessionViewSub?.unsubscribe();
    this.signalSub?.unsubscribe();
    this.entityEventSub?.unsubscribe();
  }

  public get IsVoiceGuideAvailable(): boolean {
    if (!this.realtimeSession || !this.providerToUse) {
      return false;
    }
    return Boolean(this.tourEngine.IsSageVoiceGuideEnabled);
  }

  public get TourVoiceAgentName(): string {
    return this.realtimeSession?.CurrentAgentName || 'Sage';
  }

  private isTourInProgress(): boolean {
    const view = this.activeSessionViewSubject.getValue();
    return view !== null && view.Status === 'In Progress';
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
      if (
        this.currentLocationSnapshot.ApplicationName ||
        this.currentLocationSnapshot.NavItemKey ||
        this.currentLocationSnapshot.EntityName
      ) {
        void this.EvaluateProactiveTriggers();
      }
    }
  }

  private get providerToUse(): IMetadataProvider | undefined {
    return this.provider ?? Metadata.Provider;
  }

  private get tourEngine(): TourEngine {
    return TourEngine.GetProviderInstance<TourEngine>(this.providerToUse as IMetadataProvider, TourEngine) as TourEngine;
  }

  private get userInfoEngine(): UserInfoEngine {
    return UserInfoEngine.GetProviderInstance<UserInfoEngine>(this.providerToUse as IMetadataProvider, UserInfoEngine) as UserInfoEngine;
  }

  public get Principal(): TourPrincipal {
    const md = this.providerToUse;
    const user = md?.CurrentUser;
    if (!md || (!user && !this.simulatedRolesOverride)) {
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
      if (!md) {
        return false;
      }

      // 1. Open a specific entity record
      if (intent.EntityName && intent.RecordId && navService) {
        const entityInfo: EntityInfo | undefined = md.EntityByName(intent.EntityName);
        const compositeKey = CompositeKey.FromURLSegment(entityInfo, intent.RecordId);
        const waitForLoad = this.awaitResourceLoaded(
          (evt) => evt.ResourceType.toLowerCase() === 'records' && (!evt.RecordId || evt.RecordId === intent.RecordId),
          TOUR_NAVIGATION_SETTLE_TIMEOUT_MS,
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
          TOUR_NAVIGATION_SETTLE_TIMEOUT_MS,
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

  /**
   * Demonstrates a tour step on the Explorer UI by navigating (when requested),
   * verifying the target anchor is visible, and triggering Sage's pointer highlight.
   */
  public async DemonstrateStep(
    step: TourStepDefinition,
    _context?: { ConfirmedMutation?: boolean },
  ): Promise<{ Success: boolean; ErrorMessage?: string }> {
    const prep = step.Prepare;
    if (
      prep &&
      (prep.ApplicationID ||
        prep.ApplicationName ||
        prep.NavItemKey ||
        prep.DriverClass ||
        prep.EntityName ||
        prep.Url)
    ) {
      await this.Navigate({
        ApplicationID: prep.ApplicationID,
        ApplicationName: prep.ApplicationName,
        NavItemKey: prep.NavItemKey,
        DriverClass: prep.DriverClass,
        EntityName: prep.EntityName,
        RailKey: prep.RailKey,
        SectionKey: prep.SectionKey,
        Url: prep.Url,
      });
    }

    if (step.Anchor) {
      const resolved = await this.anchorBridgeDelegate.ResolveAnchor(step.Anchor, DEMONSTRATE_ANCHOR_TIMEOUT_MS);
      if (!resolved.Found) {
        return {
          Success: false,
          ErrorMessage: resolved.FailureReason ?? 'Target element is not visible on screen.',
        };
      }

      const highlightKey = resolved.AnchorKey ?? step.Anchor.Key ?? step.Anchor.Selector;
      if (highlightKey) {
        const activeSession = this.activeSessionSubject.getValue();
        if (activeSession) {
          activeSession.SetPointerHighlight(highlightKey, step.Title);
        } else if (this.anchorBridgeDelegate.HighlightAnchor) {
          await this.anchorBridgeDelegate.HighlightAnchor(highlightKey, step.Title);
        }
      }
    }

    return { Success: true };
  }

  /**
   * Starts, attaches, or ends the embedded Sage Voice Guide realtime session for
   * the active tour. Minimizes any full-screen overlay so Sage docks into the tour card bar.
   */
  public async RequestVoiceGuide(enabled: boolean): Promise<boolean> {
    if (!this.realtimeSession) {
      return false;
    }
    if (!enabled) {
      if (this.isRealtimeActive) {
        await this.realtimeSession.EndRealtimeSession('explicit');
      }
      return true;
    }
    if (!this.IsVoiceGuideAvailable) {
      return false;
    }
    if (this.isRealtimeActive) {
      this.realtimeSession.SetMinimized(true);
      return true;
    }

    this.pendingVoiceGuideMinimize = true;
    try {
      const md = this.providerToUse;
      if (!md) {
        return false;
      }
      await AIEngineBase.Instance.Config(false, md.CurrentUser, md).catch(() => undefined);
      const agents = AIEngineBase.Instance.Agents ?? [];
      const sageAgent =
        agents.find((a) => a.Name?.trim().toLowerCase() === 'sage' && a.Status !== 'Disabled') ??
        agents.find((a) => a.Status !== 'Disabled');
      if (!sageAgent) {
        LogStatus('ExplorerTourHost.RequestVoiceGuide: No active AI agent found to start Sage Voice Guide.');
        return false;
      }

      this.realtimeSession.Provider = md;
      await this.realtimeSession.StartRealtimeSession(
        sageAgent.ID,
        null,
        null,
        sageAgent.Name || 'Sage',
        null,
        null,
        null,
        null,
        null,
        null,
        this.currentLocationSnapshot.ApplicationID ?? null,
        null,
        {
          HostChannels: [
            { ClientPluginClass: 'ClientContextChannel' },
            { ClientPluginClass: 'TourChannel' },
          ],
        },
      );
      this.realtimeSession.SetMinimized(true);
      return true;
    } catch (error) {
      LogError(`ExplorerTourHost.RequestVoiceGuide failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      this.pendingVoiceGuideMinimize = false;
    }
  }

  /**
   * Evaluates proactive triggers against eligible tours for the current Explorer location,
   * signal event, or entity event, publishing `PendingOffer$` or auto-starting `'Auto'` matches.
   */
  public async EvaluateProactiveTriggers(extra?: {
    SignalKey?: string;
    SignalPayload?: Record<string, unknown>;
    EntityEvent?: TourEntityEventPayload;
  }): Promise<void> {
    if (this.Principal.Kind !== 'MJUser' || this.isTourInProgress() || !this.providerToUse) {
      return;
    }

    const engine = this.tourEngine;
    await engine.Config(false, this.providerToUse?.CurrentUser, this.providerToUse).catch(() => undefined);

    if (this.isTourInProgress()) {
      return;
    }

    const location = this.GetCurrentLocation();
    const [tours, runs] = await Promise.all([
      engine.GetTours(location),
      engine.GetRuns(),
    ]);
    const prefs = this.GetPreferences();

    const match = this.triggerCoordinator.EvaluateForContext({
      Tours: tours,
      Host: this,
      Location: location,
      Principal: this.Principal,
      Runs: runs,
      Preferences: prefs,
      ActiveSessionStatus: this.activeSessionViewSubject.getValue()?.Status ?? null,
      SignalKey: extra?.SignalKey,
      SignalPayload: extra?.SignalPayload,
      EntityEvent: extra?.EntityEvent,
    });

    if (!match) {
      return;
    }

    this.triggerCoordinator.RecordOfferShown(match.Tour.TourKey);

    if (match.Delivery === 'Auto') {
      await this.StartTour(match.Tour.TourKey, { LaunchSource: 'Trigger' });
      return;
    }

    this.pendingOfferSubject.next({
      TourKey: match.Tour.TourKey,
      Title: match.Tour.Name,
      Description: match.Tour.Description,
      EstimatedMinutes: match.Tour.EstimatedMinutes,
      StepCount: match.Tour.Steps.length,
      Delivery: match.Delivery,
    });
  }

  /** Accepts the pending proactive tour offer, clearing the card and starting the tour. */
  public async AcceptPendingOffer(tourKey?: string): Promise<TourSession | null> {
    const current = this.pendingOfferSubject.getValue();
    const targetKey = tourKey ?? current?.TourKey;
    this.pendingOfferSubject.next(null);
    if (!targetKey) {
      return null;
    }
    return this.StartTour(targetKey, { LaunchSource: 'Trigger' });
  }

  /** Dismisses the pending proactive tour offer and records session dismissal suppression. */
  public DismissPendingOffer(tourKey?: string): void {
    const current = this.pendingOfferSubject.getValue();
    const targetKey = tourKey ?? current?.TourKey;
    if (targetKey) {
      this.triggerCoordinator.DismissOffer(targetKey);
    }
    this.pendingOfferSubject.next(null);
  }

  /** Expands the embedded Sage voice bar back into the full realtime session overlay. */
  public ExpandVoiceOverlay(): void {
    this.realtimeSession?.SetMinimized(false);
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
    if (this.providerToUse) {
      await engine.Config(false, this.providerToUse.CurrentUser, this.providerToUse).catch(() => undefined);
    }

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

    this.pendingOfferSubject.next(null);
    this.activeSessionViewSubject.next(session.SessionView);
    if (session.SessionView.Status === 'In Progress' && this.realtimeSession && this.isRealtimeActive) {
      this.realtimeSession.SetMinimized(true);
    }
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
    if (this.providerToUse) {
      await engine.Config(false, this.providerToUse.CurrentUser, this.providerToUse).catch(() => undefined);
    }
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
    this.pendingOfferSubject.next(null);
    const rawPreferredMode: TourSessionGuideMode =
      options.Mode ??
      (tour.DefaultGuideMode === 'Chat' || tour.DefaultGuideMode === 'Voice' || tour.DefaultGuideMode === 'Visual'
        ? tour.DefaultGuideMode
        : prefs.PreferredGuideMode === 'Chat' || prefs.PreferredGuideMode === 'Voice'
          ? prefs.PreferredGuideMode
          : 'Visual');
    const preferredMode: TourSessionGuideMode =
      !this.IsVoiceGuideAvailable && (rawPreferredMode === 'Voice' || rawPreferredMode === 'Chat')
        ? 'Visual'
        : rawPreferredMode;

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
      this.syncRealtimeSessionOnTourStart(preferredMode);
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
    this.syncRealtimeSessionOnTourStart(preferredMode);
    return session;
  }

  private syncRealtimeSessionOnTourStart(preferredMode: TourSessionGuideMode): void {
    if (!this.realtimeSession) {
      return;
    }
    if (this.isRealtimeActive) {
      this.realtimeSession.SetMinimized(true);
    } else if (preferredMode === 'Voice') {
      void this.RequestVoiceGuide(true);
    }
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
    if (!this.providerToUse) {
      return [];
    }
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
    if (!this.providerToUse) {
      return [];
    }
    const engine = this.tourEngine;
    await engine.Config(false, this.providerToUse.CurrentUser, this.providerToUse).catch(() => undefined);
    return engine.GetRuns();
  }

  /**
   * Returns all eligible active tours grouped by application name (active app first,
   * then `'Core Workspace'`, then alphabetical), annotated with `Completed` / `InProgress`.
   */
  public async GetAllToursByApplication(): Promise<ExplorerAppTourGroup[]> {
    const [eligible, runs] = await Promise.all([
      this.GetEligibleTours(false),
      this.GetRuns(),
    ]);

    const completedAtByTourKey = new Map<string, string>();
    const inProgressKeys = new Set<string>();
    for (const run of runs) {
      if (run.Status === 'Completed') {
        const existingAt = completedAtByTourKey.get(run.TourKey);
        const nextAt = run.CompletedAt ?? '';
        if (!existingAt || nextAt > existingAt) {
          completedAtByTourKey.set(run.TourKey, nextAt);
        }
      } else if (run.Status === 'In Progress') {
        inProgressKeys.add(run.TourKey);
      }
    }

    const groupsMap = new Map<string, ExplorerAppTourGroup['Tours']>();
    for (const { Tour } of eligible) {
      const appName = Tour.ApplicationName || Tour.StartLocation?.ApplicationName || 'Core Workspace';
      const completed = completedAtByTourKey.has(Tour.TourKey);
      const completedAtRaw = completedAtByTourKey.get(Tour.TourKey);
      const inProgress = !completed && inProgressKeys.has(Tour.TourKey);

      const list = groupsMap.get(appName) ?? [];
      list.push({
        Tour,
        Completed: completed,
        InProgress: inProgress,
        CompletedAt: completedAtRaw ? completedAtRaw : undefined,
      });
      groupsMap.set(appName, list);
    }

    const activeAppName = (this.currentLocationSnapshot.ApplicationName ?? '').trim().toLowerCase();
    return Array.from(groupsMap.entries())
      .map(([ApplicationName, Tours]) => ({ ApplicationName, Tours }))
      .sort((a, b) => {
        const aIsActive = activeAppName.length > 0 && a.ApplicationName.toLowerCase() === activeAppName;
        const bIsActive = activeAppName.length > 0 && b.ApplicationName.toLowerCase() === activeAppName;
        if (aIsActive !== bIsActive) {
          return aIsActive ? -1 : 1;
        }
        const aIsCore = a.ApplicationName === 'Core Workspace';
        const bIsCore = b.ApplicationName === 'Core Workspace';
        if (aIsCore !== bIsCore) {
          return aIsCore ? -1 : 1;
        }
        return a.ApplicationName.localeCompare(b.ApplicationName);
      });
  }

  /**
   * Loads active learning paths and computes per-user completion progress using
   * `RunView.FromMetadataProvider(this.providerToUse)` and `TourEngine` runs.
   */
  public async GetLearningPathSummaries(): Promise<ExplorerLearningPathSummary[]> {
    const md = this.providerToUse;
    if (!md) {
      return [];
    }
    const rv = RunView.FromMetadataProvider(md);
    const userId = md.CurrentUser?.ID;

    const [pathsResult, pathToursResult, toursResult, runsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Tour Learning Paths',
        ExtraFilter: `Status = 'Active'`,
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
      },
      {
        EntityName: 'MJ: Tour Learning Path Tour Links',
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

    const paths = (pathsResult?.Results ?? []) as MJTourLearningPathEntity[];
    const pathTours = (pathToursResult?.Results ?? []) as MJTourLearningPathTourLinkEntity[];
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

    const pathToursByPathId = GroupByUUID(pathTours, (pt) => pt.TourLearningPathID);
    const summaries: ExplorerLearningPathSummary[] = [];
    for (const lp of paths) {
      const sourceMembers: readonly MJTourLearningPathTourLinkEntity[] = lp.LearningPathTours?.IsAvailable
        ? lp.LearningPathTours.Items
        : (pathToursByPathId.Get(lp.ID) ?? []);
      const members = [...sourceMembers]
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
    if (!this.providerToUse) {
      return { ...DEFAULT_TOUR_PREFERENCES };
    }
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
    if (!prefs.OffersEnabled) {
      this.pendingOfferSubject.next(null);
    }
    if (!this.providerToUse) {
      return;
    }
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
      const entityEvent: TourEntityEventPayload = {
        EntityName: payload.baseEntity.EntityInfo.Name,
        EventType: payload.type,
        SaveSubType: payload.saveSubType,
        Record: recordData,
      };
      this.entityEventsSubject.next(entityEvent);
      if ((payload.type === 'save' || payload.type === 'delete') && !this.isTourInProgress()) {
        void this.EvaluateProactiveTriggers({ EntityEvent: entityEvent });
      }
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
