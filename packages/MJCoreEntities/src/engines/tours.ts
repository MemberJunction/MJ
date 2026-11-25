import {
    BaseEngine,
    BaseEnginePropertyConfig,
    CompositeFilterDescriptor,
    FilterDescriptor,
    FilterOperator,
    IMetadataProvider,
    LogError,
    ProviderType,
    UserInfo,
} from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    ILearningPathConfiguration,
    ILearningPathLocalizationEntry,
    ITourAnchor,
    ITourCompletion,
    ITourConfiguration,
    ITourDefinitionSource,
    ITourGoal,
    ITourLaunchPolicy,
    ITourLocalizationEntry,
    ITourProgressStore,
    ITourServerPredicateEvaluator,
    ITourStartLocation,
    ITourStepConfiguration,
    ITourStepLocalizationEntry,
    ITourStepPathConfiguration,
    ITourStepPathLocalizationEntry,
    ITourStepPrepare,
    LearningPathDefinition,
    LearningPathTourDefinition,
    MergeTourOverrides,
    TourAnchorResolution,
    TourAnchorStrategy,
    TourCompletionCheckSpec,
    TourDefinition,
    TourGuideMode,
    TourLaunchSource,
    TourLocation,
    TourOnMissingPolicy,
    TourOverrideDefinition,
    TourPreferences,
    TourPrerequisiteDefinition,
    TourPrincipal,
    TourRunEvent,
    TourRunRecord,
    TourRunStatus,
    TourRunStepOutcome,
    TourRunStepRecord,
    TourServerPredicateRequest,
    TourServerPredicateResult,
    TourSession,
    TourSessionEventArgs,
    TourSessionGuideMode,
    TourStepDefinition,
    TourStepMode,
    TourStepPathDefinition,
    TourStepPlacement,
    TourStepTypeKey,
    TourTriggerDefinition,
} from '@memberjunction/tours-runtime';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import {
    MJLearningPathEntity,
    MJLearningPathEntity_ILearningPathConfiguration,
    MJLearningPathTourEntity,
    MJTourEntity,
    MJTourEntity_ITourConfiguration,
    MJTourEntity_ITourGoal,
    MJTourEntity_ITourGoalFilter,
    MJTourEntity_ITourGoalSimpleFilter,
    MJTourEntity_ITourLaunchPolicy,
    MJTourEntity_ITourStartLocation,
    MJTourOverrideEntity,
    MJTourPrerequisiteEntity,
    MJTourRunEntity,
    MJTourRunEntity_ITourRunPathEntry,
    MJTourStepEntity,
    MJTourStepEntity_ITourAnchor,
    MJTourStepEntity_ITourCompletion,
    MJTourStepEntity_ITourCompletionCheck,
    MJTourStepEntity_ITourCompletionFilter,
    MJTourStepEntity_ITourCompletionSimpleFilter,
    MJTourStepEntity_ITourStepConfiguration,
    MJTourStepEntity_ITourStepPrepare,
    MJTourStepPathEntity,
    MJTourStepPathEntity_ITourStepPathConfiguration,
    MJTourStepTypeEntity,
    MJTourSurfaceEntity,
    MJTourSurfaceTourEntity,
    MJTourTriggerEntity,
    MJTourVersionEntity,
    MJTourVersionEntity_ITourVersionDefinition,
    MJTourVersionEntity_ITourVersionStepPathSnapshot,
    MJTourVersionEntity_ITourVersionStepSnapshot,
} from '../generated/entity_subclasses';
import {
    ToursClaimGuestRunsOperation,
    ToursClaimGuestRunsOutput,
    ToursEvaluatePredicatesInput,
    ToursEvaluatePredicatesOperation,
    ToursPublishTourOperation,
    ToursPublishTourOutput,
    ToursRecordEventsInput,
    ToursRecordEventsOperation,
} from '../generated/remote_operations';
import { InstanceConfigEngine } from './InstanceConfigEngine';
import { UserInfoEngine } from './UserInfoEngine';

// Derived entity field union types (AGENTS.md Rule #2c)
type EntityStepPlacement = MJTourStepEntity['Placement'] | MJTourVersionEntity_ITourVersionStepSnapshot['Placement'];
type EntityStepOnMissing = MJTourStepEntity['OnMissing'] | MJTourVersionEntity_ITourVersionStepSnapshot['OnMissing'];
type EntityRunLaunchSource = MJTourRunEntity['LaunchSource'];
type EntityTriggerStatus = MJTourTriggerEntity['Status'];
type RemoteEventRecord = ToursRecordEventsInput['Events'][number];
type RemoteEventType = RemoteEventRecord['EventType'];
type RemoteLaunchSource = NonNullable<RemoteEventRecord['LaunchSource']>;
type RemoteAnchorResolution = NonNullable<RemoteEventRecord['AnchorResolution']>;

/** Configuration shape parsed from `InstanceConfigEngine` key `Tours.InterruptionBudget`. */
export interface TourInterruptionBudgetConfig {
    MaxOffersPerSession: number;
    MaxOffersPerDay: number;
    InitialLoadQuietPeriodMs: number;
    TagGroupCaps?: Record<string, number>;
}

const DEFAULT_INTERRUPTION_BUDGET: TourInterruptionBudgetConfig = {
    MaxOffersPerSession: 1,
    MaxOffersPerDay: 1,
    InitialLoadQuietPeriodMs: 3000,
};

const DEFAULT_TOUR_PREFERENCES: TourPreferences = {
    OffersEnabled: true,
    PreferredGuideMode: 'Visual',
    ShowBeacons: true,
};

const VALID_FILTER_OPERATORS = new Set<FilterOperator>([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'contains',
    'doesnotcontain',
    'startswith',
    'endswith',
    'isnull',
    'isnotnull',
    'isempty',
    'isnotempty',
    'in',
    'notin',
    'between',
]);

interface PendingEventBatchItem {
    event: TourRunEvent;
    resolve: () => void;
    reject: (err: Error) => void;
}

/**
 * Cache and backend adapter for MemberJunction Guided Tours metadata and user progress.
 *
 * Implements the host-agnostic `@memberjunction/tours-runtime` contracts
 * (`ITourDefinitionSource`, `ITourProgressStore`, `ITourServerPredicateEvaluator`) over
 * `BaseEngine` caching and typed Remote Operations.
 *
 * In L2/Angular widgets, resolve via `TourEngine.GetProviderInstance(this.ProviderToUse, TourEngine)`.
 * In Explorer or default-provider hosts, `TourEngine.Instance` returns the singleton.
 */
