import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata } from '@memberjunction/core';
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
@Injectable({
  providedIn: 'root'
})
export class EvaluationPreferencesService {
  private readonly _preferences$ = new BehaviorSubject<EvaluationPreferences>(DEFAULT_EVALUATION_PREFERENCES);
  private _settingEntity: MJUserSettingEntity | null = null;
  private _loaded = false;
  private _saving = false;

  /** Observable of current evaluation preferences */
  get preferences$(): Observable<EvaluationPreferences> {
    return this._preferences$.asObservable();
  }

  /** Current preferences value */
  get preferences(): EvaluationPreferences {
    return this._preferences$.value;
  }

  /** Whether preferences have been loaded */
  get loaded(): boolean {
    return this._loaded;
  }

  constructor() {
    // Auto-load on first access
    this.load();
  }

  /**
   * Load preferences from User Settings
   */
  async load(): Promise<void> {
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

  /**
   * Update a single preference
   */
  async updatePreference<K extends keyof EvaluationPreferences>(
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

  /**
   * Update all preferences at once
   */
  async updateAll(prefs: Partial<EvaluationPreferences>): Promise<void> {
    const updated = { ...this._preferences$.value, ...prefs };

    // Ensure at least one is enabled
    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      console.warn('At least one evaluation type must be enabled');
      return;
    }

    this._preferences$.next(updated);
    await this.save(updated);
  }

  /**
   * Toggle a specific preference
   */
  async toggle(key: keyof EvaluationPreferences): Promise<void> {
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

  /**
   * Reset to default preferences
   */
  async reset(): Promise<void> {
    this._preferences$.next(DEFAULT_EVALUATION_PREFERENCES);
    await this.save(DEFAULT_EVALUATION_PREFERENCES);
  }

  /**
   * Save preferences to User Settings
   */
  private async save(prefs: EvaluationPreferences): Promise<void> {
    if (this._saving) return;

    this._saving = true;

    try {
      const md = new Metadata();
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
          this._settingEntity = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
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
  get showingHuman(): boolean {
    return this._preferences$.value.showHuman;
  }

  /**
   * Check if showing any auto-related metrics
   */
  get showingAuto(): boolean {
    return this._preferences$.value.showAuto;
  }

  /**
   * Check if showing execution status
   */
  get showingExecution(): boolean {
    return this._preferences$.value.showExecution;
  }
}
