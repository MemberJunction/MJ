# User Menu Plugin Architecture Proposal (Revised)

## Executive Summary

Transform the hardcoded user menu in the Explorer shell into a flexible, plugin-based system using MemberJunction's established `@RegisterClass` and `ClassFactory` patterns. This enables applications to fully customize the user menu without modifying explorer-core.

---

## Key Design Decisions

1. **Default implementation lives in `BaseUserMenu`** - No separate `DefaultUserMenu` class. Subclasses automatically get higher priority via compiler order.

2. **`DeveloperModeService` in `@memberjunction/ng-explorer-shared`** - Available to all Explorer Angular apps.

3. **Simplified Settings** - User-centric profile editing only. Admin features (Users, Roles, etc.) stay in Admin Dashboard.

---

## Architecture

### 1. Core Types

```typescript
// File: packages/Angular/Explorer/explorer-core/src/lib/user-menu/user-menu.types.ts

import { ViewContainerRef } from '@angular/core';
import { UserInfo, Metadata } from '@memberjunction/core';
import { UserEntity, ApplicationInfo } from '@memberjunction/core-entities';

/**
 * Defines a single menu item in the user context menu
 */
export interface UserMenuItem {
    /** Unique identifier for the menu item */
    id: string;

    /** Display text for the menu item */
    label: string;

    /** Font Awesome icon class (e.g., 'fa-solid fa-gear') */
    icon: string;

    /** Optional icon/text color (CSS color value) */
    color?: string;

    /** Optional CSS class for custom styling */
    cssClass?: string;

    /** Group ID for organizing items (items with same group have dividers between groups) */
    group: 'primary' | 'developer' | 'system' | 'danger' | string;

    /** Sort order within group (lower = higher in menu) */
    order: number;

    /** Whether item requires Developer role to be visible */
    developerOnly: boolean;

    /** Whether the item is currently visible (dynamic control) */
    visible: boolean;

    /** Whether the item is currently enabled/clickable */
    enabled: boolean;

    /** Optional tooltip text */
    tooltip?: string;

    /** Optional keyboard shortcut hint */
    shortcut?: string;
}

/**
 * Defines a separator/divider in the menu
 */
export interface UserMenuDivider {
    type: 'divider';
    group: string;
}

/**
 * Union type for all menu element types
 */
export type UserMenuElement = UserMenuItem | UserMenuDivider;

/**
 * Context passed to menu handlers
 */
export interface UserMenuContext {
    /** Current authenticated user */
    user: UserInfo;

    /** Full user entity with all fields */
    userEntity: UserEntity;

    /** Reference to shell component for advanced operations */
    shell: ShellComponentRef;

    /** View container for opening dialogs/modals */
    viewContainerRef: ViewContainerRef;

    /** Whether user has Developer role */
    isDeveloper: boolean;

    /** Whether developer mode is currently enabled (can be toggled) */
    developerModeEnabled: boolean;

    /** Current application context */
    currentApplication: ApplicationInfo | null;

    /** Workspace manager for layout operations */
    workspaceManager: WorkspaceManagerRef;

    /** Auth service for logout operations */
    authService: AuthServiceRef;
}

/**
 * Result of a menu item click handler
 */
export interface UserMenuActionResult {
    /** Whether the action succeeded */
    success: boolean;

    /** Whether to close the menu after action */
    closeMenu: boolean;

    /** Optional message to display (toast notification) */
    message?: string;
}

/**
 * Options for menu configuration
 */
export interface UserMenuOptions {
    /** Whether to show the user name in menu header */
    showUserName: boolean;

    /** Whether to show the user email in menu header */
    showUserEmail: boolean;

    /** Menu position relative to avatar */
    menuPosition: 'below-left' | 'below-right';

    /** Animation style for menu opening */
    animationStyle: 'fade' | 'slide' | 'none';
}

// Type aliases to avoid circular dependencies
export type ShellComponentRef = { [key: string]: unknown };
export type WorkspaceManagerRef = {
    GetConfiguration: () => unknown;
    SetConfiguration: (config: unknown) => Promise<void>;
};
export type AuthServiceRef = {
    logout: () => Promise<void>;
};
```

### 2. Base Class with Default Implementation

