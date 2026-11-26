/**
 * @fileoverview Headless reactive Guided Tour session state machine (`TourSession`).
 * Pure TypeScript (L0) — runs in Node.js and browsers.
 *
 * Enforces:
 * - Version pinning (`TourVersionID` + `DefinitionSnapshot`)
 * - Synchronous cancelable `Before*` / informational `After*` events
 * - Pathway traversal via `@memberjunction/graph` (`SelectOutgoingEdges`)
 * - Director-only cursor and Do-mode authority (`DirectorToken`)
 * - Do-mode `AllowAgentActions`, per-mutation confirmation, and hard-banned action categories
 * @module @memberjunction/tours-runtime
 */

import { MJGlobal, uuidv4 } from '@memberjunction/global';
import { SelectOutgoingEdges } from '@memberjunction/graph';
import { BehaviorSubject, Subject, type Observable } from 'rxjs';
import {
    AfterTourEndEventArgs,
    AfterTourStartEventArgs,
    AfterTourStepCompleteEventArgs,
    AfterTourStepEnterEventArgs,
    BeforeTourEndEventArgs,
    BeforeTourStartEventArgs,
    BeforeTourStepEnterEventArgs,
    TourAnchorMissingEventArgs,
    TourDirectorChangedEventArgs,
    type TourSessionEventArgs,
} from './events';
import type {
    ITourAnchorDomBridge,
    ITourAgentActionExecutor,
    ITourHost,
    ITourMutationConfirmer,
    ITourProgressStore,
    ITourServerPredicateEvaluator,
    TourBannedDoActionCategory,
    TourLocation,
    TourResolvedAnchorInfo,
} from './host-contracts';
import { ResolveLocalizedStepCopy, ResolveLocalizedTourCopy } from './localization';
import { BaseTourAnchorResolver, InterpolateAnchorTemplate } from './plugins/base-anchor-resolver';
import { BaseTourCompletionCheck, type TourCompletionResult } from './plugins/base-completion-check';
import { BaseTourDirector } from './plugins/base-director';
import { BaseTourDriver } from './plugins/base-driver';
import { BaseTourStepType } from './plugins/base-step-type';
import { RegisterStandardTourPlugins } from './plugins/register-standard-plugins';

RegisterStandardTourPlugins();
import type {
    TourCompletionContext,
    TourContextBuilder,
    TourEntityEventPayload,
    TourSessionContext,
    TourStepContext,
} from './plugins/plugin-types';
import {
    CompileTourGraph,
    EvaluateTourCondition,
    TourGraphConditionEvaluator,
    type CompiledTourGraph,
} from './tour-graph-compiler';
import type {
    ITourAnchor,
    ITourCompletion,
    ITourStepConfiguration,
    TourAnchorResolution,
    TourDefinition,
    TourLaunchSource,
    TourPendingDemonstrationConfirmation,
    TourPointerHighlight,
    TourRunEvent,
    TourRunOutcome,
    TourRunRecord,
    TourRunStatus,
    TourRunStepRecord,
    TourSessionGuideMode,
    TourSessionView,
    TourStepDefinition,
    TourStepOutcome,
    TourStepRef,
    TourStepView,
} from './types';

/** Default auto-clear duration (ms) for secondary Sage pointer highlights so transient UI rings fade without disturbing the primary spotlight. */
const DEFAULT_POINTER_HIGHLIGHT_DURATION_MS = 4500;

export const BANNED_DO_ACTION_CATEGORIES: ReadonlySet<string> = new Set<TourBannedDoActionCategory>([
    'Delete',
    'FinancialPosting',
    'BatchDispatch',
    'PermissionGrant',
    'OutboundMessage',
]);

const BANNED_DO_ACTION_NORMALIZED: ReadonlySet<string> = new Set([
    'delete',
    'financialposting',
    'batchdispatch',
    'permissiongrant',
    'outboundmessage',
]);

export interface TourSessionOptions {
    Tour: TourDefinition;
    Host: ITourHost;
    ProgressStore: ITourProgressStore;
    AnchorBridge?: ITourAnchorDomBridge;
    ServerPredicateEvaluator?: ITourServerPredicateEvaluator;
    MutationConfirmer?: ITourMutationConfirmer;
    ActionExecutor?: ITourAgentActionExecutor;
    GuideMode?: TourSessionGuideMode;
    LaunchSource?: TourLaunchSource;
    LaunchedByAgentRunID?: string;
    Locale?: string;
    InitialStepKey?: string;
    ExistingRun?: TourRunRecord;
    InitialConditionContext?: Record<string, unknown>;
    /** Optional synchronous pre-start/pre-step/pre-end hooks (alternative to subscribing to `Events$`). */
    BeforeHook?: (args: TourSessionEventArgs) => void;
    /** Optional stream of entity events from the host (`BaseEntityEvent` bridge). */
    EntityEvents$?: Observable<TourEntityEventPayload>;
}

export interface TourPerformStepRequest {
    ActionCategory?: string;
    ToolName?: string;
    ActionName?: string;
    Params?: Record<string, unknown>;
    Description?: string;
}

export interface TourPerformStepResult {
    Success: boolean;
    ErrorMessage?: string;
    Data?: Record<string, unknown>;
}

export interface TourDemonstrateStepResult {
    Success: boolean;
    ErrorCode?: string;
    RequiresConfirmation?: boolean;
    ConfirmationPrompt?: string;
    ErrorMessage?: string;
}

export class TourSession {
    private readonly _runId: string;
    private readonly _tour: TourDefinition;
    private readonly _tourVersionId: string;
    private readonly _compiled: CompiledTourGraph;
    private readonly _conditionEvaluator = new TourGraphConditionEvaluator();
    private readonly _host: ITourHost;
    private readonly _progressStore: ITourProgressStore;
    private readonly _anchorBridge?: ITourAnchorDomBridge;
    private readonly _serverPredicateEvaluator?: ITourServerPredicateEvaluator;
    private readonly _mutationConfirmer?: ITourMutationConfirmer;
    private readonly _actionExecutor?: ITourAgentActionExecutor;
    private readonly _driver: BaseTourDriver;
    private readonly _launchSource: TourLaunchSource;
    private readonly _locale?: string;
    private readonly _beforeHook?: (args: TourSessionEventArgs) => void;

    private _guideMode: TourSessionGuideMode;
    private _directorType: string;
    private _activeDirector: BaseTourDirector | null = null;
    private _activeDirectorToken: string | null = null;

    private _status: TourRunStatus = 'Pending';
    private _isPaused = false;
    private _goalMet = false;
    private _startedAt: string;
    private _completedAt: string | null = null;
    private _goalMetAt: string | null = null;
    private _snoozedUntil: string | null = null;
    private _currentStepKey: string | null = null;
    private _currentStepView: TourStepView | null = null;
    private _pathTaken: string[] = [];
    private _completedStepKeys: string[] = [];
    private _stepRecords: TourRunStepRecord[] = [];
    private _conditionContext: Record<string, unknown>;
    private _choices: Record<string, string> = {};
    private _lastError?: string;
    private _activeStepAbort: AbortController | null = null;
    private _prepareNavConsentGranted = false;
    private _pointerHighlight: TourPointerHighlight | null = null;
    private _pointerHighlightTimer: ReturnType<typeof setTimeout> | null = null;
    private _pendingDemonstrationConfirmation: TourPendingDemonstrationConfirmation | null = null;

