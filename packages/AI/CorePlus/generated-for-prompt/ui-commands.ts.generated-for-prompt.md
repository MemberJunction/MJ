```ts
type ActionableCommand = OpenResourceCommand | OpenURLCommand;

interface OpenResourceCommand {
    type: 'open:resource';  // Command type identifier
    label: string;  // Button label shown to the user.
    icon?: string;  // Optional Font Awesome icon class to display on the button.
    resourceType: ResourceType;  // Type of resource to open.
    entityName?: string;  // Entity name (required for Record type).
    resourceId: string;  // ID of the resource to open.
    mode?: 'view' | 'edit';  // Mode for opening the resource.
    parameters?: Record<string, any>;  // Optional parameters to pass to the resource.
}

type ResourceType =
    | 'Record'  // Entity record (e.g., Customer, Order)
    | 'Dashboard'  // Dashboard view
    | 'Report'  // Report view
    | 'Form'  // Form view
    | 'View';  // Saved view

interface OpenURLCommand {
    type: 'open:url';  // Command type identifier
    label: string;  // Button label shown to the user.
    icon?: string;  // Optional Font Awesome icon class to display on the button.
    url: string;  // URL to open.
    newTab?: boolean;  // Whether to open in a new tab.
}

type AutomaticCommand = RefreshDataCommand | ShowNotificationCommand;

interface RefreshDataCommand {
    type: 'refresh:data';  // Command type identifier
    scope: 'entity' | 'cache';  // Scope of data to refresh:
    entityNames?: string[];  // Array of entity names to refresh.
    cacheName?: CacheName;  // Name of cache to refresh.
}

type CacheName =
    | 'Core'  // Core metadata (entities, fields, etc.)
    | 'AI'  // AI metadata (agents, prompts, models, etc.)
    | 'Actions';  // Action metadata (actions, params, etc.)

interface ShowNotificationCommand {
    type: 'notification';  // Command type identifier
    message: string;  // Message text to display.
    severity?: 'success' | 'info' | 'warning' | 'error';  // Severity level affecting icon and color:
    duration?: number;  // Duration in milliseconds before auto-dismissing.
}
```
