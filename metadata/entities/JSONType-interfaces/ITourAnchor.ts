/**
 * Anchor descriptor stored on `MJ: Tour Steps.Anchor`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Standard anchor resolution strategies shipped in `@memberjunction/tours-runtime` and `@memberjunction/ng-tours`. */
export type StandardTourAnchorStrategy =
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

/** Anchor resolution strategy key, including custom ClassFactory-registered app resolvers. */
export type TourAnchorStrategy = StandardTourAnchorStrategy | (string & {});

/** TourStep.Anchor — describes how to locate a UI target element and optional fallback anchors. */
export interface ITourAnchor {
    /** Resolution strategy key registered with `BaseTourAnchorResolver`. */
    Strategy: TourAnchorStrategy;
    /** Registered anchor key (`data-mj-tour-anchor`) or nav/rail/toolbar action key. */
    Key?: string;
    /** Entity name for semantic form/grid resolvers; supports `{{Context.Record.EntityName}}`. */
    Entity?: string;
    /** Field name for `FormField` or `GridColumn` resolvers. */
    Field?: string;
    /** Section key for `FormSection` resolvers. */
    Section?: string;
    /** Rail group key for `FormRailGroup` resolvers. */
    RailGroup?: string;
    /** Toolbar action key for `FormToolbarAction` resolvers. */
    Action?: string;
    /** Application name or ID for `NavItem` or `RailPage` resolvers. */
    Application?: string;
    /** Nav item `DriverClass` for stable `NavItem` resolution. */
    DriverClass?: string;
    /** Accessible ARIA role for `Role` resolvers. */
    Role?: string;
    /** Accessible name for `Role` resolvers. */
    Name?: string;
    /** CSS selector fallback for `Selector` resolvers (last resort; flagged by `tour-anchors` unless opted in). */
    Selector?: string;
    /** Optional ancestor region or CSS scope disambiguating matching elements. */
    Scope?: string;
    /** Maximum milliseconds to wait for the anchor to appear in the DOM (default 5000). */
    TimeoutMs?: number;
    /** Additional registered anchor keys to spotlight simultaneously with the primary target. */
    AdditionalKeys?: string[];
    /** Additional full anchor descriptors to spotlight simultaneously with the primary target. */
    AdditionalAnchors?: ITourAnchor[];
    /** Ordered fallback descriptors tried when the primary strategy does not resolve. */
    Fallbacks?: ITourAnchor[];
    /** Custom resolver options for app-specific `BaseTourAnchorResolver` plugins. */
    Options?: Record<string, unknown>;
}