    private readonly _eventsSubject = new Subject<TourSessionEventArgs>();
    private readonly _nextRequestedSubject = new Subject<void>();
    private readonly _agentConfirmedSubject = new Subject<Record<string, unknown> | undefined>();
    private readonly _entityEventsSubject = new Subject<TourEntityEventPayload>();
    private readonly _sessionViewSubject: BehaviorSubject<TourSessionView>;

    constructor(options: TourSessionOptions) {
        const existingRun = options.ExistingRun;
        // Version pinning: if resuming an existing run with a snapshot, run on that pinned snapshot
        this._tour = existingRun?.DefinitionSnapshot ?? options.Tour;
        this._runId = existingRun?.RunID ?? uuidv4();
        this._tourVersionId =
            existingRun?.TourVersionID ??
            this._tour.CurrentVersionID ??
            `${this._tour.TourKey}@v${this._tour.VersionNumber ?? 1}`;

        this._compiled = CompileTourGraph(this._tour);
        this._host = options.Host;
        this._progressStore = options.ProgressStore;
        this._anchorBridge = options.AnchorBridge;
        this._serverPredicateEvaluator = options.ServerPredicateEvaluator;
        this._mutationConfirmer = options.MutationConfirmer;
        this._actionExecutor = options.ActionExecutor;
        this._launchSource = existingRun?.LaunchSource ?? options.LaunchSource ?? 'Launcher';
        this._locale = options.Locale;
        this._beforeHook = options.BeforeHook;

        this._guideMode = existingRun?.GuideMode ?? options.GuideMode ?? resolveDefaultGuideMode(this._tour);
        this._directorType = existingRun?.DirectorType ?? this._guideMode;
        this._startedAt = existingRun?.StartedAt ?? new Date().toISOString();
        this._completedAt = existingRun?.CompletedAt ?? null;
        this._goalMetAt = existingRun?.GoalMetAt ?? null;
        this._goalMet = Boolean(existingRun?.GoalMetAt);
        this._snoozedUntil = existingRun?.SnoozedUntil ?? null;
        this._pathTaken = existingRun ? [...existingRun.PathTaken] : [];
        this._stepRecords = existingRun ? [...existingRun.Steps] : [];
        this._completedStepKeys = existingRun
            ? existingRun.Steps.filter((s) => s.Outcome === 'Completed' || s.Outcome === 'Done By Agent').map((s) => s.StepKey)
            : [];

        this._currentStepKey =
            existingRun?.CurrentStepKey ??
            options.InitialStepKey ??
            this._compiled.Repository.GetStartNodes()[0]?.id ??
            null;

        this._conditionContext = { ...(options.InitialConditionContext ?? {}) };
        this._driver = resolveDriver(this._tour.DriverClass);

        if (options.EntityEvents$) {
            options.EntityEvents$.subscribe((evt) => this._entityEventsSubject.next(evt));
        }

        this._sessionViewSubject = new BehaviorSubject<TourSessionView>(this.buildSessionView());
    }

    // ========================================================================
    // Public Reactive Streams & Read-Only Properties
    // ========================================================================

    public get RunID(): string {
        return this._runId;
    }

    public get Tour(): TourDefinition {
        return this._tour;
    }

    public get Definition(): TourDefinition {
        return this._tour;
    }

    public get TourVersionID(): string {
        return this._tourVersionId;
    }

    public get Status(): TourRunStatus {
        return this._status;
    }

    public get GuideMode(): TourSessionGuideMode {
        return this._guideMode;
    }

    public get DirectorType(): string {
        return this._directorType;
    }

    public get CurrentStepKey(): string | null {
        return this._currentStepKey;
    }

    public get CurrentStepView(): TourStepView | null {
        return this._currentStepView;
    }

    public get CompletedStepKeys(): readonly string[] {
        return this._completedStepKeys;
    }

    public get PathTaken(): readonly string[] {
        return this._pathTaken;
    }

    public get SessionView$(): Observable<TourSessionView> {
        return this._sessionViewSubject.asObservable();
    }

    public get SessionView(): TourSessionView {
        return this._sessionViewSubject.getValue();
    }

    public get Events$(): Observable<TourSessionEventArgs> {
        return this._eventsSubject.asObservable();
    }

    public get PrepareNavConsentGranted(): boolean {
        return this._prepareNavConsentGranted;
    }

    public GrantPrepareNavConsent(): void {
        this._prepareNavConsentGranted = true;
    }

    /** Returns an immutable snapshot of the run record (suitable for persistence / version pinning). */
    public GetRunRecord(): TourRunRecord {
        return {
            RunID: this._runId,
            TourKey: this._tour.TourKey,
            TourID: this._tour.ID,
            TourVersionID: this._tourVersionId,
            VersionNumber: this._tour.VersionNumber,
            DefinitionSnapshot: this._tour,
            UserID: this._host.Principal.Kind === 'MJUser' ? this._host.Principal.UserId : null,
            VisitorKey: this._host.Principal.Kind === 'Guest' ? this._host.Principal.VisitorKey : null,
            Status: this._status,
            GuideMode: this._guideMode,
            DirectorType: this._directorType,
            CurrentStepKey: this._currentStepKey,
            PathTaken: [...this._pathTaken],
            LaunchSource: this._launchSource,
            StartedAt: this._startedAt,
            CompletedAt: this._completedAt,
            GoalMetAt: this._goalMetAt,
            SnoozedUntil: this._snoozedUntil,
            Steps: [...this._stepRecords],
        };
    }

    // ========================================================================
    // Director Attachment & Authority (§10.2)
    // ========================================================================

    /**
     * Attaches a director to this session and mints an exclusive `DirectorToken`.
     * Only the holder of the current `DirectorToken` may advance the cursor, jump steps,
     * select choices, or perform Do-mode actions.
     */
    public AttachDirector(directorOrType: string | BaseTourDirector): string {
        if (this._activeDirector) {
            this._activeDirector.Detach();
        }

        const prevType = this._activeDirector ? this._directorType : null;
        let directorInstance: BaseTourDirector;

        if (typeof directorOrType === 'string') {
            const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
                BaseTourDirector,
                directorOrType,
            );
            const res = reg
                ? MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourDirector>(
                      BaseTourDirector,
                      directorOrType,
                  )
                : { Resolved: false, Instance: null };
            if (res.Resolved && res.Instance) {
                directorInstance = res.Instance;
            } else {
                directorInstance = new AdHocDirector(directorOrType);
            }
        } else {
            directorInstance = directorOrType;
        }

        const token = uuidv4();
        this._activeDirector = directorInstance;
        this._activeDirectorToken = token;
        this._directorType = directorInstance.DirectorType;
        if (
            directorInstance.DirectorType === 'Visual' ||
            directorInstance.DirectorType === 'Chat' ||
            directorInstance.DirectorType === 'Voice'
        ) {
            this._guideMode = directorInstance.DirectorType;
        }

        directorInstance.Attach({ Session: this, DirectorToken: token });
        this.emitEvent(
            new TourDirectorChangedEventArgs(
                this._runId,
                this._tour.TourKey,
                prevType,
                this._directorType,
            ),
        );
        void this.recordStoreEvent('DirectorChanged', {
            DirectorType: this._directorType,
            GuideMode: this._guideMode,
        });
        this.publishView();

