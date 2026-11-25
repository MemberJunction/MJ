/**
 * Pre-render navigation and make-visible actions stored on `MJ: Tour Steps.Prepare`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Single ordered action inside a step's `Prepare` phase. */
export interface ITourPrepareAction {
    /** Prepare action kind executed before the step resolves its anchor and renders. */
    Type:
        | 'SwitchApp'
        | 'OpenNavItem'
        | 'OpenRailPage'
        | 'OpenRecord'
        | 'NavigateUrl'
        | 'SwitchRailGroup'
        | 'ExpandSection'
        | 'EmitSignal'
        | 'Wait';
    /** Application name or ID. */
    Application?: string;
    /** Nav item `Key` or `DriverClass`. */
    NavItem?: string;
    /** Rail page `Id`. */
    RailPage?: string;
    /** Form rail group key. */
    RailGroup?: string;
    /** Form section key. */
    Section?: string;
    /** Entity name for `OpenRecord`. */
    Entity?: string;
    /** Record ID for `OpenRecord` (supports template expressions). */
    RecordID?: string;
    /** Destination URL for `NavigateUrl`. */
    Url?: string;
    /** Signal name for `EmitSignal`. */
    Signal?: string;
    /** Delay in milliseconds for `Wait`. */
    DurationMs?: number;
    /** Query parameters applied during navigation. */
    QueryParams?: Record<string, string>;
}

/** TourStep.Prepare — cross-screen movement and UI reveal executed before step rendering. */
export interface ITourStepPrepare {
    /** Shorthand: target MJ Application to switch to. */
    Application?: string;
    /** Shorthand: target nav item `Key` or `DriverClass`. */
    NavItem?: string;
    /** Shorthand: target rail page `Id`. */
    RailPage?: string;
    /** Shorthand: form rail group key to activate. */
    RailGroup?: string;
    /** Shorthand: form section key to expand. */
    Section?: string;
    /** Shorthand: entity name to open. */
    Entity?: string;
    /** Shorthand: record ID to open. */
    RecordID?: string;
    /** Shorthand: URL to navigate to on web hosts. */
    Url?: string;
    /** Query parameters applied during navigation. */
    QueryParams?: Record<string, string>;
    /** Whether to wait for the step anchor to register after prepare completes. */
    WaitForAnchor?: boolean;
    /** Maximum milliseconds to wait for anchor registration after prepare. */
    WaitTimeoutMs?: number;
    /** Custom polite live-region announcement (WCAG 4.1.3) spoken before the step renders. */
    Announcement?: string;
    /** Explicit ordered list of prepare actions when a step needs multiple setup moves. */
    Actions?: ITourPrepareAction[];
}
