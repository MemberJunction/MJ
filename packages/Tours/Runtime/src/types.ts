/**
 * @fileoverview Core runtime types and JSONType data shapes for MemberJunction Guided Tours.
 * Pure TypeScript — zero DOM, zero Angular, zero entity dependencies.
 * @module @memberjunction/tours-runtime
 */

import type { CompositeFilterDescriptor, FilterDescriptor, FilterOperator } from '@memberjunction/core';

// ============================================================================
// Enumerated string unions (matching readable-status-values standard)
// ============================================================================

export type TourGuideMode = 'Visual' | 'Chat' | 'Voice' | 'User Choice';
export type TourSessionGuideMode = 'Visual' | 'Chat' | 'Voice';
export type TourStepMode = 'Show' | 'Guide' | 'Do';

export type TourStepPlacement =
    | 'top'
    | 'top-start'
    | 'top-end'
    | 'bottom'
    | 'bottom-start'
    | 'bottom-end'
    | 'left'
    | 'left-start'
    | 'left-end'
    | 'right'
    | 'right-start'
    | 'right-end'
    | 'center'
    | 'auto';

export type TourOnMissingPolicy = 'Skip' | 'Center' | 'Stall' | 'AgentRecover';

export type TourStatus = 'Draft' | 'Active' | 'Retired';

export type TourRunStatus =
    | 'Pending'
    | 'In Progress'
    | 'Completed'
    | 'Dismissed'
    | 'Snoozed'
    | 'Abandoned'
    | 'Failed';

export type TourRunStepOutcome =
    | 'Completed'
    | 'Skipped'
    | 'Already Known'
    | 'Done By Agent'
    | 'Anchor Missing'
    | 'Dismissed';

export type TourAnchorResolution =
    | 'Registered'
    | 'Semantic'
    | 'Role'
    | 'Selector'
    | 'Failed';

export type TourLaunchSource =
    | 'Launcher'
    | 'Omnibar'
    | 'Agent'
    | 'Trigger'
    | 'Notification'
    | 'Link'
    | 'Learning Path';

export type TourPrerequisiteType = 'Tour' | 'Role' | 'Authorization' | 'Application' | 'Data';
export type TourPrerequisiteStrength = 'Required' | 'Recommended';
export type TourTriggerDelivery = 'Offer' | 'Beacon' | 'Notification' | 'Auto';
export type TourOverrideScope = 'Global' | 'Role' | 'User';

export type TourAnchorStrategy =
    | 'Registered'
    | 'FormField'
    | 'FormSection'
    | 'FormRailGroup'
    | 'FormToolbarAction'
    | 'NavItem'
    | 'RailPage'
    | 'AppSwitcher'
    | 'GridColumn'
    | 'Omnibar'
    | 'ChatComposer'
    | 'Role'
    | 'Selector';

export type TourStandardStepTypeKey =
    | 'Spotlight'
    | 'Action'
    | 'Beacon'
    | 'Modal'
    | 'Banner'
    | 'Choice'
    | 'Media'
    | 'EmbeddedComponent'
    | 'AskAgent';

export type TourStepTypeKey = TourStandardStepTypeKey | (string & {});

export type TourStandardCompletionCheckType =
    | 'NextButton'
    | 'AnchorInteraction'
    | 'Navigation'
    | 'Signal'
    | 'EntityEvent'
    | 'FieldState'
    | 'ServerPredicate'
    | 'AgentConfirmed'
    | 'All'
    | 'Any';

export type TourCompletionCheckType = TourStandardCompletionCheckType | (string & {});

// ============================================================================
// Anchoring, Completion, Goal, StartLocation, Prepare, LaunchPolicy
// ============================================================================

