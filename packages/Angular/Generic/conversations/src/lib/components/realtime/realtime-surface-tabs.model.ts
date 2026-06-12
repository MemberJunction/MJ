import { Subject } from 'rxjs';
import type { TemplateRef } from '@angular/core';
import type { BaseRealtimeChannelClient } from './channels/base-realtime-channel-client';
import { ParsedDelegationArtifact } from '../../services/delegation-result-parser';

/**
 * The kind of a surface-panel tab:
 *  - `activity` — the always-present first tab hosting the session activity rail.
 *  - `artifact` — one tab per artifact produced by a delegated run (auto-opened on arrival).
 *  - `channel`  — an interactive-channel surface (e.g. the Whiteboard). Registered per
 *    registry-resolved plugin via {@link RealtimeSurfaceTabsModel.RegisterChannelTab};
 *    renders the plugin's dynamically-created surface component (or a registered template
 *    for legacy/template-based panes), with the "coming online…" placeholder until either
 *    is supplied.
 */
export type RealtimeSurfaceTabKind = 'activity' | 'artifact' | 'channel';

/**
 * Per-kind payload carried on a {@link RealtimeSurfaceTab}.
 */
export interface RealtimeSurfaceTabData {
  /** For `artifact` tabs: the artifact this tab views (loaded by ArtifactID, latest version). */
  Artifact?: ParsedDelegationArtifact;
  /**
   * For `channel` tabs: the channel PLUGIN whose surface component the pane creates
   * dynamically (and binds back to the plugin) — the registry-driven path every real
   * channel uses. Takes precedence over {@link Content}.
   */
  Plugin?: BaseRealtimeChannelClient;
  /**
   * For `channel` tabs: a TEMPLATE-based pane body. Backward-compatible alternative to
   * {@link Plugin} for hosts that render a bespoke surface without a channel plugin.
   * When BOTH are absent the pane renders the built-in "coming online…" placeholder.
   */
  Content?: TemplateRef<unknown>;
}

/**
 * One tab on the call overlay's tabbed surface panel (the right panel): Activity, an
 * artifact viewer, or an interactive-channel surface.
 */
export interface RealtimeSurfaceTab {
  /** Stable unique key (`activity`, `artifact:<versionId>`, or the channel's registered key). */
  Key: string;
  /** Tab strip label (artifact tabs use the artifact's name). */
  Title: string;
  /** Font Awesome icon class for the tab strip (e.g. `fa-solid fa-file-lines`). */
  Icon: string;
  /** What the tab renders. */
  Kind: RealtimeSurfaceTabKind;
  /** Kind-specific payload. */
  Data?: RealtimeSurfaceTabData;
}

/**
 * Registration for an interactive-channel tab. The overlay shell registers one per
 * registry-resolved channel plugin (supplying {@link Plugin}); supplying {@link Plugin}
 * or {@link Content} later under the same `Key` upgrades a placeholder tab to the real
 * surface.
 */
export interface RealtimeChannelTabRegistration {
  /** Stable channel key (the plugin's `ChannelName`, e.g. `Whiteboard`). Re-registering the same key updates the tab. */
  Key: string;
  /** Tab strip label (e.g. `Whiteboard`). */
  Title: string;
  /** Font Awesome icon class (e.g. `fa-solid fa-chalkboard`). */
  Icon: string;
  /** The channel plugin whose surface the pane creates + binds. Preferred over {@link Content}. */
  Plugin?: BaseRealtimeChannelClient;
  /** A template-based pane body (legacy/bespoke panes). Omit both to show the "coming online…" placeholder. */
  Content?: TemplateRef<unknown>;
  /** Focus the tab immediately after registration (default `false`). */
  Focus?: boolean;
}

/**
 * Framework-free state for the call overlay's tabbed surface panel: the ordered tab list
 * (Activity always first, then artifact tabs in arrival order, then channel tabs), the
 * active tab, and the transient "flash" highlight for a just-arrived tab.
 *
 * Owned by `RealtimeSurfaceTabsComponent`; kept free of Angular runtime imports so the
 * add / focus / dedupe / flash logic is unit-testable in isolation. All collections are
 * REPLACED (never mutated) on change, and every change emits {@link Changed$}.
 */
export class RealtimeSurfaceTabsModel {
  /** The fixed key of the always-present Activity tab. */
  public static readonly ActivityTabKey = 'activity';

  /** The ordered tabs (Activity first). Replaced immutably on every change. */
  public Tabs: RealtimeSurfaceTab[] = [
    { Key: RealtimeSurfaceTabsModel.ActivityTabKey, Title: 'Activity', Icon: 'fa-solid fa-list-check', Kind: 'activity' }
  ];

  /** Key of the currently focused tab. */
  public ActiveKey: string = RealtimeSurfaceTabsModel.ActivityTabKey;

  /**
   * Key of the tab currently "flashing" (the brief violet highlight a just-arrived
   * artifact tab gets, per the mockup). Cleared by the owning component after a beat
   * via {@link ClearFlash}.
   */
  public FlashKey: string | null = null;

  /** Emits after every model change so the owning component can mark for check. */
  public readonly Changed$ = new Subject<void>();

  /** The currently focused tab (always resolvable — Activity is never removed). */
  public get ActiveTab(): RealtimeSurfaceTab {
    return this.Tabs.find(t => t.Key === this.ActiveKey) ?? this.Tabs[0];
  }

  /** The stable tab key for an artifact (one tab per produced artifact VERSION). */
  public static ArtifactTabKey(artifact: ParsedDelegationArtifact): string {
    return `artifact:${artifact.ArtifactVersionID}`;
  }