```typescript
// File: packages/Angular/Explorer/explorer-core/src/lib/user-menu/base-user-menu.ts

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    UserMenuItem,
    UserMenuElement,
    UserMenuContext,
    UserMenuActionResult,
    UserMenuOptions,
    UserMenuDivider
} from './user-menu.types';

/**
 * Base class for user menu implementations with built-in default behavior.
 *
 * This class provides the standard MemberJunction user menu. To customize:
 * 1. Create a subclass
 * 2. Register with @RegisterClass(BaseUserMenu)
 * 3. Override methods as needed
 *
 * Subclasses automatically get higher priority via compiler order since they
 * import this class, causing their @RegisterClass to execute after this one.
 *
 * @example
 * ```typescript
 * // In your custom app
 * import { BaseUserMenu } from '@memberjunction/ng-explorer-core';
 *
 * @RegisterClass(BaseUserMenu)
 * export class MyAppUserMenu extends BaseUserMenu {
 *     public override GetMenuItems(): UserMenuItem[] {
 *         const items = super.GetMenuItems();
 *         // Add, remove, or modify items
 *         items.push({ id: 'custom', label: 'My Custom Action', ... });
 *         return items;
 *     }
 *
 *     protected override async Handle_custom(): Promise<UserMenuActionResult> {
 *         // Handle the custom action
 *         return { success: true, closeMenu: true };
 *     }
 * }
 * ```
 */
@RegisterClass(BaseUserMenu)
export class BaseUserMenu {
    protected _context: UserMenuContext | null = null;
    protected _options: UserMenuOptions;

    constructor() {
        this._options = this.GetDefaultOptions();
    }

    // ========================================
    // INITIALIZATION
    // ========================================

    /**
     * Initialize the menu with context. Called by shell component.
     */
    public async Initialize(context: UserMenuContext): Promise<void> {
        this._context = context;
        await this.OnInitialize(context);
    }

    /**
     * Override to perform custom initialization
     */
    protected async OnInitialize(context: UserMenuContext): Promise<void> {
        // Override in subclass for custom initialization
    }

    /**
     * Cleanup when menu is destroyed
     */
    public Destroy(): void {
        this._context = null;
    }

    // ========================================
    // OPTIONS
    // ========================================

    /**
     * Get default menu configuration options
     */
    protected GetDefaultOptions(): UserMenuOptions {
        return {
            showUserName: true,
            showUserEmail: true,
            menuPosition: 'below-left',
            animationStyle: 'fade'
        };
    }

    /**
     * Get current menu options
     */
    public GetOptions(): UserMenuOptions {
        return { ...this._options };
    }

    /**
     * Update menu options
     */
    public SetOptions(options: Partial<UserMenuOptions>): void {
        this._options = { ...this._options, ...options };
    }

    // ========================================
    // MENU ITEMS - Override to customize
    // ========================================

    /**
     * Get all menu items. Override to customize the menu structure.
     *
     * Items are grouped by the `group` property with dividers between groups.
     * Groups are rendered in this order: primary, developer, system, danger.
     *
     * Developer-only items are automatically hidden unless the user has
     * Developer role AND developer mode is enabled.
     */
    public GetMenuItems(): UserMenuItem[] {
        const devModeEnabled = this._context?.developerModeEnabled ?? false;

        return [
            // === PRIMARY GROUP ===
            {
                id: 'profile',
                label: 'My Profile',
                icon: 'fa-solid fa-user-circle',
                group: 'primary',
                order: 10,
                developerOnly: false,
                visible: true,
                enabled: true,
                tooltip: 'View and edit your profile'
            },

            // === DEVELOPER GROUP (Only visible to developers with dev mode on) ===
            {
                id: 'toggle-dev-mode',
                label: devModeEnabled ? 'Developer Mode (On)' : 'Developer Mode (Off)',
                icon: devModeEnabled ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off',
                color: devModeEnabled ? '#4CAF50' : undefined,
                group: 'developer',
                order: 10,
                developerOnly: true,
                visible: true,
                enabled: true,
                tooltip: 'Toggle developer tools visibility'
            },
            {
                id: 'log-layout',
                label: 'Log Layout (Debug)',
                icon: 'fa-solid fa-terminal',
                group: 'developer',
                order: 20,
                developerOnly: true,
                visible: devModeEnabled,
                enabled: true,
                tooltip: 'Output current layout configuration to console'
            },
            {
                id: 'inspect-state',
                label: 'Inspect App State',
                icon: 'fa-solid fa-magnifying-glass-chart',
                group: 'developer',
                order: 30,
                developerOnly: true,
                visible: devModeEnabled,
                enabled: true,
                tooltip: 'View current application state in console'
            },

            // === SYSTEM GROUP ===
            {
                id: 'reset-layout',
                label: 'Reset Layout',
                icon: 'fa-solid fa-rotate-left',
                group: 'system',
                order: 10,
                developerOnly: false,
                visible: true,
                enabled: true,
                tooltip: 'Reset workspace to default layout'
            },

            // === DANGER GROUP ===
            {
                id: 'logout',
                label: 'Sign Out',
                icon: 'fa-solid fa-sign-out-alt',
                color: '#c62828',
                cssClass: 'danger',
                group: 'danger',
                order: 100,
                developerOnly: false,
                visible: true,
                enabled: true
            }
        ];
    }

    /**
     * Get the complete menu element list including dividers between groups.
     * This is called by the template to render the menu.
     */
    public GetMenuElements(): UserMenuElement[] {
        const items = this.GetMenuItems();
        const visibleItems = items.filter(item => this.IsItemVisible(item));

        // Group items
        const groups = this.GroupItems(visibleItems);
        const elements: UserMenuElement[] = [];

        // Define group order
        const groupOrder = ['primary', 'developer', 'system', 'danger'];
        const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
            const aIndex = groupOrder.indexOf(a);
            const bIndex = groupOrder.indexOf(b);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        });

        // Build element list with dividers
        sortedGroupKeys.forEach((group, index) => {
            if (index > 0) {
                elements.push({ type: 'divider', group } as UserMenuDivider);
            }

            // Sort items within group by order
            const groupItems = groups[group].sort((a, b) => a.order - b.order);
            elements.push(...groupItems);
        });

        return elements;
    }

    /**
     * Check if a menu item should be visible based on current context
     */
    protected IsItemVisible(item: UserMenuItem): boolean {
        // Check developer-only visibility
        if (item.developerOnly && !this._context?.isDeveloper) {
            return false;
        }

        // Check item's own visible flag
        return item.visible;
    }

    /**
     * Group items by their group property
     */
    protected GroupItems(items: UserMenuItem[]): Record<string, UserMenuItem[]> {
        return items.reduce((groups, item) => {
            const group = item.group || 'primary';
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(item);
            return groups;
        }, {} as Record<string, UserMenuItem[]>);
    }

    // ========================================
    // CLICK HANDLING
    // ========================================

    /**
     * Handle menu item click. Dispatches to specific Handle_<id> methods.
     */
    public async HandleItemClick(itemId: string): Promise<UserMenuActionResult> {
        const items = this.GetMenuItems();
        const item = items.find(i => i.id === itemId);

        if (!item || !item.enabled) {
            return { success: false, closeMenu: false, message: 'Item not found or disabled' };
        }

        // Convert item id to handler method name (e.g., 'toggle-dev-mode' -> 'Handle_toggle_dev_mode')
        const handlerName = `Handle_${itemId.replace(/-/g, '_')}` as keyof this;

        if (typeof this[handlerName] === 'function') {
            return await (this[handlerName] as () => Promise<UserMenuActionResult>).call(this);
        }

        // Fall back to generic handler
        return await this.OnItemClick(item);
    }

    /**
     * Generic click handler for items without specific handlers.
     * Override for custom default behavior.
     */
    protected async OnItemClick(item: UserMenuItem): Promise<UserMenuActionResult> {
        console.warn(`No handler defined for menu item: ${item.id}`);
        return { success: false, closeMenu: true };
    }

    // ========================================
    // DEFAULT HANDLERS - Override to customize
    // ========================================

    /**
     * Handle "My Profile" click - Opens user profile/settings
     */
    protected async Handle_profile(): Promise<UserMenuActionResult> {
        // This will be wired to open the new simplified Settings
        // Implementation will use SettingsDialogService
        console.log('Opening profile settings...');

        return { success: true, closeMenu: true };
    }

    /**
     * Handle "Toggle Developer Mode" click
     */
    protected async Handle_toggle_dev_mode(): Promise<UserMenuActionResult> {
        if (!this._context) {
            return { success: false, closeMenu: false, message: 'Context not available' };
        }

        // Toggle developer mode
        this._context.developerModeEnabled = !this._context.developerModeEnabled;

        // Persist to localStorage
        localStorage.setItem('mj-developer-mode', String(this._context.developerModeEnabled));

        const isEnabled = this._context.developerModeEnabled;
        return {
            success: true,
            closeMenu: false, // Keep menu open to see updated state
            message: `Developer mode ${isEnabled ? 'enabled' : 'disabled'}`
        };
    }

    /**
     * Handle "Log Layout" click - Debug utility
     */
    protected async Handle_log_layout(): Promise<UserMenuActionResult> {
        if (!this._context?.workspaceManager) {
            return { success: false, closeMenu: true, message: 'Workspace manager not available' };
        }

        const config = this._context.workspaceManager.GetConfiguration();
        console.log('📋 Workspace Configuration:', JSON.stringify(config, null, 2));
        console.log('📋 Workspace Configuration (object):', config);

        return { success: true, closeMenu: true };
    }

    /**
     * Handle "Inspect App State" click - Debug utility
     */
    protected async Handle_inspect_state(): Promise<UserMenuActionResult> {
        console.group('🔍 Application State Inspection');
        console.log('User:', this._context?.userEntity);
        console.log('Current App:', this._context?.currentApplication);
        console.log('Developer Mode:', this._context?.developerModeEnabled);
        console.log('Is Developer:', this._context?.isDeveloper);
        console.log('Workspace Config:', this._context?.workspaceManager?.GetConfiguration());
        console.groupEnd();

        return { success: true, closeMenu: true };
    }

    /**
     * Handle "Reset Layout" click
     */
    protected async Handle_reset_layout(): Promise<UserMenuActionResult> {
        if (!this._context?.workspaceManager) {
            return { success: false, closeMenu: true, message: 'Workspace manager not available' };
        }

        // Generate fresh default configuration
        const freshConfig = {
            tabs: [{
                id: this.GenerateTabId(),
                label: 'Home',
                closable: false,
                active: true,
                goldenLayoutConfig: null
            }],
            activeTabId: null,
            singleResourceMode: true
        };

        await this._context.workspaceManager.SetConfiguration(freshConfig);

        return {
            success: true,
            closeMenu: true,
            message: 'Layout reset to default'
        };
    }

    /**
     * Handle "Sign Out" click
     */
    protected async Handle_logout(): Promise<UserMenuActionResult> {
        if (!this._context?.authService) {
            return { success: false, closeMenu: true, message: 'Auth service not available' };
        }

        // Clear auth data
        localStorage.removeItem('auth');
        localStorage.removeItem('claims');
        localStorage.removeItem('mj-developer-mode');

        // Call logout
        await this._context.authService.logout();

        return { success: true, closeMenu: true };
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Get user display information for menu header
     */
    public GetUserDisplayInfo(): { name: string; email: string; avatarUrl: string | null; initials: string } {
        const user = this._context?.userEntity;
        const name = user?.Name || this._context?.user?.Name || 'User';
        const email = user?.Email || '';
        const avatarUrl = user?.UserImageURL || null;

        // Generate initials from name
        const nameParts = name.split(' ').filter(Boolean);
        const initials = nameParts.length >= 2
            ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
            : name.substring(0, 2).toUpperCase();

        return { name, email, avatarUrl, initials };
    }

    /**
     * Generate a unique tab ID
     */
    protected GenerateTabId(): string {
        return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the current context (for subclasses)
     */
    protected get Context(): UserMenuContext | null {
        return this._context;
    }
}

// Tree-shaking prevention
export function LoadBaseUserMenu(): void {
    // This function ensures the decorator executes
}
```

