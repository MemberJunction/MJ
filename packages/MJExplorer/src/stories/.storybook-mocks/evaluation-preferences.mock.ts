import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * EvaluationPreferences interface matching the real service
 */
export interface EvaluationPreferences {
  showExecution: boolean;
  showHuman: boolean;
  showAuto: boolean;
}

/**
 * Default preferences for mock service
 */
export const DEFAULT_MOCK_PREFERENCES: EvaluationPreferences = {
  showExecution: true,
  showHuman: true,
  showAuto: false
};

/**
 * Mock EvaluationPreferencesService for Storybook stories.
 * Provides controllable state without DB persistence.
 */
@Injectable()
export class MockEvaluationPreferencesService {
  private readonly prefsSubject = new BehaviorSubject<EvaluationPreferences>(DEFAULT_MOCK_PREFERENCES);

  get preferences$(): Observable<EvaluationPreferences> {
    return this.prefsSubject.asObservable();
  }

  get preferences(): EvaluationPreferences {
    return this.prefsSubject.value;
  }

  get loaded(): boolean {
    return true;
  }

  async load(): Promise<void> {
    // No-op in mock
  }

  async updatePreference<K extends keyof EvaluationPreferences>(
    key: K,
    value: EvaluationPreferences[K]
  ): Promise<void> {
    const current = this.prefsSubject.value;
    const updated = { ...current, [key]: value };

    // Ensure at least one is enabled
    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      console.warn('At least one evaluation type must be enabled');
      return;
    }

    this.prefsSubject.next(updated);
  }

  async updateAll(prefs: Partial<EvaluationPreferences>): Promise<void> {
    const updated = { ...this.prefsSubject.value, ...prefs };

    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      console.warn('At least one evaluation type must be enabled');
      return;
    }

    this.prefsSubject.next(updated);
  }

  async toggle(key: keyof EvaluationPreferences): Promise<void> {
    const current = this.prefsSubject.value;
    const newValue = !current[key];
    const updated = { ...current, [key]: newValue };

    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      console.warn('At least one evaluation type must be enabled');
      return;
    }

    this.prefsSubject.next(updated);
  }

  async reset(): Promise<void> {
    this.prefsSubject.next(DEFAULT_MOCK_PREFERENCES);
  }

  /**
   * Storybook-specific: Set preferences directly for story control
   */
  setPreferences(prefs: EvaluationPreferences): void {
    this.prefsSubject.next(prefs);
  }

  get showingHuman(): boolean {
    return this.prefsSubject.value.showHuman;
  }

  get showingAuto(): boolean {
    return this.prefsSubject.value.showAuto;
  }

  get showingExecution(): boolean {
    return this.prefsSubject.value.showExecution;
  }
}
