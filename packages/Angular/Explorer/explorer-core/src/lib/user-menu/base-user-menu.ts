import { RegisterClass } from '@memberjunction/global';
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

            // === DEVELOPER GROUP (Only visible to developers) ===
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
                id: 'toggle-theme',
                label: this.GetThemeLabel(),
                icon: this.GetThemeIcon(),
                group: 'system',
                order: 5,
                developerOnly: false,
                visible: true,
                enabled: true,
                tooltip: 'Switch between light and dark mode'
            },
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
        if (this._context?.openSettings) {
            this._context.openSettings();
        }
        return { success: true, closeMenu: true };
    }

    /**
     * Handle "Toggle Developer Mode" click
     */
    protected async Handle_toggle_dev_mode(): Promise<UserMenuActionResult> {
        // This will be handled by the shell component which has access to DeveloperModeService
        // The result signals that the menu should refresh to show the updated state
        return {
            success: true,
            closeMenu: false, // Keep menu open to see updated state
            message: 'toggle-dev-mode' // Special signal for shell to handle
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
     * Handle "Toggle Theme" click
     */
    protected async Handle_toggle_theme(): Promise<UserMenuActionResult> {
        return {
            success: true,
            closeMenu: false, // Keep menu open to see updated state
            message: 'toggle-theme' // Special signal for shell to handle
        };
    }

    /**
     * Handle "Reset Layout" click
     */
    protected async Handle_reset_layout(): Promise<UserMenuActionResult> {
        // Signal to shell to handle reset layout
        return {
            success: true,
            closeMenu: true,
            message: 'reset-layout' // Special signal for shell to handle
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

        // Call logout
        await this._context.authService.logout();

        return { success: true, closeMenu: true };
    }

    // ========================================
    // THEME HELPERS
    // ========================================

    /**
     * Get the display label for the theme toggle (just "Theme" — the toggle switch conveys state)
     */
    protected GetThemeLabel(): string {
        return 'Theme';
    }

    /**
     * Get the icon for the theme toggle based on current preference
     */
    protected GetThemeIcon(): string {
        const pref = this._context?.themePreference ?? 'light';
        return pref === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
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

    /**
     * Update context (called by shell when developer mode changes)
     */
    public UpdateContext(updates: Partial<UserMenuContext>): void {
        if (this._context) {
            this._context = { ...this._context, ...updates };
        }
    }
}
