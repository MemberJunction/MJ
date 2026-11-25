/**
 * Completion specification stored on `MJ: Tour Steps.Completion`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Standard completion check keys registered with `BaseTourCompletionCheck`. */
export type StandardTourCompletionCheckType =
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

/** Completion check key, including custom ClassFactory-registered app checks. */
export type TourCompletionCheckType = StandardTourCompletionCheckType | (string & {});

/** Leaf predicate within a portable MJ filter expression. */
export interface ITourCompletionSimpleFilter {
    field: string;
    operator: string;
    value?: string | number | boolean | string[] | number[] | null;
}

/** Portable MJ CompositeFilter tree for `EntityEvent`, `FieldState`, and `Signal` checks. */
export interface ITourCompletionFilter {
    logic: 'and' | 'or';
    filters: Array<ITourCompletionSimpleFilter | ITourCompletionFilter>;
}

/** Single completion check evaluated by `TourSession`. */
export interface ITourCompletionCheck {
    /** Check plugin key registered with `BaseTourCompletionCheck`. */
    Type: TourCompletionCheckType;
    /** DOM event for `AnchorInteraction` checks. */
    Event?: 'click' | 'focus' | 'change' | 'input' | 'submit';
    /** Signal name for `Signal` checks (emitted via `TourSignals.Emit`). */
    Signal?: string;
    /** Optional filter over signal payload properties. */
    SignalFilter?: ITourCompletionFilter;
    /** Entity name for `EntityEvent`, `FieldState`, or `HasRecords` checks. */
    Entity?: string;
    /** Entity write action for `EntityEvent` checks. */
    Action?: 'Save' | 'Delete' | 'Create' | 'Update';
    /** Field name for `FieldState` checks. */
    Field?: string;
    /** CompositeFilter evaluated against entity record, form field, or signal payload. */
    Filter?: ITourCompletionFilter;
    /** Route or URL pattern for `Navigation` checks. */
    RoutePattern?: string;
    /** Target application name or ID for `Navigation` checks. */
    Application?: string;
    /** Target nav item key or DriverClass for `Navigation` checks. */
    NavItem?: string;
    /** Server predicate ClassFactory key for `ServerPredicate` checks (`HasRecords`, `QueryReturnsRows`, `AuthorizationHeld`, etc.). */
    Predicate?: string;
    /** Parameters passed to `ServerPredicate` or custom completion check plugins. */
    Params?: Record<string, unknown>;
    /** Nested checks for `All` and `Any` combinators. */
    Checks?: ITourCompletionCheck[];
}

/** TourStep.Completion — declares what satisfies and advances a step. */
export interface ITourCompletion {
    /** Checks evaluated to mark the step complete. */
    Checks: ITourCompletionCheck[];
    /** Combinator across top-level `Checks` (default `'All'`). */
    Mode?: 'All' | 'Any';
    /** Optional custom label for the `NextButton` control. */
    NextLabel?: string;
    /** Whether the user may manually click Next even when another check is pending. */
    AllowManualAdvance?: boolean;
}
