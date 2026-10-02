import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import { MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import {
  EvaluationPreferences,
  DEFAULT_EVALUATION_PREFERENCES,
  EVALUATION_PREFS_SETTING_KEY
} from '../models/evaluation.types';

/**
 * Service for managing user evaluation display preferences.
 * Persists preferences to MJ: User Settings entity.
 */
/**
 * Multi-provider note: callers under a non-default provider should set
 * `service.Provider = component.ProviderToUse` before invoking any methods.
 */
@Injectable({
  providedIn: 'root'
})
export class EvaluationPreferencesService {
  private readonly _preferences$ = new BehaviorSubject<EvaluationPreferences>(DEFAULT_EVALUATION_PREFERENCES);
  private _settingEntity: MJUserSettingEntity | null = null;
  private _loaded = false;
  private _saving = false;

  private _provider: IMetadataProvider | null = null;
  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  /** Observable of current evaluation preferences */
  get Preferences$(): Observable<EvaluationPreferences> {
    return this._preferences$.asObservable();
  }

  /** @deprecated Use {@link Preferences$}. */
  get preferences$(): Observable<EvaluationPreferences> {
    return this.Preferences$;
  }

  /** Current preferences value */
  get Preferences(): EvaluationPreferences {
    return this._preferences$.value;
  }

  /** @deprecated Use {@link Preferences}. */
  get preferences(): EvaluationPreferences {
    return this.Preferences;
  }

  /** Whether preferences have been loaded */
  get Loaded(): boolean {
    return this._loaded;
  }

  /** @deprecated Use {@link Loaded}. */
  get loaded(): boolean {
    return this.Loaded;
  }

  constructor() {
    // Auto-load on first access
    this.Load();
  }

  /**
   * Load preferences from User Settings
   */
  async Load(): Promise<void> {
    if (this._loaded) return;

    try {
      const engine = UserInfoEngine.Instance;
      const setting = engine.UserSettings.find(s => s.Setting === EVALUATION_PREFS_SETTING_KEY);

      if (setting?.Value) {
        this._settingEntity = setting;
        const parsed = JSON.parse(setting.Value) as Partial<EvaluationPreferences>;
        // Merge with defaults to handle new properties
        this._preferences$.next({
          ...DEFAULT_EVALUATION_PREFERENCES,
          ...parsed
        });
      }

      this._loaded = true;
    } catch (error) {
      console.warn('Failed to load evaluation preferences:', error);
      // Keep defaults on error
      this._loaded = true;
    }
  }

  /** @deprecated Use {@link Load}. */
  async load(): Promise<void> {
    return this.Load();
  }

  /**
   * Update a single preference
   */
  async UpdatePreference<K extends keyof EvaluationPreferences>(
    key: K,
    value: EvaluationPreferences[K]
  ): Promise<void> {
    const current = this._preferences$.value;
    const updated = { ...current, [key]: value };

    // Ensure at least one is enabled
    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      console.warn('At least one evaluation type must be enabled');
      return;
    }

    this._preferences$.next(updated);
    await this.save(updated);
  }

  /** @deprecated Use {@link UpdatePreference}. */
  async updatePreference<K extends keyof EvaluationPreferences>(
    key: K,
    value: EvaluationPreferences[K]
  ): Promise<void> {
    return this.UpdatePreference(key, value);
  }

  /**
   * Update all preferences at once
   */
  async UpdateAll(prefs: Partial<EvaluationPreferences>): Promise<void> {
    const updated = { ...this._preferences$.value, ...prefs };

    // Ensure at least one is enabled
    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      console.warn('At least one evaluation type must be enabled');
      return;
    }

    this._preferences$.next(updated);
    await this.save(updated);
  }

  /** @deprecated Use {@link UpdateAll}. */
  async updateAll(prefs: Partial<EvaluationPreferences>): Promise<void> {
    return this.UpdateAll(prefs);
  }

  /**
   * Toggle a specific preference
   */
  async Toggle(key: keyof EvaluationPreferences): Promise<void> {
    const current = this._preferences$.value;
    const newValue = !current[key];

    // Check if this would disable all
    const updated = { ...current, [key]: newValue };
    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      console.warn('At least one evaluation type must be enabled');
      return;
    }

    this._preferences$.next(updated);
    await this.save(updated);
  }

  /** @deprecated Use {@link Toggle}. */
  async toggle(key: keyof EvaluationPreferences): Promise<void> {
    return this.Toggle(key);
  }

  /**
   * Reset to default preferences
   */
  async Reset(): Promise<void> {
    this._preferences$.next(DEFAULT_EVALUATION_PREFERENCES);
    await this.save(DEFAULT_EVALUATION_PREFERENCES);
  }

  /** @deprecated Use {@link Reset}. */
  async reset(): Promise<void> {
    return this.Reset();
  }

  /**
   * Save preferences to User Settings
   */
  private async save(prefs: EvaluationPreferences): Promise<void> {
    if (this._saving) return;

    this._saving = true;

    try {
      const md = this.Provider;
      const userId = md.CurrentUser?.ID;
      if (!userId) {
        this._saving = false;
        return;
      }

      // Find or create setting entity
      if (!this._settingEntity) {
        const engine = UserInfoEngine.Instance;
        const existing = engine.UserSettings.find(s => s.Setting === EVALUATION_PREFS_SETTING_KEY);

        if (existing) {
          this._settingEntity = existing;
        } else {
          this._settingEntity = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings', md.CurrentUser);
          this._settingEntity.UserID = userId;
          this._settingEntity.Setting = EVALUATION_PREFS_SETTING_KEY;
        }
      }

      this._settingEntity.Value = JSON.stringify(prefs);
      await this._settingEntity.Save();
    } catch (error) {
      console.warn('Failed to save evaluation preferences:', error);
    } finally {
      this._saving = false;
    }
  }

  /**
   * Check if showing any human-related metrics
   */
  get ShowingHuman(): boolean {
    return this._preferences$.value.showHuman;
  }

  /** @deprecated Use {@link ShowingHuman}. */
  get showingHuman(): boolean {
    return this.ShowingHuman;
  }

  /**
   * Check if showing any auto-related metrics
   */
  get ShowingAuto(): boolean {
    return this._preferences$.value.showAuto;
  }

  /** @deprecated Use {@link ShowingAuto}. */
  get showingAuto(): boolean {
    return this.ShowingAuto;
  }

  /**
   * Check if showing execution status
   */
  get ShowingExecution(): boolean {
    return this._preferences$.value.showExecution;
  }

  /** @deprecated Use {@link ShowingExecution}. */
  get showingExecution(): boolean {
    return this.ShowingExecution;
  }
}
