/**
 * Trigger configuration stored on `MJ: Tour Triggers.Configuration`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** TourTrigger.Configuration — matching criteria for standard and custom `BaseTourTrigger` plugins. */
export interface ITourTriggerConfiguration {
    /** URL pattern matched by `FirstVisit` or route-scoped triggers on web hosts. */
    UrlPattern?: string;
    /** MJ Application name or ID matched by `FirstVisit` or `AppUpgraded`. */
    Application?: string;
    /** Nav item `Key` or `DriverClass` matched on first visit. */
    NavItem?: string;
    /** Entity name matched by `EntityFormOpened`. */
    Entity?: string;
    /** Form mode matched by `EntityFormOpened`. */
    Mode?: 'Create' | 'Edit' | 'View' | 'Any';
    /** Signal name matched by `Signal` triggers. */
    Signal?: string;
    /** Optional filter over signal payload properties. */
    SignalFilter?: Record<string, unknown>;
    /** Minimum Open App / release version matched by `AppUpgraded`. */
    MinVersion?: string;
    /** Explicit `VersionTag` matched by `AppUpgraded`. */
    VersionTag?: string;
    /** High-signal struggle indicators monitored by `Struggle` triggers. */
    StruggleSignals?: Array<'RepeatedValidationFailure' | 'HowDoISearch'>;
    /** Consecutive failure count threshold for `Struggle` triggers. */
    FailureThreshold?: number;
    /** Delay in milliseconds before surfacing the trigger offer. */
    DelayMs?: number;
    /** Cron schedule expression for `Schedule` triggers. */
    CronExpression?: string;
    /** Contextual hint for `AgentSuggested` triggers. */
    PromptHint?: string;
    /** Extensible properties for custom `BaseTourTrigger` plugins. */
    [key: string]: unknown;
}
