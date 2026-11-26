/**
 * Goal definition stored on `MJ: Tours.Goal`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Leaf predicate within a portable MJ filter expression. */
export interface ITourGoalSimpleFilter {
    field: string;
    operator: string;
    value?: string | number | boolean | string[] | number[] | null;
}

/** Portable MJ CompositeFilter tree for goal outcome verification. */
export interface ITourGoalFilter {
    logic: 'and' | 'or';
    filters: Array<ITourGoalSimpleFilter | ITourGoalFilter>;
}

/** Tour.Goal — real-world outcome measured to evaluate goal conversion rather than step completion alone. */
export interface ITourGoal {
    /** Outcome mechanism evaluated to credit the tour's goal. */
    Type: 'EntityEvent' | 'ServerPredicate' | 'Signal' | 'Navigation' | 'TourCompleted' | 'None' | (string & {});
    /** Human-readable description of the target outcome shown in Tour Studio analytics. */
    Description?: string;
    /** Entity name observed for `EntityEvent` goals. */
    Entity?: string;
    /** Entity action observed for `EntityEvent` goals. */
    Action?: 'Save' | 'Delete' | 'Create' | 'Update';
    /** CompositeFilter matching the target record or payload. */
    Filter?: ITourGoalFilter;
    /** Server predicate key evaluated for `ServerPredicate` goals. */
    Predicate?: string;
    /** Parameters passed to the server predicate. */
    PredicateParams?: Record<string, unknown>;
    /** Signal name observed for `Signal` goals. */
    Signal?: string;
    /** Route or URL pattern observed for `Navigation` goals. */
    RoutePattern?: string;
    /** Attribution window in days after tour start for goal-conversion reporting. */
    WindowDays?: number;
}