  /**
   * Opens (or re-focuses) the tab for an artifact a delegated run produced.
   *
   * First arrival: appends an `artifact` tab (after existing artifact tabs, before channel
   * tabs), marks it as the {@link FlashKey}, and — when `focus` is true (the default,
   * per the auto-open-on-arrival behavior) — makes it the active tab. Subsequent calls
   * for the same artifact version just focus the existing tab (no duplicate, no re-flash).
   *
   * @param artifact The produced artifact (id + version id + display name).
   * @param focus Whether to focus the tab (default `true`).
   * @returns The (new or existing) tab.
   */
  public OpenArtifactTab(artifact: ParsedDelegationArtifact, focus: boolean = true): RealtimeSurfaceTab {
    const key = RealtimeSurfaceTabsModel.ArtifactTabKey(artifact);
    const existing = this.Tabs.find(t => t.Key === key);
    if (existing) {
      if (focus) {
        this.Focus(key);
      }
      return existing;
    }
    const tab: RealtimeSurfaceTab = {
      Key: key,
      Title: artifact.Name,
      Icon: 'fa-solid fa-file-lines',
      Kind: 'artifact',
      Data: { Artifact: artifact }
    };
    // Insert before any channel tabs so the strip reads Activity | artifacts… | channels….
    const firstChannel = this.Tabs.findIndex(t => t.Kind === 'channel');
    const at = firstChannel >= 0 ? firstChannel : this.Tabs.length;
    this.Tabs = [...this.Tabs.slice(0, at), tab, ...this.Tabs.slice(at)];
    this.FlashKey = key;
    if (focus) {
      this.ActiveKey = key;
    }
    this.Changed$.next();
    return tab;
  }

  /**
   * Registers (or updates) an interactive-channel tab. Re-registering an existing key
   * replaces its title/icon/plugin/content in place (this is how a placeholder upgrades
   * to the real surface once the channel comes online).
   *
   * @param registration The channel tab registration.
   * @returns The (new or updated) tab.
   */
  public RegisterChannelTab(registration: RealtimeChannelTabRegistration): RealtimeSurfaceTab {
    const tab: RealtimeSurfaceTab = {
      Key: registration.Key,
      Title: registration.Title,
      Icon: registration.Icon,
      Kind: 'channel',
      Data: { Plugin: registration.Plugin, Content: registration.Content }
    };
    const idx = this.Tabs.findIndex(t => t.Key === registration.Key);
    if (idx >= 0) {
      const next = [...this.Tabs];
      next[idx] = tab;
      this.Tabs = next;
    } else {
      this.Tabs = [...this.Tabs, tab];
    }
    if (registration.Focus) {
      this.ActiveKey = tab.Key;
    }
    this.Changed$.next();
    return tab;
  }

  /** Focuses the tab with `key` (no-op when it doesn't exist). */
  public Focus(key: string): void {
    if (this.ActiveKey === key || !this.Tabs.some(t => t.Key === key)) {
      return;
    }
    this.ActiveKey = key;
    this.Changed$.next();
  }

  /**
   * Removes the tab with `key`. Rules:
   *  - the Activity tab is IRREMOVABLE (always the panel's first tab) — removing it is a no-op;
   *  - an unknown key is a no-op (returns `false`);
   *  - when the removed tab was focused, focus falls back to the Activity tab;
   *  - a pending flash on the removed tab is cleaned up so the highlight can't dangle.
   *
   * @param key The tab key to remove.
   * @returns `true` when a tab was removed.
   */
  public RemoveTab(key: string): boolean {
    if (key === RealtimeSurfaceTabsModel.ActivityTabKey || !this.Tabs.some(t => t.Key === key)) {
      return false;
    }
    this.Tabs = this.Tabs.filter(t => t.Key !== key);
    if (this.ActiveKey === key) {
      this.ActiveKey = RealtimeSurfaceTabsModel.ActivityTabKey;
    }
    if (this.FlashKey === key) {
      this.FlashKey = null;
    }
    this.Changed$.next();
    return true;
  }

  /** Clears the transient flash highlight (called by the component after a beat). */
  public ClearFlash(): void {
    if (this.FlashKey !== null) {
      this.FlashKey = null;
      this.Changed$.next();
    }
  }
}

/**
 * Pure decision helper for the REVIEW→LIVE continuation edge: should the overlay REMOVE the
 * review-registered (template-based, read-only) Whiteboard tab?
 *
 * Yes only when ALL hold:
 *  - a live session is active (the channel set emission belongs to a real session start, not
 *    the initial/teardown `[]` replay);
 *  - review mode actually registered a whiteboard tab (otherwise there is nothing stale);
 *  - the live session's resolved channel set has NO Whiteboard channel — when it HAS one, the
 *    live plugin re-registers the same tab key and upgrades the pane in place instead.
 *
 * Review ARTIFACT tabs are deliberately NOT removed — they are wanted carryover.
 *
 * Kept framework-free (like the model) so the rule is unit-testable in isolation.
 */
export function ShouldRemoveReviewWhiteboardTab(
  liveSessionActive: boolean,
  reviewWhiteboardTabRegistered: boolean,
  liveChannels: ReadonlyArray<{ ChannelName: string }>
): boolean {
  if (!liveSessionActive || !reviewWhiteboardTabRegistered) {
    return false;
  }
  return !liveChannels.some(c => c.ChannelName?.trim().toLowerCase() === 'whiteboard');
}
