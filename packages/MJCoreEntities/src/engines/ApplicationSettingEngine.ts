import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  RegisterForStartup,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { Observable } from 'rxjs';

import { MJApplicationSettingEntity } from '../generated/entity_subclasses';

/**
 * Internal key used to identify a pending debounced write. Combines the optional
 * applicationId scope with the setting name so that GLOBAL and app-scoped writes
 * for the same name don't collide in the pending map.
 */
function pendingKey(name: string, applicationId?: string | null): string {
  return `${applicationId ?? ''}::${name}`;
}

/**
 * ApplicationSettingEngine is a singleton engine that provides centralized, cached access to
 * application configuration settings stored in the `MJ: Application Settings` entity
 * (table `ApplicationSetting`).
 *
 * Each setting row has an optional `ApplicationID`:
 * - **NULL** → a GLOBAL setting that applies across all applications.
 * - **non-NULL** → a setting scoped to that single application.
 *
 * **Resolution semantics**: when reading a setting for a given application, an app-scoped row
 * (matching applicationId + name) takes precedence over the GLOBAL row (ApplicationID NULL) of
 * the same name. If neither exists, the read returns `undefined`.
 *
 * This engine mirrors {@link UserInfoEngine}: it loads all setting rows into an in-memory cache
 * via a BaseEnginePropertyConfig (which auto-subscribes to BaseEntity events for reactivity),
 * exposes a reactive observable, and supports debounced writes with read-after-write semantics.
 *
 * Usage:
 * ```typescript
 * const engine = ApplicationSettingEngine.Instance;
 * await engine.Config(false, contextUser);
 *
 * // Read a setting (app-scoped first, then GLOBAL fallback)
 * const raw = engine.GetSetting('feature.flag', applicationId);
 *
 * // Write a GLOBAL setting
 * await engine.SetSetting('feature.flag', 'true');
 *
 * // Write an app-scoped setting
 * await engine.SetSetting('feature.flag', 'false', applicationId);
 * ```
 */
@RegisterForStartup()
export class ApplicationSettingEngine extends BaseEngine<ApplicationSettingEngine> {
  /**
   * Returns the global instance of the class. This is a singleton class, so there is only one
   * instance of it in the application. Do not directly create new instances of it, always use
   * this method to get the instance.
   */
  public static get Instance(): ApplicationSettingEngine {
    return super.getInstance<ApplicationSettingEngine>();
  }

  // Private storage for the application setting cache (all rows, global + app-scoped)
  private _ApplicationSettings: MJApplicationSettingEntity[] = [];

  // ========================================================================
  // DEBOUNCED SETTINGS SUPPORT
  // ========================================================================

  /**
   * Debounce time in milliseconds for SetSettingDebounced calls.
   * Default is 500ms. Change via the SettingsDebounceMs setter.
   */
  private _settingsDebounceMs: number = 500;

  /**
   * Map of pending setting updates keyed by `${applicationId}::${name}`.
   * These are queued and flushed after the debounce period of inactivity.
   */
  private _pendingSettings: Map<
    string,
    { name: string; value: string; applicationId?: string; contextUser?: UserInfo; timestamp: number }
  > = new Map();

  /**
   * Timer handle for the debounce flush.
   */
  private _settingsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Promise that resolves when the current flush operation completes.
   * Used to prevent concurrent flush operations.
   */
  private _flushPromise: Promise<void> | null = null;

  /**
   * Configures the engine by loading all application settings from the database into the
   * in-memory cache. Application settings are global reference data (not per-user), so all rows
   * are loaded regardless of provider type.
   *
   * @param forceRefresh - If true, forces a refresh from the server even if data is cached
   * @param contextUser - The user context (required for server-side)
   * @param provider - Optional custom metadata provider
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'MJ: Application Settings',
        PropertyName: '_ApplicationSettings',
        CacheLocal: true,
        // Global reference data — no user filter
      },
    ];

    await super.Load(configs, provider, forceRefresh, contextUser);
  }

  // ========================================================================
  // OBSERVABLE ACCESSORS
  // ========================================================================

  /**
   * Observable stream of the application settings cache array. Emits the current array on
   * subscribe and re-emits whenever the cache is mutated (save, delete, remote-invalidate,
   * refresh).
   */
  public get ApplicationSettings$(): Observable<MJApplicationSettingEntity[]> {
    return this.ObserveProperty<MJApplicationSettingEntity>('_ApplicationSettings');
  }

  // ========================================================================
  // PUBLIC ACCESSORS
  // ========================================================================

  /**
   * Get all application settings in the cache (global + app-scoped, unfiltered).
   */
  public get ApplicationSettings(): MJApplicationSettingEntity[] {
    return this.GetConfigData<MJApplicationSettingEntity>('_ApplicationSettings');
  }