export class TourEngine
    extends BaseEngine<TourEngine>
    implements ITourDefinitionSource, ITourProgressStore, ITourServerPredicateEvaluator
{
    /** Standard singleton accessor — never construct directly. */
    public static get Instance(): TourEngine {
        return super.getInstance<TourEngine>();
    }

    /** `MJ: Instance Configurations` key controlling the Guided Tours kill switch (default `true`). */
    public static readonly ToursEnabledConfigKey = 'Tours.Enabled';
    /** `MJ: Instance Configurations` key for global interruption budget defaults. */
    public static readonly InterruptionBudgetConfigKey = 'Tours.InterruptionBudget';
    /** `MJ: Instance Configurations` key for the fallback Guide Agent ID. */
    public static readonly DefaultGuideAgentIDConfigKey = 'Tours.DefaultGuideAgentID';
    /** `MJ: Instance Configurations` key for `TourRunStep` retention days (`null` = unlimited). */
    public static readonly RunStepRetentionDaysConfigKey = 'Tours.RunStepRetentionDays';
    /** `UserInfoEngine` setting key storing `TourPreferences` JSON. */
    public static readonly UserPreferencesSettingKey = 'mj.tours.preferences.v1';

    private static _toursEnabled: boolean = TourEngine.readToursEnabledFlag();

    public static get ToursEnabled(): boolean {
        return TourEngine._toursEnabled;
    }

    public static set ToursEnabled(value: boolean) {
        TourEngine._toursEnabled = value;
    }

    /**
     * Turns Guided Tours off when the instance configuration (`Tours.Enabled`) is `false`.
     * A missing key leaves the switch unchanged, and `true` never re-enables a switch
     * that has already been turned off.
     */
    public static ApplyInstanceConfiguration(
        config: Pick<InstanceConfigEngine, 'GetBoolean'> & Partial<Pick<InstanceConfigEngine, 'Get' | 'GetNumber' | 'GetJSON'>>,
    ): void {
        if (!config.GetBoolean(TourEngine.ToursEnabledConfigKey, true)) {
            TourEngine._toursEnabled = false;
        }
    }

    private static readToursEnabledFlag(): boolean {
        const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
        const env = proc?.env?.MJ_TOURS_ENABLED;
        if (env === undefined || env === null || env.trim().length === 0) return true;
        const v = env.trim().toLowerCase();
        return !(v === 'false' || v === '0' || v === 'off' || v === 'no');
    }

    // Cached entity backing arrays
    private _stepTypes: MJTourStepTypeEntity[] = [];
    private _tours: MJTourEntity[] = [];
    private _tourVersions: MJTourVersionEntity[] = [];
    private _tourSteps: MJTourStepEntity[] = [];
    private _tourStepPaths: MJTourStepPathEntity[] = [];
    private _tourPrerequisites: MJTourPrerequisiteEntity[] = [];
    private _tourTriggers: MJTourTriggerEntity[] = [];
    private _learningPaths: MJLearningPathEntity[] = [];
    private _learningPathTours: MJLearningPathTourEntity[] = [];
    private _tourOverrides: MJTourOverrideEntity[] = [];
    private _tourSurfaces: MJTourSurfaceEntity[] = [];
    private _tourSurfaceTours: MJTourSurfaceTourEntity[] = [];
    private _userRuns: MJTourRunEntity[] = [];

    private _loadedForUserId: string | null = null;

    // Active session & forwarded event stream
    private readonly _activeSessionSubject = new BehaviorSubject<TourSession | null>(null);
    private readonly _eventsSubject = new Subject<TourSessionEventArgs>();
    private _activeSessionEventSub: Subscription | null = null;

    // Batched event persistence queue
    private _eventFlushDebounceMs = 50;
    private _pendingEvents: PendingEventBatchItem[] = [];
    private _eventFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private _eventFlushPromise: Promise<void> | null = null;
    private readonly _serverRunIdsByClientId = new Map<string, string>();
    private readonly _optimisticRuns = new Map<string, TourRunRecord>();

    /**
     * Lazy-load all Guided Tours metadata and the current user's tour runs.
     * Safe to call repeatedly — no-op once loaded unless `forceRefresh` is true or
     * the client user changed.
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const effectiveProvider = provider ?? this.ProviderToUse;
        const effectiveUser = contextUser ?? effectiveProvider?.CurrentUser;
        const userId = effectiveUser?.ID;

        const isClientSide = effectiveProvider?.ProviderType !== ProviderType.Database;
        if (isClientSide && userId && this._loadedForUserId && !UUIDsEqual(this._loadedForUserId, userId)) {
            forceRefresh = true;
        }

        const runsConfig: Partial<BaseEnginePropertyConfig> = {
            Type: 'entity',
            EntityName: 'MJ: Tour Runs',
            PropertyName: '_userRuns',
            CacheLocal: true,
        };
        if (userId) {
            runsConfig.Filter = `UserID='${EscapeSQLString(userId)}'`;
        }

        const overridesConfig: Partial<BaseEnginePropertyConfig> = {
            Type: 'entity',
            EntityName: 'MJ: Tour Overrides',
            PropertyName: '_tourOverrides',
            CacheLocal: true,
        };
        if (isClientSide && userId) {
            overridesConfig.Filter = `Scope <> 'User' OR UserID = '${EscapeSQLString(userId)}'`;
        }

        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: 'MJ: Tour Step Types', PropertyName: '_stepTypes', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Tours', PropertyName: '_tours', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Tour Versions', PropertyName: '_tourVersions', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Tour Steps', PropertyName: '_tourSteps', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Tour Step Paths', PropertyName: '_tourStepPaths', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Tour Prerequisites', PropertyName: '_tourPrerequisites', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Tour Triggers', PropertyName: '_tourTriggers', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Learning Paths', PropertyName: '_learningPaths', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Learning Path Tours', PropertyName: '_learningPathTours', CacheLocal: true },
            overridesConfig,
            { Type: 'entity', EntityName: 'MJ: Tour Surfaces', PropertyName: '_tourSurfaces', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Tour Surface Tours', PropertyName: '_tourSurfaceTours', CacheLocal: true },
            runsConfig,
        ];

        await this.Load(configs, provider, forceRefresh, contextUser);
        if (userId && (isClientSide || forceRefresh || !this._loadedForUserId)) {
            this._loadedForUserId = userId;
        }
    }

    // ─── Feature Configuration & Kill Switch ────────────────────────────────

    /** Whether Guided Tours are currently enabled (static kill switch + `Tours.Enabled`). */
    public get IsEnabled(): boolean {
        if (!TourEngine._toursEnabled) {
            return false;
        }
        return this.getInstanceConfigEngine().GetBoolean(TourEngine.ToursEnabledConfigKey, true);
    }

    /** Returns the effective interruption budget configuration from `Tours.InterruptionBudget`. */
    public GetInterruptionBudget(): TourInterruptionBudgetConfig {
        const parsed = this.getInstanceConfigEngine().GetJSON<Partial<TourInterruptionBudgetConfig>>(
            TourEngine.InterruptionBudgetConfigKey,
        );
        if (!parsed) {
            return { ...DEFAULT_INTERRUPTION_BUDGET };
        }
        return {
            MaxOffersPerSession:
                typeof parsed.MaxOffersPerSession === 'number'
                    ? parsed.MaxOffersPerSession
                    : DEFAULT_INTERRUPTION_BUDGET.MaxOffersPerSession,
            MaxOffersPerDay:
                typeof parsed.MaxOffersPerDay === 'number'
                    ? parsed.MaxOffersPerDay
                    : DEFAULT_INTERRUPTION_BUDGET.MaxOffersPerDay,
            InitialLoadQuietPeriodMs:
                typeof parsed.InitialLoadQuietPeriodMs === 'number'
                    ? parsed.InitialLoadQuietPeriodMs
                    : DEFAULT_INTERRUPTION_BUDGET.InitialLoadQuietPeriodMs,
            TagGroupCaps: parsed.TagGroupCaps,
        };
    }

    /** Returns the instance-level fallback Guide Agent ID (`Tours.DefaultGuideAgentID`), or `null`. */
    public GetDefaultGuideAgentID(): string | null {
        const raw = this.getInstanceConfigEngine().Get(TourEngine.DefaultGuideAgentIDConfigKey);
        const trimmed = raw?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : null;
    }

    /** Returns `Tours.RunStepRetentionDays` (`null` = unlimited by default). */
    public GetRunStepRetentionDays(): number | null {
        const raw = this.getInstanceConfigEngine().Get(TourEngine.RunStepRetentionDaysConfigKey);
        if (!raw || raw.trim().length === 0) {
            return null;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return null;
        }
        return parsed;
    }

    // ─── Reactive Streams & Cached Entity Accessors ─────────────────────────

    /** Cached `MJ: Tours` rows (empty when `IsEnabled` is false). */
    public get Tours(): MJTourEntity[] {
        if (!this.IsEnabled) return [];
        return this.GetConfigData<MJTourEntity>('_tours');
    }

    /** Reactive stream of cached `MJ: Tours` rows. */
    public get Tours$(): Observable<MJTourEntity[]> {
        return this.ObserveProperty<MJTourEntity>('_tours');
    }

    /** Cached `MJ: Tour Step Types` rows. */
    public get StepTypes(): MJTourStepTypeEntity[] {
        return this.GetConfigData<MJTourStepTypeEntity>('_stepTypes');
    }

    /** Reactive stream of cached `MJ: Tour Step Types` rows. */
    public get StepTypes$(): Observable<MJTourStepTypeEntity[]> {
        return this.ObserveProperty<MJTourStepTypeEntity>('_stepTypes');
    }

    /** Cached `MJ: Tour Versions` rows. */
    public get TourVersions(): MJTourVersionEntity[] {
        return this.GetConfigData<MJTourVersionEntity>('_tourVersions');
    }

    /** Cached `MJ: Tour Steps` rows. */
    public get TourSteps(): MJTourStepEntity[] {
        return this.GetConfigData<MJTourStepEntity>('_tourSteps');
    }

    /** Cached `MJ: Tour Step Paths` rows. */
    public get TourStepPaths(): MJTourStepPathEntity[] {
        return this.GetConfigData<MJTourStepPathEntity>('_tourStepPaths');
    }

    /** Cached `MJ: Tour Prerequisites` rows. */
    public get TourPrerequisites(): MJTourPrerequisiteEntity[] {
        return this.GetConfigData<MJTourPrerequisiteEntity>('_tourPrerequisites');
    }

    /** Cached `MJ: Tour Triggers` rows. */
    public get TourTriggers(): MJTourTriggerEntity[] {
        return this.GetConfigData<MJTourTriggerEntity>('_tourTriggers');
    }

    /** Cached `MJ: Learning Paths` rows (empty when `IsEnabled` is false). */
    public get LearningPaths(): MJLearningPathEntity[] {
        if (!this.IsEnabled) return [];
        return this.GetConfigData<MJLearningPathEntity>('_learningPaths');
    }

    /** Reactive stream of cached `MJ: Learning Paths` rows. */
    public get LearningPaths$(): Observable<MJLearningPathEntity[]> {
        return this.ObserveProperty<MJLearningPathEntity>('_learningPaths');
    }

    /** Cached `MJ: Learning Path Tours` rows. */
    public get LearningPathTours(): MJLearningPathTourEntity[] {
        return this.GetConfigData<MJLearningPathTourEntity>('_learningPathTours');
    }

    /** Cached `MJ: Tour Overrides` rows. */
    public get TourOverrides(): MJTourOverrideEntity[] {
        return this.GetConfigData<MJTourOverrideEntity>('_tourOverrides');
    }

    /** Cached `MJ: Tour Surfaces` rows. */
    public get TourSurfaces(): MJTourSurfaceEntity[] {
        return this.GetConfigData<MJTourSurfaceEntity>('_tourSurfaces');
    }

    /** Cached `MJ: Tour Surface Tours` rows. */
    public get TourSurfaceTours(): MJTourSurfaceTourEntity[] {
        return this.GetConfigData<MJTourSurfaceTourEntity>('_tourSurfaceTours');
    }

    /** Cached `MJ: Tour Runs` rows for the current user. */
    public get UserRuns(): MJTourRunEntity[] {
        return this.GetConfigData<MJTourRunEntity>('_userRuns');
    }

    /** Reactive stream of cached `MJ: Tour Runs` rows. */
    public get UserRuns$(): Observable<MJTourRunEntity[]> {
        return this.ObserveProperty<MJTourRunEntity>('_userRuns');
    }

    /** Currently active `TourSession`, or `null` when idle. */
    public get ActiveSession(): TourSession | null {
        return this._activeSessionSubject.getValue();
    }

    /** Reactive stream of the active `TourSession` (`null` when no tour is running). */
    public get ActiveSession$(): Observable<TourSession | null> {
        return this._activeSessionSubject.asObservable();
    }

    /**
     * Unified stream forwarding all `TourSessionEventArgs` (`Before*` / `After*` / `AnchorMissing` /
     * `DirectorChanged`) from whichever `TourSession` is currently active.
     */
    public get Events$(): Observable<TourSessionEventArgs> {
        return this._eventsSubject.asObservable();
    }

    /**
     * Binds the currently running `TourSession` so `ActiveSession$` and `Events$` stay live
     * for host bridges (`ClientContextChannel`, UI overlays, analytics).
     */
    public SetActiveSession(session: TourSession | null): void {
        if (this._activeSessionEventSub) {
            this._activeSessionEventSub.unsubscribe();
            this._activeSessionEventSub = null;
        }
        this._activeSessionSubject.next(session);
        if (session) {
            this._activeSessionEventSub = session.Events$.subscribe((evt) => {
                this._eventsSubject.next(evt);
            });
        }
    }

    // ─── ITourDefinitionSource ──────────────────────────────────────────────

    /**
     * Returns all `Active` tours compiled into `TourDefinition`s with applicable
     * `MJ: Tour Overrides` merged (`Global` -> `Role` -> `User`).
     */
    public async GetTours(_location: TourLocation): Promise<TourDefinition[]> {
        if (!this.IsEnabled) {
            return [];
        }
        const principal = this.buildCurrentPrincipal();
        const result: TourDefinition[] = [];
        for (const tour of this.Tours) {
            if (tour.Status !== 'Active') {
                continue;
            }
            const compiled = this.CompileTourDefinition(tour, principal);
            if (compiled) {
                result.push(compiled);
            }
        }
        return result.sort((a, b) => (b.Priority ?? 100) - (a.Priority ?? 100));
    }

    /**
     * Finds and compiles a single tour by `TourKey`, merging applicable overrides.
     * Returns `null` when tours are disabled, the key is not found, or an active override disables it.
     */
    public async GetTourByKey(tourKey: string): Promise<TourDefinition | null> {
        if (!this.IsEnabled || !tourKey) {
            return null;
        }
        const normalized = tourKey.trim();
        const tour = this.Tours.find((t) => t.TourKey === normalized);
        if (!tour) {
            return null;
        }
        return this.CompileTourDefinition(tour, this.buildCurrentPrincipal());
    }

    // ─── Compilation & Override Merging ─────────────────────────────────────

    /**
     * Compiles an `MJTourEntity` into a runtime `TourDefinition`.
     * Uses `CurrentVersionID`'s immutable `MJTourVersionEntity.DefinitionObject` when `Status === 'Active'`
     * and `CurrentVersionID` is populated, falling back to live `TourStep` + `TourStepPath` rows for drafts/previews.
     * Merges `MJ: Tour Overrides` via `MergeTourOverrides` unless `applyOverrides` is false.
     */
    public CompileTourDefinition(
        tour: MJTourEntity,
        principal?: TourPrincipal,
        applyOverrides: boolean = true,
    ): TourDefinition | null {
        const stepTypeById = new Map<string, MJTourStepTypeEntity>();
        for (const st of this.StepTypes) {
            stepTypeById.set(NormalizeUUID(st.ID), st);
        }

        const version =
            tour.Status === 'Active' && tour.CurrentVersionID
                ? this.TourVersions.find((v) => UUIDsEqual(v.ID, tour.CurrentVersionID))
                : undefined;
        const snapshot = version?.DefinitionObject;

        let steps: TourStepDefinition[];
        let paths: TourStepPathDefinition[];

        if (snapshot) {
            steps = snapshot.Steps.map((s) => this.compileStepFromSnapshot(s, stepTypeById));
            paths = snapshot.Paths.map((p) => this.compilePathFromSnapshot(p));
        } else {
            const liveSteps = this.TourSteps
                .filter((s) => UUIDsEqual(s.TourID, tour.ID))
                .sort((a, b) => a.Sequence - b.Sequence);
            const stepKeyById = new Map<string, string>();
            for (const s of liveSteps) {
                stepKeyById.set(NormalizeUUID(s.ID), s.StepKey);
            }
            steps = liveSteps.map((s) => this.compileStepFromEntity(s, stepTypeById));
            paths = this.TourStepPaths
                .filter((p) => UUIDsEqual(p.TourID, tour.ID))
                .sort((a, b) => a.Sequence - b.Sequence)
                .map((p) => this.compilePathFromEntity(p, stepKeyById))
                .filter((p): p is TourStepPathDefinition => p !== null);
        }

        const prerequisites = this.TourPrerequisites
            .filter((p) => UUIDsEqual(p.TourID, tour.ID))
            .sort((a, b) => a.Sequence - b.Sequence)
            .map((p) => this.compilePrerequisite(p));

        const triggers = this.TourTriggers
            .filter((t) => UUIDsEqual(t.TourID, tour.ID))
            .sort((a, b) => b.Priority - a.Priority)
            .map((t) => this.compileTrigger(t));

        const rawGoal: MJTourEntity_ITourGoal | Record<string, unknown> | null | undefined =
            snapshot?.Goal ?? tour.GoalObject;
        const rawStartLocation: MJTourEntity_ITourStartLocation | Record<string, unknown> | null | undefined =
            snapshot?.StartLocation ?? tour.StartLocationObject;
        const rawConfig: MJTourEntity_ITourConfiguration | Record<string, unknown> | null | undefined =
            snapshot?.Configuration ?? tour.ConfigurationObject;

        const throttleTags = tour.ThrottleTags
            ? tour.ThrottleTags.split(',')
                  .map((tag) => tag.trim())
                  .filter((tag) => tag.length > 0)
            : undefined;

        const baseDefinition: TourDefinition = {
            ID: tour.ID,
            TourKey: snapshot?.TourKey ?? tour.TourKey,
            Name: snapshot?.Name ?? tour.Name,
            Description: (snapshot?.Description ?? tour.Description) ?? undefined,
            ApplicationID: tour.ApplicationID,
            ApplicationName: tour.Application,
            RunInAuthenticatedHosts: tour.RunInAuthenticatedHosts,
            Status: tour.Status,
            CurrentVersionID: tour.CurrentVersionID,
            VersionNumber: version?.VersionNumber,
            EstimatedMinutes: (snapshot?.EstimatedMinutes ?? tour.EstimatedMinutes) ?? undefined,
            AudienceFilter: tour.AudienceFilter,
            LaunchPolicy: this.mapLaunchPolicy(tour.LaunchPolicyObject),
            Priority: tour.Priority,
            ThrottleTags: throttleTags,
            DefaultGuideMode: snapshot?.DefaultGuideMode ?? tour.DefaultGuideMode,
            AllowAgentActions: snapshot?.AllowAgentActions ?? tour.AllowAgentActions,
            GuideAgentID: tour.GuideAgentID ?? this.GetDefaultGuideAgentID(),
            DriverClass: snapshot?.DriverClass ?? tour.DriverClass,
            PresenterClass: snapshot?.PresenterClass ?? tour.PresenterClass,
            Goal: this.mapGoal(rawGoal),
            StartLocation: this.mapStartLocation(rawStartLocation),
            Configuration: this.mapTourConfiguration(rawConfig, tour.VersionTag),
            Steps: steps,
            Paths: paths,
            Prerequisites: prerequisites,
            Triggers: triggers,
        };

        if (!applyOverrides) {
            return baseDefinition;
        }

        const overrideDefs = this.compileOverridesForTour(tour);
        if (overrideDefs.length === 0) {
            return baseDefinition;
        }
        return MergeTourOverrides(baseDefinition, overrideDefs, principal ?? this.buildCurrentPrincipal());
    }

    /** Compiles all `Active` `LearningPath` records into runtime `LearningPathDefinition`s. */
    public GetCompiledLearningPaths(): LearningPathDefinition[] {
        if (!this.IsEnabled) {
            return [];
        }
        return this.LearningPaths
            .filter((lp) => lp.Status === 'Active')
            .map((lp) => this.CompileLearningPathDefinition(lp));
    }

    /** Compiles a single `MJLearningPathEntity` and its `MJ: Learning Path Tours` members. */
    public CompileLearningPathDefinition(path: MJLearningPathEntity): LearningPathDefinition {
        const tourKeyById = new Map<string, string>();
        for (const t of this.Tours) {
            tourKeyById.set(NormalizeUUID(t.ID), t.TourKey);
        }

        const tours: LearningPathTourDefinition[] = this.LearningPathTours
            .filter((m) => UUIDsEqual(m.LearningPathID, path.ID))
            .sort((a, b) => a.Sequence - b.Sequence)
            .map((m) => ({
                TourKey: tourKeyById.get(NormalizeUUID(m.TourID)) ?? '',
                Sequence: m.Sequence,
                IsRequired: m.IsRequired,
            }))
            .filter((m) => m.TourKey.length > 0);

        return {
            ID: path.ID,
            PathKey: path.PathKey,
            Name: path.Name,
            Description: path.Description ?? undefined,
            ApplicationName: path.Application,
            AudienceFilter: path.AudienceFilter,
            Status: path.Status,
            Configuration: this.mapLearningPathConfiguration(path.ConfigurationObject),
            Tours: tours,
        };
    }

    /**
     * Returns `Active` tours whose `VersionTag` matches a newly upgraded Open App version (§12).
     * `installedAppVersions` maps application name, application ID, or `'core'`/`'mj'` to version string.
     */
    public GetWhatsNewTours(installedAppVersions: Record<string, string>): TourDefinition[] {
        if (!this.IsEnabled || !installedAppVersions) {
            return [];
        }
        const entries = Object.entries(installedAppVersions);
        if (entries.length === 0) {
            return [];
        }

        const normalizedMap = new Map<string, string>();
        for (const [appKey, version] of entries) {
            const k = appKey.trim().toLowerCase();
            if (k && version) {
                normalizedMap.set(k, version.trim());
            }
        }

        const principal = this.buildCurrentPrincipal();
        const matches: TourDefinition[] = [];

        for (const tour of this.Tours) {
            if (tour.Status !== 'Active') {
                continue;
            }
            const tag = tour.VersionTag?.trim();
            if (!tag) {
                continue;
            }

            const appVersion = this.resolveInstalledVersionForTour(tour, normalizedMap);
            if (!appVersion || !this.versionMatchesTag(appVersion, tag)) {
                continue;
            }

            const compiled = this.CompileTourDefinition(tour, principal);
            if (compiled) {
                matches.push(compiled);
            }
        }

        return matches.sort((a, b) => (b.Priority ?? 100) - (a.Priority ?? 100));
    }

    // ─── ITourProgressStore ─────────────────────────────────────────────────

    /**
     * Returns the current user's tour run history, combining cached `MJ: Tour Runs` rows
     * with any optimistic in-memory runs recorded in the current session.
     */
    public async GetRuns(): Promise<TourRunRecord[]> {
        const tourKeyById = new Map<string, string>();
        for (const t of this.Tours) {
            tourKeyById.set(NormalizeUUID(t.ID), t.TourKey);
        }
        const versionById = new Map<string, MJTourVersionEntity>();
        for (const v of this.TourVersions) {
            versionById.set(NormalizeUUID(v.ID), v);
        }

        const runsById = new Map<string, TourRunRecord>();
        for (const entity of this.UserRuns) {
            const record = this.mapRunEntityToRecord(entity, tourKeyById, versionById);
            runsById.set(NormalizeUUID(record.RunID), record);
        }

        for (const [clientId, optRun] of this._optimisticRuns.entries()) {
            const serverId = this._serverRunIdsByClientId.get(clientId);
            const targetKey = NormalizeUUID(serverId ?? optRun.RunID);
            if (!runsById.has(targetKey)) {
                runsById.set(targetKey, {
                    ...optRun,
                    RunID: serverId ?? optRun.RunID,
                    PathTaken: [...optRun.PathTaken],
                    Steps: [...optRun.Steps],
                });
            }
        }

        return Array.from(runsById.values());
    }

    /** Configures the batch debounce window (ms) for `RecordEvents`. Default is `50`. */
    public get EventFlushDebounceMs(): number {
        return this._eventFlushDebounceMs;
    }

    public set EventFlushDebounceMs(value: number) {
        this._eventFlushDebounceMs = Math.max(0, value);
    }

    /**
     * Queues tour telemetry events, updates local optimistic run state immediately, and
     * flushes the batch through `ToursRecordEventsOperation` after a short debounce.
     */
    public async RecordEvents(events: TourRunEvent[]): Promise<void> {
        if (!events || events.length === 0) {
            return;
        }

        for (const event of events) {
            this.applyOptimisticEvent(event);
        }

        const promise = new Promise<void>((resolve, reject) => {
            for (const event of events) {
                this._pendingEvents.push({ event, resolve, reject });
            }
        });

        if (this._eventFlushTimer) {
            clearTimeout(this._eventFlushTimer);
            this._eventFlushTimer = null;
        }

        if (this._eventFlushDebounceMs === 0) {
            void this.FlushPendingEvents();
        } else {
            this._eventFlushTimer = setTimeout(() => {
                void this.FlushPendingEvents();
            }, this._eventFlushDebounceMs);
        }

        return promise;
    }

    /** Immediately flushes all queued `RecordEvents` batches through `ToursRecordEventsOperation`. */
    public async FlushPendingEvents(): Promise<void> {
        if (this._eventFlushTimer) {
            clearTimeout(this._eventFlushTimer);
            this._eventFlushTimer = null;
        }

        if (this._eventFlushPromise) {
            await this._eventFlushPromise;
            if (this._pendingEvents.length > 0) {
                await this.FlushPendingEvents();
            }
            return;
        }

        if (this._pendingEvents.length === 0) {
            return;
        }

        const batch = this._pendingEvents.splice(0, this._pendingEvents.length);
        this._eventFlushPromise = this.executeEventBatch(batch).finally(() => {
            this._eventFlushPromise = null;
        });

        await this._eventFlushPromise;

        if (this._pendingEvents.length > 0) {
            await this.FlushPendingEvents();
        }
    }

    // ─── ITourServerPredicateEvaluator & Remote Operations ──────────────────

    /**
     * Evaluates batched server-side completion / eligibility predicates under the caller's
     * permissions via `ToursEvaluatePredicatesOperation`.
     */
    public async EvaluatePredicates(
        requests: TourServerPredicateRequest[],
    ): Promise<TourServerPredicateResult[]> {
        if (!requests || requests.length === 0) {
            return [];
        }

        const keyedRequests = requests.map((req, index) => ({
            requestKey: `${index}:${req.PredicateKey}`,
            request: req,
        }));

        const input: ToursEvaluatePredicatesInput = {
            Predicates: keyedRequests.map(({ requestKey, request }) => {
                const params = request.Params ?? {};
                const queryParams = isPrimitiveRecord(params['QueryParams']) ? params['QueryParams'] : undefined;
                return {
                    RequestKey: requestKey,
                    PredicateType: request.PredicateKey,
                    EntityName: readOptionalString(params, 'EntityName'),
                    ExtraFilter: readOptionalString(params, 'ExtraFilter'),
                    QueryName: readOptionalString(params, 'QueryName'),
                    CategoryPath: readOptionalString(params, 'CategoryPath'),
                    QueryParams: queryParams,
                    AuthorizationName: readOptionalString(params, 'AuthorizationName'),
                    CustomConfig: request.Params,
                };
            }),
        };

        const opResult = await new ToursEvaluatePredicatesOperation().Execute(input, {
            provider: this.ProviderToUse,
        });

        if (!opResult.Success || !opResult.Output?.Success) {
            const message =
                opResult.ErrorMessage ??
                opResult.Output?.ErrorMessage ??
                'Server predicate evaluation failed.';
            return keyedRequests.map(({ request }) => ({
                PredicateKey: request.PredicateKey,
                Satisfied: false,
                ErrorMessage: message,
            }));
        }

        const resultsMap = opResult.Output.Results ?? {};
        return keyedRequests.map(({ requestKey, request }) => {
            const match = resultsMap[requestKey] ?? resultsMap[request.PredicateKey];
            if (!match) {
                return {
                    PredicateKey: request.PredicateKey,
                    Satisfied: false,
                    ErrorMessage: `No predicate result returned for '${request.PredicateKey}'.`,
                };
            }
            return {
                PredicateKey: request.PredicateKey,
                Satisfied: match.Satisfied,
                ErrorMessage: match.ErrorMessage,
            };
        });
    }

    /**
     * Snapshots an immutable `MJ: Tour Versions` record and optionally activates the tour
     * via `ToursPublishTourOperation`.
     */
    public async PublishTour(
        tourId: string,
        changeSummary?: string,
        activate: boolean = true,
    ): Promise<ToursPublishTourOutput> {
        const result = await new ToursPublishTourOperation().Execute(
            {
                TourId: tourId,
                ChangeSummary: changeSummary,
                Activate: activate,
            },
            { provider: this.ProviderToUse },
        );

        if (!result.Success || !result.Output) {
            return {
                Success: false,
                TourId: tourId,
                ErrorMessage: result.ErrorMessage ?? 'Failed to publish tour.',
            };
        }

        return result.Output;
    }

    /**
     * Re-attributes prior guest `VisitorKey` tour runs to the authenticated MJ user on sign-in
     * via `ToursClaimGuestRunsOperation`.
     */
    public async ClaimGuestRuns(visitorKey: string, surfaceKey?: string): Promise<ToursClaimGuestRunsOutput> {
        const result = await new ToursClaimGuestRunsOperation().Execute(
            {
                VisitorKey: visitorKey,
                SurfaceKey: surfaceKey,
            },
            { provider: this.ProviderToUse },
        );

        if (!result.Success || !result.Output) {
            return {
                Success: false,
                ClaimedRunCount: 0,
                ErrorMessage: result.ErrorMessage ?? 'Failed to claim guest tour runs.',
            };
        }

        return result.Output;
    }

    // ─── User Preferences (UserInfoEngine, never localStorage) ──────────────

    /** Reads the user's Guided Tours preferences from `UserInfoEngine` (`mj.tours.preferences.v1`). */
    public GetUserPreferences(): TourPreferences {
        const raw = this.getUserInfoEngine().GetSetting(TourEngine.UserPreferencesSettingKey);
        if (!raw || raw.trim().length === 0) {
            return { ...DEFAULT_TOUR_PREFERENCES };
        }
        try {
            const parsed = JSON.parse(raw) as Partial<TourPreferences>;
            return {
                OffersEnabled:
                    typeof parsed.OffersEnabled === 'boolean'
                        ? parsed.OffersEnabled
                        : DEFAULT_TOUR_PREFERENCES.OffersEnabled,
                PreferredGuideMode: isTourGuideMode(parsed.PreferredGuideMode)
                    ? parsed.PreferredGuideMode
                    : DEFAULT_TOUR_PREFERENCES.PreferredGuideMode,
                PreferredVoice: typeof parsed.PreferredVoice === 'string' ? parsed.PreferredVoice : undefined,
                Pace: isTourPace(parsed.Pace) ? parsed.Pace : undefined,
                ShowBeacons:
                    typeof parsed.ShowBeacons === 'boolean'
                        ? parsed.ShowBeacons
                        : DEFAULT_TOUR_PREFERENCES.ShowBeacons,
                Locale: typeof parsed.Locale === 'string' ? parsed.Locale : undefined,
            };
        } catch {
            return { ...DEFAULT_TOUR_PREFERENCES };
        }
    }

    /** Persists a partial update to the user's Guided Tours preferences via `UserInfoEngine`. */
    public UpdateUserPreferences(patch: Partial<TourPreferences>): void {
        const current = this.GetUserPreferences();
        const next: TourPreferences = {
            ...current,
            ...patch,
        };
        const userInfoEngine = this.getUserInfoEngine();
        userInfoEngine.SetSettingDebounced(
            TourEngine.UserPreferencesSettingKey,
            JSON.stringify(next),
            this.ProviderToUse?.CurrentUser,
        );
    }

    // ─── Private Helpers ────────────────────────────────────────────────────

    private getUserInfoEngine(): UserInfoEngine {
        const provider = this.ProviderToUse;
        if (provider?.InstanceConnectionString) {
            return UserInfoEngine.GetProviderInstance(provider, UserInfoEngine) as UserInfoEngine;
        }
        return UserInfoEngine.Instance;
    }

    private getInstanceConfigEngine(): InstanceConfigEngine {
        const provider = this.ProviderToUse;
        if (provider?.InstanceConnectionString) {
            return InstanceConfigEngine.GetProviderInstance(provider, InstanceConfigEngine) as InstanceConfigEngine;
        }
        return InstanceConfigEngine.Instance;
    }

    private buildCurrentPrincipal(): TourPrincipal {
        const user = this.ProviderToUse?.CurrentUser;
        if (!user?.ID) {
            return { Kind: 'Anonymous' };
        }
        const roles = (user.UserRoles ?? [])
            .map((r) => r.Role)
            .filter((name): name is string => typeof name === 'string' && name.length > 0);
        return {
            Kind: 'MJUser',
            UserId: user.ID,
            Roles: roles,
        };
    }

    private compileStepFromSnapshot(
        step: MJTourVersionEntity_ITourVersionStepSnapshot,
        stepTypeById: Map<string, MJTourStepTypeEntity>,
    ): TourStepDefinition {
        const stepTypeRow = stepTypeById.get(NormalizeUUID(step.StepTypeID));

        return {
            ID: step.ID,
            StepKey: step.StepKey,
            Sequence: step.Sequence,
            StepType: (step.StepTypeName || stepTypeRow?.Name || 'Spotlight') as TourStepTypeKey,
            DriverClass: step.DriverClass ?? step.StepTypeDriverClass ?? stepTypeRow?.DriverClass ?? null,
            Title: step.Title,
            Body: step.Body ?? undefined,
            Configuration: this.mapStepConfiguration(step.Configuration),
            Anchor: this.mapAnchor(step.Anchor),
            Placement: mapPlacement(step.Placement),
            Mode: step.Mode as TourStepMode,
            Prepare: this.mapPrepare(step.Prepare),
            Completion: this.mapCompletion(step.Completion),
            SkipWhen: this.mapSkipWhen(step.SkipWhen),
            OnMissing: mapOnMissing(step.OnMissing),
            IsOptional: step.IsOptional,
            GuideNotes: step.GuideNotes ?? undefined,
            VoiceScript: step.VoiceScript ?? undefined,
        };
    }

    private compileStepFromEntity(
        step: MJTourStepEntity,
        stepTypeById: Map<string, MJTourStepTypeEntity>,
    ): TourStepDefinition {
        const stepTypeRow = stepTypeById.get(NormalizeUUID(step.StepTypeID));
        const stepTypeName = (stepTypeRow?.Name || step.StepType || 'Spotlight') as TourStepTypeKey;
        const rawSkipWhen = parseJsonSafe<MJTourStepEntity_ITourCompletion | MJTourStepEntity_ITourCompletionFilter>(
            step.SkipWhen,
        );

        return {
            ID: step.ID,
            StepKey: step.StepKey,
            Sequence: step.Sequence,
            StepType: stepTypeName,
            DriverClass: step.DriverClass ?? stepTypeRow?.DriverClass ?? null,
            Title: step.Title,
            Body: step.Body ?? undefined,
            Configuration: this.mapStepConfiguration(step.ConfigurationObject),
            Anchor: this.mapAnchor(step.AnchorObject),
            Placement: mapPlacement(step.Placement),
            Mode: step.Mode as TourStepMode,
            Prepare: this.mapPrepare(step.PrepareObject),
            Completion: this.mapCompletion(step.CompletionObject),
            SkipWhen: this.mapSkipWhen(rawSkipWhen),
            OnMissing: mapOnMissing(step.OnMissing),
            IsOptional: step.IsOptional,
            GuideNotes: step.GuideNotes ?? undefined,
            VoiceScript: step.VoiceScript ?? undefined,
        };
    }

    private compilePathFromSnapshot(
        path: MJTourVersionEntity_ITourVersionStepPathSnapshot,
    ): TourStepPathDefinition {
        const condition =
            path.Condition == null
                ? null
                : typeof path.Condition === 'string'
                  ? path.Condition
                  : isFilterRecord(path.Condition)
                    ? mapGoalOrCompletionFilter(path.Condition)
                    : null;

        return {
            ID: path.ID,
            FromStepKey: path.FromStepKey,
            ToStepKey: path.ToStepKey,
            Condition: condition,
            Label: path.Label ?? undefined,
            Priority: path.Priority,
            IsDefault: path.IsDefault,
            Configuration: this.mapPathConfiguration(path.Configuration),
        };
    }

    private compilePathFromEntity(
        path: MJTourStepPathEntity,
        stepKeyById: Map<string, string>,
    ): TourStepPathDefinition | null {
        const fromKey = stepKeyById.get(NormalizeUUID(path.FromStepID));
        const toKey = stepKeyById.get(NormalizeUUID(path.ToStepID));
        if (!fromKey || !toKey) {
            return null;
        }
        return {
            ID: path.ID,
            FromStepKey: fromKey,
            ToStepKey: toKey,
            Condition: path.Condition,
            Label: path.Label ?? undefined,
            Priority: path.Priority,
            IsDefault: path.IsDefault,
            Configuration: this.mapPathConfiguration(path.ConfigurationObject),
        };
    }

    private compilePrerequisite(prereq: MJTourPrerequisiteEntity): TourPrerequisiteDefinition {
        const tourKeyById = new Map<string, string>();
        for (const t of this.Tours) {
            tourKeyById.set(NormalizeUUID(t.ID), t.TourKey);
        }

        const parsed = parseJsonSafe<Record<string, unknown>>(prereq.Condition);
        const requiredRole = parsed ? readOptionalString(parsed, 'RequiredRole') ?? readOptionalString(parsed, 'Role') : undefined;
        const requiredApp = parsed
            ? readOptionalString(parsed, 'RequiredApplicationName') ?? readOptionalString(parsed, 'Application')
            : undefined;
        const entityPermRaw = parsed?.['RequiredEntityPermission'] as
            | { EntityName?: string; Action?: 'Read' | 'Create' | 'Update' | 'Delete' }
            | undefined;

        return {
            ID: prereq.ID,
            PrerequisiteType: prereq.PrerequisiteType,
            RequiredTourKey: prereq.RequiredTourID ? tourKeyById.get(NormalizeUUID(prereq.RequiredTourID)) : undefined,
            RequiredRole: requiredRole,
            RequiredApplicationName: requiredApp,
            RequiredEntityPermission:
                entityPermRaw?.EntityName && entityPermRaw?.Action
                    ? { EntityName: entityPermRaw.EntityName, Action: entityPermRaw.Action }
                    : undefined,
            Condition: prereq.Condition,
            Strength: prereq.Strength,
        };
    }

    private compileTrigger(trigger: MJTourTriggerEntity): TourTriggerDefinition {
        const status: TourTriggerDefinition['Status'] =
            mapTriggerStatus(trigger.Status);
        return {
            ID: trigger.ID,
            TriggerType: trigger.TriggerType,
            Configuration: trigger.ConfigurationObject ? { ...trigger.ConfigurationObject } : undefined,
            Delivery: trigger.Delivery,
            CooldownDays: trigger.CooldownDays ?? undefined,
            Status: status,
        };
    }

    private compileOverridesForTour(tour: MJTourEntity): TourOverrideDefinition[] {
        const matching = this.TourOverrides.filter((ov) => UUIDsEqual(ov.TourID, tour.ID));
        return matching.map((ov) => {
            const rawPolicy = parseJsonSafe<MJTourEntity_ITourLaunchPolicy>(ov.LaunchPolicy);
            const rawConfig = parseJsonSafe<Record<string, unknown>>(ov.Configuration);
            const priorityRaw = rawConfig?.['Priority'];
            return {
                ID: ov.ID,
                TourKey: tour.TourKey,
                Scope: ov.Scope,
                RoleName: ov.Role ?? undefined,
                UserId: ov.UserID ?? undefined,
                Precedence: ov.Precedence,
                Status: ov.Status,
                AudienceFilter: ov.AudienceFilter,
                LaunchPolicy: this.mapLaunchPolicy(rawPolicy),
                IsDisabled: ov.IsDisabled,
                Priority: typeof priorityRaw === 'number' ? priorityRaw : undefined,
            };
        });
    }

    private mapLaunchPolicy(raw: MJTourEntity_ITourLaunchPolicy | null | undefined): ITourLaunchPolicy | null {
        if (!raw) return null;
        const record = toPlainRecord(raw);
        const policy: ITourLaunchPolicy = {};
        if (raw.AutoLaunch !== undefined) policy.AutoLaunch = raw.AutoLaunch;
        if (raw.MaxOffersPerUser !== undefined) policy.MaxAutoLaunches = raw.MaxOffersPerUser;
        const allowReplay = readOptionalBoolean(record, 'AllowReplay');
        if (allowReplay !== undefined) policy.AllowReplay = allowReplay;
        if (raw.RequireNavigationConsent !== undefined) {
            policy.RequireConsentForPrepareNav = raw.RequireNavigationConsent;
        }
        if (raw.HoldoutPercentage !== undefined) policy.HoldoutPercent = raw.HoldoutPercentage;
        if (raw.BypassBudget !== undefined) policy.CriticalBypass = raw.BypassBudget;
        if (raw.SmartDelayMs !== undefined) policy.SmartDelayMs = raw.SmartDelayMs;
        if (raw.AllowBeacons !== undefined) policy.ShowBeacons = raw.AllowBeacons;
        return policy;
    }

    private mapGoal(
        raw: MJTourEntity_ITourGoal | Record<string, unknown> | null | undefined,
    ): ITourGoal | null {
        if (!raw) return null;
        const record = toPlainRecord(raw);
        const rawType = readOptionalString(record, 'Type');
        if (!rawType || rawType === 'None') return null;
        const type = mapGoalType(rawType);
        const customKey = type === 'Custom' && rawType !== 'Custom' ? rawType : undefined;
        const rawFilter = record['Filter'];
        const predicateParams = isRecord(record['PredicateParams']) ? record['PredicateParams'] : undefined;
        return {
            Type: type,
            Description: readOptionalString(record, 'Description'),
            EntityName: readOptionalString(record, 'EntityName') ?? readOptionalString(record, 'Entity'),
            EventType: mapGoalActionToEventType(
                readOptionalString(record, 'EventType') ?? readOptionalString(record, 'Action'),
            ),
            Filter: isFilterRecord(rawFilter) ? mapGoalOrCompletionFilter(rawFilter) : undefined,
            PredicateKey: readOptionalString(record, 'PredicateKey') ?? readOptionalString(record, 'Predicate'),
            PredicateParams: predicateParams,
            SignalKey: readOptionalString(record, 'SignalKey') ?? readOptionalString(record, 'Signal'),
            UrlPattern: readOptionalString(record, 'UrlPattern') ?? readOptionalString(record, 'RoutePattern'),
            WindowDays: readOptionalNumber(record, 'WindowDays'),
            CustomKey: customKey,
        };
    }

    private mapStartLocation(
        raw: MJTourEntity_ITourStartLocation | Record<string, unknown> | null | undefined,
    ): ITourStartLocation | null {
        if (!raw) return null;
        const record = toPlainRecord(raw);
        return {
            ApplicationID: readOptionalString(record, 'ApplicationID'),
            ApplicationName: readOptionalString(record, 'ApplicationName') ?? readOptionalString(record, 'Application'),
            NavItemKey: readOptionalString(record, 'NavItemKey') ?? readOptionalString(record, 'NavItem'),
            DriverClass: readOptionalString(record, 'DriverClass'),
            EntityName: readOptionalString(record, 'EntityName') ?? readOptionalString(record, 'Entity'),
            RequireOpenRecord:
                readOptionalBoolean(record, 'RequireOpenRecord') ??
                readOptionalBoolean(record, 'RequiresOpenRecord'),
            UrlPattern: readOptionalString(record, 'UrlPattern') ?? readOptionalString(record, 'Url'),
        };
    }

    private mapTourConfiguration(
        raw: MJTourEntity_ITourConfiguration | Record<string, unknown> | null | undefined,
        versionTag: string | null | undefined,
    ): ITourConfiguration | null {
        if (!raw && !versionTag) return null;
        const record = raw ? toPlainRecord(raw) : undefined;
        let localizations: Record<string, ITourLocalizationEntry> | undefined;
        const rawLocalizations = record?.['localizations'];
        if (isRecord(rawLocalizations)) {
            localizations = {};
            for (const [locale, entryVal] of Object.entries(rawLocalizations)) {
                if (isRecord(entryVal)) {
                    localizations[locale] = {
                        Name: readOptionalString(entryVal, 'Name') ?? readOptionalString(entryVal, 'name'),
                        Description:
                            readOptionalString(entryVal, 'Description') ?? readOptionalString(entryVal, 'description'),
                    };
                }
            }
        }
        return {
            localizations,
            AppVersionTag:
                versionTag ?? (record ? readOptionalString(record, 'AppVersionTag') : undefined),
            Settings: record,
        };
    }

    private mapStepConfiguration(
        raw: MJTourStepEntity_ITourStepConfiguration | Record<string, unknown> | null | undefined,
    ): ITourStepConfiguration | undefined {
        if (!raw) return undefined;
        const record = toPlainRecord(raw);
        let localizations: Record<string, ITourStepLocalizationEntry> | undefined;
        const rawLocalizations = record['localizations'];
        if (isRecord(rawLocalizations)) {
            localizations = {};
            for (const [locale, entryVal] of Object.entries(rawLocalizations)) {
                if (isRecord(entryVal)) {
                    localizations[locale] = {
                        Title: readOptionalString(entryVal, 'Title') ?? readOptionalString(entryVal, 'title'),
                        Body: readOptionalString(entryVal, 'Body') ?? readOptionalString(entryVal, 'body'),
                        VoiceScript:
                            readOptionalString(entryVal, 'VoiceScript') ?? readOptionalString(entryVal, 'voiceScript'),
                        NextButtonText:
                            readOptionalString(entryVal, 'NextButtonText') ?? readOptionalString(entryVal, 'nextLabel'),
                        BackButtonText:
                            readOptionalString(entryVal, 'BackButtonText') ?? readOptionalString(entryVal, 'backLabel'),
                        DismissButtonText: readOptionalString(entryVal, 'DismissButtonText'),
                        GuideNotes:
                            readOptionalString(entryVal, 'GuideNotes') ?? readOptionalString(entryVal, 'guideNotes'),
                    };
                }
            }
        }
        return {
            ...record,
            localizations,
        };
    }

    private mapPathConfiguration(
        raw: MJTourStepPathEntity_ITourStepPathConfiguration | Record<string, unknown> | null | undefined,
    ): ITourStepPathConfiguration | undefined {
        if (!raw) return undefined;
        const record = toPlainRecord(raw);
        let localizations: Record<string, ITourStepPathLocalizationEntry> | undefined;
        const rawLocalizations = record['localizations'];
        if (isRecord(rawLocalizations)) {
            localizations = {};
            for (const [locale, entryVal] of Object.entries(rawLocalizations)) {
                if (isRecord(entryVal)) {
                    localizations[locale] = {
                        Label: readOptionalString(entryVal, 'Label') ?? readOptionalString(entryVal, 'label'),
                    };
                }
            }
        }
        return {
            localizations,
            Metadata: record,
        };
    }

    private mapLearningPathConfiguration(
        raw: MJLearningPathEntity_ILearningPathConfiguration | null | undefined,
    ): ILearningPathConfiguration | null {
        if (!raw) return null;
        let localizations: Record<string, ILearningPathLocalizationEntry> | undefined;
        if (raw.localizations) {
            localizations = {};
            for (const [locale, entry] of Object.entries(raw.localizations)) {
                localizations[locale] = {
                    Name: entry.name,
                    Description: entry.description,
                };
            }
        }
        return {
            localizations,
            AllowSkipOptional: typeof raw['AllowSkipOptional'] === 'boolean' ? raw['AllowSkipOptional'] : undefined,
            ShowEstimatedTime: typeof raw['ShowEstimatedTime'] === 'boolean' ? raw['ShowEstimatedTime'] : undefined,
        };
    }

    private mapAnchor(
        raw: MJTourStepEntity_ITourAnchor | Record<string, unknown> | null | undefined,
    ): ITourAnchor | null {
        if (!raw) return null;
        const record = toPlainRecord(raw);
        const strategy = readOptionalString(record, 'Strategy');
        if (!strategy) return null;
        const rawFallbacks = Array.isArray(record['Fallbacks']) ? record['Fallbacks'] : undefined;
        return {
            Strategy: strategy as TourAnchorStrategy,
            Key: readOptionalString(record, 'Key'),
            Entity: readOptionalString(record, 'Entity'),
            Field: readOptionalString(record, 'Field'),
            SectionKey: readOptionalString(record, 'SectionKey') ?? readOptionalString(record, 'Section'),
            RailKey: readOptionalString(record, 'RailKey') ?? readOptionalString(record, 'RailGroup'),
            ActionKey: readOptionalString(record, 'ActionKey') ?? readOptionalString(record, 'Action'),
            NavItemKey: readOptionalString(record, 'NavItemKey'),
            DriverClass: readOptionalString(record, 'DriverClass'),
            PageId: readOptionalString(record, 'PageId'),
            ColumnKey: readOptionalString(record, 'ColumnKey'),
            AppName: readOptionalString(record, 'AppName') ?? readOptionalString(record, 'Application'),
            Role: readOptionalString(record, 'Role'),
            Name: readOptionalString(record, 'Name'),
            Selector: readOptionalString(record, 'Selector'),
            WaitTimeoutMs:
                readOptionalNumber(record, 'WaitTimeoutMs') ?? readOptionalNumber(record, 'TimeoutMs'),
            Fallbacks: rawFallbacks
                ?.map((fb) => (isRecord(fb) ? this.mapAnchor(fb) : null))
                .filter((fb): fb is ITourAnchor => fb !== null),
        };
    }

    private mapPrepare(
        raw: MJTourStepEntity_ITourStepPrepare | Record<string, unknown> | null | undefined,
    ): ITourStepPrepare | null {
        if (!raw) return null;
        const record = toPlainRecord(raw);
        return {
            ApplicationID: readOptionalString(record, 'ApplicationID'),
            ApplicationName: readOptionalString(record, 'ApplicationName') ?? readOptionalString(record, 'Application'),
            NavItemKey: readOptionalString(record, 'NavItemKey') ?? readOptionalString(record, 'NavItem'),
            DriverClass: readOptionalString(record, 'DriverClass'),
            EntityName: readOptionalString(record, 'EntityName') ?? readOptionalString(record, 'Entity'),
            RecordIdTemplate: readOptionalString(record, 'RecordIdTemplate') ?? readOptionalString(record, 'RecordID'),
            RailKey: readOptionalString(record, 'RailKey') ?? readOptionalString(record, 'RailGroup'),
            SectionKey: readOptionalString(record, 'SectionKey') ?? readOptionalString(record, 'Section'),
            Url: readOptionalString(record, 'Url'),
            WaitForAnchorMs:
                readOptionalNumber(record, 'WaitForAnchorMs') ?? readOptionalNumber(record, 'WaitTimeoutMs'),
            Announcement: readOptionalString(record, 'Announcement'),
        };
    }

    private mapCompletion(
        raw: MJTourStepEntity_ITourCompletion | Record<string, unknown> | null | undefined,
    ): ITourCompletion | null {
        if (!raw) return null;
        const record = toPlainRecord(raw);
        const matchRaw = readOptionalString(record, 'Match') ?? readOptionalString(record, 'Mode');
        let checks: TourCompletionCheckSpec[] = [];
        if (Array.isArray(record['Checks'])) {
            checks = record['Checks']
                .filter((c): c is Record<string, unknown> => isRecord(c))
                .map((c) => this.mapCompletionCheck(c));
        } else if (typeof record['Type'] === 'string' && record['Type'].trim().length > 0) {
            checks = [this.mapCompletionCheck(record)];
        }
        if (checks.length === 0) {
            return null;
        }
        return {
            Checks: checks,
            Match: matchRaw === 'Any' ? 'Any' : 'All',
            TimeoutMs: readOptionalNumber(record, 'TimeoutMs'),
        };
    }

    private mapCompletionCheck(
        raw: MJTourStepEntity_ITourCompletionCheck | Record<string, unknown>,
    ): TourCompletionCheckSpec {
        const record = toPlainRecord(raw);
        const interaction = mapAnchorInteraction(
            readOptionalString(record, 'Interaction') ?? readOptionalString(record, 'Event'),
        );
        const actionRaw = readOptionalString(record, 'Action');
        const eventType = mapCompletionEntityAction(
            readOptionalString(record, 'EventType') ?? actionRaw,
        );
        const saveSubType =
            actionRaw === 'Create'
                ? 'create'
                : actionRaw === 'Update'
                  ? 'update'
                  : (readOptionalString(record, 'SaveSubType') as 'create' | 'update' | 'any' | undefined);

        const signalFilterRaw = record['SignalPayloadFilter'] ?? record['SignalFilter'];
        const filterRaw = record['Filter'];
        const nestedChecks = Array.isArray(record['Checks']) ? record['Checks'] : undefined;

        const operatorRaw = readOptionalString(record, 'Operator');
        const operator = operatorRaw && isFilterOperator(operatorRaw) ? operatorRaw : undefined;

        return {
            Type: readOptionalString(record, 'Type') ?? 'NextButton',
            Checks: nestedChecks
                ?.filter((c): c is Record<string, unknown> => isRecord(c))
                .map((c) => this.mapCompletionCheck(c)),
            SignalKey: readOptionalString(record, 'SignalKey') ?? readOptionalString(record, 'Signal'),
            SignalPayloadFilter: isFilterRecord(signalFilterRaw)
                ? mapGoalOrCompletionFilter(signalFilterRaw)
                : undefined,
            Interaction: interaction,
            AnchorKey: readOptionalString(record, 'AnchorKey'),
            AppName: readOptionalString(record, 'AppName') ?? readOptionalString(record, 'Application'),
            NavItemKey: readOptionalString(record, 'NavItemKey') ?? readOptionalString(record, 'NavItem'),
            DriverClass: readOptionalString(record, 'DriverClass'),
            EntityName: readOptionalString(record, 'EntityName') ?? readOptionalString(record, 'Entity'),
            UrlPattern: readOptionalString(record, 'UrlPattern') ?? readOptionalString(record, 'RoutePattern'),
            EventType: eventType,
            SaveSubType: saveSubType,
            Filter: isFilterRecord(filterRaw) ? mapGoalOrCompletionFilter(filterRaw) : undefined,
            FieldName: readOptionalString(record, 'FieldName') ?? readOptionalString(record, 'Field'),
            Operator: operator,
            Value: record['Value'] as TourCompletionCheckSpec['Value'],
            PredicateKey: readOptionalString(record, 'PredicateKey') ?? readOptionalString(record, 'Predicate'),
            PredicateParams: isRecord(record['PredicateParams'])
                ? record['PredicateParams']
                : isRecord(record['Params'])
                  ? record['Params']
                  : undefined,
            Prompt: readOptionalString(record, 'Prompt'),
            Config: isRecord(record['Config']) ? record['Config'] : undefined,
        };
    }

    private mapSkipWhen(
        raw:
            | MJTourStepEntity_ITourCompletion
            | MJTourStepEntity_ITourCompletionFilter
            | Record<string, unknown>
            | null
            | undefined,
    ): ITourCompletion | CompositeFilterDescriptor | null {
        if (!raw) return null;
        const record = toPlainRecord(raw);
        if (Array.isArray(record['Checks'])) {
            return this.mapCompletion(record);
        }
        if (isFilterRecord(record)) {
            return mapGoalOrCompletionFilter(record);
        }
        return null;
    }

    private resolveInstalledVersionForTour(
        tour: MJTourEntity,
        normalizedVersions: Map<string, string>,
    ): string | undefined {
        if (tour.ApplicationID) {
            const byId = normalizedVersions.get(NormalizeUUID(tour.ApplicationID).toLowerCase());
            if (byId) return byId;
        }
        if (tour.Application) {
            const byName = normalizedVersions.get(tour.Application.trim().toLowerCase());
            if (byName) return byName;
        }
        if (!tour.ApplicationID && !tour.Application) {
            return normalizedVersions.get('core') ?? normalizedVersions.get('mj');
        }
        return undefined;
    }

    private versionMatchesTag(installedVersion: string, versionTag: string): boolean {
        const installed = installedVersion.trim().toLowerCase();
        const tag = versionTag.trim().toLowerCase();
        if (installed === tag) {
            return true;
        }
        return installed.startsWith(`${tag}.`) || installed.startsWith(`${tag}-`);
    }

    private mapRunEntityToRecord(
        entity: MJTourRunEntity,
        tourKeyById: Map<string, string>,
        versionById: Map<string, MJTourVersionEntity>,
    ): TourRunRecord {
        const pathEntries: MJTourRunEntity_ITourRunPathEntry[] = entity.PathTakenObject ?? [];
        const version = versionById.get(NormalizeUUID(entity.TourVersionID));

        const steps: TourRunStepRecord[] = pathEntries.map((entry) => ({
            StepKey: entry.StepKey,
            EnteredAt: entry.EnteredAt,
            ExitedAt: entry.ExitedAt,
            Outcome: entry.Outcome ?? 'Completed',
            AnchorResolution: 'Registered',
            QuestionCount: 0,
        }));

        return {
            RunID: entity.ID,
            TourKey: tourKeyById.get(NormalizeUUID(entity.TourID)) ?? entity.Tour ?? '',
            TourID: entity.TourID,
            TourVersionID: entity.TourVersionID,
            VersionNumber: version?.VersionNumber,
            UserID: entity.UserID,
            VisitorKey: entity.VisitorKey,
            SurfaceID: entity.SurfaceID,
            Status: entity.Status as TourRunStatus,
            GuideMode: entity.GuideMode as TourSessionGuideMode,
            DirectorType: entity.DirectorType,
            CurrentStepKey: entity.CurrentStepKey,
            PathTaken: pathEntries.map((p) => p.StepKey),
            LaunchSource: mapEntityLaunchSourceToRuntime(entity.LaunchSource),
            LaunchedByAgentRunID: entity.LaunchedByAgentRunID,
            StartedAt: entity.StartedAt
                ? new Date(entity.StartedAt).toISOString()
                : new Date(entity.__mj_CreatedAt ?? Date.now()).toISOString(),
            CompletedAt: entity.CompletedAt ? new Date(entity.CompletedAt).toISOString() : null,
            GoalMetAt: entity.GoalMetAt ? new Date(entity.GoalMetAt).toISOString() : null,
            SnoozedUntil: entity.SnoozedUntil ? new Date(entity.SnoozedUntil).toISOString() : null,
            IsHoldout: entity.IsHoldout,
            Steps: steps,
        };
    }

    private applyOptimisticEvent(event: TourRunEvent): void {
        const key = NormalizeUUID(event.RunID);
        let existing = this._optimisticRuns.get(key);
        if (!existing) {
            if (event.EventType !== 'RunStarted') {
                return;
            }
            const tour = this.Tours.find((t) => t.TourKey === event.TourKey);
            existing = {
                RunID: event.RunID,
                TourKey: event.TourKey,
                TourID: tour?.ID,
                TourVersionID: event.TourVersionID,
                UserID: this.ProviderToUse?.CurrentUser?.ID ?? null,
                Status: 'In Progress',
                GuideMode: event.GuideMode ?? 'Visual',
                DirectorType: event.DirectorType ?? 'Visual',
                CurrentStepKey: event.StepKey ?? null,
                PathTaken: event.StepKey ? [event.StepKey] : [],
                LaunchSource: event.LaunchSource ?? 'Launcher',
                StartedAt: event.Timestamp,
                Steps: [],
            };
            this._optimisticRuns.set(key, existing);
            return;
        }

        switch (event.EventType) {
            case 'StepEntered':
                if (event.StepKey) {
                    existing.CurrentStepKey = event.StepKey;
                    if (!existing.PathTaken.includes(event.StepKey)) {
                        existing.PathTaken.push(event.StepKey);
                    }
                    existing.Steps.push({
                        StepKey: event.StepKey,
                        EnteredAt: event.Timestamp,
                        Outcome: 'Completed',
                        AnchorResolution: event.AnchorResolution ?? 'Registered',
                        QuestionCount: 0,
                    });
                }
                break;
            case 'StepCompleted':
            case 'StepSkipped':
            case 'AnchorMissing':
                if (event.StepKey) {
                    const last = [...existing.Steps].reverse().find((s) => s.StepKey === event.StepKey);
                    if (last) {
                        last.ExitedAt = event.Timestamp;
                        if (event.Outcome) last.Outcome = event.Outcome;
                        if (event.AnchorResolution) last.AnchorResolution = event.AnchorResolution;
                    }
                }
                break;
            case 'DirectorChanged':
                if (event.DirectorType) existing.DirectorType = event.DirectorType;
                if (event.GuideMode) existing.GuideMode = event.GuideMode;
                break;
            case 'RunCompleted':
                existing.Status = 'Completed';
                existing.CompletedAt = event.Timestamp;
                break;
            case 'RunDismissed':
                existing.Status = 'Dismissed';
                existing.CompletedAt = event.Timestamp;
                break;
            case 'RunSnoozed':
                existing.Status = 'Snoozed';
                existing.SnoozedUntil = event.SnoozedUntil ?? null;
                break;
            case 'GoalMet':
                existing.GoalMetAt = event.Timestamp;
                break;
        }
    }

    private async executeEventBatch(batch: PendingEventBatchItem[]): Promise<void> {
        const tourIdByKey = new Map<string, string>();
        for (const t of this.Tours) {
            tourIdByKey.set(t.TourKey, t.ID);
        }

        const mappedEvents: RemoteEventRecord[] = batch.map(({ event }) =>
            this.mapRunEventToRemoteInput(event, tourIdByKey),
        );

        try {
            const opResult = await new ToursRecordEventsOperation().Execute(
                { Events: mappedEvents },
                { provider: this.ProviderToUse },
            );

            if (!opResult.Success || !opResult.Output?.Success) {
                const msg =
                    opResult.ErrorMessage ??
                    opResult.Output?.ErrorMessage ??
                    'Failed to record Guided Tour events.';
                LogError(`TourEngine.RecordEvents: ${msg}`);
                const err = new Error(msg);
                for (const item of batch) {
                    item.reject(err);
                }
                return;
            }

            const runIdsMap = opResult.Output.RunIdsByClientId;
            if (runIdsMap) {
                for (const [clientId, serverId] of Object.entries(runIdsMap)) {
                    this._serverRunIdsByClientId.set(NormalizeUUID(clientId), serverId);
                }
            }

            for (const item of batch) {
                item.resolve();
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            LogError(`TourEngine.RecordEvents threw: ${error.message}`);
            for (const item of batch) {
                item.reject(error);
            }
        }
    }

    private mapRunEventToRemoteInput(
        event: TourRunEvent,
        tourIdByKey: Map<string, string>,
    ): RemoteEventRecord {
        const clientKey = NormalizeUUID(event.RunID);
        const knownServerRunId = this._serverRunIdsByClientId.get(clientKey);
        const optimistic = this._optimisticRuns.get(clientKey);
        const remoteEventType = mapEventTypeToRemote(event.EventType);

        let stepOutcome: TourRunStepOutcome | undefined = event.Outcome;
        if (!stepOutcome && event.EventType === 'StepSkipped') {
            stepOutcome = 'Skipped';
        } else if (!stepOutcome && event.EventType === 'AnchorMissing') {
            stepOutcome = 'Anchor Missing';
        }

        const anchorResolution: RemoteAnchorResolution | undefined =
            event.AnchorResolution ??
            (event.EventType === 'AnchorMissing' ? 'Failed' : undefined);

        const detailsPayload: Record<string, unknown> = {
            ...(event.Payload ?? {}),
            ...(event.EventType !== remoteEventType ? { originalEventType: event.EventType } : {}),
        };
        const detailsJson =
            Object.keys(detailsPayload).length > 0 ? JSON.stringify(detailsPayload) : undefined;

        const pathTakenJson =
            optimistic && optimistic.Steps.length > 0
                ? JSON.stringify(
                      optimistic.Steps.map(
                          (s): MJTourRunEntity_ITourRunPathEntry => ({
                              StepKey: s.StepKey,
                              EnteredAt: s.EnteredAt,
                              ExitedAt: s.ExitedAt,
                              Outcome: s.Outcome,
                          }),
                      ),
                  )
                : undefined;

        return {
            RunClientId: event.RunID,
            RunId: knownServerRunId,
            TourId: tourIdByKey.get(event.TourKey),
            TourKey: event.TourKey,
            TourVersionId: event.TourVersionID,
            EventType: remoteEventType,
            Timestamp: event.Timestamp,
            GuideMode: event.GuideMode,
            DirectorType: event.DirectorType,
            LaunchSource: event.LaunchSource as RemoteLaunchSource | undefined,
            CurrentStepKey: event.StepKey,
            StepOutcome: stepOutcome,
            AnchorResolution: anchorResolution,
            QuestionCountDelta: event.EventType === 'QuestionAsked' ? 1 : undefined,
            PathTakenJson: pathTakenJson,
            SnoozedUntil: event.SnoozedUntil,
            DetailsJson: detailsJson,
        };
    }
}

// ─── Pure Mapping Helpers ────────────────────────────────────────────────────

function mapPlacement(placement: EntityStepPlacement | undefined): TourStepPlacement {
    switch (placement) {
        case 'Top':
            return 'top';
        case 'Bottom':
            return 'bottom';
        case 'Left':
            return 'left';
        case 'Right':
            return 'right';
        case 'Center':
            return 'center';
        case 'Auto':
        default:
            return 'auto';
    }
}

function mapOnMissing(onMissing: EntityStepOnMissing | undefined): TourOnMissingPolicy {
    switch (onMissing) {
        case 'Agent Recover':
            return 'AgentRecover';
        case 'Skip':
            return 'Skip';
        case 'Stall':
            return 'Stall';
        case 'Center':
        default:
            return 'Center';
    }
}

function mapTriggerStatus(status: EntityTriggerStatus): TourTriggerDefinition['Status'] {
    return status === 'Active' ? 'Active' : 'Disabled';
}

function mapEntityLaunchSourceToRuntime(source: EntityRunLaunchSource): TourLaunchSource {
    if (source === 'Empty State') {
        return 'Trigger';
    }
    return source;
}

function mapEventTypeToRemote(eventType: TourRunEvent['EventType']): RemoteEventType {
    switch (eventType) {
        case 'RunStarted':
            return 'RunStarted';
        case 'StepEntered':
            return 'StepEntered';
        case 'StepCompleted':
        case 'StepSkipped':
        case 'AnchorMissing':
            return 'StepCompleted';
        case 'RunCompleted':
            return 'RunCompleted';
        case 'RunDismissed':
            return 'RunDismissed';
        case 'RunSnoozed':
            return 'RunSnoozed';
        case 'GoalMet':
            return 'GoalMet';
        case 'RunPaused':
        case 'RunResumed':
        case 'DirectorChanged':
        case 'QuestionAsked':
        default:
            return 'RunUpdated';
    }
}

function mapGoalType(rawType: string): ITourGoal['Type'] {
    switch (rawType) {
        case 'EntityEvent':
            return 'EntityEvent';
        case 'ServerPredicate':
            return 'ServerPredicate';
        case 'Signal':
            return 'Signal';
        case 'Navigation':
            return 'Navigation';
        case 'Custom':
        default:
            return 'Custom';
    }
}

function mapGoalActionToEventType(
    action: string | undefined,
): ITourGoal['EventType'] | undefined {
    switch (action) {
        case 'Save':
        case 'Create':
        case 'Update':
        case 'save':
            return 'save';
        case 'Delete':
        case 'delete':
            return 'delete';
        case 'any':
            return 'any';
        default:
            return undefined;
    }
}

function mapCompletionEntityAction(
    action: string | undefined,
): TourCompletionCheckSpec['EventType'] | undefined {
    switch (action) {
        case 'Save':
        case 'Create':
        case 'Update':
        case 'save':
            return 'save';
        case 'Delete':
        case 'delete':
            return 'delete';
        case 'new_record':
            return 'new_record';
        case 'any':
            return 'any';
        default:
            return undefined;
    }
}

function mapAnchorInteraction(
    value: string | undefined,
): TourCompletionCheckSpec['Interaction'] | undefined {
    switch (value) {
        case 'click':
        case 'focus':
        case 'change':
        case 'input':
        case 'any':
            return value;
        case 'submit':
            return 'click';
        default:
            return undefined;
    }
}

function mapGoalOrCompletionFilter(
    raw: MJTourEntity_ITourGoalFilter | MJTourStepEntity_ITourCompletionFilter | Record<string, unknown>,
): CompositeFilterDescriptor {
    const logic = raw.logic === 'or' ? 'or' : 'and';
    const filtersRaw = Array.isArray(raw.filters) ? raw.filters : [];
    return {
        logic,
        filters: filtersRaw
            .filter((item): item is Record<string, unknown> => isRecord(item))
            .map((item) => mapFilterNode(item)),
    };
}

function mapFilterNode(
    node:
        | MJTourEntity_ITourGoalSimpleFilter
        | MJTourEntity_ITourGoalFilter
        | MJTourStepEntity_ITourCompletionSimpleFilter
        | MJTourStepEntity_ITourCompletionFilter
        | Record<string, unknown>,
): FilterDescriptor | CompositeFilterDescriptor {
    if ('logic' in node && 'filters' in node && Array.isArray(node.filters)) {
        return mapGoalOrCompletionFilter(node);
    }
    const record = toPlainRecord(node);
    const op = readOptionalString(record, 'operator') ?? 'eq';
    return {
        field: readOptionalString(record, 'field') ?? '',
        operator: isFilterOperator(op) ? op : 'eq',
        value: record['value'] ?? null,
    };
}

function toPlainRecord(value: object): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = v;
    }
    return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isFilterRecord(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && ('logic' in value) && Array.isArray(value['filters']);
}

function readOptionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
    const val = obj[key];
    return typeof val === 'boolean' ? val : undefined;
}

function readOptionalNumber(obj: Record<string, unknown>, key: string): number | undefined {
    const val = obj[key];
    return typeof val === 'number' ? val : undefined;
}

function isFilterOperator(value: string): value is FilterOperator {
    return VALID_FILTER_OPERATORS.has(value as FilterOperator);
}

function isTourGuideMode(value: unknown): value is TourGuideMode {
    return value === 'Visual' || value === 'Chat' || value === 'Voice' || value === 'User Choice';
}

function isTourPace(value: unknown): value is NonNullable<TourPreferences['Pace']> {
    return value === 'slow' || value === 'normal' || value === 'fast';
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
    const val = obj[key];
    return typeof val === 'string' && val.length > 0 ? val : undefined;
}

function isPrimitiveRecord(
    value: unknown,
): value is Record<string, string | number | boolean | null> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    return Object.values(value).every(
        (v) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
}

function parseJsonSafe<T>(raw: string | null | undefined): T | null {
    if (!raw || raw.trim().length === 0) {
        return null;
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}
