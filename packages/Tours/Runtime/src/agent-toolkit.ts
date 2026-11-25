/**
 * @fileoverview Host-agnostic `TourAgentToolkit` (§10):
 * Builds JSON-schema client tools + handlers for global tour control (`StartTour`,
 * `ListTours`, `GetActiveTour`, `PauseTour`, `ResumeTour`, `StopTour`) and active
 * session guidance (`TourGetState`, `TourGetVisibleAnchors`, `TourHighlight`,
 * `TourGoToStep`, `TourPrepareStep`, `TourPerformStep`, `TourMarkKnown`, `TourSuggest`),
 * plus `BuildActiveTourContextSnapshot()` for `AppContextSnapshot`.
 * @module @memberjunction/tours-runtime
 */

import { MJGlobal } from '@memberjunction/global';
import type {
    ITourAnchorDomBridge,
    ITourAgentActionExecutor,
    ITourDefinitionSource,
    ITourHost,
    ITourMutationConfirmer,
    ITourProgressStore,
    ITourServerPredicateEvaluator,
    TourActiveContextSnapshot,
    TourClientToolDefinition,
    TourLocation,
} from './host-contracts';
import { BaseTourStepType } from './plugins/base-step-type';
import { RegisterStandardTourPlugins } from './plugins/register-standard-plugins';
import { TourEligibilityEvaluator } from './plugins/standard-eligibility-policies';

RegisterStandardTourPlugins();
import { CompileTourGraph } from './tour-graph-compiler';
import { TourSession } from './tour-session';
import type {
    TourDefinition,
    TourSessionGuideMode,
    TourStepDefinition,
} from './types';

export interface TourAgentToolkitOptions {
    Host: ITourHost;
    DefinitionSource: ITourDefinitionSource;
    ProgressStore: ITourProgressStore;
    AnchorBridge?: ITourAnchorDomBridge;
    ServerPredicateEvaluator?: ITourServerPredicateEvaluator;
    MutationConfirmer?: ITourMutationConfirmer;
    ActionExecutor?: ITourAgentActionExecutor;
    EligibilityEvaluator?: TourEligibilityEvaluator;
    OnSessionChanged?: (session: TourSession | null) => void;
}

export class TourAgentToolkit {
    private readonly _host: ITourHost;
    private readonly _definitionSource: ITourDefinitionSource;
    private readonly _progressStore: ITourProgressStore;
    private readonly _anchorBridge?: ITourAnchorDomBridge;
    private readonly _serverPredicateEvaluator?: ITourServerPredicateEvaluator;
    private readonly _mutationConfirmer?: ITourMutationConfirmer;
    private readonly _actionExecutor?: ITourAgentActionExecutor;
    private readonly _eligibilityEvaluator: TourEligibilityEvaluator;
    private readonly _onSessionChanged?: (session: TourSession | null) => void;

    private _activeSession: TourSession | null = null;
    private _activeDirectorToken: string | null = null;

    constructor(options: TourAgentToolkitOptions) {
        this._host = options.Host;
        this._definitionSource = options.DefinitionSource;
        this._progressStore = options.ProgressStore;
        this._anchorBridge = options.AnchorBridge;
        this._serverPredicateEvaluator = options.ServerPredicateEvaluator;
        this._mutationConfirmer = options.MutationConfirmer;
        this._actionExecutor = options.ActionExecutor;
        this._eligibilityEvaluator = options.EligibilityEvaluator ?? new TourEligibilityEvaluator();
        this._onSessionChanged = options.OnSessionChanged;
    }

    public get ActiveSession(): TourSession | null {
        return this._activeSession;
    }

    /**
     * Attaches an externally created `TourSession` (and optionally its director token if this
     * toolkit's agent is the session director).
     */
    public SetActiveSession(session: TourSession | null, directorToken?: string | null): void {
        this._activeSession = session;
        this._activeDirectorToken = directorToken ?? null;
        this._onSessionChanged?.(session);
    }