  /**
   * Get all settings for a specific application, OR all GLOBAL settings when no applicationId
   * is supplied.
   *
   * @param applicationId - The application ID to filter by; omit/undefined for GLOBAL settings
   * @returns The matching settings (does NOT merge global fallbacks into the app-scoped list)
   */
  public GetAllForApplication(applicationId?: string): MJApplicationSettingEntity[] {
    if (applicationId) {
      return this.ApplicationSettings.filter((s) => s.ApplicationID != null && UUIDsEqual(s.ApplicationID, applicationId));
    }
    return this.ApplicationSettings.filter((s) => s.ApplicationID == null);
  }

  /**
   * Get an application setting value by name with scope resolution.
   *
   * **Resolution**: if `applicationId` is given and an app-scoped row exists for
   * (applicationId, name), its value is returned. Otherwise the GLOBAL row (ApplicationID NULL)
   * for that name is used as a fallback. Returns `undefined` if neither exists.
   *
   * **Read-after-write semantics**: this consults the in-memory pending-debounced-writes map
   * FIRST (app-scoped pending takes precedence over global pending, mirroring the persisted
   * resolution order). Without that, a `SetSettingDebounced` followed immediately by
   * `GetSetting` would return the old DB-cached value because the debounce timer hasn't fired
   * yet and the entity hasn't been saved.
   *
   * @param name - The setting name to find
   * @param applicationId - Optional application scope; when given, app-scoped overrides global
   * @returns The setting value string, or undefined if not found
   */
  public GetSetting(name: string, applicationId?: string): string | undefined {
    // 1) Pending app-scoped write (read-after-write)
    if (applicationId) {
      const pendingApp = this._pendingSettings.get(pendingKey(name, applicationId));
      if (pendingApp !== undefined) return pendingApp.value;
    }

    // 2) Persisted app-scoped row
    if (applicationId) {
      const appRow = this.findEntity(name, applicationId);
      if (appRow) return appRow.Value;
    }

    // 3) Pending GLOBAL write (read-after-write)
    const pendingGlobal = this._pendingSettings.get(pendingKey(name, undefined));
    if (pendingGlobal !== undefined) return pendingGlobal.value;

    // 4) Persisted GLOBAL row (fallback)
    const globalRow = this.findEntity(name, undefined);
    return globalRow?.Value ?? undefined;
  }

  /**
   * Get an application setting entity by name with the same scope resolution as
   * {@link GetSetting} (app-scoped first, then GLOBAL fallback). Does NOT consult pending
   * debounced writes — returns the persisted entity instance.
   *
   * @param name - The setting name to find
   * @param applicationId - Optional application scope
   * @returns The MJApplicationSettingEntity, or undefined if not found
   */
  public GetSettingEntity(name: string, applicationId?: string): MJApplicationSettingEntity | undefined {
    if (applicationId) {
      const appRow = this.findEntity(name, applicationId);
      if (appRow) return appRow;
    }
    return this.findEntity(name, undefined);
  }

  /**
   * Internal: find the cache row that exactly matches (name, scope) WITHOUT fallback.
   * A null/undefined applicationId matches only GLOBAL rows; a non-null applicationId matches
   * only the app-scoped row for that application.
   */
  private findEntity(name: string, applicationId?: string): MJApplicationSettingEntity | undefined {
    return this.ApplicationSettings.find((s) => {
      if (s.Name !== name) return false;
      if (applicationId) {
        return s.ApplicationID != null && UUIDsEqual(s.ApplicationID, applicationId);
      }
      return s.ApplicationID == null;
    });
  }

