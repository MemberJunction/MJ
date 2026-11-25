/**
 * @fileoverview Server implementations for all 5 Guided Tours Remote Operations:
 * - `Tours.RecordEvents`
 * - `Tours.EvaluatePredicates`
 * - `Tours.GetSurfaceTours`
 * - `Tours.ClaimGuestRuns`
 * - `Tours.PublishTour`
 * @module @memberjunction/tours-server
 */

import {
    BaseRemotableOperation,
    LogError,
    RemoteOperationError,
    RunView,
    type IMetadataProvider,
    type RemoteOpServerContext,
    type UserInfo,
} from '@memberjunction/core';
import {
    MJTourEntity,
    MJTourRunEntity,
    MJTourRunStepEntity,
    MJTourSurfaceEntity,
    MJTourSurfaceTourEntity,
    MJTourTriggerEntity,
    MJTourVersionEntity,
    ToursClaimGuestRunsOperation,
    ToursEvaluatePredicatesOperation,
    ToursGetSurfaceToursOperation,
    ToursPublishTourOperation,
    ToursRecordEventsOperation,
    type MJTourRunEntity_ITourRunPathEntry,
    type MJTourVersionEntity_ITourVersionDefinition,
    type ToursClaimGuestRunsInput,
    type ToursClaimGuestRunsOutput,
    type ToursEvaluatePredicatesInput,
    type ToursEvaluatePredicatesOutput,
    type ToursGetSurfaceToursInput,
    type ToursGetSurfaceToursOutput,
    type ToursPublishTourInput,
    type ToursPublishTourOutput,
    type ToursRecordEventsInput,
    type ToursRecordEventsOutput,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, MJGlobal, RegisterClass, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import type { TourDefinition, TourRunRecord, TourRunStepRecord } from '@memberjunction/tours-runtime';
import { BaseTourServerPredicate } from '../predicates/base-tour-server-predicate.js';
import {
    TourPublisherService,
    VersionDefinitionToRuntimeTour,
} from '../services/tour-publisher.service.js';

export const TOURS_RECORD_EVENTS_KEY = 'Tours.RecordEvents';
export const TOURS_EVALUATE_PREDICATES_KEY = 'Tours.EvaluatePredicates';
export const TOURS_GET_SURFACE_TOURS_KEY = 'Tours.GetSurfaceTours';
export const TOURS_CLAIM_GUEST_RUNS_KEY = 'Tours.ClaimGuestRuns';
export const TOURS_PUBLISH_TOUR_KEY = 'Tours.PublishTour';

const TOUR_SURFACE_RESOURCE_TYPE = 'Tour Surface';
const ANCHOR_MISS_MIN_SAMPLES = 5;
const ANCHOR_MISS_FAILURE_RATIO = 0.5;
const ANCHOR_MISS_SAMPLE_WINDOW = 20;

export interface VerifiedGuestTourClaims {
    IsGuest: boolean;
    SurfaceID: string | null;
    VisitorKey: string | null;
}

function isIsolatedGuestSession(user: UserInfo | undefined | null): boolean {
    if (!user) return true;
    if (user.IsMagicLinkAnonymous) return true;
    const scope = user.MagicLinkScope;
    return Boolean(scope?.ResourceID || scope?.ResourceType);
}

function getSystemOrFallbackUser(caller: UserInfo): UserInfo {
    try {
        const sysUser = UserCache.Instance?.GetSystemUser();
        if (sysUser) {
            return sysUser;
        }
    } catch {
        // Unit tests without populated UserCache fall back to caller
    }
    return caller;
}

/**
 * Resolves the authoritative `SurfaceID` and `VisitorKey` (with `mj_sid` fallback)
 * strictly from verified JWT claims mapped onto `UserInfo`.
 */
export async function ResolveVerifiedGuestTourClaims(
    user: UserInfo,
    provider: IMetadataProvider,
): Promise<VerifiedGuestTourClaims> {
    if (!isIsolatedGuestSession(user)) {
        return {
            IsGuest: false,
            SurfaceID: null,
            VisitorKey: null,
        };
    }

    const visitorKey =
        user.ReturningVisitorContext?.VisitorKey?.trim() ||
        user.AnonymousVisitorID?.trim() ||
        null;

    if (
        user.MagicLinkScope?.ResourceType === TOUR_SURFACE_RESOURCE_TYPE &&
        user.MagicLinkScope.ResourceID?.trim()
    ) {
        return {
            IsGuest: true,
            SurfaceID: user.MagicLinkScope.ResourceID.trim(),
            VisitorKey: visitorKey,
        };
    }

    const widgetId = user.WidgetGuestContext?.WidgetID?.trim();
    if (widgetId) {
        const serviceUser = getSystemOrFallbackUser(user);
        const rv = RunView.FromMetadataProvider(provider);
        const surfRes = await rv.RunView<MJTourSurfaceEntity>(
            {
                EntityName: 'MJ: Tour Surfaces',
                ExtraFilter: `ConversationWidgetInstanceID='${EscapeSQLString(widgetId)}' AND Status='Active'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            serviceUser,
        );
        if (surfRes.Success && surfRes.Results.length > 0) {
            return {
                IsGuest: true,
                SurfaceID: surfRes.Results[0].ID,
                VisitorKey: visitorKey,
            };
        }
    }

    return {
        IsGuest: true,
        SurfaceID: null,
        VisitorKey: visitorKey,
    };
}

function parseJsonSafely<T>(raw: string | null | undefined): T | null {
    if (!raw || !raw.trim()) {
        return null;
    }
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function mapEntityOutcomeToRuntimeOutcome(
    outcome: MJTourRunStepEntity['Outcome'],
): TourRunStepRecord['Outcome'] {
    return outcome ?? 'Completed';
}

function mapEntityAnchorResToRuntime(
    res: MJTourRunStepEntity['AnchorResolution'],
): TourRunStepRecord['AnchorResolution'] {
    switch (res) {
        case 'Registered':
        case 'Semantic':
        case 'Role':
        case 'Selector':
            return res;
        default:
            return 'Failed';
    }
}

/**
 * Server implementation of `Tours.RecordEvents`.
 * Supports both authenticated MJ users and isolated surface guest sessions.
 * For guests, `SurfaceID` and `VisitorKey` (with `mj_sid` fallback) are derived
 * strictly from verified JWT claims — never from client payload values.
 */
@RegisterClass(BaseRemotableOperation, TOURS_RECORD_EVENTS_KEY)
export class ToursRecordEventsServerOperation extends ToursRecordEventsOperation {
    public override readonly AllowScopeLimitedPrincipals = true;

    protected override async Authorize(
        _input: ToursRecordEventsInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        if (!user) {
            throw new RemoteOperationError('UNAUTHORIZED', 'Authentication required.');
        }
        if (isIsolatedGuestSession(user)) {
            if (!context?.provider) {
                throw new RemoteOperationError('FORBIDDEN', 'Guest session context could not be verified.');
            }
            const claims = await ResolveVerifiedGuestTourClaims(user, context.provider);
            if (!claims.SurfaceID || !claims.VisitorKey) {
                throw new RemoteOperationError(
                    'FORBIDDEN',
                    'Guest session lacks verified Tour Surface scope or visitor identifier.',
                );
            }
        }
        return true;
    }

    protected override async InternalExecute(
        input: ToursRecordEventsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ToursRecordEventsOutput> {
        const events = input.Events ?? [];
        if (events.length === 0) {
            return { Success: true, ProcessedCount: 0, RunIdsByClientId: {} };
        }

        const guestClaims = await ResolveVerifiedGuestTourClaims(user, provider);
        if (guestClaims.IsGuest && (!guestClaims.SurfaceID || !guestClaims.VisitorKey)) {
            throw new RemoteOperationError(
                'FORBIDDEN',
                'Guest session lacks verified Tour Surface scope or visitor identifier.',
            );
        }

        const dataUser = guestClaims.IsGuest ? getSystemOrFallbackUser(user) : user;
        const rv = RunView.FromMetadataProvider(provider);
        const runIdsByClientId: Record<string, string> = {};
        const tourCache = new Map<string, MJTourEntity>();
        const runCache = new Map<string, MJTourRunEntity>();
        const toursToCheckAnchorHealth = new Set<string>();
        let processedCount = 0;

        for (const ev of events) {
            const tour = await this.resolveTour(ev.TourId, ev.TourKey, rv, dataUser, tourCache);
            if (!tour) {
                continue;
            }

            if (guestClaims.IsGuest && guestClaims.SurfaceID) {
                const assigned = await this.isTourAssignedToSurface(
                    tour.ID,
                    guestClaims.SurfaceID,
                    rv,
                    dataUser,
                );
                if (!assigned) {
                    throw new RemoteOperationError(
                        'FORBIDDEN',
                        `Tour '${tour.TourKey}' is not assigned to this guest surface.`,
                    );
                }
            }

            const clientUuid =
                ev.RunClientId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ev.RunClientId.trim())
                    ? ev.RunClientId.trim()
                    : undefined;
            const existingRunId =
                ev.RunId?.trim() ||
                (ev.RunClientId ? runIdsByClientId[ev.RunClientId] : undefined) ||
                clientUuid;

            let run = existingRunId ? runCache.get(existingRunId.toLowerCase()) : undefined;
            if (!run && existingRunId) {
                const loaded = await provider.GetEntityObject<MJTourRunEntity>('MJ: Tour Runs', dataUser);
                if (await loaded.Load(existingRunId)) {
                    this.assertRunOwnership(loaded, user, guestClaims);
                    run = loaded;
                    runCache.set(loaded.ID.toLowerCase(), loaded);
                }
            }

            if (!run) {
                const versionId = await this.resolveVersionId(tour, ev.TourVersionId, rv, dataUser);
                if (!versionId) {
                    continue;
                }
                run = await provider.GetEntityObject<MJTourRunEntity>('MJ: Tour Runs', dataUser);
                if (clientUuid) {
                    run.ID = clientUuid;
                }
                run.UserID = guestClaims.IsGuest ? null : user.ID;
                run.VisitorKey = guestClaims.IsGuest ? guestClaims.VisitorKey : null;
                run.SurfaceID = guestClaims.IsGuest ? guestClaims.SurfaceID : null;
                run.TourID = tour.ID;
                run.TourVersionID = versionId;
                run.Status = 'In Progress';
                run.GuideMode = ev.GuideMode ?? 'Visual';
                run.DirectorType = ev.DirectorType ?? run.GuideMode;
                run.LaunchSource = ev.LaunchSource ?? 'Launcher';
                run.LaunchedByAgentRunID = ev.LaunchedByAgentRunId ?? null;
                run.StartedAt = ev.Timestamp ? new Date(ev.Timestamp) : new Date();
                run.IsHoldout = ev.IsHoldout ?? false;
                run.ConversationID = ev.ConversationId ?? null;
                run.AgentSessionID = ev.AgentSessionId ?? null;
            }

            this.applyEventToRun(run, ev);
            if (!(await run.Save())) {
                LogError(
                    `[Tours.RecordEvents] Failed saving TourRun for '${tour.TourKey}': ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
                continue;
            }

            runCache.set(run.ID.toLowerCase(), run);
            if (ev.RunClientId) {
                runIdsByClientId[ev.RunClientId] = run.ID;
            }

            if (ev.EventType === 'StepEntered' || ev.EventType === 'StepCompleted') {
                await this.upsertRunStep(provider, rv, dataUser, run.ID, ev);
                if (ev.AnchorResolution === 'Failed' || ev.StepOutcome === 'Anchor Missing') {
                    toursToCheckAnchorHealth.add(tour.ID);
                }
            }

            processedCount++;
        }

        const autoPausedTourKeys: string[] = [];
        for (const tourId of toursToCheckAnchorHealth) {
            const pausedKey = await this.evaluateAndPauseBrokenTourTriggers(
                tourId,
                rv,
                dataUser,
                tourCache,
            );
            if (pausedKey) {
                autoPausedTourKeys.push(pausedKey);
            }
        }

        return {
            Success: true,
            ProcessedCount: processedCount,
            RunIdsByClientId: runIdsByClientId,
            ...(autoPausedTourKeys.length > 0 ? { AutoPausedTourKeys: autoPausedTourKeys } : {}),
        };
    }

    private assertRunOwnership(
        run: MJTourRunEntity,
        user: UserInfo,
        claims: VerifiedGuestTourClaims,
    ): void {
        if (claims.IsGuest) {
            const sameVisitor = run.UserID == null && run.VisitorKey === claims.VisitorKey;
            const sameSurface =
                claims.SurfaceID != null &&
                run.SurfaceID != null &&
                UUIDsEqual(run.SurfaceID, claims.SurfaceID);
            if (!sameVisitor || !sameSurface) {
                throw new RemoteOperationError(
                    'FORBIDDEN',
                    'Guest session cannot modify a TourRun owned by another visitor or surface.',
                );
            }
            return;
        }
        if (run.UserID && !UUIDsEqual(run.UserID, user.ID)) {
            throw new RemoteOperationError('FORBIDDEN', 'Cannot modify another user tour run.');
        }
    }

    private applyEventToRun(
        run: MJTourRunEntity,
        ev: ToursRecordEventsInput['Events'][number],
    ): void {
        const ts = ev.Timestamp ? new Date(ev.Timestamp) : new Date();
        if (ev.CurrentStepKey !== undefined) {
            run.CurrentStepKey = ev.CurrentStepKey;
        }
        if (ev.GuideMode) {
            run.GuideMode = ev.GuideMode;
        }
        if (ev.DirectorType) {
            run.DirectorType = ev.DirectorType;
        }
        if (ev.PathTakenJson !== undefined) {
            run.PathTaken = ev.PathTakenJson;
        }
        if (ev.ConversationId) {
            run.ConversationID = ev.ConversationId;
        }
        if (ev.AgentSessionId) {
            run.AgentSessionID = ev.AgentSessionId;
        }

        switch (ev.EventType) {
            case 'RunStarted':
                run.Status = 'In Progress';
                if (!run.StartedAt) run.StartedAt = ts;
                break;
            case 'RunCompleted':
                run.Status = 'Completed';
                run.CompletedAt = ts;
                break;
            case 'RunDismissed':
                run.Status = 'Dismissed';
                break;
            case 'RunSnoozed':
                run.Status = 'Snoozed';
                run.SnoozedUntil = ev.SnoozedUntil ? new Date(ev.SnoozedUntil) : null;
                break;
            case 'GoalMet':
                run.GoalMetAt = ts;
                break;
            default:
                break;
        }
    }

    private async upsertRunStep(
        provider: IMetadataProvider,
        rv: RunView,
        dataUser: UserInfo,
        tourRunId: string,
        ev: ToursRecordEventsInput['Events'][number],
    ): Promise<void> {
        const stepKey = ev.CurrentStepKey?.trim();
        if (!stepKey) return;

        const seq = ev.StepSequence ?? 0;
        const existingRes = await rv.RunView<MJTourRunStepEntity>(
            {
                EntityName: 'MJ: Tour Run Steps',
                ExtraFilter: `TourRunID='${EscapeSQLString(tourRunId)}' AND StepKey='${EscapeSQLString(stepKey)}' AND Sequence=${seq}`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            dataUser,
        );

        let stepRow: MJTourRunStepEntity;
        if (existingRes.Success && existingRes.Results.length > 0) {
            stepRow = existingRes.Results[0];
        } else {
            stepRow = await provider.GetEntityObject<MJTourRunStepEntity>('MJ: Tour Run Steps', dataUser);
            stepRow.TourRunID = tourRunId;
            stepRow.StepKey = stepKey;
            stepRow.Sequence = seq;
            stepRow.EnteredAt = ev.Timestamp ? new Date(ev.Timestamp) : new Date();
            stepRow.QuestionCount = 0;
        }

        if (ev.EventType === 'StepCompleted') {
            stepRow.ExitedAt = ev.Timestamp ? new Date(ev.Timestamp) : new Date();
            if (ev.StepOutcome) {
                stepRow.Outcome = ev.StepOutcome;
            }
        }
        if (ev.AnchorResolution) {
            stepRow.AnchorResolution = ev.AnchorResolution;
        }
        if (typeof ev.QuestionCountDelta === 'number' && ev.QuestionCountDelta > 0) {
            stepRow.QuestionCount = (stepRow.QuestionCount ?? 0) + ev.QuestionCountDelta;
        }
        if (ev.DetailsJson !== undefined) {
            stepRow.Details = ev.DetailsJson;
        }

        if (!(await stepRow.Save())) {
            LogError(
                `[Tours.RecordEvents] Failed saving TourRunStep '${stepKey}' on run ${tourRunId}: ${stepRow.LatestResult?.CompleteMessage ?? 'unknown'}`,
            );
        }
    }

    private async resolveTour(
        tourId: string | undefined,
        tourKey: string,
        rv: RunView,
        dataUser: UserInfo,
        cache: Map<string, MJTourEntity>,
    ): Promise<MJTourEntity | null> {
        const cacheKey = tourId?.trim().toLowerCase() || `key:${tourKey.trim().toLowerCase()}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        const filter = tourId?.trim()
            ? `ID='${EscapeSQLString(tourId.trim())}'`
            : `TourKey='${EscapeSQLString(tourKey.trim())}'`;

        const res = await rv.RunView<MJTourEntity>(
            {
                EntityName: 'MJ: Tours',
                ExtraFilter: filter,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            dataUser,
        );
        if (!res.Success || res.Results.length === 0) {
            return null;
        }
        const tour = res.Results[0];
        cache.set(tour.ID.toLowerCase(), tour);
        cache.set(`key:${tour.TourKey.toLowerCase()}`, tour);
        return tour;
    }

    private async isTourAssignedToSurface(
        tourId: string,
        surfaceId: string,
        rv: RunView,
        dataUser: UserInfo,
    ): Promise<boolean> {
        const res = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Tour Surface Tours',
                ExtraFilter: `SurfaceID='${EscapeSQLString(surfaceId)}' AND TourID='${EscapeSQLString(tourId)}'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            dataUser,
        );
        return res.Success && res.Results.length > 0;
    }

    private async resolveVersionId(
        tour: MJTourEntity,
        requestedVersionId: string | undefined,
        rv: RunView,
        dataUser: UserInfo,
    ): Promise<string | null> {
        if (requestedVersionId?.trim()) {
            return requestedVersionId.trim();
        }
        if (tour.CurrentVersionID) {
            return tour.CurrentVersionID;
        }
        const res = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Tour Versions',
                ExtraFilter: `TourID='${EscapeSQLString(tour.ID)}'`,
                OrderBy: 'VersionNumber DESC',
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            dataUser,
        );
        return res.Success && res.Results.length > 0 ? res.Results[0].ID : null;
    }

    private async evaluateAndPauseBrokenTourTriggers(
        tourId: string,
        rv: RunView,
        dataUser: UserInfo,
        tourCache: Map<string, MJTourEntity>,
    ): Promise<string | null> {
        const runsRes = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Tour Runs',
                ExtraFilter: `TourID='${EscapeSQLString(tourId)}'`,
                OrderBy: '__mj_CreatedAt DESC',
                Fields: ['ID'],
                MaxRows: ANCHOR_MISS_SAMPLE_WINDOW,
                ResultType: 'simple',
            },
            dataUser,
        );
        if (!runsRes.Success || runsRes.Results.length === 0) {
            return null;
        }
        const runIds = runsRes.Results.map((r) => `'${EscapeSQLString(r.ID)}'`).join(', ');
        const stepsRes = await rv.RunView<MJTourRunStepEntity>(
            {
                EntityName: 'MJ: Tour Run Steps',
                ExtraFilter: `TourRunID IN (${runIds})`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: ANCHOR_MISS_SAMPLE_WINDOW,
                ResultType: 'entity_object',
            },
            dataUser,
        );
        if (!stepsRes.Success || stepsRes.Results.length < ANCHOR_MISS_MIN_SAMPLES) {
            return null;
        }

        const steps = stepsRes.Results;
        const failedCount = steps.filter(
            (s) => s.AnchorResolution === 'Failed' || s.Outcome === 'Anchor Missing',
        ).length;
        if (failedCount / steps.length <= ANCHOR_MISS_FAILURE_RATIO) {
            return null;
        }

        const triggersRes = await rv.RunView<MJTourTriggerEntity>(
            {
                EntityName: 'MJ: Tour Triggers',
                ExtraFilter: `TourID='${EscapeSQLString(tourId)}' AND Status='Active'`,
                ResultType: 'entity_object',
            },
            dataUser,
        );
        if (!triggersRes.Success || triggersRes.Results.length === 0) {
            return null;
        }

        let pausedAny = false;
        for (const trigger of triggersRes.Results) {
            if (!trigger.ContextCurrentUser) {
                trigger.ContextCurrentUser = dataUser;
            }
            trigger.Status = 'Paused';
            if (await trigger.Save()) {
                pausedAny = true;
            }
        }
        if (!pausedAny) {
            return null;
        }

        const tour = tourCache.get(tourId.toLowerCase());
        return tour?.TourKey ?? tourId;
    }
}

