/**
 * @fileoverview Composed-shell per-user preferences (SLICE-S1).
 *
 * Backs the S1 Settings panel: `Show Projects` (D-S7 — visible by default,
 * per-user opt-OUT) and sidebar density. Persisted server-side via
 * `UserInfoEngine` (`MJ: User Settings`) so choices follow the user across
 * devices — never localStorage. Mirrors the memoized-read / debounced-write
 * pattern of {@link PlanModePreference} (`plan-mode-preference.ts`).
 *
 * @module @memberjunction/ng-conversations
 */

import { UserInfoEngine } from '@memberjunction/core-entities';

/** Sidebar row-spacing options surfaced in Settings → Sidebar density. */
export type ShellSidebarDensity = 'comfortable' | 'compact';

/** W0a Chats-surface grouping mode (S2). */
export type ShellChatsGroupMode = 'project' | 'flat';

/** Static utility — all state lives in UserInfoEngine's cache; this class only parses/writes. */
export class ShellPreferences {
  /** `MJ: User Settings` key for the Show Projects opt-out toggle (D-S7; default ON). */
  private static readonly ShowProjectsKey = 'mj.conversations.showProjects.v1';
  /** `MJ: User Settings` key for sidebar density. */
  private static readonly DensityKey = 'mj.conversations.sidebarDensity.v1';

  /**
   * Whether the Projects nav item (and project dots) render. Default TRUE —
   * D-S7 locked projects visible-by-default with this as the per-user opt-out.
   * Synchronous cache read; safe from getters every change-detection pass.
   */
  public static get ShowProjects(): boolean {
    try {
      return UserInfoEngine.Instance.GetSetting(this.ShowProjectsKey) !== 'false';
    } catch {
      return true; // engine not configured yet — default wins
    }
  }

  public static SetShowProjects(value: boolean): void {
    this.write(this.ShowProjectsKey, String(value));
  }

  /** Sidebar density. Default 'comfortable'. */
  public static get SidebarDensity(): ShellSidebarDensity {
    try {
      return UserInfoEngine.Instance.GetSetting(this.DensityKey) === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  }

  public static SetSidebarDensity(value: ShellSidebarDensity): void {
    this.write(this.DensityKey, value);
  }

  /** `MJ: User Settings` key for the W0a Chats grouping mode (S2). */
  private static readonly ChatsGroupKey = 'mj.conversations.chatsGroup.v1';

  /**
   * W0a grouping mode. Default 'project'. NOTE: callers must force 'flat' when
   * ShowProjects is off (the mockup's gating) — this getter returns the raw pref.
   */
  public static get ChatsGroupMode(): ShellChatsGroupMode {
    try {
      return UserInfoEngine.Instance.GetSetting(this.ChatsGroupKey) === 'flat' ? 'flat' : 'project';
    } catch {
      return 'project';
    }
  }

  public static SetChatsGroupMode(value: ShellChatsGroupMode): void {
    this.write(this.ChatsGroupKey, value);
  }

  /** Warm the UserInfoEngine cache. Fire-and-forget from shell init; failures leave defaults. */
  public static Warm(): void {
    UserInfoEngine.Instance.Config().catch(() => {
      /* reads fall back to defaults until the engine loads */
    });
  }

  private static write(key: string, value: string): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(key, value);
    } catch (error) {
      console.warn('[ShellPreferences] Failed to persist preference:', key, error);
    }
  }
}