/** Semantic, registered, role, or selector anchor descriptor for a step. */
export interface ITourAnchor {
    Strategy: TourAnchorStrategy | (string & {});
    /** Registered anchor key (e.g. `sales.deals.board`, `core.shell.app-switcher`). */
    Key?: string;
    /** Target MJ Entity name (supports `{{Context.Record.EntityName}}`). */
    Entity?: string;
    /** Target form field name. */
    Field?: string;
    /** Target form section key. */
    SectionKey?: string;
    /** Target form rail group key. */
    RailKey?: string;
    /** Target form toolbar action key. */
    ActionKey?: string;
    /** Target navigation item stable key (`NavItem.Key`). */
    NavItemKey?: string;
    /** Target navigation item or resource `DriverClass`. */
    DriverClass?: string;
    /** Target rail page stable ID. */
    PageId?: string;
    /** Target grid column key or field name. */
    ColumnKey?: string;
    /** Target application name/key for `AppSwitcher`. */
    AppName?: string;
    /** Accessible ARIA role (Playwright-style fallback). */
    Role?: string;
    /** Accessible name for `Role` strategy. */
    Name?: string;
    /** CSS selector (last-resort fallback; flagged by CI gate and Tour Studio). */
    Selector?: string;
    /** Optional fallback chain tried in order when the primary strategy does not resolve. */
    Fallbacks?: ITourAnchor[];
    /** Custom timeout waiting for anchor registration (ms). */
    WaitTimeoutMs?: number;
}

/** Single completion check specification. Composable via `All` / `Any`. */
export interface TourCompletionCheckSpec {
    Type: TourCompletionCheckType;
    /** Child checks when `Type` is `'All'` or `'Any'`. */
    Checks?: TourCompletionCheckSpec[];
    /** Signal key when `Type === 'Signal'`. */
    SignalKey?: string;
    /** Optional payload filter for `Signal` checks. */
    SignalPayloadFilter?: CompositeFilterDescriptor | FilterDescriptor;
    /** Interaction event kind when `Type === 'AnchorInteraction'`. */
    Interaction?: 'click' | 'focus' | 'change' | 'input' | 'any';
    /** Target anchor key override for `AnchorInteraction`. */
    AnchorKey?: string;
    /** Navigation matcher fields when `Type === 'Navigation'`. */
    AppName?: string;
    NavItemKey?: string;
    DriverClass?: string;
    EntityName?: string;
    UrlPattern?: string;
    /** Entity event fields when `Type === 'EntityEvent'`. */
    EventType?: 'save' | 'delete' | 'new_record' | 'any';
    SaveSubType?: 'create' | 'update' | 'any';
    Filter?: CompositeFilterDescriptor | FilterDescriptor;
    /** Field state fields when `Type === 'FieldState'`. */
    FieldName?: string;
    Operator?: FilterOperator;
    Value?: string | number | boolean | null | Array<string | number | boolean>;
    /** Server predicate fields when `Type === 'ServerPredicate'`. */
    PredicateKey?: string;
    PredicateParams?: Record<string, unknown>;
    /** Optional prompt/description for `AgentConfirmed`. */
    Prompt?: string;
    /** Arbitrary extension configuration for custom completion check plugins. */
    Config?: Record<string, unknown>;
}

/** Step completion or `SkipWhen` specification. */
export interface ITourCompletion {
    Checks: TourCompletionCheckSpec[];
    /** How multiple top-level checks combine; defaults to `'All'`. */
    Match?: 'All' | 'Any';
    /** Optional timeout in milliseconds. */
    TimeoutMs?: number;
}

/** Outcome-based tour goal specification (data facts, not step completion). */
export interface ITourGoal {
    Type: 'EntityEvent' | 'ServerPredicate' | 'Signal' | 'Navigation' | 'Custom';
    Description?: string;
    EntityName?: string;
    EventType?: 'save' | 'delete' | 'any';
    Filter?: CompositeFilterDescriptor | FilterDescriptor;
    PredicateKey?: string;
    PredicateParams?: Record<string, unknown>;
    SignalKey?: string;
    AppName?: string;
    NavItemKey?: string;
    UrlPattern?: string;
    /** Attribution window in days after starting the tour. */
    WindowDays?: number;
    CustomKey?: string;
    Config?: Record<string, unknown>;
}