        return token;
    }

    public IsValidDirectorToken(token: string | null | undefined): boolean {
        return Boolean(token && this._activeDirectorToken && token === this._activeDirectorToken);
    }

    // ========================================================================
    // Lifecycle Controls (Open to Director or Host/Agent helpers)
    // ========================================================================

    public async Start(): Promise<boolean> {
        if (this._status === 'In Progress') {
            return true;
        }

        const beforeArgs = new BeforeTourStartEventArgs(
            this._runId,
            this._tour.TourKey,
            this._tourVersionId,
            this._guideMode,
            this._directorType,
            this._launchSource,
        );
        this._driver.BeforeTourStart(beforeArgs);
        this.emitEvent(beforeArgs);

        if (beforeArgs.Cancel) {
            this._lastError = beforeArgs.CancelReason ?? 'Tour start canceled.';
            this.publishView();
            return false;
        }

        await this.refreshConditionContext();

        this._status = 'In Progress';
        this._isPaused = false;
        this._startedAt = new Date().toISOString();

        await this.recordStoreEvent('RunStarted', {
            StepKey: this._currentStepKey ?? undefined,
            GuideMode: this._guideMode,
            DirectorType: this._directorType,
            LaunchSource: this._launchSource,
        });

        this.emitEvent(
            new AfterTourStartEventArgs(
                this._runId,
                this._tour.TourKey,
                this._tourVersionId,
                this._guideMode,
                this._directorType,
                this._launchSource,
            ),
        );

        if (this._currentStepKey) {
            await this.enterStep(this._currentStepKey);
        } else {
            await this.Complete();
        }

        return true;
    }

    public async Pause(): Promise<void> {
        if (this._status !== 'In Progress' || this._isPaused) {
            return;
        }
        this._isPaused = true;
        this.abortActiveStepWait();
        await this.recordStoreEvent('RunPaused', { StepKey: this._currentStepKey ?? undefined });
        this.publishView();
    }

    public async Resume(): Promise<void> {
        if (this._status !== 'In Progress' || !this._isPaused) {
            return;
        }
        this._isPaused = false;
        await this.recordStoreEvent('RunResumed', { StepKey: this._currentStepKey ?? undefined });
        if (this._currentStepKey) {
            await this.enterStep(this._currentStepKey);
        } else {
            this.publishView();
        }
    }

    public async Dismiss(reason?: string): Promise<boolean> {
        return this.endSession('Dismissed', 'RunDismissed', reason);
    }

    public async Stop(reason?: string): Promise<boolean> {
        this.clearPointerHighlightTimer();
        this._pointerHighlight = null;
        this._pendingDemonstrationConfirmation = null;
        return this.Dismiss(reason);
    }

    public Dispose(): void {
        this.clearPointerHighlightTimer();
        this._pointerHighlight = null;
        this._pendingDemonstrationConfirmation = null;
        this.abortActiveStepWait();
        this.publishView();
    }

    public async Snooze(until: Date | string): Promise<boolean> {
        const iso = typeof until === 'string' ? until : until.toISOString();
        this._snoozedUntil = iso;
        return this.endSession('Snoozed', 'RunSnoozed', undefined, iso);
    }

    public async Complete(): Promise<boolean> {
        return this.endSession('Completed', 'RunCompleted');
    }

    // ========================================================================
    // User & Signal Interactions (non-cursor-hijacking)
    // ========================================================================

    /** Called by UI renderer when user clicks Next/Continue/Skip. */
    public RequestNext(): void {
        const stepBefore = this._currentStepKey;
        this._nextRequestedSubject.next();
        if (this._status === 'In Progress' && !this._isPaused && stepBefore !== null) {
            queueMicrotask(() => {
                if (
                    this._status === 'In Progress' &&
                    !this._isPaused &&
                    this._currentStepKey === stepBefore
                ) {
                    void this.Next();
                }
            });
        }
    }

    /** Called by an agent via `AgentConfirmed` completion check. */
    public ConfirmAgentStep(data?: Record<string, unknown>): void {
        this._agentConfirmedSubject.next(data);
    }

    /** Forwards a host `BaseEntityEvent` into the session's completion & goal watchers. */
    public NotifyEntityEvent(event: TourEntityEventPayload): void {
        this._entityEventsSubject.next(event);
        void this.checkGoalOnEntityEvent(event);
    }

    // ========================================================================
    // Secondary Sage Pointer Highlight & Convenience Navigation
    // ========================================================================

    /**
     * Displays a secondary Sage Pointer Ring + mini caption on an anchor without disturbing
     * the primary step spotlight. Auto-clears after `durationMs` (default 4500ms).
     */
    public SetPointerHighlight(
        anchorKey: string,
        caption?: string,
        durationMs: number = DEFAULT_POINTER_HIGHLIGHT_DURATION_MS,
    ): void {
        this.clearPointerHighlightTimer();
        const expiresAt = durationMs > 0 ? Date.now() + durationMs : undefined;
        this._pointerHighlight = {
            AnchorKey: anchorKey,
            Caption: caption,
            ExpiresAt: expiresAt,
        };
        this.publishView();

        if (durationMs > 0) {
            this._pointerHighlightTimer = setTimeout(() => {
                this.ClearPointerHighlight();
            }, durationMs);
        }
    }

    /** Clears any active secondary Sage Pointer Highlight and cancels its expiry timer. */
    public ClearPointerHighlight(): void {
        this.clearPointerHighlightTimer();
        if (this._pointerHighlight !== null) {
            this._pointerHighlight = null;
            this.publishView();
        }
    }

    /** Clears any pending Tier-3 demonstration confirmation prompt. */
    public CancelPendingDemonstration(): void {
        if (this._pendingDemonstrationConfirmation !== null) {
            this._pendingDemonstrationConfirmation = null;
            this.publishView();
        }
    }

    /** Convenience method to advance the current step (completing it and moving along outgoing edges). */
    public async Next(): Promise<boolean> {
        if (this._status !== 'In Progress' || !this._currentStepKey) {
            return false;
        }
        const step = this._compiled.StepByKey.get(this._currentStepKey);
        if (!step) {
            return false;
        }
        this.abortActiveStepWait();
        const outcome: TourStepOutcome = {
            Outcome: 'Completed',
            AnchorResolution: this._currentStepView?.AnchorResolution ?? 'Registered',
        };
        await this.finishCurrentStep(step, outcome);
        await this.moveToNextFrom(step, outcome);
        return true;
    }

    /** Convenience method to step back to the previous step in `PathTaken`. */
    public async Back(): Promise<boolean> {
        if (this._status !== 'In Progress' || this._pathTaken.length < 2) {
            return false;
        }
        this.abortActiveStepWait();
        this._pathTaken.pop();
        const prevKey = this._pathTaken[this._pathTaken.length - 1];
        if (!prevKey) {
            return false;
        }
        await this.enterStep(prevKey, false);
        return true;
    }

    /**
     * Executes a step demonstration gated by the 3-Tier Safety Gate:
     * 1. Verify mode lockout (`verify_mode_locked`)
     * 2. Permission check (`agent_actions_disabled` unless `UserInitiated`, `AllowAgentActions`, or `Mode === 'Show'`)
     * 3. Mutation confirmation gate (`confirmation_required` when step or host requires confirmation and `ConfirmedMutation !== true`)
     * 4. Prepare -> `Host.DemonstrateStep` -> pulse/highlight anchor -> advance step
     */
    public async DemonstrateCurrentStep(options?: {
        ConfirmedMutation?: boolean;
        UserInitiated?: boolean;
    }): Promise<TourDemonstrateStepResult> {
        if (this._status !== 'In Progress' || !this._currentStepKey) {
            return {
                Success: false,
                ErrorCode: 'no_active_step',
                ErrorMessage: 'No active step to demonstrate.',
            };
        }

        const currentStep = this._compiled.StepByKey.get(this._currentStepKey);
        if (!currentStep) {
            return {
                Success: false,
                ErrorCode: 'no_active_step',
                ErrorMessage: 'Current step definition not found.',
            };
        }

        // Tier 1: Verify Mode Lockout
        if (this.DirectorType === 'Verify') {
            return {
                Success: false,
                ErrorCode: 'verify_mode_locked',
                ErrorMessage: 'Step demonstrations are disabled during Verify assessments.',
            };
        }

        // Tier 2: Permission Check
        if (
            !options?.UserInitiated &&
            !this._tour.AllowAgentActions &&
            currentStep.Mode !== 'Show'
        ) {
            return {
                Success: false,
                ErrorCode: 'agent_actions_disabled',
                ErrorMessage: 'Agent actions are not enabled for this tour unless requested by the user.',
            };
        }

        // Tier 3: Mutation Confirmation Gate
        const stepConfig = currentStep.Configuration as ITourStepConfiguration | undefined;
        const stepRequiresConfirmation =
            currentStep.RequiresMutationConfirmation === true ||
            stepConfig?.RequiresMutationConfirmation === true;

        if (stepRequiresConfirmation && options?.ConfirmedMutation !== true) {
            const prompt =
                currentStep.ConfirmationPrompt ??
                stepConfig?.ConfirmationPrompt ??
                currentStep.DoAction?.Description ??
                `Confirm demonstrating step "${currentStep.Title}"?`;
            this._pendingDemonstrationConfirmation = {
                StepKey: currentStep.StepKey,
                Prompt: prompt,
            };
            this.publishView();
            return {
                Success: false,
                ErrorCode: 'confirmation_required',
                RequiresConfirmation: true,
                ConfirmationPrompt: prompt,
            };
        }

        // Prepare navigation / make-visible
        const stepType = this.resolveStepType(currentStep);
        const stepCtx = this.buildStepContext(currentStep);
        const prepareResult = await stepType.Prepare(stepCtx);
        if (!prepareResult.Success) {
            return {
                Success: false,
                ErrorCode: 'prepare_failed',
                ErrorMessage: prepareResult.ErrorMessage ?? 'Step preparation failed.',
            };
        }

        // Host-level demonstration execution (and dynamic confirmation check)
        if (this._host.DemonstrateStep) {
            const hostRes = await this._host.DemonstrateStep(currentStep, {
                ConfirmedMutation: options?.ConfirmedMutation,
            });
            if (hostRes.RequiresConfirmation && options?.ConfirmedMutation !== true) {
                const prompt =
                    hostRes.ConfirmationPrompt ??
                    `Confirm demonstrating step "${currentStep.Title}"?`;
                this._pendingDemonstrationConfirmation = {
                    StepKey: currentStep.StepKey,
                    Prompt: prompt,
                };
                this.publishView();
                return {
                    Success: false,
                    ErrorCode: 'confirmation_required',
                    RequiresConfirmation: true,
                    ConfirmationPrompt: prompt,
                };
            }
            if (!hostRes.Success) {
                this._pendingDemonstrationConfirmation = null;
                this.publishView();
                return {
                    Success: false,
                    ErrorCode: 'demonstration_failed',
                    ErrorMessage: hostRes.ErrorMessage ?? 'Step demonstration failed.',
                };
            }
        }

        this._pendingDemonstrationConfirmation = null;

        // Pulse/highlight the step's anchor if present
        if (currentStep.Anchor) {
            const interpolated = InterpolateAnchorTemplate(
                currentStep.Anchor,
                this._conditionContext,
            );
            const anchorKey = extractAnchorKey(interpolated);
            if (anchorKey) {
                this.SetPointerHighlight(anchorKey, currentStep.Title);
                if (this._anchorBridge?.HighlightAnchor) {
                    await this._anchorBridge.HighlightAnchor(anchorKey, currentStep.Title);
                }
            }
        }

        // Advance/confirm the step cleanly
        this.abortActiveStepWait();
        const outcome: TourStepOutcome = {
            Outcome:
                options?.ConfirmedMutation || currentStep.Mode === 'Do'
                    ? 'Done By Agent'
                    : 'Completed',
            AnchorResolution: this._currentStepView?.AnchorResolution ?? 'Registered',
        };
        await this.finishCurrentStep(currentStep, outcome);
        await this.moveToNextFrom(currentStep, outcome);

        return { Success: true };
    }

    // ========================================================================
    // Director-Only Cursor & Do-Mode Operations (§10.2 & §10.3)
    // ========================================================================

    /**
     * Advances from the current step along the graph's outgoing edge (`SelectOutgoingEdges`
     * or `BaseTourDriver.ResolveNextStep`). Director-only.
     */
    public async Advance(
        directorToken: string,
        overrideOutcome?: Partial<TourStepOutcome>,
    ): Promise<boolean> {
        this.assertDirectorToken(directorToken, 'Advance');
        if (this._status !== 'In Progress' || !this._currentStepKey) {
            return false;
        }

        const step = this._compiled.StepByKey.get(this._currentStepKey);
        if (!step) {
            return false;
        }

        this.abortActiveStepWait();

        const outcome: TourStepOutcome = {
            Outcome: overrideOutcome?.Outcome ?? 'Completed',
            AnchorResolution:
                overrideOutcome?.AnchorResolution ??
                this._currentStepView?.AnchorResolution ??
                'Registered',
            ChoiceKey: overrideOutcome?.ChoiceKey,
            Data: overrideOutcome?.Data,
        };

        await this.finishCurrentStep(step, outcome);
        await this.moveToNextFrom(step, outcome);
        return true;
    }

    /**
     * Moves the cursor to `targetStepKey`.
     * Guarded (§10.3):
     * - Director-only (`directorToken` must match active director)
     * - `targetStepKey` must be either an authored outgoing edge from the current step
     *   OR a previously completed step (allowing review/backtrack without inventing steps).
     */
    public async GoToStep(directorToken: string, targetStepKey: string): Promise<boolean> {
        this.assertDirectorToken(directorToken, 'GoToStep');
        if (this._status !== 'In Progress') {
            return false;
        }
        if (!this._compiled.StepByKey.has(targetStepKey)) {
            throw new Error(`TourGoToStep rejected: step '${targetStepKey}' does not exist in tour '${this._tour.TourKey}'.`);
        }

        const currentKey = this._currentStepKey;
        const isCompletedHistory = this._completedStepKeys.includes(targetStepKey);
        const outgoing = currentKey
            ? this._compiled.Repository.GetOutgoingEdges(currentKey).map((e) => e.destinationNodeId)
            : [];
        const isAuthoredOutgoing = outgoing.includes(targetStepKey);

        if (!isAuthoredOutgoing && !isCompletedHistory) {
            throw new Error(
                `TourGoToStep rejected: '${targetStepKey}' is neither an authored outgoing edge from '${currentKey ?? '(none)'}' nor a previously completed step.`,
            );
        }

        this.abortActiveStepWait();
        if (currentKey) {
            const currentStep = this._compiled.StepByKey.get(currentKey);
            if (currentStep && isAuthoredOutgoing) {
                await this.finishCurrentStep(currentStep, {
                    Outcome: 'Completed',
                    AnchorResolution: this._currentStepView?.AnchorResolution ?? 'Registered',
                });
            }
        }

        await this.enterStep(targetStepKey);
        return true;
    }

    /** Goes back to the previous step in `PathTaken`. Director-only. */
    public async GoBack(directorToken: string): Promise<boolean> {
        this.assertDirectorToken(directorToken, 'GoBack');
        if (this._status !== 'In Progress' || this._pathTaken.length < 2) {
            return false;
        }
        this.abortActiveStepWait();
        this._pathTaken.pop();
        const prevKey = this._pathTaken[this._pathTaken.length - 1];
        if (!prevKey) {
            return false;
        }
        await this.enterStep(prevKey, false);
        return true;
    }

    /** Records a user/director choice selection on a `Choice` step and advances along the matching branch. */
    public async SelectChoice(choiceKey: string, directorToken?: string): Promise<boolean> {
        if (directorToken !== undefined) {
            this.assertDirectorToken(directorToken, 'SelectChoice');
        }
        if (!this._currentStepKey) {
            return false;
        }
        this._choices[this._currentStepKey] = choiceKey;
        this._conditionContext = {
            ...this._conditionContext,
            lastChoiceKey: choiceKey,
            choices: { ...this._choices },
        };
        const step = this._compiled.StepByKey.get(this._currentStepKey);
        if (!step || this._status !== 'In Progress') {
            return false;
        }
        this.abortActiveStepWait();
        const outcome: TourStepOutcome = {
            Outcome: 'Completed',
            AnchorResolution: this._currentStepView?.AnchorResolution ?? 'Registered',
            ChoiceKey: choiceKey,
            Data: { ChoiceKey: choiceKey },
        };
        await this.finishCurrentStep(step, outcome);
        await this.moveToNextFrom(step, outcome);
        return true;
    }

    /** Marks the current step as `'Already Known'` and advances. Director-only. */
    public async MarkStepKnown(directorToken: string, userConfirmed = false): Promise<boolean> {
        this.assertDirectorToken(directorToken, 'MarkStepKnown');
        if (!this._currentStepKey) {
            return false;
        }
        const step = this._compiled.StepByKey.get(this._currentStepKey);
        if (!step) {
            return false;
        }
        if (!step.IsOptional && !userConfirmed) {
            throw new Error(
                `TourMarkKnown rejected: step '${step.StepKey}' is required and requires explicit user confirmation.`,
            );
        }
        return this.Advance(directorToken, {
            Outcome: 'Already Known',
            AnchorResolution: this._currentStepView?.AnchorResolution ?? 'Registered',
        });
    }

    /**
     * Executes the current step in `Do` mode (§10.3):
     * 1. Requires valid `directorToken`
     * 2. Requires `tour.AllowAgentActions === true`
     * 3. Requires `step.Mode === 'Do'`
     * 4. Hard-rejects banned categories (`Delete`, `FinancialPosting`, `BatchDispatch`, `PermissionGrant`, `OutboundMessage`)
     * 5. Requires explicit **per-mutation confirmation** via `ITourMutationConfirmer`
     * 6. Executes through `ITourAgentActionExecutor` and advances with `'Done By Agent'`
     */
    public async PerformStep(
        directorToken: string,
        request?: TourPerformStepRequest,
    ): Promise<TourPerformStepResult> {
        this.assertDirectorToken(directorToken, 'PerformStep');
        if (this._status !== 'In Progress' || !this._currentStepKey) {
            return { Success: false, ErrorMessage: 'Session is not in progress.' };
        }

        if (!this._tour.AllowAgentActions) {
            return {
                Success: false,
                ErrorMessage: `Do mode is disabled on tour '${this._tour.TourKey}' (AllowAgentActions is false).`,
            };
        }

        const step = this._compiled.StepByKey.get(this._currentStepKey);
        if (!step) {
            return { Success: false, ErrorMessage: 'Current step not found.' };
        }

        if (step.Mode !== 'Do') {
            return {
                Success: false,
                ErrorMessage: `Step '${step.StepKey}' is in '${step.Mode ?? 'Guide'}' mode; PerformStep requires Mode === 'Do'.`,
            };
        }

        const actionCategory = request?.ActionCategory ?? step.DoAction?.Category ?? 'Update';
        if (isBannedDoActionCategory(actionCategory)) {
            return {
                Success: false,
                ErrorMessage: `Action category '${actionCategory}' is hard-banned from Do mode.`,
            };
        }

        const description =
            request?.Description ?? step.DoAction?.Description ?? `Execute step '${step.Title}'`;
        const toolName = request?.ToolName ?? step.DoAction?.ToolName;
        const actionName = request?.ActionName ?? step.DoAction?.ActionName;
        const params = request?.Params ?? step.DoAction?.Params;

        if (!this._mutationConfirmer) {
            return {
                Success: false,
                ErrorMessage: 'Do mode requires an explicit per-mutation confirmation handler (ITourMutationConfirmer).',
            };
        }

        const confirmed = await this._mutationConfirmer.ConfirmMutation({
            TourKey: this._tour.TourKey,
            StepKey: step.StepKey,
            ActionCategory: actionCategory,
            Description: description,
            ToolName: toolName,
            ActionName: actionName,
            Params: params,
        });

        if (!confirmed) {
            return {
                Success: false,
                ErrorMessage: 'User declined per-mutation confirmation for Do mode.',
            };
        }

        let execData: Record<string, unknown> | undefined;
        if (this._actionExecutor) {
            const execRes = await this._actionExecutor.ExecuteStepAction({
                TourKey: this._tour.TourKey,
                Step: step,
                ActionCategory: actionCategory,
                ToolName: toolName,
                ActionName: actionName,
                Params: params,
            });
            if (!execRes.Success) {
                return {
                    Success: false,
                    ErrorMessage: execRes.Message ?? 'Do-mode step action execution failed.',
                };
            }
            execData = execRes.Data;
        }

        await this.Advance(directorToken, {
            Outcome: 'Done By Agent',
            AnchorResolution: this._currentStepView?.AnchorResolution ?? 'Registered',
            Data: execData,
        });

        return { Success: true, Data: execData };
    }

    // ========================================================================
    // Internal Step Lifecycle (§8)
    // ========================================================================

    private async enterStep(stepKey: string, appendToPath = true): Promise<void> {
        this.clearPointerHighlightTimer();
        this._pointerHighlight = null;
        this._pendingDemonstrationConfirmation = null;

        if (this._status !== 'In Progress' || this._isPaused) {
            return;
        }

        const step = this._compiled.StepByKey.get(stepKey);
        if (!step) {
            await this.Complete();
            return;
        }

        this._currentStepKey = stepKey;
        if (appendToPath && this._pathTaken[this._pathTaken.length - 1] !== stepKey) {
            this._pathTaken.push(stepKey);
        }

        const stepType = this.resolveStepType(step);
        const stepCtx = this.buildStepContext(step);

        // 0. Check SkipWhen before Prepare/Enter
        if (await this.shouldSkipStep(step)) {
            const skippedOutcome: TourStepOutcome = {
                Outcome: 'Skipped',
                AnchorResolution: 'Registered',
            };
            await this.recordStepSkipped(step, skippedOutcome);
            await this.moveToNextFrom(step, skippedOutcome);
            return;
        }

        // 1. Prepare (navigation / make-visible)
        const prepareResult = await stepType.Prepare(stepCtx);
        if (!prepareResult.Success) {
            this._lastError = prepareResult.ErrorMessage;
        }

        // 2. Resolve anchor
        const targets = stepType.GetTargets(stepCtx);
        const primaryTarget = targets[0] ?? null;
        let anchorInfo: TourResolvedAnchorInfo = {
            Found: true,
            Resolution: 'Registered',
        };

        if (primaryTarget) {
            anchorInfo = await this.resolveAnchorWithFallbacks(primaryTarget);
            if (!anchorInfo.Found) {
                this.emitEvent(
                    new TourAnchorMissingEventArgs(
                        this._runId,
                        this._tour.TourKey,
                        step.StepKey,
                        primaryTarget,
                        anchorInfo.FailureReason ?? 'Anchor not found',
                    ),
                );
                await this.recordStoreEvent('AnchorMissing', {
                    StepKey: step.StepKey,
                    Outcome: 'Anchor Missing',
                    AnchorResolution: 'Failed',
                });

                const onMissing = step.OnMissing ?? 'Center';
                if (onMissing === 'Skip') {
                    const missingOutcome: TourStepOutcome = {
                        Outcome: 'Anchor Missing',
                        AnchorResolution: 'Failed',
                    };
                    await this.finishCurrentStep(step, missingOutcome);
                    await this.moveToNextFrom(step, missingOutcome);
                    return;
                }
                if (onMissing === 'Stall') {
                    this._lastError = anchorInfo.FailureReason ?? `Anchor missing for step '${step.StepKey}'.`;
                    this._currentStepView = this.buildStepView(step, anchorInfo, false, this._lastError);
                    this.publishView();
                    return;
                }
                // 'Center' or 'AgentRecover' proceeds to render centered
            }
        }

        // 3. BeforeStepEnter (synchronous, cancelable)
        const stepRef = toStepRef(step);
        const beforeStepArgs = new BeforeTourStepEnterEventArgs(
            this._runId,
            this._tour.TourKey,
            stepRef,
        );
        this._driver.BeforeStepEnter(beforeStepArgs);
        this.emitEvent(beforeStepArgs);

        if (beforeStepArgs.Cancel) {
            this._lastError = beforeStepArgs.CancelReason ?? `Step '${step.StepKey}' entry canceled.`;
            this.publishView();
            return;
        }

        // 4. Render view + AfterStepEnter
        this._lastError = undefined;
        this._currentStepView = this.buildStepView(
            step,
            anchorInfo,
            true,
            prepareResult.Announcement,
        );
        this._stepRecords.push({
            StepKey: step.StepKey,
            EnteredAt: new Date().toISOString(),
            Outcome: 'Completed',
            AnchorResolution: anchorInfo.Resolution,
            QuestionCount: 0,
        });

        await this.recordStoreEvent('StepEntered', {
            StepKey: step.StepKey,
            AnchorResolution: anchorInfo.Resolution,
        });

        this.publishView();
        this.emitEvent(
            new AfterTourStepEnterEventArgs(this._runId, this._tour.TourKey, stepRef),
        );
        await stepType.OnEnter(stepCtx);

        // 5. Await completion (for visual/non-headless interactive execution)
        const completionSpec = step.Completion ?? stepType.GetDefaultCompletion(stepCtx);
        this.startCompletionWait(step, stepType, stepCtx, completionSpec, anchorInfo.Resolution);
    }

    private startCompletionWait(
        step: TourStepDefinition,
        _stepType: BaseTourStepType,
        _stepCtx: TourStepContext,
        completionSpec: ITourCompletion,
        anchorResolution: TourAnchorResolution,
    ): void {
        this.abortActiveStepWait();
        const controller = new AbortController();
        this._activeStepAbort = controller;

        const compositeCheck =
            completionSpec.Checks.length === 1
                ? completionSpec.Checks[0]
                : {
                      Type: completionSpec.Match === 'Any' ? ('Any' as const) : ('All' as const),
                      Checks: completionSpec.Checks,
                  };

        const checkPlugin = this.resolveCompletionCheck(compositeCheck.Type);
        if (!checkPlugin) {
            return;
        }

        const ctx: TourCompletionContext = {
            RunID: this._runId,
            Tour: this._tour,
            Step: step,
            Check: compositeCheck,
            Host: this._host,
            AnchorBridge: this._anchorBridge,
            ServerPredicateEvaluator: this._serverPredicateEvaluator,
            ConditionContext: this._conditionContext,
            NextRequested$: this._nextRequestedSubject.asObservable(),
            AgentConfirmed$: this._agentConfirmedSubject.asObservable(),
            EntityEvents$: this._entityEventsSubject.asObservable(),
            GetFieldValue: this._anchorBridge?.GetFieldValue,
            AbortSignal: controller.signal,
        };

        void checkPlugin.WaitForCompletion(ctx).then(async (result: TourCompletionResult) => {
            if (controller.signal.aborted || !result.Satisfied) {
                return;
            }
            if (this._currentStepKey !== step.StepKey || this._status !== 'In Progress' || this._isPaused) {
                return;
            }

            const outcome: TourStepOutcome = {
                Outcome: 'Completed',
                AnchorResolution: anchorResolution,
                Data: result.Data,
            };
            await this.finishCurrentStep(step, outcome);
            await this.moveToNextFrom(step, outcome);
        });
    }

    private async finishCurrentStep(step: TourStepDefinition, outcome: TourStepOutcome): Promise<void> {
        const now = new Date().toISOString();
        const lastRecord = [...this._stepRecords].reverse().find((r) => r.StepKey === step.StepKey && !r.ExitedAt);
        if (lastRecord) {
            lastRecord.ExitedAt = now;
            lastRecord.Outcome = outcome.Outcome;
            lastRecord.AnchorResolution = outcome.AnchorResolution;
        } else {
            this._stepRecords.push({
                StepKey: step.StepKey,
                EnteredAt: now,
                ExitedAt: now,
                Outcome: outcome.Outcome,
                AnchorResolution: outcome.AnchorResolution,
                QuestionCount: 0,
            });
        }

        if (
            (outcome.Outcome === 'Completed' || outcome.Outcome === 'Done By Agent') &&
            !this._completedStepKeys.includes(step.StepKey)
        ) {
            this._completedStepKeys.push(step.StepKey);
        }

        await this.recordStoreEvent('StepCompleted', {
            StepKey: step.StepKey,
            Outcome: outcome.Outcome,
            AnchorResolution: outcome.AnchorResolution,
            Payload: outcome.Data,
        });

        const stepType = this.resolveStepType(step);
        const stepCtx = this.buildStepContext(step);
        await stepType.OnExit(stepCtx, outcome);

        const stepRef = toStepRef(step);
        await this._driver.OnStepCompleted(this.buildSessionContext(), stepRef, outcome);

        this.emitEvent(
            new AfterTourStepCompleteEventArgs(
                this._runId,
                this._tour.TourKey,
                step.StepKey,
                stepRef,
                outcome,
            ),
        );
    }

    private async recordStepSkipped(step: TourStepDefinition, outcome: TourStepOutcome): Promise<void> {
        const now = new Date().toISOString();
        this._stepRecords.push({
            StepKey: step.StepKey,
            EnteredAt: now,
            ExitedAt: now,
            Outcome: 'Skipped',
            AnchorResolution: outcome.AnchorResolution,
            QuestionCount: 0,
        });

        await this.recordStoreEvent('StepSkipped', {
            StepKey: step.StepKey,
            Outcome: 'Skipped',
        });

        this.emitEvent(
            new AfterTourStepCompleteEventArgs(
                this._runId,
                this._tour.TourKey,
                step.StepKey,
                toStepRef(step),
                outcome,
            ),
        );
    }

    private async moveToNextFrom(
        completedStep: TourStepDefinition,
        _outcome: TourStepOutcome,
    ): Promise<void> {
        await this.refreshConditionContext();
        const selection = SelectOutgoingEdges(
            completedStep.StepKey,
            this._compiled.Repository,
            this._conditionEvaluator,
            this._conditionContext,
        );

        const candidateRefs: TourStepRef[] = selection.Edges
            .map((e) => this._compiled.StepByKey.get(e.destinationNodeId))
            .filter((s): s is TourStepDefinition => s !== undefined)
            .map(toStepRef);

        const driverOverride = this._driver.ResolveNextStep(
            this.buildSessionContext(),
            candidateRefs,
        );
        const nextKey = driverOverride ?? selection.Edges[0]?.destinationNodeId ?? null;

        if (!nextKey) {
            await this.Complete();
            return;
        }

        await this.enterStep(nextKey);
    }

    private async endSession(
        targetStatus: 'Completed' | 'Dismissed' | 'Snoozed',
        storeEventType: 'RunCompleted' | 'RunDismissed' | 'RunSnoozed',
        reason?: string,
        snoozedUntil?: string,
    ): Promise<boolean> {
        if (this._status === 'Completed' || this._status === 'Dismissed') {
            return false;
        }

        await this.refreshConditionContext();
        const goalMet = this._goalMet || (await this._driver.EvaluateGoal(this.buildSessionContext()));

        const runOutcome: TourRunOutcome = {
            Status: targetStatus,
            GoalMet: goalMet,
            CompletedStepKeys: [...this._completedStepKeys],
            Reason: reason,
        };

        const beforeEnd = new BeforeTourEndEventArgs(
            this._runId,
            this._tour.TourKey,
            runOutcome,
        );
        this.emitEvent(beforeEnd);
        if (beforeEnd.Cancel) {
            this._lastError = beforeEnd.CancelReason ?? 'Tour end canceled.';
            this.publishView();
            return false;
        }

        this.abortActiveStepWait();
        this.clearPointerHighlightTimer();
        this._pointerHighlight = null;
        this._pendingDemonstrationConfirmation = null;
        this._status = targetStatus;
        this._isPaused = false;
        this._completedAt = new Date().toISOString();
        this._currentStepView = null;

        if (goalMet && !this._goalMet) {
            this._goalMet = true;
            this._goalMetAt = this._completedAt;
            await this.recordStoreEvent('GoalMet', {});
        }

        await this.recordStoreEvent(storeEventType, {
            StepKey: this._currentStepKey ?? undefined,
            SnoozedUntil: snoozedUntil,
            Payload: reason ? { Reason: reason } : undefined,
        });

        await this._driver.OnTourEnded(this.buildSessionContext(), runOutcome);
        this.publishView();

        this.emitEvent(
            new AfterTourEndEventArgs(this._runId, this._tour.TourKey, runOutcome),
        );
        return true;
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private async shouldSkipStep(step: TourStepDefinition): Promise<boolean> {
        if (!step.SkipWhen) {
            return false;
        }
        if ('Checks' in step.SkipWhen) {
            const completion: ITourCompletion = step.SkipWhen;
            const checkCtxBase: Omit<TourCompletionContext, 'Check'> = {
                RunID: this._runId,
                Tour: this._tour,
                Step: step,
                Host: this._host,
                AnchorBridge: this._anchorBridge,
                ServerPredicateEvaluator: this._serverPredicateEvaluator,
                ConditionContext: this._conditionContext,
                NextRequested$: this._nextRequestedSubject.asObservable(),
                AgentConfirmed$: this._agentConfirmedSubject.asObservable(),
                EntityEvents$: this._entityEventsSubject.asObservable(),
                GetFieldValue: this._anchorBridge?.GetFieldValue,
                AbortSignal: new AbortController().signal,
            };

            const results: boolean[] = [];
            for (const c of completion.Checks) {
                const plugin = this.resolveCompletionCheck(c.Type);
                results.push(plugin ? await plugin.EvaluateNow({ ...checkCtxBase, Check: c }) : false);
            }
            return completion.Match === 'Any' ? results.some(Boolean) : results.every(Boolean);
        }

        const evalRes = EvaluateTourCondition(step.SkipWhen, this._conditionContext);
        return evalRes.Success && evalRes.Value;
    }

    private async resolveAnchorWithFallbacks(anchor: ITourAnchor): Promise<TourResolvedAnchorInfo> {
        const interpolated = InterpolateAnchorTemplate(anchor, this._conditionContext);
        if (!this._anchorBridge) {
            return {
                Found: true,
                Resolution: this.inferResolutionRung(interpolated.Strategy),
                AnchorKey: interpolated.Key,
            };
        }

        const primary = await this._anchorBridge.ResolveAnchor(interpolated, interpolated.WaitTimeoutMs);
        if (primary.Found) {
            return primary;
        }

        for (const fb of interpolated.Fallbacks ?? []) {
            const res = await this._anchorBridge.ResolveAnchor(fb, fb.WaitTimeoutMs);
            if (res.Found) {
                return res;
            }
        }

        return {
            Found: false,
            Resolution: 'Failed',
            FailureReason: primary.FailureReason ?? `Anchor strategy '${interpolated.Strategy}' did not resolve.`,
        };
    }

    private inferResolutionRung(strategy: string): TourAnchorResolution {
        if (strategy === 'Registered') return 'Registered';
        if (strategy === 'Role') return 'Role';
        if (strategy === 'Selector') return 'Selector';
        return 'Semantic';
    }

    private async refreshConditionContext(): Promise<void> {
        const location: TourLocation = this._host.GetCurrentLocation?.() ?? {};
        const bag: Record<string, unknown> = {
            ...this._conditionContext,
            location,
            principal: this._host.Principal,
            roles: this._host.Principal.Kind === 'MJUser' ? this._host.Principal.Roles : [],
            choices: { ...this._choices },
            completedSteps: [...this._completedStepKeys],
            record: {
                ...(typeof this._conditionContext['record'] === 'object' && this._conditionContext['record'] !== null
                    ? (this._conditionContext['record'] as Record<string, unknown>)
                    : {}),
                EntityName: location.EntityName,
                RecordId: location.RecordId,
            },
        };

        const builder: TourContextBuilder = {
            Tour: this._tour,
            Host: this._host,
            Location: location,
            Principal: this._host.Principal,
            Set(key: string, value: unknown): void {
                bag[key] = value;
            },
            Get(key: string): unknown {
                return bag[key];
            },
            Build(): Record<string, unknown> {
                return bag;
            },
        };

        await this._driver.BuildContext(builder);
        this._conditionContext = builder.Build();
    }

    private async checkGoalOnEntityEvent(event: TourEntityEventPayload): Promise<void> {
        const goal = this._tour.Goal;
        if (!goal || goal.Type !== 'EntityEvent' || this._goalMet) {
            return;
        }
        if (goal.EntityName && goal.EntityName !== event.EntityName) {
            return;
        }
        if (goal.EventType && goal.EventType !== 'any' && goal.EventType !== event.EventType) {
            return;
        }
        if (goal.Filter) {
            const evalRes = EvaluateTourCondition(goal.Filter, {
                ...(event.Record ?? {}),
                record: event.Record ?? {},
            });
            if (!evalRes.Success || !evalRes.Value) {
                return;
            }
        }
        this._goalMet = true;
        this._goalMetAt = new Date().toISOString();
        await this.recordStoreEvent('GoalMet', { Payload: event.Record });
        this.publishView();
    }

    private buildSessionContext(): TourSessionContext {
        return {
            RunID: this._runId,
            Tour: this._tour,
            GuideMode: this._guideMode,
            DirectorType: this._directorType,
            Host: this._host,
            Location: this._host.GetCurrentLocation?.() ?? {},
            Principal: this._host.Principal,
            ConditionContext: this._conditionContext,
            CompletedStepKeys: [...this._completedStepKeys],
            CurrentStepKey: this._currentStepKey,
            AnchorBridge: this._anchorBridge,
            ServerPredicateEvaluator: this._serverPredicateEvaluator,
        };
    }

    private buildStepContext(step: TourStepDefinition): TourStepContext {
        const ordered = [...this._tour.Steps].sort((a, b) => a.Sequence - b.Sequence);
        const idx = Math.max(0, ordered.findIndex((s) => s.StepKey === step.StepKey));
        return {
            Session: this.buildSessionContext(),
            Step: step,
            Config: step.Configuration ?? {},
            StepIndex: idx,
            TotalSteps: ordered.length,
        };
    }

    private buildStepView(
        step: TourStepDefinition,
        anchorInfo: TourResolvedAnchorInfo,
        waitingForCompletion: boolean,
        statusMessage?: string,
    ): TourStepView {
        const ordered = [...this._tour.Steps].sort((a, b) => a.Sequence - b.Sequence);
        const idx = Math.max(0, ordered.findIndex((s) => s.StepKey === step.StepKey));
        const copy = ResolveLocalizedStepCopy(step, this._locale);
        const interpolatedAnchor = step.Anchor
            ? InterpolateAnchorTemplate(step.Anchor, this._conditionContext)
            : null;

        return {
            StepKey: step.StepKey,
            Sequence: step.Sequence,
            StepIndex: idx,
            TotalSteps: ordered.length,
            StepType: step.StepType,
            DriverClass: step.DriverClass ?? null,
            RendererClass: step.RendererClass ?? null,
            Title: copy.Title,
            Body: copy.Body,
            Placement: step.Placement ?? 'auto',
            Mode: step.Mode ?? 'Guide',
            IsOptional: Boolean(step.IsOptional),
            Anchor: interpolatedAnchor,
            AnchorResolved: interpolatedAnchor === null ? true : anchorInfo.Found,
            AnchorResolution: interpolatedAnchor === null ? 'Registered' : anchorInfo.Resolution,
            Configuration: step.Configuration ?? {},
            GuideNotes: copy.GuideNotes,
            VoiceScript: copy.VoiceScript,
            WaitingForCompletion: waitingForCompletion,
            StatusMessage: statusMessage,
        };
    }

    private buildSessionView(): TourSessionView {
        const ordered = [...this._tour.Steps].sort((a, b) => a.Sequence - b.Sequence);
        const idx = this._currentStepKey
            ? Math.max(0, ordered.findIndex((s) => s.StepKey === this._currentStepKey))
            : -1;
        const localizedTour = ResolveLocalizedTourCopy(this._tour, this._locale);

        return {
            RunID: this._runId,
            TourKey: this._tour.TourKey,
            TourName: localizedTour.Name,
            TourVersionID: this._tourVersionId,
            Status: this._status,
            GuideMode: this._guideMode,
            DirectorType: this._directorType,
            PresenterClass: this._tour.PresenterClass ?? 'Overlay',
            CurrentStep: this._currentStepView,
            CompletedStepKeys: [...this._completedStepKeys],
            PathTaken: [...this._pathTaken],
            CanGoBack: this._pathTaken.length > 1 && idx > 0 && this._status === 'In Progress',
            CanAdvance: this._status === 'In Progress' && !this._isPaused && this._currentStepKey !== null,
            StepIndex: idx,
            StepCount: ordered.length,
            IsPaused: this._isPaused,
            GoalMet: this._goalMet,
            LastError: this._lastError,
            PointerHighlight: this._pointerHighlight,
            PendingDemonstrationConfirmation: this._pendingDemonstrationConfirmation,
        };
    }

    private publishView(): void {
        this._sessionViewSubject.next(this.buildSessionView());
    }

    private emitEvent(args: TourSessionEventArgs): void {
        if (this._beforeHook) {
            this._beforeHook(args);
        }
        this._eventsSubject.next(args);
    }

    private async recordStoreEvent(
        eventType: TourRunEvent['EventType'],
        fields: Partial<TourRunEvent>,
    ): Promise<void> {
        const event: TourRunEvent = {
            EventID: uuidv4(),
            RunID: this._runId,
            TourKey: this._tour.TourKey,
            TourVersionID: this._tourVersionId,
            EventType: eventType,
            Timestamp: new Date().toISOString(),
            ...fields,
        };
        await this._progressStore.RecordEvents([event]);
    }

    private resolveStepType(step: TourStepDefinition): BaseTourStepType {
        const key = step.DriverClass || step.StepType;
        const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepType>(
            BaseTourStepType,
            key,
        );
        if (res.Resolved && res.Instance) {
            return res.Instance;
        }
        if (step.DriverClass) {
            const fallback = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepType>(
                BaseTourStepType,
                step.StepType,
            );
            if (fallback.Resolved && fallback.Instance) {
                return fallback.Instance;
            }
        }
        throw new Error(`No BaseTourStepType registered for key '${key}'.`);
    }

    private resolveCompletionCheck(typeKey: string): BaseTourCompletionCheck | null {
        const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourCompletionCheck>(
            BaseTourCompletionCheck,
            typeKey,
        );
        return res.Resolved ? res.Instance : null;
    }

    private abortActiveStepWait(): void {
        if (this._activeStepAbort) {
            this._activeStepAbort.abort();
            this._activeStepAbort = null;
        }
    }

    private clearPointerHighlightTimer(): void {
        if (this._pointerHighlightTimer !== null) {
            clearTimeout(this._pointerHighlightTimer);
            this._pointerHighlightTimer = null;
        }
    }

    private assertDirectorToken(token: string, methodName: string): void {
        if (!this.IsValidDirectorToken(token)) {
            throw new Error(
                `Unauthorized director call to TourSession.${methodName}(): caller does not hold the active DirectorToken.`,
            );
        }
    }
}

