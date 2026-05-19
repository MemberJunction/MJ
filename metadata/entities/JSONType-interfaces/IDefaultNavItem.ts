/**
 * Describes a single navigation item in an Application's default tab bar.
 *
 * Stored as a JSON array in the `DefaultNavItems` column of the `Applications` entity.
 * CodeGen emits a strongly-typed `DefaultNavItemsObject` accessor on `ApplicationEntity`
 * that returns `IDefaultNavItem[]`.
 *
 * When a user opens an application for the first time (or has no saved state),
 * `BaseApplication.GetNavItems()` parses this array to create the initial set of tabs.
 * Each item maps to either a persisted Dashboard (via `RecordID`) or a custom component
 * registered with `@RegisterClass(BaseResourceComponent, DriverClass)`.
 *
 * Exactly one item should have `isDefault: true` to indicate which tab is focused on load.
 */
export interface IDefaultNavItem {
    /** Display label for the navigation item */
    Label: string;
    /** Font Awesome icon class (e.g., "fa-solid fa-database") */
    Icon: string;
    /** Type of resource: "Dashboards", "Custom", etc. */
    ResourceType: string;
    /** For Dashboard resources, the ID of the dashboard record */
    RecordID?: string | null;
    /** For Custom resources, the registered driver class name */
    DriverClass?: string | null;
    /** Whether this is the default tab when the app opens */
    isDefault?: boolean;
}