/** Where a tour can start and what context it expects. */
export interface ITourStartLocation {
    ApplicationID?: string;
    ApplicationName?: string;
    NavItemKey?: string;
    DriverClass?: string;
    EntityName?: string;
    RequireOpenRecord?: boolean;
    UrlPattern?: string;
    UrlMatchMode?: 'glob' | 'regex' | 'exact';
}

/** Pre-step navigation and make-visible instructions executed before rendering. */
export interface ITourStepPrepare {
    ApplicationID?: string;
    ApplicationName?: string;
    NavItemKey?: string;
    DriverClass?: string;
    EntityName?: string;
    RecordIdTemplate?: string;
    RailKey?: string;
    SectionKey?: string;
    Url?: string;
    WaitForAnchorMs?: number;
    /** Screen-reader live-region announcement spoken/rendered on navigation. */
    Announcement?: string;
}

/** Launch, holdout, and interruption budget policy on a tour or override. */
export interface ITourLaunchPolicy {
    AutoLaunch?: boolean;
    MaxAutoLaunches?: number;
    AllowReplay?: boolean;
    RequireConsentForPrepareNav?: boolean;
    HoldoutPercent?: number;
    CriticalBypass?: boolean;
    SmartDelayMs?: number;
    ShowBeacons?: boolean;
}

// ============================================================================
// Localization & Configuration JSONTypes
// ============================================================================

export interface ITourLocalizationEntry {
    Name?: string;
    Description?: string;
}

export interface ITourConfiguration {
    localizations?: Record<string, ITourLocalizationEntry>;
    /** Open App version tag for "What's new" offers. */
    AppVersionTag?: string;
    /** Additional tour-level settings. */
    Settings?: Record<string, unknown>;
}

export interface ITourStepLocalizationEntry {
    Title?: string;
    Body?: string;
    NextButtonText?: string;
    BackButtonText?: string;
    DismissButtonText?: string;
    ChoiceOptions?: Record<string, { Label?: string; Description?: string; Feedback?: string }>;
    GuideNotes?: string;
    VoiceScript?: string;
}