/**
 * Server implementation of `Tours.EvaluatePredicates`.
 * Always executes predicates strictly as the caller's `user` (never elevated),
 * so guest and standard users only see records and queries they are permitted to read.
 */
@RegisterClass(BaseRemotableOperation, TOURS_EVALUATE_PREDICATES_KEY)
export class ToursEvaluatePredicatesServerOperation extends ToursEvaluatePredicatesOperation {
    public override readonly AllowScopeLimitedPrincipals = true;

    protected override async Authorize(
        _input: ToursEvaluatePredicatesInput,
        user: UserInfo,
    ): Promise<boolean> {
        if (!user) {
            throw new RemoteOperationError('UNAUTHORIZED', 'Authentication required.');
        }
        return true;
    }

    protected override async InternalExecute(
        input: ToursEvaluatePredicatesInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ToursEvaluatePredicatesOutput> {
        const results: ToursEvaluatePredicatesOutput['Results'] = {};
        const predicates = input.Predicates ?? [];

        for (const pred of predicates) {
            const key = pred.RequestKey?.trim();
            if (!key) continue;

            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTourServerPredicate>(
                BaseTourServerPredicate,
                pred.PredicateType,
            );
            if (!instance) {
                results[key] = {
                    Satisfied: false,
                    ErrorMessage: `Unknown tour server predicate '${pred.PredicateType}'.`,
                };
                continue;
            }

            try {
                results[key] = await instance.Evaluate(pred, provider, user);
            } catch (e) {
                results[key] = {
                    Satisfied: false,
                    ErrorMessage: e instanceof Error ? e.message : String(e),
                };
            }
        }

        return {
            Success: true,
            Results: results,
        };
    }
}

/**
 * Server implementation of `Tours.GetSurfaceTours`.
 * Loads an active `MJ: Tour Surfaces` row by `SurfaceKey`, joins `MJ: Tour Surface Tours`,
 * active `MJ: Tours`, and pinned `MJ: Tour Versions`, and returns published tour snapshots
 * plus prior runs for the verified visitor/user.
 */
@RegisterClass(BaseRemotableOperation, TOURS_GET_SURFACE_TOURS_KEY)
export class ToursGetSurfaceToursServerOperation extends ToursGetSurfaceToursOperation {
    public override readonly AllowScopeLimitedPrincipals = true;

