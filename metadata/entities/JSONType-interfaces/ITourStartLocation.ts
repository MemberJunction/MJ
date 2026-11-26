/**
 * Start location and context requirements stored on `MJ: Tours.StartLocation`
 * and `MJ: Tour Surface Tours.StartLocationOverride`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Tour.StartLocation / TourSurfaceTour.StartLocationOverride — navigation target and context preconditions. */
export interface ITourStartLocation {
    /** Target MJ Application name or ID. */
    Application?: string;
    /** Target nav item `Key` or `DriverClass`. */
    NavItem?: string;
    /** Target Explorer resource type (for example `'Records'`, `'Dashboards'`, `'Custom'`). */
    ResourceType?: string;
    /** Target entity name when opening a record or entity view. */
    Entity?: string;
    /** Optional specific record ID to open. */
    RecordID?: string;
    /** Destination URL for web or external-surface hosts. */
    Url?: string;
    /** URL pattern restricting where the tour starts on web hosts. */
    UrlPattern?: string;
    /** When true, the tour requires an already-open record in the active host context. */
    RequiresOpenRecord?: boolean;
    /** Restricts contextual tours to an open record of the specified entity name. */
    RequiresEntity?: string;
    /** Query parameters applied when navigating to the start location. */
    QueryParams?: Record<string, string>;
}
