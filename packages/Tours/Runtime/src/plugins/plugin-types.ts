/**
 * @fileoverview Shared context and result interfaces used by all Guided Tours plugins.
 * @module @memberjunction/tours-runtime
 */

import type {
    ITourAnchorDomBridge,
    ITourHost,
    ITourServerPredicateEvaluator,
    TourCapabilityRequirement,
    TourLocation,
    TourPrincipal,
} from '../host-contracts';
import type {
    ITourAnchor,
    ITourCompletion,
    ITourStepConfiguration,
    TourCompletionCheckSpec,
    TourDefinition,
    TourHealthCheck,
    TourOverrideDefinition,
    TourPreferences,
    TourRunRecord,
    TourSessionGuideMode,
    TourStepDefinition,
    TourStepRef,
    TourTriggerDefinition,
} from '../types';

export interface TourContextBuilder {
    readonly Tour: TourDefinition;
    readonly Host: ITourHost;
    readonly Location: TourLocation;
    readonly Principal: TourPrincipal;
    Set(key: string, value: unknown): void;
    Get(key: string): unknown;
    Build(): Record<string, unknown>;
}

export interface TourSessionContext {
    readonly RunID: string;
    readonly Tour: TourDefinition;
    readonly GuideMode: TourSessionGuideMode;
    readonly DirectorType: string;
    readonly Host: ITourHost;
    readonly Location: TourLocation;
    readonly Principal: TourPrincipal;
    readonly ConditionContext: Record<string, unknown>;
    readonly CompletedStepKeys: ReadonlyArray<string>;
    readonly CurrentStepKey: string | null;
    readonly AnchorBridge?: ITourAnchorDomBridge;
    readonly ServerPredicateEvaluator?: ITourServerPredicateEvaluator;
}

export interface TourStepContext<TConfig extends object = ITourStepConfiguration> {
    readonly Session: TourSessionContext;
    readonly Step: TourStepDefinition<TConfig>;
    readonly Config: TConfig;
    readonly StepIndex: number;
    readonly TotalSteps: number;
}

export interface TourPrepareResult {
    Success: boolean;
    Navigated: boolean;
    Announcement?: string;
    ErrorMessage?: string;
}

export interface TourAgentStepToolDef {
    Name: string;
    Description: string;
    InputSchema: Record<string, unknown>;
    Handler?: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface TourStepAgentBrief {
    StepKey: string;
    StepType: string;
    Title: string;
    Mode: string;
    Instructions: string;
    GuideNotes?: string;
    ExpectedOutcome: string;
    TargetAnchors: ITourAnchor[];
    StepTools: TourAgentStepToolDef[];
}

export interface TourCompletionContext {
    readonly RunID: string;
    readonly Tour: TourDefinition;
    readonly Step: TourStepDefinition;
    readonly Check: TourCompletionCheckSpec;
    readonly Host: ITourHost;
    readonly AnchorBridge?: ITourAnchorDomBridge;
    readonly ServerPredicateEvaluator?: ITourServerPredicateEvaluator;
    readonly ConditionContext: Record<string, unknown>;
    /** Fires when user clicks Next/Continue or a choice completes. */
    readonly NextRequested$: import('rxjs').Observable<void>;
    /** Fires when an agent director confirms completion via `AgentConfirmed`. */
    readonly AgentConfirmed$: import('rxjs').Observable<Record<string, unknown> | undefined>;
    /** Fires when an `EntityEvent` is reported to the session/engine. */
    readonly EntityEvents$: import('rxjs').Observable<TourEntityEventPayload>;
    /** Current open form field reader if host provides it. */
    readonly GetFieldValue?: (entityName: string | undefined, fieldName: string) => unknown;
    readonly AbortSignal: AbortSignal;
}

export interface TourEntityEventPayload {
    EntityName: string;
    EventType: 'save' | 'delete' | 'new_record';
    SaveSubType?: 'create' | 'update';
    Record?: Record<string, unknown>;
    ChangedFieldNames?: string[];
}

export interface TourTriggerContext {
    readonly Tour: TourDefinition;
    readonly Trigger: TourTriggerDefinition;
    readonly Host: ITourHost;
    readonly Location: TourLocation;
    readonly PreviousLocation?: TourLocation;
    readonly Principal: TourPrincipal;
    readonly Runs: ReadonlyArray<TourRunRecord>;
    readonly InstalledAppVersions?: ReadonlyMap<string, string>;
    readonly SeenAppVersions?: ReadonlyMap<string, string>;
    readonly SignalEvent?: { SignalKey: string; Payload?: Record<string, unknown> };
    readonly EntityEvent?: TourEntityEventPayload;
    readonly StruggleEvent?: {
        Kind: 'RepeatedSaveValidationFailure' | 'HowDoIOmnibarQuery';
        FailureCount?: number;
        EntityName?: string;
        QueryText?: string;
    };
    readonly Now?: Date;
}

export interface TourTriggerMatch {
    Matched: boolean;
    Delivery: TourTriggerDefinition['Delivery'];
    Reason?: string;
}

export interface TourInterruptionBudgetState {
    OffersThisSession: number;
    OffersToday: number;
    TagCountsToday: Record<string, number>;
    IsFormDirty: boolean;
    IsDialogOpen: boolean;
    IsUserTyping: boolean;
    IsRealtimeSessionLive: boolean;
    MsSincePageLoad: number;
    MaxOffersPerSession?: number;
    MaxOffersPerDay?: number;
    TagGroupCaps?: Record<string, number>;
    InitialLoadQuietPeriodMs?: number;
}

export interface TourEligibilityContext {
    readonly Tour: TourDefinition;
    readonly Host: ITourHost;
    readonly Location: TourLocation;
    readonly Principal: TourPrincipal;
    readonly Preferences?: TourPreferences;
    readonly Runs: ReadonlyArray<TourRunRecord>;
    readonly AllTours?: ReadonlyArray<TourDefinition>;
    readonly Overrides?: ReadonlyArray<TourOverrideDefinition>;
    readonly InstalledApps?: ReadonlyArray<string>;
    readonly ConditionContext?: Record<string, unknown>;
    readonly InterruptionBudget?: TourInterruptionBudgetState;
    readonly RequestedExplicitly?: boolean;
    readonly Now?: Date;
    readonly ServerPredicateResults?: ReadonlyMap<string, boolean>;
}

export interface TourEligibilityResult {
    Eligible: boolean;
    Reason?: string;
    PolicyName?: string;
    RecommendedPrerequisites?: string[];
}

export interface TourAnchorPlan {
    Strategy: string;
    SelectorHints: string[];
    RequiresContextResolution: boolean;
    MissingTemplateVariables: string[];
}

export interface TourPluginDescriptor {
    Key: string;
    RequiredCapabilities?: TourCapabilityRequirement;
}

export type {
    ITourAnchor,
    ITourCompletion,
    TourHealthCheck,
    TourStepRef,
};
