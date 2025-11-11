/**
 * @fileoverview Type definitions for agent UI commands.
 *
 * This module contains type definitions for UI commands that agents can issue
 * to control the user interface. Commands are divided into two categories:
 * - Actionable Commands: Shown as buttons/links for user to click
 * - Automatic Commands: Execute immediately when received
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.116.0
 */

/**
 * Union type of all actionable commands.
 *
 * Actionable commands are shown to the user as clickable buttons or links,
 * typically after an agent completes work. They provide easy navigation to
 * created/modified resources or external links.
 *
 * @example
 * ```json
 * {
 *   "actionableCommands": [
 *     {
 *       "type": "open:resource",
 *       "label": "Open Customer Record",
 *       "icon": "fa-user",
 *       "resourceType": "Record",
 *       "resourceId": "abc-123",
 *       "mode": "view"
 *     }
 *   ]
 * }
 * ```
 */
export type ActionableCommand =
    | OpenResourceCommand
    | OpenURLCommand;

/**
 * Command to open a resource in the MemberJunction UI.
 *
 * This command navigates the user to a specific resource (record, dashboard,
 * report, form, etc.) within the application.
 *
 * @example Opening a record
 * ```json
 * {
 *   "type": "open:resource",
 *   "label": "Open Customer Record",
 *   "icon": "fa-user",
 *   "resourceType": "Record",
 *   "resourceId": "customer-123",
 *   "mode": "view"
 * }
 * ```
 *
 * @example Opening a dashboard
 * ```json
 * {
 *   "type": "open:resource",
 *   "label": "View Sales Dashboard",
 *   "icon": "fa-chart-line",
 *   "resourceType": "Dashboard",
 *   "resourceId": "sales-dashboard-456"
 * }
 * ```
 */
export interface OpenResourceCommand {
    /** Command type identifier */
    type: 'open:resource';

    /**
     * Button label shown to the user.
     * Should be clear and action-oriented (e.g., "Open Customer Record", "View Dashboard").
     */
    label: string;

    /**
     * Optional Font Awesome icon class to display on the button.
     * Examples: "fa-user", "fa-chart-line", "fa-file-alt"
     */
    icon?: string;

    /**
     * Type of resource to open.
     */
    resourceType: ResourceType;

    /**
     * ID of the resource to open.
     * This should be the actual ID value, not a template.
     */
    resourceId: string;

    /**
     * Mode for opening the resource.
     * Only applies to Record type.
     * - 'view': Open in view/read-only mode
     * - 'edit': Open in edit mode
     */
    mode?: 'view' | 'edit';

    /**
     * Optional parameters to pass to the resource.
     * Used for reports (report parameters) and dashboards (filters).
     */
    parameters?: Record<string, any>;
}

/**
 * Types of resources that can be opened in the UI.
 */
export type ResourceType =
    | 'Record'      // Entity record (e.g., Customer, Order)
    | 'Dashboard'   // Dashboard view
    | 'Report'      // Report view
    | 'Form'        // Form view
    | 'View';       // Saved view

/**
 * Command to open an external URL.
 *
 * This command opens a URL in a new browser tab, useful for linking to
 * external resources like company websites, documentation, or third-party tools.
 *
 * @example
 * ```json
 * {
 *   "type": "open:url",
 *   "label": "Visit Company Website",
 *   "icon": "fa-external-link",
 *   "url": "https://example.com",
 *   "newTab": true
 * }
 * ```
 */
export interface OpenURLCommand {
    /** Command type identifier */
    type: 'open:url';

    /**
     * Button label shown to the user.
     * Should indicate the destination (e.g., "Visit Website", "View Documentation").
     */
    label: string;

    /**
     * Optional Font Awesome icon class to display on the button.
     * Commonly: "fa-external-link" for external links.
     */
    icon?: string;

    /**
     * URL to open.
     * Should be a complete URL including protocol (https://).
     */
    url: string;

    /**
     * Whether to open in a new tab.
     * Default: true
     */
    newTab?: boolean;
}

/**
 * Union type of all automatic commands.
 *
 * Automatic commands execute immediately when received, without user interaction.
 * Used for updating UI state, refreshing data, and showing notifications.
 *
 * @example
 * ```json
 * {
 *   "automaticCommands": [
 *     {
 *       "type": "refresh:data",
 *       "scope": "cache",
 *       "cacheName": "AI"
 *     },
 *     {
 *       "type": "notification",
 *       "message": "Customer created successfully",
 *       "severity": "success"
 *     }
 *   ]
 * }
 * ```
 */
export type AutomaticCommand =
    | RefreshDataCommand
    | ShowNotificationCommand;

/**
 * Command to refresh data in the UI.
 *
 * This command tells the UI to refresh cached data or reload specific entities.
 * Use after modifying system configuration or entity data.
 *
 * @example Refresh specific entities
 * ```json
 * {
 *   "type": "refresh:data",
 *   "scope": "entity",
 *   "entityNames": ["Customers", "Contacts"]
 * }
 * ```
 *
 * @example Refresh AI cache
 * ```json
 * {
 *   "type": "refresh:data",
 *   "scope": "cache",
 *   "cacheName": "AI"
 * }
 * ```
 */
export interface RefreshDataCommand {
    /** Command type identifier */
    type: 'refresh:data';

    /**
     * Scope of data to refresh:
     * - 'entity': Refresh specific entity data
     * - 'cache': Refresh a named cache
     */
    scope: 'entity' | 'cache';

    /**
     * Array of entity names to refresh.
     * Only used when scope is 'entity'.
     * Example: ["Customers", "Contacts", "Orders"]
     */
    entityNames?: string[];

    /**
     * Name of cache to refresh.
     * Only used when scope is 'cache'.
     */
    cacheName?: CacheName;
}

/**
 * Names of caches that can be refreshed.
 * This list will grow as new caches are added to the system.
 */
export type CacheName =
    | 'Core'     // Core metadata (entities, fields, etc.)
    | 'AI'       // AI metadata (agents, prompts, models, etc.)
    | 'Actions'; // Action metadata (actions, params, etc.)

/**
 * Command to show a notification message to the user.
 *
 * This command displays a toast/notification with a message, typically used
 * to confirm successful operations or alert about errors.
 *
 * @example Success notification
 * ```json
 * {
 *   "type": "notification",
 *   "message": "Customer 'Acme Corp' created successfully",
 *   "severity": "success",
 *   "duration": 3000
 * }
 * ```
 *
 * @example Error notification
 * ```json
 * {
 *   "type": "notification",
 *   "message": "Failed to save changes: Invalid email format",
 *   "severity": "error",
 *   "duration": 5000
 * }
 * ```
 */
export interface ShowNotificationCommand {
    /** Command type identifier */
    type: 'notification';

    /**
     * Message text to display.
     * Keep concise but informative (1-2 sentences).
     */
    message: string;

    /**
     * Severity level affecting icon and color:
     * - 'success': Green with checkmark icon
     * - 'info': Blue with info icon
     * - 'warning': Yellow with warning icon
     * - 'error': Red with error icon
     *
     * Default: 'info'
     */
    severity?: 'success' | 'info' | 'warning' | 'error';

    /**
     * Duration in milliseconds before auto-dismissing.
     * Set to 0 for manual dismiss only.
     * Default: 3000 (3 seconds)
     */
    duration?: number;
}