  /**
   * Set an application setting by name. Creates a new setting if one doesn't exist for the
   * exact (name, scope) pair; updates it otherwise. When `applicationId` is omitted the setting
   * is written as a GLOBAL setting (ApplicationID NULL).
   *
   * @param name - The setting name
   * @param value - The setting value (string, typically JSON for complex data)
   * @param applicationId - Optional application scope; omit for a GLOBAL setting
   * @param contextUser - Optional user context for server-side use
   * @returns true if successful, false otherwise
   */
  public async SetSetting(name: string, value: string, applicationId?: string, contextUser?: UserInfo): Promise<boolean> {
    const md = this.ProviderToUse;

    try {
      // Look up the exact (name, scope) row — NOT the resolved fallback, so writing an
      // app-scoped value never accidentally mutates the GLOBAL row.
      let setting = this.findEntity(name, applicationId);

      if (setting) {
        setting.Value = value;
      } else {
        setting = await md.GetEntityObject<MJApplicationSettingEntity>('MJ: Application Settings', contextUser);
        setting.NewRecord();
        setting.ApplicationID = applicationId ?? null;
        setting.Name = name;
        setting.Value = value;
      }

      const saved = await setting.Save();
      if (saved) {
        if (!this._ApplicationSettings.some((s) => UUIDsEqual(s.ID, setting!.ID))) {
          this._ApplicationSettings.push(setting);
        }
        return true;
      } else {
        console.error('ApplicationSettingEngine.SetSetting: Failed to save:', setting.LatestResult?.CompleteMessage);
        return false;
      }
    } catch (error) {
      console.error('ApplicationSettingEngine.SetSetting: Error:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Delete an application setting by name and scope.
   *
   * @param name - The setting name to delete
   * @param applicationId - Optional application scope; omit to delete the GLOBAL setting
   * @returns true if successful (or setting didn't exist), false on error
   */
  public async DeleteSetting(name: string, applicationId?: string): Promise<boolean> {
    const setting = this.findEntity(name, applicationId);

    if (!setting) {
      // Setting doesn't exist, consider it a success
      return true;
    }

    try {
      const deleted = await setting.Delete();
      if (deleted) {
        const index = this._ApplicationSettings.findIndex((s) => UUIDsEqual(s.ID, setting.ID));
        if (index >= 0) {
          this._ApplicationSettings.splice(index, 1);
        }
        return true;
      } else {
        console.error('ApplicationSettingEngine.DeleteSetting: Failed to delete:', setting.LatestResult?.CompleteMessage);
        return false;
      }
    } catch (error) {
      console.error('ApplicationSettingEngine.DeleteSetting: Error:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  // ========================================================================
  // DEBOUNCED SETTINGS METHODS
  // ========================================================================

  /**
   * Get the current debounce time in milliseconds for SetSettingDebounced calls.
   */
  public get SettingsDebounceMs(): number {
    return this._settingsDebounceMs;
  }

  /**
   * Set the debounce time in milliseconds for SetSettingDebounced calls.
   * When changed, any pending settings are flushed first before the new debounce time takes effect.
   * @param value - The debounce time in milliseconds (minimum 100ms, maximum 10000ms)
   */
  public set SettingsDebounceMs(value: number) {
    const clampedValue = Math.max(100, Math.min(10000, value));
    if (clampedValue !== this._settingsDebounceMs) {
      this.FlushPendingSettings();
      this._settingsDebounceMs = clampedValue;
    }
  }

  /**
   * Queue a setting update with debouncing. Multiple calls within the debounce period for the
   * same (name, scope) pair are batched together, with only the last value being saved. The
   * actual database save occurs after the debounce period of inactivity.
   *
   * This is the preferred method for UI components that may update settings frequently.
   *
   * @param name - The setting name
   * @param value - The setting value (string, typically JSON for complex data)
   * @param applicationId - Optional application scope; omit for a GLOBAL setting
   * @param contextUser - Optional user context for server-side use
   */
  public SetSettingDebounced(name: string, value: string, applicationId?: string, contextUser?: UserInfo): void {
    this._pendingSettings.set(pendingKey(name, applicationId), {
      name,
      value,
      applicationId,
      contextUser,
      timestamp: Date.now(),
    });

    if (this._settingsDebounceTimer) {
      clearTimeout(this._settingsDebounceTimer);
    }

    this._settingsDebounceTimer = setTimeout(() => {
      this.FlushPendingSettings();
    }, this._settingsDebounceMs);
  }

  /**
   * Immediately flush all pending debounced settings to the database.
   * Call this when you need to ensure settings are saved (e.g., before navigation).
   * Safe to call multiple times - concurrent calls will wait for the current flush to complete.
   *
   * @returns Promise that resolves when all pending settings have been saved
   */
  public async FlushPendingSettings(): Promise<void> {
    if (this._settingsDebounceTimer) {
      clearTimeout(this._settingsDebounceTimer);
      this._settingsDebounceTimer = null;
    }

    if (this._pendingSettings.size === 0) {
      return;
    }

    if (this._flushPromise) {
      await this._flushPromise;
      if (this._pendingSettings.size > 0) {
        return this.FlushPendingSettings();
      }
      return;
    }

    const settingsToSave = new Map(this._pendingSettings);
    this._pendingSettings.clear();

    this._flushPromise = this.doFlushSettings(settingsToSave);

    try {
      await this._flushPromise;
    } finally {
      this._flushPromise = null;
    }
  }

  /**
   * Internal method to perform the actual flush of settings.
   * @param settingsToSave - Map of settings to save
   */
  private async doFlushSettings(
    settingsToSave: Map<string, { name: string; value: string; applicationId?: string; contextUser?: UserInfo; timestamp: number }>,
  ): Promise<void> {
    const savePromises: Promise<boolean>[] = [];

    for (const { name, value, applicationId, contextUser } of settingsToSave.values()) {
      savePromises.push(this.SetSetting(name, value, applicationId, contextUser));
    }

    const results = await Promise.all(savePromises);
    const failedCount = results.filter((r) => !r).length;

    if (failedCount > 0) {
      console.warn(`ApplicationSettingEngine.FlushPendingSettings: ${failedCount} of ${results.length} settings failed to save`);
    }
  }

  /**
   * Check if there are any pending debounced settings waiting to be saved.
   */
  public get HasPendingSettings(): boolean {
    return this._pendingSettings.size > 0;
  }

  /**
   * Get the number of pending debounced settings.
   */
  public get PendingSettingsCount(): number {
    return this._pendingSettings.size;
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Force refresh all application setting data.
   * @param contextUser - Optional user context for server-side use
   */
  public async Refresh(contextUser?: UserInfo): Promise<void> {
    await this.Config(true, contextUser);
  }
}
