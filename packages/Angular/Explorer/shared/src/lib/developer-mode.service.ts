import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { MJUserEntity, MJUserSettingEntity } from '@memberjunction/core-entities';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Setting key for developer mode in MJ: User Settings entity
 */
const DEVELOPER_MODE_SETTING_KEY = 'Explorer.DeveloperMode';

/**
 * Service to manage Developer Mode functionality across Explorer apps.
 *
 * Developer Mode shows additional debugging tools and developer-focused
 * features in the UI. Only users with Developer, Admin, or System Administrator
 * roles can enable developer mode.
 *
 * Settings are persisted using the MJ: User Settings entity via UserInfoEngine.
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
    private _currentUser: MJUserEntity | null = null;

    /**
     * Optional explicit metadata provider. Set via `setProvider()` from a
     * caller with provider context. Falls back to `Metadata.Provider` when
     * not set.
     */
    private _provider: IMetadataProvider | null = null;

    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    // Role names that qualify as "developer"
    private static readonly DEVELOPER_ROLES = [
        'Developer',
        'Admin',
        'System Administrator',
        'Integration'
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
    public async Initialize(user: MJUserEntity): Promise<void> {
        if (this._initialized) {
            return;
        }

        this._currentUser = user;

        // Check if user has a developer role (in-memory, no DB round-trip)
        const hasDeveloperRole = this.checkDeveloperRole(user);
        this._isDeveloper$.next(hasDeveloperRole);

        // Load saved preference from User Settings (only if user is a developer)
        if (hasDeveloperRole) {
            const savedState = await this.loadSetting();
            this._isEnabled$.next(savedState);
        } else {
            // Non-developers always have dev mode disabled
            this._isEnabled$.next(false);
        }

        this._initialized = true;
    }

    /**
     * Toggle developer mode on/off.
     * Only works if user has developer role.
     * @returns The new state, or false if user cannot enable dev mode
     */
    public async Toggle(): Promise<boolean> {
        if (!this.IsDeveloper) {
            console.warn('Developer mode not available - user does not have Developer role');
            return false;
        }

        const newState = !this.IsEnabled;
        this._isEnabled$.next(newState);
        await this.saveSetting(newState);

        return newState;
    }

    /**
     * Enable developer mode (if user has developer role)
     */
    public async Enable(): Promise<void> {
        if (this.IsDeveloper) {
            this._isEnabled$.next(true);
            await this.saveSetting(true);
        }
    }

    /**
     * Disable developer mode
     */
    public async Disable(): Promise<void> {
        this._isEnabled$.next(false);
        await this.saveSetting(false);
    }

    /**
     * Reset the service (e.g., on logout)
     */
    public Reset(): void {
        this._isEnabled$.next(false);
        this._isDeveloper$.next(false);
        this._initialized = false;
        this._currentUser = null;
    }

    /**
     * Load the developer mode setting from User Settings entity
     */
    private async loadSetting(): Promise<boolean> {
        try {
            const engine = UserInfoEngine.Instance;
            const settingValue = engine.GetSetting(DEVELOPER_MODE_SETTING_KEY);
            return settingValue === 'true';
        } catch (error) {
            console.warn('Failed to load developer mode setting:', error);
            return false;
        }
    }

    /**
     * Save the developer mode setting to User Settings entity
     */
    private async saveSetting(enabled: boolean): Promise<void> {
        try {
            const engine = UserInfoEngine.Instance;
            await engine.SetSetting(DEVELOPER_MODE_SETTING_KEY, String(enabled));
        } catch (error) {
            console.warn('Failed to save developer mode setting:', error);
        }
    }

    /**
     * Check if user has a developer role using the in-memory UserInfo.UserRoles
     * already loaded by the provider. No DB round-trip required — role names
     * are denormalized onto each UserRoleInfo as `Role`.
     */
    private checkDeveloperRole(user: MJUserEntity): boolean {
        const currentUser = this.Provider.CurrentUser;
        if (!currentUser?.UserRoles?.length) {
            return false;
        }
        const developerRoleSet = new Set(
            DeveloperModeService.DEVELOPER_ROLES.map(r => r.toLowerCase())
        );
        return currentUser.UserRoles.some(ur =>
            ur.Role && developerRoleSet.has(ur.Role.toLowerCase())
        );
    }
}