class AdHocDirector extends BaseTourDirector {
    constructor(public readonly DirectorType: string) {
        super();
    }
}

function resolveDriver(driverClass?: string | null): BaseTourDriver {
    const key = driverClass || 'Default';
    const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourDriver>(
        BaseTourDriver,
        key,
    );
    return res.Resolved && res.Instance ? res.Instance : new BaseTourDriver();
}

function resolveDefaultGuideMode(tour: TourDefinition): TourSessionGuideMode {
    const mode = tour.DefaultGuideMode;
    if (mode === 'Chat' || mode === 'Voice' || mode === 'Visual') {
        return mode;
    }
    return 'Visual';
}

function toStepRef(step: TourStepDefinition): TourStepRef {
    return {
        StepKey: step.StepKey,
        Sequence: step.Sequence,
        Title: step.Title,
        StepType: step.StepType,
        Mode: step.Mode ?? 'Guide',
        IsOptional: Boolean(step.IsOptional),
    };
}

function isBannedDoActionCategory(category: string): boolean {
    const normalized = category.replace(/[^a-zA-Z]/g, '').toLowerCase();
    return BANNED_DO_ACTION_NORMALIZED.has(normalized);
}

function extractAnchorKey(anchor: ITourAnchor): string | undefined {
    return (
        anchor.Key ??
        anchor.Field ??
        anchor.SectionKey ??
        anchor.RailKey ??
        anchor.ActionKey ??
        anchor.NavItemKey ??
        anchor.DriverClass ??
        anchor.PageId ??
        anchor.ColumnKey ??
        anchor.AppName ??
        anchor.Selector
    );
}
