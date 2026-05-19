import { RegisterClass } from '@memberjunction/global';
import {
    UserMenuItem,
    UserMenuElement,
    UserMenuContext,
    UserMenuActionResult,
    UserMenuOptions,
    UserMenuDivider,
    UserDisplayInfo
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
            {
                id: 'pin-to-home',
                label: 'Pin to Home',
                icon: 'fa-solid fa-house-chimney',
                group: 'primary',
                order: 20,
                developerOnly: false,
                visible: true,
                enabled: true,
                tooltip: 'Pin the current resource to your Home dashboard'
            },
            {
                id: 'sharing-center',
                label: 'Sharing Center',
                icon: 'fa-solid fa-share-nodes',
                group: 'primary',
                order: 25,
                developerOnly: false,
                visible: true,
                enabled: true,
                tooltip: "See what you've shared and what's been shared with you"
            },
            {
                id: 'submit-feedback',
                label: 'Submit Feedback',
                icon: 'fa-solid fa-comment-dots',
                group: 'primary',
                order: 30,
                developerOnly: false,
                visible: this._context?.feedbackEnabled !== false,
                enabled: true,
                tooltip: 'Report a bug or request a feature'
            },

            // Developer tools live in the Admin app's "Developer Tools" section,
            // not in this menu. The DeveloperModeService still exists for
            // per-record dev affordances (e.g. "open in CodeGen" links).

            // === SYSTEM GROUP (Theme selection) ===
            ...this.BuildThemeMenuItems(),
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
            {
                id: 'about',
                label: 'About MemberJunction',
                icon: 'fa-solid fa-circle-info',
                group: 'system',
                order: 20,
                developerOnly: false,
                visible: true,
                enabled: true,
                tooltip: 'Version, diagnostics, and links'
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
        const groupOrder = this.GetGroupOrder();
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
     * Get the ordered list of group names for menu rendering.
     * Override to insert custom groups (e.g., 'organization' before 'primary').
     */
    protected GetGroupOrder(): string[] {
        return ['primary', 'developer', 'system', 'danger'];
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
     * Theme selection items (select-theme-*) are routed to HandleThemeSelection.
     */
    public async HandleItemClick(itemId: string): Promise<UserMenuActionResult> {
        const items = this.GetMenuItems();
        const item = items.find(i => i.id === itemId);

        if (!item || !item.enabled) {
            return { success: false, closeMenu: false, message: 'Item not found or disabled' };
        }

        // Route theme selection items to the theme handler
        if (itemId.startsWith('select-theme-')) {
            const themeId = itemId.substring('select-theme-'.length);
            return await this.HandleThemeSelection(themeId);
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
     * Handle "My Profile" click — signals the shell to open the new
     * Identity Card profile dialog. The shell wires this to ProfileDialogService.
     */
    protected async Handle_profile(): Promise<UserMenuActionResult> {
        return {
            success: true,
            closeMenu: true,
            message: 'profile'
        };
    }

    /**
     * Handle theme selection clicks.
     * Item IDs follow the pattern 'select-theme-<themeId>'.
     */
    protected async HandleThemeSelection(themeId: string): Promise<UserMenuActionResult> {
        return {
            success: true,
            closeMenu: false, // Keep menu open to see updated state
            message: `select-theme-${themeId}` // Signal for shell to handle
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
    // PIN TO HOME HELPERS
    // ========================================

    /**
     * Handle "Pin to Home" click - signals the shell to pin the active resource
     */
    protected async Handle_pin_to_home(): Promise<UserMenuActionResult> {
        // Signal the shell to handle the actual pinning (it has access to DI and the active tab)
        // The shell's handler checks for Home app and duplicate pin conditions
        return {
            success: true,
            closeMenu: true,
            message: 'pin-to-home'
        };
    }

    /**
     * Handle "Sharing Center" click — signals the shell to open the dialog.
     * The shell has access to `ViewContainerRef` and the dialog service; the
     * menu only needs to report the intent.
     */
    protected async Handle_sharing_center(): Promise<UserMenuActionResult> {
        return {
            success: true,
            closeMenu: true,
            message: 'sharing-center'
        };
    }

    /** Signal the shell to open the feedback dialog */
    protected async Handle_submit_feedback(): Promise<UserMenuActionResult> {
        return {
            success: true,
            closeMenu: true,
            message: 'submit-feedback'
        };
    }

    /** Signal the shell to open the About dialog */
    protected async Handle_about(): Promise<UserMenuActionResult> {
        return {
            success: true,
            closeMenu: true,
            message: 'about'
        };
    }

    // ========================================
    // THEME HELPERS
    // ========================================

    /**
     * Build menu items for each registered theme plus a 'System' option.
     * Each theme gets a `select-theme-<id>` item ID. The currently active
     * theme (or 'system' preference) shows a checkmark icon.
     */
    protected BuildThemeMenuItems(): UserMenuItem[] {
        const themes = this._context?.availableThemes ?? [];
        const currentPreference = this._context?.themePreference ?? 'system';
        const items: UserMenuItem[] = [];
        let order = 1;

        for (const theme of themes) {
            const isActive = currentPreference === theme.Id;
            items.push({
                id: `select-theme-${theme.Id}`,
                label: theme.Name,
                icon: isActive ? 'fa-solid fa-check' : this.GetThemeIconForBaseTheme(theme.BaseTheme),
                color: isActive ? '#4CAF50' : undefined,
                group: 'system',
                order: order++,
                developerOnly: false,
                visible: true,
                enabled: true,
                tooltip: theme.Description ?? `Switch to ${theme.Name} theme`
            });
        }

        // Always add a 'System' option (auto-detect OS preference)
        const isSystemActive = currentPreference === 'system';
        items.push({
            id: 'select-theme-system',
            label: 'System',
            icon: isSystemActive ? 'fa-solid fa-check' : 'fa-solid fa-desktop',
            color: isSystemActive ? '#4CAF50' : undefined,
            group: 'system',
            order: order++,
            developerOnly: false,
            visible: true,
            enabled: true,
            tooltip: 'Auto-detect theme from OS preference'
        });

        return items;
    }

    /**
     * Get an appropriate icon for a base theme type.
     * Used for non-active theme items to hint at light vs dark.
     */
    protected GetThemeIconForBaseTheme(baseTheme: 'light' | 'dark'): string {
        return baseTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Get user display information for menu header
     */
    public GetUserDisplayInfo(): UserDisplayInfo {
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