    /** Global client tools available even when no tour is running (§10.1). */
    public GetGlobalTools(): TourClientToolDefinition[] {
        return [
            {
                Name: 'StartTour',
                Description: 'Start a Guided Tour by TourKey in Visual, Chat, or Voice mode.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        TourKey: { type: 'string', description: 'Unique key of the tour to start.' },
                        Mode: {
                            type: 'string',
                            enum: ['Visual', 'Chat', 'Voice'],
                            description: 'Guide mode for the tour session.',
                        },
                        StartAtStepKey: {
                            type: 'string',
                            description: 'Optional StepKey to start at.',
                        },
                    },
                    required: ['TourKey'],
                },
                Handler: async (params) => this.handleStartTour(params),
            },
            {
                Name: 'ListTours',
                Description: 'List available Guided Tours, optionally filtered by current location or search query.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        ForCurrentLocation: { type: 'boolean' },
                        Query: { type: 'string' },
                    },
                },
                Handler: async (params) => this.handleListTours(params),
            },
            {
                Name: 'GetActiveTour',
                Description: 'Get the currently active Guided Tour session state, if any.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {},
                },
                Handler: async () => this.handleGetActiveTour(),
            },
            {
                Name: 'PauseTour',
                Description: 'Pause the currently running Guided Tour.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {},
                },
                Handler: async () => this.handlePauseTour(),
            },
            {
                Name: 'ResumeTour',
                Description: 'Resume a paused Guided Tour.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {},
                },
                Handler: async () => this.handleResumeTour(),
            },
            {
                Name: 'StopTour',
                Description: 'Stop/dismiss the currently running Guided Tour.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        Reason: { type: 'string' },
                    },
                },
                Handler: async (params) => this.handleStopTour(params),
            },
        ];
    }

    /**
     * Session tools registered while a tour session is live (§10.3).
     * Names intentionally avoid dots for native tool-calling compatibility.
     */
    public GetSessionTools(directorToken?: string): TourClientToolDefinition[] {
        const effectiveToken = directorToken ?? this._activeDirectorToken ?? '';

        const tools: TourClientToolDefinition[] = [
            {
                Name: 'TourGetState',
                Description: 'Read-only: get the active step, completed path, remaining steps, and guide notes.',
                Category: 'tours',
                InputSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleTourGetState(),
            },
            {
                Name: 'TourGetVisibleAnchors',
                Description:
                    'List all registered and semantic anchors currently visible on screen with accessible names. This is the ONLY anchor source an agent may cite.',
                Category: 'tours',
                InputSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleTourGetVisibleAnchors(),
            },
            {
                Name: 'TourHighlight',
                Description:
                    'Spotlight a visible anchor on screen with an optional caption. Fails loudly if the anchor is not currently visible.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        AnchorKey: { type: 'string' },
                        Caption: { type: 'string' },
                    },
                    required: ['AnchorKey'],
                },
                Handler: async (params) => this.handleTourHighlight(params),
            },
            {
                Name: 'TourGoToStep',
                Description:
                    'Director-only: move the tour cursor to an authored outgoing step or a previously completed step.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        StepKey: { type: 'string' },
                    },
                    required: ['StepKey'],
                },
                Handler: async (params) => this.handleTourGoToStep(effectiveToken, params),
            },
            {
                Name: 'TourPrepareStep',
                Description:
                    'Run the current (or target) step Prepare navigation/make-visible instructions (requires navigation consent once per tour).',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        ConsentGranted: { type: 'boolean' },
                    },
                },
                Handler: async (params) => this.handleTourPrepareStep(params),
            },
            {
                Name: 'TourPerformStep',
                Description:
                    'Director-only Do mode: execute the current step action when AllowAgentActions is true, Mode is Do, user confirms the mutation, and category is not banned.',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        ActionCategory: { type: 'string' },
                        ToolName: { type: 'string' },
                        ActionName: { type: 'string' },
                        Params: { type: 'object' },
                        Description: { type: 'string' },
                    },
                },
                Handler: async (params) => this.handleTourPerformStep(effectiveToken, params),
            },
            {
                Name: 'TourMarkKnown',
                Description:
                    'Skip ahead on the current step because the user already knows it (requires optional step or UserConfirmed=true).',
                Category: 'tours',
                InputSchema: {
                    type: 'object',
                    properties: {
                        UserConfirmed: { type: 'boolean' },
                    },
                },
                Handler: async (params) => this.handleTourMarkKnown(effectiveToken, params),
            },
            {
                Name: 'TourSuggest',
                Description: 'Suggest eligible prerequisite or next tours for the user and current location.',
                Category: 'tours',
                InputSchema: { type: 'object', properties: {} },
                Handler: async () => this.handleTourSuggest(),
            },
        ];

        // Append step-specific tools from BaseTourStepType.DescribeForAgent
        const session = this._activeSession;
        if (session?.CurrentStepView) {
            const step = session.Tour.Steps.find(
                (s) => s.StepKey === session.CurrentStepView?.StepKey,
            );
            if (step) {
                const stepTypeKey = step.DriverClass || step.StepType;
                const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepType>(
                    BaseTourStepType,
                    stepTypeKey,
                );
                if (res.Resolved && res.Instance) {
                    const ordered = [...session.Tour.Steps].sort((a, b) => a.Sequence - b.Sequence);
                    const stepIndex = Math.max(0, ordered.findIndex((s) => s.StepKey === step.StepKey));
                    const brief = res.Instance.DescribeForAgent({
                        Session: {
                            RunID: session.RunID,
                            Tour: session.Tour,
                            GuideMode: session.GuideMode,
                            DirectorType: session.DirectorType,
                            Host: this._host,
                            Location: this._host.GetCurrentLocation?.() ?? {},
                            Principal: this._host.Principal,
                            ConditionContext: {},
                            CompletedStepKeys: session.CompletedStepKeys,
                            CurrentStepKey: session.CurrentStepKey,
                            AnchorBridge: this._anchorBridge,
                            ServerPredicateEvaluator: this._serverPredicateEvaluator,
                        },
                        Step: step,
                        Config: step.Configuration ?? {},
                        StepIndex: stepIndex,
                        TotalSteps: ordered.length,
                    });
                    for (const stepTool of brief.StepTools) {
                        tools.push({
                            Name: stepTool.Name,
                            Description: stepTool.Description,
                            InputSchema: stepTool.InputSchema,
                            Category: 'tours-step',
                            Handler:
                                stepTool.Handler ??
                                (async (params) => ({
                                    Success: true,
                                    Tool: stepTool.Name,
                                    Params: params,
                                })),
                        });
                    }
                }
            }
        }

        return tools;
    }

    /** Builds `ActiveTour` + `AvailableTours` (up to 3) for `AppContextSnapshot` (§10.2). */
    public async BuildActiveTourContextSnapshot(): Promise<TourActiveContextSnapshot> {
        const location = this._host.GetCurrentLocation?.() ?? {};
        const tours = await this._definitionSource.GetTours(location);
        const runs = await this._progressStore.GetRuns();

        const ranked = this._eligibilityEvaluator.RankEligibleTours(tours, {
            Host: this._host,
            Location: location,
            Principal: this._host.Principal,
            Runs: runs,
            RequestedExplicitly: true,
        });

        const available = ranked.slice(0, 3).map(({ Tour }) => ({
            TourKey: Tour.TourKey,
            Name: Tour.Name,
            Description: Tour.Description ?? '',
            EstimatedMinutes: Tour.EstimatedMinutes,
        }));

        const session = this._activeSession;
        if (!session || session.Status !== 'In Progress') {
            return { ActiveTour: null, AvailableTours: available };
        }

        const view = session.SessionView;
        return {
            ActiveTour: {
                TourKey: view.TourKey,
                Name: view.TourName,
                StepKey: view.CurrentStep?.StepKey ?? '',
                StepTitle: view.CurrentStep?.Title ?? '',
                StepIndex: view.StepIndex,
                StepCount: view.StepCount,
                Mode: view.GuideMode,
                DirectorType: view.DirectorType,
                StartedAt: session.GetRunRecord().StartedAt,
            },
            AvailableTours: available,
        };
    }

    // ========================================================================
    // Tool Handlers
    // ========================================================================

    private async handleStartTour(params: Record<string, unknown>): Promise<Record<string, unknown>> {
        const tourKey = typeof params['TourKey'] === 'string' ? params['TourKey'].trim() : '';
        if (!tourKey) {
            return { Success: false, Error: 'TourKey is required.' };
        }

        const modeRaw = params['Mode'];
        const mode: TourSessionGuideMode =
            modeRaw === 'Chat' || modeRaw === 'Voice' || modeRaw === 'Visual'
                ? modeRaw
                : 'Visual';
        const startAtStepKey =
            typeof params['StartAtStepKey'] === 'string' ? params['StartAtStepKey'] : undefined;

        const location = this._host.GetCurrentLocation?.() ?? {};
        const tour =
            (await this._definitionSource.GetTourByKey?.(tourKey)) ??
            (await this._definitionSource.GetTours(location)).find((t) => t.TourKey === tourKey) ??
            null;

        if (!tour) {
            return { Success: false, Error: `Tour '${tourKey}' not found.` };
        }

        if (startAtStepKey && !tour.Steps.some((s) => s.StepKey === startAtStepKey)) {
            return {
                Success: false,
                Error: `StartAtStepKey '${startAtStepKey}' does not exist in tour '${tourKey}'.`,
            };
        }

        const session = new TourSession({
            Tour: tour,
            Host: this._host,
            ProgressStore: this._progressStore,
            AnchorBridge: this._anchorBridge,
            ServerPredicateEvaluator: this._serverPredicateEvaluator,
            MutationConfirmer: this._mutationConfirmer,
            ActionExecutor: this._actionExecutor,
            GuideMode: mode,
            LaunchSource: 'Agent',
            InitialStepKey: startAtStepKey,
        });

        const directorToken = session.AttachDirector(mode);
        const started = await session.Start();
        if (!started) {
            return {
                Success: false,
                Error: session.SessionView.LastError ?? 'Tour start was canceled.',
            };
        }

        this.SetActiveSession(session, directorToken);
        return {
            Success: true,
            RunID: session.RunID,
            TourKey: tour.TourKey,
            Mode: session.GuideMode,
            CurrentStepKey: session.CurrentStepKey,
        };
    }

    private async handleListTours(params: Record<string, unknown>): Promise<Record<string, unknown>> {
        const location: TourLocation = this._host.GetCurrentLocation?.() ?? {};
        const tours = await this._definitionSource.GetTours(location);
        const forCurrentLocation = params['ForCurrentLocation'] === true;
        const query = typeof params['Query'] === 'string' ? params['Query'].trim().toLowerCase() : '';

        let filtered: TourDefinition[] = tours.filter((t) => t.Status === 'Active');
        if (forCurrentLocation && location.ApplicationName) {
            filtered = filtered.filter(
                (t) =>
                    !t.ApplicationName ||
                    t.ApplicationName === location.ApplicationName ||
                    t.StartLocation?.ApplicationName === location.ApplicationName,
            );
        }
        if (query) {
            filtered = filtered.filter((t) => matchesTourQuery(t, query));
        }

        return {
            Success: true,
            Tours: filtered.map((t) => ({
                TourKey: t.TourKey,
                Name: t.Name,
                Description: t.Description ?? '',
                ApplicationName: t.ApplicationName ?? null,
                EstimatedMinutes: t.EstimatedMinutes ?? null,
                StepCount: t.Steps.length,
            })),
        };
    }

    private async handleGetActiveTour(): Promise<Record<string, unknown>> {
        const snapshot = await this.BuildActiveTourContextSnapshot();
        return {
            Success: true,
            ActiveTour: snapshot.ActiveTour,
            AvailableTours: snapshot.AvailableTours,
        };
    }

    private async handlePauseTour(): Promise<Record<string, unknown>> {
        if (!this._activeSession) {
            return { Success: false, Error: 'No active tour session.' };
        }
        await this._activeSession.Pause();
        return { Success: true, Status: this._activeSession.Status, IsPaused: true };
    }

    private async handleResumeTour(): Promise<Record<string, unknown>> {
        if (!this._activeSession) {
            return { Success: false, Error: 'No active tour session.' };
        }
        await this._activeSession.Resume();
        return { Success: true, Status: this._activeSession.Status, IsPaused: false };
    }

    private async handleStopTour(params: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (!this._activeSession) {
            return { Success: false, Error: 'No active tour session.' };
        }
        const reason = typeof params['Reason'] === 'string' ? params['Reason'] : undefined;
        await this._activeSession.Dismiss(reason);
        return { Success: true, Status: this._activeSession.Status };
    }

    private async handleTourGetState(): Promise<Record<string, unknown>> {
        const session = this._activeSession;
        if (!session) {
            return { Success: false, Error: 'No active tour session.' };
        }
        const view = session.SessionView;
        const compiled = CompileTourGraph(session.Tour);
        const currentKey = view.CurrentStep?.StepKey ?? null;
        const outgoingStepKeys = currentKey
            ? compiled.Repository.GetOutgoingEdges(currentKey).map((e) => e.destinationNodeId)
            : [];
        const remainingSteps = session.Tour.Steps.filter(
            (s) => !view.CompletedStepKeys.includes(s.StepKey) && s.StepKey !== currentKey,
        ).map((s) => ({ StepKey: s.StepKey, Title: s.Title, Sequence: s.Sequence }));

        return {
            Success: true,
            RunID: view.RunID,
            TourKey: view.TourKey,
            TourName: view.TourName,
            Status: view.Status,
            GuideMode: view.GuideMode,
            DirectorType: view.DirectorType,
            CurrentStep: view.CurrentStep,
            PathTaken: view.PathTaken,
            CompletedStepKeys: view.CompletedStepKeys,
            AuthoredNextStepKeys: outgoingStepKeys,
            RemainingSteps: remainingSteps,
            GuideNotes: view.CurrentStep?.GuideNotes ?? '',
        };
    }

    private async handleTourGetVisibleAnchors(): Promise<Record<string, unknown>> {
        if (!this._anchorBridge) {
            return { Success: true, Anchors: [] };
        }
        const anchors = this._anchorBridge.GetVisibleAnchors().filter((a) => a.IsVisible);
        return {
            Success: true,
            Anchors: anchors,
        };
    }

    private async handleTourHighlight(params: Record<string, unknown>): Promise<Record<string, unknown>> {
        const anchorKey = typeof params['AnchorKey'] === 'string' ? params['AnchorKey'].trim() : '';
        const caption = typeof params['Caption'] === 'string' ? params['Caption'] : undefined;

        if (!anchorKey) {
            return { Success: false, Error: 'TourHighlight failed: AnchorKey is required.' };
        }
        if (!this._anchorBridge) {
            return {
                Success: false,
                Error: `TourHighlight failed: no anchor bridge is attached to verify '${anchorKey}'.`,
            };
        }

        const visible = this._anchorBridge.GetVisibleAnchors().filter((a) => a.IsVisible);
        const found = visible.find((a) => a.AnchorKey === anchorKey);
        if (!found) {
            return {
                Success: false,
                Error: `TourHighlight failed: anchor '${anchorKey}' is not currently visible on screen. Call TourGetVisibleAnchors to see visible anchors.`,
            };
        }

        if (this._anchorBridge.HighlightAnchor) {
            const hl = await this._anchorBridge.HighlightAnchor(anchorKey, caption);
            if (!hl.Success) {
                return {
                    Success: false,
                    Error: hl.ErrorMessage ?? `TourHighlight failed for '${anchorKey}'.`,
                };
            }
        }

        return {
            Success: true,
            AnchorKey: anchorKey,
            AccessibleName: found.AccessibleName,
            Caption: caption ?? null,
        };
    }

    private async handleTourGoToStep(
        directorToken: string,
        params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const session = this._activeSession;
        if (!session) {
            return { Success: false, Error: 'No active tour session.' };
        }
        const stepKey = typeof params['StepKey'] === 'string' ? params['StepKey'].trim() : '';
        if (!stepKey) {
            return { Success: false, Error: 'StepKey is required.' };
        }
        try {
            const moved = await session.GoToStep(directorToken, stepKey);
            return {
                Success: moved,
                CurrentStepKey: session.CurrentStepKey,
            };
        } catch (err) {
            return {
                Success: false,
                Error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private async handleTourPrepareStep(params: Record<string, unknown>): Promise<Record<string, unknown>> {
        const session = this._activeSession;
        if (!session || !session.CurrentStepKey) {
            return { Success: false, Error: 'No active tour step to prepare.' };
        }
        const step = session.Tour.Steps.find((s) => s.StepKey === session.CurrentStepKey);
        if (!step) {
            return { Success: false, Error: 'Active step definition not found.' };
        }
        if (params['ConsentGranted'] === true) {
            session.GrantPrepareNavConsent();
        }
        if (
            session.Tour.LaunchPolicy?.RequireConsentForPrepareNav &&
            !session.PrepareNavConsentGranted &&
            step.Prepare
        ) {
            return {
                Success: false,
                RequiresConsent: true,
                Error: 'Navigation consent is required once per tour before running Prepare navigation.',
            };
        }
        const stepTypeKey = step.DriverClass || step.StepType;
        const res = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTourStepType>(
            BaseTourStepType,
            stepTypeKey,
        );
        if (!res.Resolved || !res.Instance) {
            return { Success: false, Error: `Unknown step type '${stepTypeKey}'.` };
        }
        const prep = await res.Instance.Prepare({
            Session: {
                RunID: session.RunID,
                Tour: session.Tour,
                GuideMode: session.GuideMode,
                DirectorType: session.DirectorType,
                Host: this._host,
                Location: this._host.GetCurrentLocation?.() ?? {},
                Principal: this._host.Principal,
                ConditionContext: {},
                CompletedStepKeys: session.CompletedStepKeys,
                CurrentStepKey: session.CurrentStepKey,
                AnchorBridge: this._anchorBridge,
                ServerPredicateEvaluator: this._serverPredicateEvaluator,
            },
            Step: step,
            Config: step.Configuration ?? {},
            StepIndex: session.SessionView.StepIndex,
            TotalSteps: session.SessionView.StepCount,
        });
        return {
            Success: prep.Success,
            Navigated: prep.Navigated,
            Announcement: prep.Announcement ?? null,
            Error: prep.ErrorMessage ?? null,
        };
    }

    private async handleTourPerformStep(
        directorToken: string,
        params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const session = this._activeSession;
        if (!session) {
            return { Success: false, Error: 'No active tour session.' };
        }
        try {
            const res = await session.PerformStep(directorToken, {
                ActionCategory: typeof params['ActionCategory'] === 'string' ? params['ActionCategory'] : undefined,
                ToolName: typeof params['ToolName'] === 'string' ? params['ToolName'] : undefined,
                ActionName: typeof params['ActionName'] === 'string' ? params['ActionName'] : undefined,
                Params:
                    params['Params'] && typeof params['Params'] === 'object'
                        ? (params['Params'] as Record<string, unknown>)
                        : undefined,
                Description: typeof params['Description'] === 'string' ? params['Description'] : undefined,
            });
            return {
                Success: res.Success,
                Error: res.ErrorMessage ?? null,
                Data: res.Data ?? null,
            };
        } catch (err) {
            return {
                Success: false,
                Error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private async handleTourMarkKnown(
        directorToken: string,
        params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const session = this._activeSession;
        if (!session) {
            return { Success: false, Error: 'No active tour session.' };
        }
        try {
            const ok = await session.MarkStepKnown(directorToken, params['UserConfirmed'] === true);
            return { Success: ok, CurrentStepKey: session.CurrentStepKey };
        } catch (err) {
            return {
                Success: false,
                Error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private async handleTourSuggest(): Promise<Record<string, unknown>> {
        const location = this._host.GetCurrentLocation?.() ?? {};
        const tours = await this._definitionSource.GetTours(location);
        const runs = await this._progressStore.GetRuns();

        const ranked = this._eligibilityEvaluator.RankEligibleTours(tours, {
            Host: this._host,
            Location: location,
            Principal: this._host.Principal,
            Runs: runs,
            RequestedExplicitly: true,
        });

        return {
            Success: true,
            Suggestions: ranked.map((r) => ({
                TourKey: r.Tour.TourKey,
                Name: r.Tour.Name,
                Description: r.Tour.Description ?? '',
                RecommendedPrerequisites: r.Result.RecommendedPrerequisites ?? [],
            })),
        };
    }
}

function matchesTourQuery(tour: TourDefinition, lowerQuery: string): boolean {
    if (tour.Name.toLowerCase().includes(lowerQuery)) return true;
    if (tour.TourKey.toLowerCase().includes(lowerQuery)) return true;
    if ((tour.Description ?? '').toLowerCase().includes(lowerQuery)) return true;
    return tour.Steps.some((step: TourStepDefinition) => {
        return (
            step.Title.toLowerCase().includes(lowerQuery) ||
            (step.Body ?? '').toLowerCase().includes(lowerQuery)
        );
    });
}
