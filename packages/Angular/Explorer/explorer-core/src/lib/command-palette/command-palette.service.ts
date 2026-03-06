import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Service for managing command palette state and recent apps tracking.
 *
 * Responsibilities:
 * - Manage open/close state of command palette
 * - Track recently accessed applications (top 3)
 * - Persist recent apps via UserInfoEngine
 */
@Injectable({
  providedIn: 'root'
})
export class CommandPaletteService {
  private isOpen$ = new BehaviorSubject<boolean>(false);
  private readonly recentAppsKey = 'CommandPalette.RecentApps';
  private readonly maxRecentApps = 3;

  /**
   * Observable of command palette open/close state
   */
  get IsOpen(): Observable<boolean> {
    return this.isOpen$.asObservable();
  }

  /**
   * Open the command palette
   */
  Open(): void {
    this.isOpen$.next(true);
  }

  /**
   * Close the command palette
   */
  Close(): void {
    this.isOpen$.next(false);
  }

  /**
   * Track that a user accessed an application.
   * Adds the app ID to the front of the recent apps list,
   * removes duplicates, and limits to max 3 apps.
   * Persists via UserInfoEngine.
   *
   * @param appId - ID of the application that was accessed
   */
  async TrackAppAccess(appId: string): Promise<void> {
    try {
      const engine = UserInfoEngine.Instance;

      // Load current recent apps
      const recentApps = await this.GetRecentApps();

      // Add to front, remove duplicates, limit to max
      const updated = [
        appId,
        ...recentApps.filter(id => id !== appId)
      ].slice(0, this.maxRecentApps);

      // Save back to UserInfoEngine
      await engine.SetSetting(this.recentAppsKey, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to track app access:', error);
    }
  }

  /**
   * Get the list of recently accessed application IDs (up to 3)
   *
   * @returns Promise resolving to array of app IDs
   */
  async GetRecentApps(): Promise<string[]> {
    try {
      const engine = UserInfoEngine.Instance;
      const json = await engine.GetSetting(this.recentAppsKey);

      if (!json) {
        return [];
      }

      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to load recent apps:', error);
      return [];
    }
  }

  /**
   * Clear all recent apps history
   */
  async ClearRecentApps(): Promise<void> {
    try {
      const engine = UserInfoEngine.Instance;
      await engine.SetSetting(this.recentAppsKey, JSON.stringify([]));
    } catch (error) {
      console.error('Failed to clear recent apps:', error);
    }
  }
}