    protected override async Authorize(
        input: ToursGetSurfaceToursInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        if (!user) {
            throw new RemoteOperationError('UNAUTHORIZED', 'Authentication required.');
        }
        if (isIsolatedGuestSession(user)) {
            if (!context?.provider) {
                throw new RemoteOperationError('FORBIDDEN', 'Guest session context could not be verified.');
            }
            const claims = await ResolveVerifiedGuestTourClaims(user, context.provider);
            if (!claims.SurfaceID) {
                throw new RemoteOperationError('FORBIDDEN', 'Guest session lacks verified Tour Surface scope.');
            }
            const rv = RunView.FromMetadataProvider(context.provider);
            const serviceUser = getSystemOrFallbackUser(user);
            const surfRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Tour Surfaces',
                    ExtraFilter: `SurfaceKey='${EscapeSQLString(input.SurfaceKey.trim())}' AND Status='Active'`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                serviceUser,
            );
            if (!surfRes.Success || surfRes.Results.length === 0 || !UUIDsEqual(surfRes.Results[0].ID, claims.SurfaceID)) {
                throw new RemoteOperationError(
                    'FORBIDDEN',
                    'Guest session is not authorized for the requested Tour Surface.',
                );
            }
        }
        return true;
    }

    protected override async InternalExecute(
        input: ToursGetSurfaceToursInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ToursGetSurfaceToursOutput> {
        const surfaceKey = input.SurfaceKey.trim();
        if (!surfaceKey) {
            return {
                Success: false,
                ToursJson: '[]',
                RunsJson: '[]',
                ErrorMessage: 'SurfaceKey is required.',
            };
        }

        const guestClaims = await ResolveVerifiedGuestTourClaims(user, provider);
        const dataUser = guestClaims.IsGuest ? getSystemOrFallbackUser(user) : user;
        const rv = RunView.FromMetadataProvider(provider);

        const surfaceRes = await rv.RunView<MJTourSurfaceEntity>(
            {
                EntityName: 'MJ: Tour Surfaces',
                ExtraFilter: `SurfaceKey='${EscapeSQLString(surfaceKey)}' AND Status='Active'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            dataUser,
        );
        if (!surfaceRes.Success || surfaceRes.Results.length === 0) {
            return {
                Success: false,
                ToursJson: '[]',
                RunsJson: '[]',
                ErrorMessage: surfaceRes.ErrorMessage || `Active Tour Surface '${surfaceKey}' was not found.`,
            };
        }

        const surface = surfaceRes.Results[0];
        if (guestClaims.IsGuest && (!guestClaims.SurfaceID || !UUIDsEqual(guestClaims.SurfaceID, surface.ID))) {
            throw new RemoteOperationError('FORBIDDEN', 'Surface mismatch against verified guest claims.');
        }

        const assignmentsRes = await rv.RunView<MJTourSurfaceTourEntity>(
            {
                EntityName: 'MJ: Tour Surface Tours',
                ExtraFilter: `SurfaceID='${EscapeSQLString(surface.ID)}'`,
                OrderBy: 'Sequence ASC',
                ResultType: 'entity_object',
            },
            dataUser,
        );
        if (!assignmentsRes.Success) {
            return {
                Success: false,
                SurfaceId: surface.ID,
                SurfaceKey: surface.SurfaceKey,
                ToursJson: '[]',
                RunsJson: '[]',
                ErrorMessage: assignmentsRes.ErrorMessage || 'Failed loading surface tour assignments.',
            };
        }

        const assignments = assignmentsRes.Results ?? [];
        if (assignments.length === 0) {
            return {
                Success: true,
                SurfaceId: surface.ID,
                SurfaceKey: surface.SurfaceKey,
                ConversationWidgetInstanceId: surface.ConversationWidgetInstanceID ?? undefined,
                ToursJson: '[]',
                RunsJson: '[]',
            };
        }

        const tourIdIn = assignments.map((a) => `'${EscapeSQLString(a.TourID)}'`).join(', ');
        const [toursRes, triggersRes] = await rv.RunViews(
            [
                {
                    EntityName: 'MJ: Tours',
                    ExtraFilter: `ID IN (${tourIdIn}) AND Status='Active' AND CurrentVersionID IS NOT NULL`,
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: Tour Triggers',
                    ExtraFilter: `TourID IN (${tourIdIn}) AND Status='Active'`,
                    OrderBy: 'Priority DESC',
                    ResultType: 'entity_object',
                },
            ],
            dataUser,
        );

        const activeTours = (toursRes.Success ? toursRes.Results : []) as MJTourEntity[];
        const triggers = (triggersRes.Success ? triggersRes.Results : []) as MJTourTriggerEntity[];

        const versionIds = activeTours
            .map((t) => t.CurrentVersionID)
            .filter((id): id is string => Boolean(id));

        const versionsById = new Map<string, MJTourVersionEntity>();
        if (versionIds.length > 0) {
            const verIn = versionIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
            const versionsRes = await rv.RunView<MJTourVersionEntity>(
                {
                    EntityName: 'MJ: Tour Versions',
                    ExtraFilter: `ID IN (${verIn})`,
                    ResultType: 'entity_object',
                },
                dataUser,
            );
            if (versionsRes.Success) {
                for (const v of versionsRes.Results ?? []) {
                    versionsById.set(v.ID.toLowerCase(), v);
                }
            }
        }

        const toursById = new Map<string, MJTourEntity>(
            activeTours.map((t) => [t.ID.toLowerCase(), t]),
        );

        const triggersByTourId = new UUIDMap<MJTourTriggerEntity[]>();
        for (const tr of triggers) {
            const list = triggersByTourId.Get(tr.TourID) ?? [];
            list.push(tr);
            triggersByTourId.Set(tr.TourID, list);
        }

        const runtimeTours: TourDefinition[] = [];
        for (const assignment of assignments) {
            const tour = toursById.get(assignment.TourID.toLowerCase());
            if (!tour || !tour.CurrentVersionID) continue;
            const version = versionsById.get(tour.CurrentVersionID.toLowerCase());
            if (!version) continue;

            const parsedDef = parseJsonSafely<MJTourVersionEntity_ITourVersionDefinition>(
                version.Definition,
            );
            if (!parsedDef) continue;

            const runtimeTour = VersionDefinitionToRuntimeTour(parsedDef, {
                TourID: tour.ID,
                TourVersionID: version.ID,
                VersionNumber: version.VersionNumber,
                ApplicationID: tour.ApplicationID,
                Status: tour.Status,
                RunInAuthenticatedHosts: tour.RunInAuthenticatedHosts,
                Priority: tour.Priority,
            });

            if (assignment.StartLocationOverride) {
                const overrideLoc = parseJsonSafely<TourDefinition['StartLocation']>(
                    assignment.StartLocationOverride,
                );
                if (overrideLoc) {
                    runtimeTour.StartLocation = overrideLoc;
                }
            }

            runtimeTour.Triggers = (triggersByTourId.Get(tour.ID) ?? []).map((tr) => ({
                ID: tr.ID,
                TriggerType: tr.TriggerType,
                Configuration: parseJsonSafely<Record<string, unknown>>(tr.Configuration) ?? undefined,
                Delivery: tr.Delivery,
                CooldownDays: tr.CooldownDays ?? undefined,
                Status: tr.Status === 'Active' ? 'Active' : 'Disabled',
            }));

            runtimeTours.push(runtimeTour);
        }

        const priorRuns = await this.loadVisitorOrUserRuns(rv, dataUser, user, guestClaims, surface.ID, toursById);

        return {
            Success: true,
            SurfaceId: surface.ID,
            SurfaceKey: surface.SurfaceKey,
            ConversationWidgetInstanceId: surface.ConversationWidgetInstanceID ?? undefined,
            ToursJson: JSON.stringify(runtimeTours),
            RunsJson: JSON.stringify(priorRuns),
        };
    }

    private async loadVisitorOrUserRuns(
        rv: RunView,
        dataUser: UserInfo,
        caller: UserInfo,
        guestClaims: VerifiedGuestTourClaims,
        surfaceId: string,
        toursById: Map<string, MJTourEntity>,
    ): Promise<TourRunRecord[]> {
        let extraFilter: string;
        if (guestClaims.IsGuest) {
            if (!guestClaims.VisitorKey) {
                return [];
            }
            extraFilter = `SurfaceID='${EscapeSQLString(surfaceId)}' AND UserID IS NULL AND VisitorKey='${EscapeSQLString(guestClaims.VisitorKey)}'`;
        } else {
            extraFilter = `UserID='${EscapeSQLString(caller.ID)}'`;
        }

        const runsRes = await rv.RunView<MJTourRunEntity>(
            {
                EntityName: 'MJ: Tour Runs',
                ExtraFilter: extraFilter,
                OrderBy: '__mj_UpdatedAt DESC',
                ResultType: 'entity_object',
            },
            dataUser,
        );
        if (!runsRes.Success || runsRes.Results.length === 0) {
            return [];
        }

        const runs = runsRes.Results;
        const runIds = runs.map((r) => `'${EscapeSQLString(r.ID)}'`).join(', ');
        const stepsRes = await rv.RunView<MJTourRunStepEntity>(
            {
                EntityName: 'MJ: Tour Run Steps',
                ExtraFilter: `TourRunID IN (${runIds})`,
                OrderBy: 'Sequence ASC',
                ResultType: 'entity_object',
            },
            dataUser,
        );
        const runSteps = stepsRes.Success ? stepsRes.Results : [];
        const stepsByRunId = new Map<string, TourRunStepRecord[]>();
        for (const rs of runSteps) {
            const key = rs.TourRunID.toLowerCase();
            const list = stepsByRunId.get(key) ?? [];
            list.push({
                StepKey: rs.StepKey,
                EnteredAt: new Date(rs.EnteredAt).toISOString(),
                ExitedAt: rs.ExitedAt ? new Date(rs.ExitedAt).toISOString() : undefined,
                Outcome: mapEntityOutcomeToRuntimeOutcome(rs.Outcome),
                AnchorResolution: mapEntityAnchorResToRuntime(rs.AnchorResolution),
                QuestionCount: rs.QuestionCount,
            });
            stepsByRunId.set(key, list);
        }

        return runs.map((r) => {
            const pathEntries = parseJsonSafely<MJTourRunEntity_ITourRunPathEntry[]>(r.PathTaken) ?? [];
            const launchSource =
                r.LaunchSource === 'Empty State' ? 'Launcher' : r.LaunchSource;
            const tour = toursById.get(r.TourID.toLowerCase());
            return {
                RunID: r.ID,
                TourKey: tour?.TourKey ?? '',
                TourID: r.TourID,
                TourVersionID: r.TourVersionID,
                UserID: r.UserID,
                VisitorKey: r.VisitorKey,
                SurfaceID: r.SurfaceID,
                Status: r.Status,
                GuideMode: r.GuideMode,
                DirectorType: r.DirectorType,
                CurrentStepKey: r.CurrentStepKey,
                PathTaken: pathEntries.map((e) => e.StepKey),
                LaunchSource: launchSource,
                LaunchedByAgentRunID: r.LaunchedByAgentRunID,
                StartedAt: r.StartedAt ? new Date(r.StartedAt).toISOString() : new Date().toISOString(),
                CompletedAt: r.CompletedAt ? new Date(r.CompletedAt).toISOString() : null,
                GoalMetAt: r.GoalMetAt ? new Date(r.GoalMetAt).toISOString() : null,
                SnoozedUntil: r.SnoozedUntil ? new Date(r.SnoozedUntil).toISOString() : null,
                IsHoldout: r.IsHoldout,
                Steps: stepsByRunId.get(r.ID.toLowerCase()) ?? [],
            };
        });
    }
}

/**
 * Server implementation of `Tours.ClaimGuestRuns`.
 * Re-attributes guest `VisitorKey` `MJ: Tour Runs` rows (where `UserID IS NULL`)
 * to the authenticated MJ user on sign-in (RV4).
 */
@RegisterClass(BaseRemotableOperation, TOURS_CLAIM_GUEST_RUNS_KEY)
export class ToursClaimGuestRunsServerOperation extends ToursClaimGuestRunsOperation {
    protected override async Authorize(
        _input: ToursClaimGuestRunsInput,
        user: UserInfo,
    ): Promise<boolean> {
        if (!user || isIsolatedGuestSession(user)) {
            throw new RemoteOperationError(
                'FORBIDDEN',
                'ClaimGuestRuns requires an authenticated non-guest MJ user.',
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: ToursClaimGuestRunsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ToursClaimGuestRunsOutput> {
        const visitorKey = input.VisitorKey?.trim();
        if (!visitorKey) {
            return {
                Success: false,
                ClaimedRunCount: 0,
                ErrorMessage: 'VisitorKey is required.',
            };
        }

        const serviceUser = getSystemOrFallbackUser(user);
        const rv = RunView.FromMetadataProvider(provider);

        let extraFilter = `UserID IS NULL AND VisitorKey='${EscapeSQLString(visitorKey)}'`;
        if (input.SurfaceKey?.trim()) {
            const surfRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Tour Surfaces',
                    ExtraFilter: `SurfaceKey='${EscapeSQLString(input.SurfaceKey.trim())}'`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                serviceUser,
            );
            if (!surfRes.Success || surfRes.Results.length === 0) {
                return { Success: true, ClaimedRunCount: 0 };
            }
            extraFilter += ` AND SurfaceID='${EscapeSQLString(surfRes.Results[0].ID)}'`;
        }

        const runsRes = await rv.RunView<MJTourRunEntity>(
            {
                EntityName: 'MJ: Tour Runs',
                ExtraFilter: extraFilter,
                ResultType: 'entity_object',
            },
            serviceUser,
        );
        if (!runsRes.Success) {
            return {
                Success: false,
                ClaimedRunCount: 0,
                ErrorMessage: runsRes.ErrorMessage || 'Failed querying guest tour runs.',
            };
        }

        let claimedCount = 0;
        for (const run of runsRes.Results ?? []) {
            if (!run.ContextCurrentUser) {
                run.ContextCurrentUser = serviceUser;
            }
            run.UserID = user.ID;
            if (await run.Save()) {
                claimedCount++;
            } else {
                LogError(
                    `[Tours.ClaimGuestRuns] Failed claiming run ${run.ID}: ${run.LatestResult?.CompleteMessage ?? 'unknown'}`,
                );
            }
        }

        return {
            Success: true,
            ClaimedRunCount: claimedCount,
        };
    }
}

/**
 * Server implementation of `Tours.PublishTour`.
 * Validates the tour graph via `ValidateTourGraph`, snapshots `MJ: Tour Versions` when
 * canonical content changed, updates `CurrentVersionID`, and optionally sets `Status = 'Active'`.
 */
@RegisterClass(BaseRemotableOperation, TOURS_PUBLISH_TOUR_KEY)
export class ToursPublishTourServerOperation extends ToursPublishTourOperation {
    protected override async Authorize(
        _input: ToursPublishTourInput,
        user: UserInfo,
    ): Promise<boolean> {
        if (!user || isIsolatedGuestSession(user)) {
            throw new RemoteOperationError(
                'FORBIDDEN',
                'PublishTour requires an authenticated non-guest MJ user.',
            );
        }
        return true;
    }

    protected override async InternalExecute(
        input: ToursPublishTourInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ToursPublishTourOutput> {
        const tourId = input.TourId?.trim();
        if (!tourId) {
            return { Success: false, ErrorMessage: 'TourId is required.' };
        }

        const tour = await provider.GetEntityObject<MJTourEntity>('MJ: Tours', user);
        if (!(await tour.Load(tourId))) {
            return {
                Success: false,
                ErrorMessage: `Tour '${tourId}' was not found.`,
            };
        }

        const snapResult = await TourPublisherService.Instance.SnapshotIfChanged(
            tour,
            user,
            provider,
            {
                ChangeSummary: input.ChangeSummary,
                ValidateGraph: true,
            },
        );
        if (!snapResult.Success) {
            return {
                Success: false,
                TourId: tour.ID,
                ErrorMessage: snapResult.ErrorMessage ?? 'Tour publish failed.',
            };
        }

        if (input.Activate && tour.Status !== 'Active') {
            tour.Status = 'Active';
            if (!(await tour.Save())) {
                return {
                    Success: false,
                    TourId: tour.ID,
                    ErrorMessage:
                        tour.LatestResult?.CompleteMessage ??
                        `Failed setting Status = 'Active' on tour '${tour.TourKey}'.`,
                };
            }
        }

        return {
            Success: true,
            TourId: tour.ID,
            TourVersionId: snapResult.TourVersionId,
            VersionNumber: snapResult.VersionNumber,
            UnchangedSnapshot: snapResult.UnchangedSnapshot,
        };
    }
}