/** Typed configuration shapes for the 9 standard step types. */
export interface ISpotlightStepConfig {
    Title?: string;
    Body?: string;
    ExtraAnchors?: ITourAnchor[];
    NextButtonText?: string;
    BackButtonText?: string;
    DismissButtonText?: string;
    ShowProgress?: boolean;
    PaddingPx?: number;
    AllowTargetClick?: boolean;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IActionStepConfig {
    Title?: string;
    Body?: string;
    ShowWaitingIndicator?: boolean;
    WaitingMessage?: string;
    AllowManualSkip?: boolean;
    SkipButtonText?: string;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IBeaconStepConfig {
    Title?: string;
    Body?: string;
    PulseDurationMs?: number;
    DismissButtonText?: string;
    OpenOnHover?: boolean;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IModalStepConfig {
    Title?: string;
    Body?: string;
    Variant?: 'welcome' | 'announcement' | 'checkpoint' | 'summary';
    PrimaryButtonText?: string;
    SecondaryButtonText?: string;
    NextTourKey?: string;
    LearningPathKey?: string;
    ShowProgress?: boolean;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IBannerStepConfig {
    Title?: string;
    Body?: string;
    Tone?: 'info' | 'success' | 'warning';
    CtaText?: string;
    CtaUrl?: string;
    CtaSignalKey?: string;
    Dismissible?: boolean;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IChoiceOption {
    Key: string;
    Label: string;
    Description?: string;
    IsCorrect?: boolean;
    Feedback?: string;
}

export interface IChoiceStepConfig {
    Title?: string;
    Body?: string;
    Question?: string;
    Options: IChoiceOption[];
    IsKnowledgeCheck?: boolean;
    ShowFeedbackBeforeAdvance?: boolean;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IMediaStepConfig {
    Title?: string;
    Body?: string;
    MediaType: 'video' | 'image' | 'gif';
    SourceUrl: string;
    CaptionsUrl?: string;
    AltText: string;
    PosterUrl?: string;
    AutoAdvanceOnEnd?: boolean;
    NextButtonText?: string;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IEmbeddedComponentStepConfig {
    Title?: string;
    Body?: string;
    ComponentID?: string;
    ComponentName?: string;
    ComponentSpec?: Record<string, unknown>;
    InputProps?: Record<string, unknown>;
    CompletionEventName?: string;
    AllowNextButtonFallback?: boolean;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface IAskAgentStepConfig {
    Title?: string;
    Body?: string;
    SeedPrompt: string;
    AgentID?: string;
    PreferVoice?: boolean;
    AllowNextButtonFallback?: boolean;
    NextButtonText?: string;
    localizations?: Record<string, ITourStepLocalizationEntry>;
}

export interface ITourStepConfiguration extends Record<string, unknown> {
    localizations?: Record<string, ITourStepLocalizationEntry>;
    RequiresMutationConfirmation?: boolean;
    ConfirmationPrompt?: string;
}

export interface ITourStepPathLocalizationEntry {
    Label?: string;
}

export interface ITourStepPathConfiguration {
    localizations?: Record<string, ITourStepPathLocalizationEntry>;
    Metadata?: Record<string, unknown>;
}

export interface ILearningPathLocalizationEntry {
    Name?: string;
    Description?: string;
}

export interface ILearningPathConfiguration {
    localizations?: Record<string, ILearningPathLocalizationEntry>;
    AllowSkipOptional?: boolean;
    ShowEstimatedTime?: boolean;
}

// ============================================================================
// Core Runtime Definitions (Entity-independent)
// ============================================================================

export interface TourStepDefinition<TConfig extends object = ITourStepConfiguration> {
    ID?: string;
    StepKey: string;
    Sequence: number;
    StepType: TourStepTypeKey;
    /** Optional per-step driver class override key registered with `BaseTourStepType`. */
    DriverClass?: string | null;
    /** Optional renderer class key registered with `BaseTourStepRenderer` (from `TourStepType.RendererClass`). */
    RendererClass?: string | null;
    Title: string;
    Body?: string;
    Configuration?: TConfig;
    Anchor?: ITourAnchor | null;
    Placement?: TourStepPlacement;
    Mode?: TourStepMode;
    Prepare?: ITourStepPrepare | null;
    Completion?: ITourCompletion | null;
    SkipWhen?: ITourCompletion | CompositeFilterDescriptor | null;
    OnMissing?: TourOnMissingPolicy;
    IsOptional?: boolean;
    GuideNotes?: string;
    VoiceScript?: string;
    RequiresMutationConfirmation?: boolean;
    ConfirmationPrompt?: string;
    /** Optional Do-mode action metadata when `Mode === 'Do'`. */
    DoAction?: {
        Category: string;
        ToolName?: string;
        ActionName?: string;
        Params?: Record<string, unknown>;
        Description: string;
    };
}

export interface TourStepPathDefinition {
    ID?: string;
    FromStepKey: string;
    ToStepKey: string;
    /**
     * Condition gating this edge:
     * - `null` / `undefined` / `''`: unconditional
     * - `CompositeFilterDescriptor` or JSON string starting with `{`: evaluated with `CompositeFilter`
     * - Plain choice key string (e.g. `'explore-data'`): matches `context.lastChoiceKey === condition`
     * - JS boolean expression: evaluated with `SafeExpressionEvaluator`
     */
    Condition?: string | CompositeFilterDescriptor | null;
    Label?: string;
    Priority?: number;
    IsDefault?: boolean;
    Configuration?: ITourStepPathConfiguration;
}

export interface TourPrerequisiteDefinition {
    ID?: string;
    PrerequisiteType: TourPrerequisiteType;
    RequiredTourKey?: string;
    RequiredRole?: string;
    RequiredApplicationName?: string;
    RequiredEntityPermission?: {
        EntityName: string;
        Action: 'Read' | 'Create' | 'Update' | 'Delete';
    };
    Condition?: CompositeFilterDescriptor | string | null;
    Strength: TourPrerequisiteStrength;
}

export interface TourTriggerDefinition {
    ID?: string;
    TriggerType: string;
    Configuration?: Record<string, unknown>;
    Delivery: TourTriggerDelivery;
    CooldownDays?: number;
    Priority?: number;
    Status: 'Active' | 'Disabled';
}

export interface TourOverrideDefinition {
    ID?: string;
    TourKey: string;
    Scope: TourOverrideScope;
    RoleName?: string;
    UserId?: string;
    Precedence: number;
    Status: 'Active' | 'Disabled';
    AudienceFilter?: CompositeFilterDescriptor | string | null;
    LaunchPolicy?: ITourLaunchPolicy | null;
    IsDisabled?: boolean;
    Priority?: number;
}

export interface TourDefinition {
    ID?: string;
    TourKey: string;
    Name: string;
    Description?: string;
    ApplicationID?: string | null;
    ApplicationName?: string | null;
    RunInAuthenticatedHosts?: boolean;
    Status: TourStatus;
    CurrentVersionID?: string | null;
    VersionNumber?: number;
    EstimatedMinutes?: number;
    AudienceFilter?: CompositeFilterDescriptor | string | null;
    LaunchPolicy?: ITourLaunchPolicy | null;
    Priority?: number;
    ThrottleTags?: string[];
    DefaultGuideMode?: TourGuideMode;
    AllowAgentActions?: boolean;
    GuideAgentID?: string | null;
    DriverClass?: string | null;
    PresenterClass?: string | null;
    Goal?: ITourGoal | null;
    StartLocation?: ITourStartLocation | null;
    Configuration?: ITourConfiguration | null;
    Steps: TourStepDefinition[];
    Paths?: TourStepPathDefinition[];
    Prerequisites?: TourPrerequisiteDefinition[];
    Triggers?: TourTriggerDefinition[];
}

export interface LearningPathTourDefinition {
    TourKey: string;
    Sequence: number;
    IsRequired: boolean;
}

export interface LearningPathDefinition {
    ID?: string;
    PathKey: string;
    Name: string;
    Description?: string;
    ApplicationName?: string | null;
    AudienceFilter?: CompositeFilterDescriptor | string | null;
    Status: TourStatus;
    Configuration?: ILearningPathConfiguration | null;
    Tours: LearningPathTourDefinition[];
}

// ============================================================================
// Run Progress, Telemetry & Preferences
// ============================================================================

export interface TourRunStepRecord {
    StepKey: string;
    EnteredAt: string;
    ExitedAt?: string;
    Outcome: TourRunStepOutcome;
    AnchorResolution: TourAnchorResolution;
    QuestionCount: number;
}

export interface TourRunRecord {
    RunID: string;
    TourKey: string;
    TourID?: string;
    TourVersionID: string;
    /** Pinned version snapshot so tour edits mid-run never break active sessions. */
    VersionNumber?: number;
    DefinitionSnapshot?: TourDefinition;
    UserID?: string | null;
    VisitorKey?: string | null;
    SurfaceID?: string | null;
    Status: TourRunStatus;
    GuideMode: TourSessionGuideMode;
    DirectorType: string;
    CurrentStepKey: string | null;
    PathTaken: string[];
    LaunchSource: TourLaunchSource;
    LaunchedByAgentRunID?: string | null;
    StartedAt: string;
    CompletedAt?: string | null;
    GoalMetAt?: string | null;
    SnoozedUntil?: string | null;
    IsHoldout?: boolean;
    Steps: TourRunStepRecord[];
}

export type TourRunEventType =
    | 'RunStarted'
    | 'StepEntered'
    | 'StepCompleted'
    | 'StepSkipped'
    | 'AnchorMissing'
    | 'RunPaused'
    | 'RunResumed'
    | 'RunCompleted'
    | 'RunDismissed'
    | 'RunSnoozed'
    | 'GoalMet'
    | 'DirectorChanged'
    | 'QuestionAsked';

export interface TourRunEvent {
    EventID: string;
    RunID: string;
    TourKey: string;
    TourVersionID: string;
    EventType: TourRunEventType;
    Timestamp: string;
    StepKey?: string;
    Outcome?: TourRunStepOutcome;
    AnchorResolution?: TourAnchorResolution;
    DirectorType?: string;
    GuideMode?: TourSessionGuideMode;
    LaunchSource?: TourLaunchSource;
    SnoozedUntil?: string;
    Payload?: Record<string, unknown>;
}

/** Stored under `UserInfoEngine` key `mj.tours.preferences.v1`. */
export interface TourPreferences {
    OffersEnabled: boolean;
    PreferredGuideMode: TourGuideMode;
    PreferredVoice?: string;
    Pace?: 'slow' | 'normal' | 'fast';
    ShowBeacons: boolean;
    Locale?: string;
}

// ============================================================================
// Validation, Health Checks & Session Views
// ============================================================================

export type TourValidationSeverity = 'Error' | 'Warning';

export interface TourValidationIssue {
    Code: string;
    Message: string;
    Field?: string;
    Severity: TourValidationSeverity;
}

export interface TourValidationResult {
    Valid: boolean;
    Errors: TourValidationIssue[];
    Warnings: TourValidationIssue[];
}

export interface TourHealthCheck {
    Kind: 'Anchor' | 'StepType' | 'CompletionCheck' | 'Config';
    Description: string;
    Anchor?: ITourAnchor;
    StepType?: string;
    CheckType?: string;
}

export interface TourStepRef {
    StepKey: string;
    Sequence: number;
    Title: string;
    StepType: TourStepTypeKey;
    Mode: TourStepMode;
    IsOptional: boolean;
}

export interface TourStepOutcome {
    Outcome: TourRunStepOutcome;
    AnchorResolution: TourAnchorResolution;
    ChoiceKey?: string;
    Data?: Record<string, unknown>;
}

export interface TourRunOutcome {
    Status: TourRunStatus;
    GoalMet: boolean;
    CompletedStepKeys: string[];
    Reason?: string;
}

export interface TourStepView<TConfig extends object = ITourStepConfiguration> {
    StepKey: string;
    Sequence: number;
    StepIndex: number;
    TotalSteps: number;
    StepType: TourStepTypeKey;
    DriverClass?: string | null;
    RendererClass?: string | null;
    Title: string;
    Body: string;
    Placement: TourStepPlacement;
    Mode: TourStepMode;
    IsOptional: boolean;
    Anchor: ITourAnchor | null;
    AnchorResolved: boolean;
    AnchorResolution: TourAnchorResolution;
    ResolvedAnchorSelector?: string;
    Configuration: TConfig;
    GuideNotes?: string;
    VoiceScript?: string;
    WaitingForCompletion: boolean;
    StatusMessage?: string;
}

export interface TourPointerHighlight {
    AnchorKey: string;
    Caption?: string;
    ExpiresAt?: number;
}

export interface TourPendingDemonstrationConfirmation {
    StepKey: string;
    Prompt: string;
}

export interface TourSessionView {
    RunID: string;
    TourKey: string;
    TourName: string;
    TourVersionID: string;
    Status: TourRunStatus;
    GuideMode: TourSessionGuideMode;
    DirectorType: string;
    PresenterClass: string;
    CurrentStep: TourStepView | null;
    CompletedStepKeys: string[];
    PathTaken: string[];
    CanGoBack: boolean;
    CanAdvance: boolean;
    StepIndex: number;
    StepCount: number;
    IsPaused: boolean;
    GoalMet: boolean;
    LastError?: string;
    PointerHighlight?: TourPointerHighlight | null;
    PendingDemonstrationConfirmation?: TourPendingDemonstrationConfirmation | null;
}