### 3. Developer Mode Service (in Explorer/shared)

```typescript
// File: packages/Angular/Explorer/shared/src/lib/developer-mode.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';

/**
 * Service to manage Developer Mode functionality across Explorer apps.
 *
 * Developer Mode shows additional debugging tools and developer-focused
 * features in the UI. Only users with Developer, Admin, or System Administrator
 * roles can enable developer mode.
 *
 * Usage:
 * ```typescript
 * constructor(private devMode: DeveloperModeService) {}
 *
 * async ngOnInit() {
 *     await this.devMode.Initialize(userEntity);
 *
 *     // Subscribe to changes
 *     this.devMode.IsEnabled$.subscribe(enabled => {
 *         this.showDevTools = enabled;
 *     });
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class DeveloperModeService {
    private _isEnabled$ = new BehaviorSubject<boolean>(false);
    private _isDeveloper$ = new BehaviorSubject<boolean>(false);
    private _initialized = false;

    // Role names that qualify as "developer"
    private static readonly DEVELOPER_ROLES = [
        'Developer',
        'Admin',
        'System Administrator',
        'Integration'  // Often used for API/system accounts
    ];

    /**
     * Observable for developer mode enabled state.
     * Emits whenever developer mode is toggled.
     */
    public get IsEnabled$(): Observable<boolean> {
        return this._isEnabled$.asObservable();
    }

    /**
     * Observable for whether user has developer role.
     * This determines if they CAN enable developer mode.
     */
    public get IsDeveloper$(): Observable<boolean> {
        return this._isDeveloper$.asObservable();
    }

    /**
     * Current enabled state (synchronous access)
     */
    public get IsEnabled(): boolean {
        return this._isEnabled$.value;
    }

    /**
     * Whether user has developer role (synchronous access)
     */
    public get IsDeveloper(): boolean {
        return this._isDeveloper$.value;
    }

    /**
     * Whether the service has been initialized
     */
    public get IsInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Initialize service with current user.
     * Call this after login/authentication completes.
     */
    public async Initialize(user: UserEntity): Promise<void> {
        if (this._initialized) {
            return;
        }

        // Check if user has a developer role
        const hasDeveloperRole = await this.CheckDeveloperRole(user);
        this._isDeveloper$.next(hasDeveloperRole);

        // Load saved preference from localStorage (only if user is a developer)
        if (hasDeveloperRole) {
            const savedState = localStorage.getItem('mj-developer-mode');
            const isEnabled = savedState === 'true';
            this._isEnabled$.next(isEnabled);
        } else {
            // Non-developers always have dev mode disabled
            this._isEnabled$.next(false);
            localStorage.removeItem('mj-developer-mode');
        }

        this._initialized = true;
    }

    /**
     * Toggle developer mode on/off.
     * Only works if user has developer role.
     * @returns The new state, or false if user cannot enable dev mode
     */
    public Toggle(): boolean {
        if (!this.IsDeveloper) {
            console.warn('Developer mode not available - user does not have Developer role');
            return false;
        }

        const newState = !this.IsEnabled;
        this._isEnabled$.next(newState);
        localStorage.setItem('mj-developer-mode', String(newState));

        return newState;
    }

    /**
     * Enable developer mode (if user has developer role)
     */
    public Enable(): void {
        if (this.IsDeveloper) {
            this._isEnabled$.next(true);
            localStorage.setItem('mj-developer-mode', 'true');
        }
    }

    /**
     * Disable developer mode
     */
    public Disable(): void {
        this._isEnabled$.next(false);
        localStorage.setItem('mj-developer-mode', 'false');
    }

    /**
     * Reset the service (e.g., on logout)
     */
    public Reset(): void {
        this._isEnabled$.next(false);
        this._isDeveloper$.next(false);
        this._initialized = false;
    }

    /**
     * Check if user has a developer role by querying User Roles entity
     */
    private async CheckDeveloperRole(user: UserEntity): Promise<boolean> {
        try {
            const rv = new RunView();

            // Get user's roles via the User Roles junction table
            const userRolesResult = await rv.RunView<{ RoleID: string }>({
                EntityName: 'User Roles',
                ExtraFilter: `UserID='${user.ID}'`,
                ResultType: 'simple',
                Fields: ['RoleID']
            });

            if (!userRolesResult.Success || !userRolesResult.Results?.length) {
                return false;
            }

            const roleIds = userRolesResult.Results.map(ur => ur.RoleID);

            // Get the role names
            const rolesResult = await rv.RunView<{ Name: string }>({
                EntityName: 'Roles',
                ExtraFilter: `ID IN (${roleIds.map(id => `'${id}'`).join(',')})`,
                ResultType: 'simple',
                Fields: ['Name']
            });

            if (!rolesResult.Success || !rolesResult.Results?.length) {
                return false;
            }

            // Check if any role matches our developer roles (case-insensitive)
            const userRoleNames = rolesResult.Results.map(r => r.Name.toLowerCase());
            return DeveloperModeService.DEVELOPER_ROLES.some(devRole =>
                userRoleNames.includes(devRole.toLowerCase())
            );
        } catch (error) {
            console.error('Error checking developer role:', error);
            return false;
        }
    }
}
```

---

## Simplified User Profile Settings

### Design Philosophy

The new Settings should be:
- **User-centric**: Only what the user personally controls
- **Gorgeous**: Clean, modern, delightful to use
- **Simple**: Minimal cognitive load, clear actions
- **Focused**: Profile editing, not system administration

### What Gets REMOVED (Moved to Admin Dashboard)

| Current Tab | Disposition |
|-------------|-------------|
| Users | Remove - Admin Dashboard |
| Roles | Remove - Admin Dashboard |
| Applications | Remove - Admin Dashboard |
| Permissions | Remove - Admin Dashboard |
| Notifications (admin) | Remove - Admin Dashboard |
| Advanced (SQL Logging, Performance) | Remove - Admin Dashboard |

### What Stays / Gets Enhanced

The new profile settings will have a **single-page design** with these sections:

### Profile Settings Mockup

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back                              My Profile                    Save │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │                        PROFILE PICTURE                              │
│  │                                                                     │
│  │            ┌──────────┐                                             │
│  │            │          │     John Smith                              │
│  │            │  Avatar  │     john.smith@company.com                  │
│  │            │  Preview │     Member since Jan 2024                   │
│  │            │          │                                             │
│  │            └──────────┘                                             │
│  │                                                                     │
│  │     ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │     │  📷 Upload │  │  🔗 URL    │  │  ⭐ Icon   │                 │
│  │     └────────────┘  └────────────┘  └────────────┘                 │
│  │                                                                     │
│  │     [Drag & drop an image or click to browse]                      │
│  │     PNG, JPG, GIF, WebP • Max 200KB                                │
│  │                                                                     │
│  └─────────────────────────────────────────────────────────────────────┘
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │                        PERSONAL INFORMATION                         │
│  │                                                                     │
│  │   Display Name                        Title                         │
│  │   ┌─────────────────────────┐        ┌─────────────────────────┐   │
│  │   │ John Smith              │        │ Senior Developer        │   │
│  │   └─────────────────────────┘        └─────────────────────────┘   │
│  │                                                                     │
│  │   First Name                          Last Name                     │
│  │   ┌─────────────────────────┐        ┌─────────────────────────┐   │
│  │   │ John                    │        │ Smith                   │   │
│  │   └─────────────────────────┘        └─────────────────────────┘   │
│  │                                                                     │
│  │   Email (read-only)                                                │
│  │   ┌─────────────────────────────────────────────────────────────┐  │
│  │   │ john.smith@company.com                            🔒        │  │
│  │   └─────────────────────────────────────────────────────────────┘  │
│  │                                                                     │
│  └─────────────────────────────────────────────────────────────────────┘
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │                        PREFERENCES                                  │
│  │                                                                     │
│  │   Theme                                                             │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐                         │
│  │   │ ☀️ Light │  │ 🌙 Dark  │  │ 💻 System │  ← selected            │
│  │   └──────────┘  └──────────┘  └──────────┘                         │
│  │                                                                     │
│  │   Default Application                                               │
│  │   ┌─────────────────────────────────────────────────────────────┐  │
│  │   │ Explorer                                               ▼    │  │
│  │   └─────────────────────────────────────────────────────────────┘  │
│  │   App that opens when you log in                                   │
│  │                                                                     │
│  │   ☑ Show tips and hints                                            │
│  │   ☑ Remember my last open tabs                                     │
│  │   ☐ Compact view mode                                              │
│  │                                                                     │
│  └─────────────────────────────────────────────────────────────────────┘
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │                        DANGER ZONE                                  │
│  │                                                                     │
│  │   ┌─────────────────────────────────────────────────────────────┐  │
│  │   │ 🗑️ Reset All Preferences                                    │  │
│  │   │ This will reset your layout, theme, and all preferences     │  │
│  │   │ to their default values.                                    │  │
│  │   │                                                             │  │
│  │   │                                    [Reset Everything]       │  │
│  │   └─────────────────────────────────────────────────────────────┘  │
│  │                                                                     │
│  └─────────────────────────────────────────────────────────────────────┘
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Design Elements

1. **Single Page, No Tabs** - Everything visible in one scrollable view
2. **Card-Based Sections** - Clear visual grouping with subtle elevation
3. **Large Avatar Preview** - Prominent, centered, with user info beside it
4. **Simple Tab Switcher for Avatar** - Upload / URL / Icon (reuse existing)
5. **Inline Editing** - All fields editable in place
6. **Theme Selector** - Visual button group, not dropdown
7. **Preferences as Toggles** - Simple checkboxes for boolean options
8. **Danger Zone** - Visually distinct, requires confirmation
9. **Floating Save Button** - Always visible, disabled until changes made

### Component Structure

```
packages/Angular/Explorer/explorer-settings/src/lib/
├── user-profile/
│   ├── user-profile.component.ts        # Main profile settings
│   ├── user-profile.component.html
│   ├── user-profile.component.css
│   ├── sections/
│   │   ├── avatar-section.component.ts   # Reuse existing avatar logic
│   │   ├── personal-info-section.component.ts
│   │   ├── preferences-section.component.ts
│   │   └── danger-zone-section.component.ts
│   └── user-profile.module.ts
└── settings/
    └── settings.component.ts             # Now just opens UserProfile
```

### What We Keep from Current Implementation

- **Avatar Editor Component** - The multi-method avatar selection (upload/URL/icon) is excellent
- **Icon Picker** - Categorized, searchable icon selection
- **Material Design 3 Styling** - Color tokens, elevation, responsive design
- **Validation Patterns** - Real-time validation feedback
- **Event System** - `AvatarUpdated` event for header sync

---

## Shell Integration

### Modified Shell Component

```typescript
// Additions to shell.component.ts

import { MJGlobal } from '@memberjunction/global';
import { BaseUserMenu, UserMenuContext, UserMenuElement } from '../user-menu';
import { DeveloperModeService } from '@memberjunction/ng-explorer-shared';

export class ShellComponent implements OnInit, OnDestroy {
    // New properties
    private userMenu: BaseUserMenu | null = null;
    public userMenuElements: UserMenuElement[] = [];

    constructor(
        // ... existing injections ...
        public developerMode: DeveloperModeService
    ) {}

    async ngOnInit() {
        // ... existing initialization ...

        // Initialize user menu after user is loaded
        await this.initializeUserMenu();
    }

    private async initializeUserMenu(): Promise<void> {
        // Get the highest priority user menu implementation
        this.userMenu = MJGlobal.Instance.ClassFactory.CreateInstance<BaseUserMenu>(
            BaseUserMenu
        );

        if (!this.userMenu) {
            console.error('No user menu implementation found');
            return;
        }

        // Initialize developer mode service
        if (this.userEntity) {
            await this.developerMode.Initialize(this.userEntity);
        }

        // Build context
        const context: UserMenuContext = {
            user: this.currentUserInfo,
            userEntity: this.userEntity,
            shell: this,
            viewContainerRef: this.viewContainerRef,
            isDeveloper: this.developerMode.IsDeveloper,
            developerModeEnabled: this.developerMode.IsEnabled,
            currentApplication: this.currentApplication,
            workspaceManager: this.workspaceManager,
            authService: this.authBase
        };

        // Initialize menu
        await this.userMenu.Initialize(context);

        // Get initial menu elements
        this.refreshMenuElements();

        // Subscribe to developer mode changes to refresh menu
        this.developerMode.IsEnabled$.pipe(
            takeUntil(this.destroy$)
        ).subscribe(() => {
            // Update context and refresh menu
            if (this.userMenu && this.userMenu['_context']) {
                this.userMenu['_context'].developerModeEnabled = this.developerMode.IsEnabled;
            }
            this.refreshMenuElements();
        });
    }

    private refreshMenuElements(): void {
        if (this.userMenu) {
            this.userMenuElements = this.userMenu.GetMenuElements();
        }
    }

    async onUserMenuItemClick(itemId: string): Promise<void> {
        if (!this.userMenu) return;

        const result = await this.userMenu.HandleItemClick(itemId);

        if (result.closeMenu) {
            this.userMenuVisible = false;
        }

        // Refresh menu (some items may have changed state)
        this.refreshMenuElements();

        if (result.message) {
            // Show toast notification
            this.sharedService.CreateSimpleNotification(
                result.message,
                result.success ? 'success' : 'error'
            );
        }
    }

    getUserMenuOptions() {
        return this.userMenu?.GetOptions();
    }

    getUserDisplayInfo() {
        return this.userMenu?.GetUserDisplayInfo();
    }

    ngOnDestroy() {
        this.userMenu?.Destroy();
        this.destroy$.next();
        this.destroy$.complete();
    }
}
```

### Updated Template

```html
<!-- User menu section in shell.component.html -->

<div class="user-menu" kendoWindowContainer>
    <button class="avatar-btn" (click)="toggleUserMenu($event)">
        <ng-container *ngIf="userImageURL; else iconAvatar">
            <img [src]="userImageURL" alt="User avatar" class="avatar-img" />
        </ng-container>
        <ng-template #iconAvatar>
            <div class="icon-fallback">
                <i [class]="userIconClass || 'fa-solid fa-user'"></i>
            </div>
        </ng-template>
    </button>

    <div class="user-context-menu"
         *ngIf="userMenuVisible"
         [class.menu-fade]="getUserMenuOptions()?.animationStyle === 'fade'"
         [class.menu-slide]="getUserMenuOptions()?.animationStyle === 'slide'">

        <!-- User Header -->
        <ng-container *ngIf="getUserMenuOptions()?.showUserName">
            <div class="user-menu-header">
                <div class="user-info">
                    <span class="user-name">{{ getUserDisplayInfo()?.name }}</span>
                    <span class="user-email" *ngIf="getUserMenuOptions()?.showUserEmail">
                        {{ getUserDisplayInfo()?.email }}
                    </span>
                </div>
            </div>
            <div class="user-menu-divider"></div>
        </ng-container>

        <!-- Dynamic Menu Items -->
        <ng-container *ngFor="let element of userMenuElements">

            <!-- Divider -->
            <div class="user-menu-divider" *ngIf="element.type === 'divider'"></div>

            <!-- Menu Item -->
            <div class="user-menu-item"
                 *ngIf="!element.type"
                 [class.disabled]="!element.enabled"
                 [class.danger]="element.cssClass === 'danger'"
                 [style.color]="element.color || null"
                 [title]="element.tooltip || ''"
                 (click)="element.enabled && onUserMenuItemClick(element.id)">

                <i [class]="element.icon"></i>
                <span class="menu-label">{{ element.label }}</span>

                <!-- Shortcut hint -->
                <span class="menu-shortcut" *ngIf="element.shortcut">
                    {{ element.shortcut }}
                </span>
            </div>
        </ng-container>
    </div>
</div>
```

---

## Example: Custom App Extension

```typescript
// In a custom application (e.g., my-app)
// File: my-app/src/lib/my-user-menu.ts

import { RegisterClass } from '@memberjunction/global';
import { BaseUserMenu, UserMenuItem, UserMenuActionResult } from '@memberjunction/ng-explorer-core';

/**
 * Custom user menu for MyApp.
 * Extends base menu with app-specific features.
 */
@RegisterClass(BaseUserMenu)  // Automatically higher priority
export class MyAppUserMenu extends BaseUserMenu {

    /**
     * Override to add custom menu items
     */
    public override GetMenuItems(): UserMenuItem[] {
        // Get base items
        const items = super.GetMenuItems();

        // Add custom item in primary group
        items.push({
            id: 'my-dashboard',
            label: 'My Dashboard',
            icon: 'fa-solid fa-chart-line',
            group: 'primary',
            order: 5,  // Before profile
            developerOnly: false,
            visible: true,
            enabled: true,
            tooltip: 'View your personal dashboard'
        });

        // Add app-specific developer tool
        items.push({
            id: 'api-tester',
            label: 'API Tester',
            icon: 'fa-solid fa-flask',
            group: 'developer',
            order: 100,
            developerOnly: true,
            visible: this.Context?.developerModeEnabled ?? false,
            enabled: true
        });

        // Remove an item we don't want
        const resetIndex = items.findIndex(i => i.id === 'reset-layout');
        if (resetIndex >= 0) {
            items.splice(resetIndex, 1);
        }

        return items;
    }

    /**
     * Handle custom dashboard action
     */
    protected async Handle_my_dashboard(): Promise<UserMenuActionResult> {
        // Navigate to dashboard
        console.log('Opening My Dashboard...');

        return { success: true, closeMenu: true };
    }

    /**
     * Handle API tester action
     */
    protected async Handle_api_tester(): Promise<UserMenuActionResult> {
        // Open API tester in new window
        window.open('/api-tester', '_blank');

        return { success: true, closeMenu: true };
    }
}

// Tree-shaking prevention
export function LoadMyAppUserMenu(): void { }
```

---

## File Structure Summary

```
packages/Angular/Explorer/
├── shared/src/lib/
│   ├── developer-mode.service.ts         # NEW - Developer mode service
│   └── public-api.ts                     # Export DeveloperModeService
│
├── explorer-core/src/lib/
│   ├── user-menu/
│   │   ├── index.ts                      # Public exports
│   │   ├── user-menu.types.ts            # Interfaces and types
│   │   └── base-user-menu.ts             # Base class with default impl
│   └── shell/
│       └── shell.component.ts            # Modified to use BaseUserMenu
│
└── explorer-settings/src/lib/
    ├── user-profile/                     # NEW - Simplified profile
    │   ├── user-profile.component.ts
    │   ├── user-profile.component.html
    │   ├── user-profile.component.css
    │   └── user-profile.module.ts
    └── settings/
        └── settings.component.ts         # Simplified - just profile now
```

---

## Migration Plan

### Phase 1: Infrastructure
1. Create `DeveloperModeService` in `@memberjunction/ng-explorer-shared`
2. Create `user-menu.types.ts` with all interfaces
3. Create `BaseUserMenu` with default implementation

### Phase 2: Shell Integration
1. Modify `shell.component.ts` to use ClassFactory for menu
2. Update template to render dynamic menu
3. Wire up `DeveloperModeService`

### Phase 3: Settings Simplification
1. Create new `UserProfileComponent` with single-page design
2. Reuse existing avatar editor components
3. Remove admin tabs from settings
4. Update settings dialog to show profile only

### Phase 4: Testing
1. Test default menu works identically to current
2. Test developer mode toggle and persistence
3. Test custom menu extension in separate app
4. Test profile save/load functionality

---

## Summary

| Feature | Implementation |
|---------|----------------|
| **Plugin Architecture** | `@RegisterClass(BaseUserMenu)` pattern |
| **Default Implementation** | Built into `BaseUserMenu` |
| **Extension Mechanism** | Subclass and override methods |
| **Developer Mode** | `DeveloperModeService` in shared package |
| **Role-Based Visibility** | `developerOnly` flag on menu items |
| **Settings** | Single-page user profile, gorgeous & simple |
| **Admin Features** | Remain in Admin Dashboard (unchanged) |
