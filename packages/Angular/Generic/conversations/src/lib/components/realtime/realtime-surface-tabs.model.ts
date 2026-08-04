import { Subject } from 'rxjs';
import type { TemplateRef } from '@angular/core';
import type { BaseRealtimeChannelClient } from './channels/base-realtime-channel-client';
import { ChannelTabColor } from './realtime-surface-tab-style';

/**
 * The kind of a surface-panel tab:
 *  - `activity` — the session-activity tab (pinned LAST, right-aligned). Hosts the activity
 *    rail AND, since the artifact redesign, the inline artifact previews + the split-pane
 *    artifact viewer. Shown only once ≥1 agent run has occurred (see
 *    {@link RealtimeSurfaceTabsModel.SetShowActivityTab}).
 *  - `channel`  — an interactive-channel surface (e.g. the Whiteboard). Registered per
 *    used channel via {@link RealtimeSurfaceTabsModel.RegisterChannelTab}; renders the
 *    plugin's dynamically-created surface component (or a registered template for
 *    legacy/template-based panes), with the "coming online…" placeholder until either
 *    is supplied.
 *
 * NOTE: artifacts NO LONGER get their own tab. A delegated run's artifacts now render
 * INSIDE the Activity tab (inline previews + an `as-split` viewer pane) — see
 * `RealtimeActivityRailComponent`.
 */
export type RealtimeSurfaceTabKind = 'activity' | 'channel';

/**
 * Per-kind payload carried on a {@link RealtimeSurfaceTab}.
 */
export interface RealtimeSurfaceTabData {
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
 * One tab on the call overlay's tabbed surface panel (the right panel): a channel surface
 * (left cluster) or the session-activity tab (right-aligned).
 */
export interface RealtimeSurfaceTab {
  /** Stable unique key (`activity`, or the channel's registered key). */
  Key: string;
  /** Tab strip label (channel name, or "Activity"). */
  Title: string;
  /** Font Awesome icon class for the tab strip (e.g. `fa-solid fa-chalkboard`). */
  Icon: string;
  /** What the tab renders. */
  Kind: RealtimeSurfaceTabKind;
  /**
   * Accent color for the tab's dot + active underline. Channel tabs carry a distinct color
   * (plugin-supplied or a deterministic hash of the name); the Activity tab uses its own
   * fixed accent in CSS, so its `Color` is left undefined.
   */
  Color?: string;
  /** Kind-specific payload. */
  Data?: RealtimeSurfaceTabData;
}

/**
 * Registration for an interactive-channel tab. The overlay shell registers one per
 * USED channel plugin (supplying {@link Plugin}); supplying {@link Plugin} or
 * {@link Content} later under the same `Key` upgrades a placeholder tab to the real surface.
 */
export interface RealtimeChannelTabRegistration {
  /** Stable channel key (the plugin's `ChannelName`, e.g. `Whiteboard`). Re-registering the same key updates the tab. */
  Key: string;
  /** Tab strip label (e.g. `Whiteboard`). */
  Title: string;
  /** Font Awesome icon class (e.g. `fa-solid fa-chalkboard`). */
  Icon: string;
  /**
   * Optional explicit accent color for the tab. When omitted, a deterministic color is
   * derived from {@link Key} so every channel tab still reads as a distinct surface.
   */
  Color?: string | null;
  /** The channel plugin whose surface the pane creates + binds. Preferred over {@link Content}. */
  Plugin?: BaseRealtimeChannelClient;
  /** A template-based pane body (legacy/bespoke panes). Omit both to show the "coming online…" placeholder. */
  Content?: TemplateRef<unknown>;
  /** Focus the tab immediately after registration (default `false`). */
  Focus?: boolean;
}

/**
 * Framework-free state for the call overlay's tabbed surface panel: the ordered tab list
 * (CHANNEL tabs first — the marquee surfaces, left cluster — with the session-activity tab
 * pinned LAST and right-aligned by the strip), the active tab, and the transient "flash"
 * highlight for a just-revealed channel tab.
 *
 * The Activity tab is GATED: it isn't listed until {@link SetShowActivityTab}(true) — i.e.
 * once ≥1 agent run has occurred (or in review mode). Channel tabs appear only as channels
 * come into play (the whiteboard up-front; every other channel on first use), so an
 * idle voice-first session shows an empty/near-empty strip rather than a row of unused tabs.
 *
 * Owned by `RealtimeSurfaceTabsComponent`; kept free of Angular runtime imports so the
 * add / focus / dedupe / flash logic is unit-testable in isolation. All collections are
 * REPLACED (never mutated) on change, and every change emits {@link Changed$}.
 */
export class RealtimeSurfaceTabsModel {
  /** The fixed key of the session-activity tab (pinned LAST, right-aligned). */
  public static readonly ActivityTabKey = 'activity';

  /** The activity tab definition, appended last whenever {@link showActivity} is true. */
  private static readonly ActivityTab: RealtimeSurfaceTab = {
    Key: RealtimeSurfaceTabsModel.ActivityTabKey,
    Title: 'Activity',
    Icon: 'fa-solid fa-wave-square',
    Kind: 'activity'
  };

  /** Channel tabs (left cluster), in registration order. Replaced immutably on change. */
  private channelTabs: RealtimeSurfaceTab[] = [];

  /** Whether the gated Activity tab is currently shown (≥1 agent run, or review mode). */
  private showActivity = false;

  /** Key of the currently focused tab. */
  public ActiveKey: string = RealtimeSurfaceTabsModel.ActivityTabKey;

  /**
   * Key of the tab currently "flashing" (the brief highlight a just-revealed channel tab
   * gets when the agent first acts on it). Cleared by the owning component after a beat via
   * {@link ClearFlash}.
   */
  public FlashKey: string | null = null;

  /** Emits after every model change so the owning component can mark for check. */
  public readonly Changed$ = new Subject<void>();

  /**
   * The ordered tabs: channel tabs (left), then the Activity tab LAST when shown. The strip
   * right-aligns the Activity tab via a flex spacer, so this order also matches reading order.
   */
  public get Tabs(): RealtimeSurfaceTab[] {
    return this.showActivity
      ? [...this.channelTabs, RealtimeSurfaceTabsModel.ActivityTab]
      : [...this.channelTabs];
  }

  /** Whether the Activity tab is currently part of the strip. */
  public get IsActivityShown(): boolean {
    return this.showActivity;
  }

  /**
   * The currently focused tab. Resolves to the active key when it still exists, else falls
   * back to the Activity tab (when shown), else the first channel tab, else the Activity tab
   * definition (so a consumer always has SOMETHING to render even on an empty strip).
   */
  public get ActiveTab(): RealtimeSurfaceTab {
    const tabs = this.Tabs;
    return tabs.find(t => t.Key === this.ActiveKey)
      ?? tabs.find(t => t.Key === RealtimeSurfaceTabsModel.ActivityTabKey)
      ?? tabs[0]
      ?? RealtimeSurfaceTabsModel.ActivityTab;
  }

  /**
   * Shows or hides the gated Activity tab. Turning it ON when an empty strip was implicitly
   * focusing Activity keeps focus on Activity; turning it OFF while it was focused falls
   * focus back to the first channel tab (if any). No-op (no emission) when unchanged.
   *
   * @param show Whether ≥1 agent run has occurred (or review mode) — the gate.
   */
  public SetShowActivityTab(show: boolean): void {
    if (this.showActivity === show) {
      return;
    }
    this.showActivity = show;
    if (!show && this.ActiveKey === RealtimeSurfaceTabsModel.ActivityTabKey) {
      this.ActiveKey = this.channelTabs[0]?.Key ?? RealtimeSurfaceTabsModel.ActivityTabKey;
    }
    this.Changed$.next();
  }

  /**
   * Registers (or updates) an interactive-channel tab. Re-registering an existing key
   * replaces its title/icon/color/plugin/content in place (this is how a placeholder
   * upgrades to the real surface once the channel comes online). New channel tabs join the
   * left cluster in registration order. A registration without an explicit {@link
   * RealtimeChannelTabRegistration.Color} gets a deterministic color from its key.
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
      Color: registration.Color ?? ChannelTabColor(registration.Key),
      Data: { Plugin: registration.Plugin, Content: registration.Content }
    };
    const idx = this.channelTabs.findIndex(t => t.Key === registration.Key);
    if (idx >= 0) {
      const next = [...this.channelTabs];
      next[idx] = tab;
      this.channelTabs = next;
    } else {
      this.channelTabs = [...this.channelTabs, tab];
    }
    if (registration.Focus) {
      this.ActiveKey = tab.Key;
    }
    this.Changed$.next();
    return tab;
  }

  /** Focuses the tab with `key` (no-op when it doesn't exist or is already active). */
  public Focus(key: string): void {
    if (!this.Tabs.some(t => t.Key === key) || this.ActiveKey === key) {
      return;
    }
    this.ActiveKey = key;
    this.Changed$.next();
  }

  /**
   * Marks the tab with `key` as the {@link FlashKey} (the brief "just arrived" highlight)
   * WITHOUT changing focus — used by the auto-reveal path when the agent first acts on a
   * channel, so the user's eye lands on the tab that just came alive. No-op for unknown
   * keys; the owning component clears it after a beat via {@link ClearFlash}.
   */
  public FlashTab(key: string): void {
    if (this.FlashKey === key || !this.Tabs.some(t => t.Key === key)) {
      return;
    }
    this.FlashKey = key;
    this.Changed$.next();
  }

  /**
   * Removes the channel tab with `key`. Rules:
   *  - the Activity tab is IRREMOVABLE — removing it is a no-op;
   *  - an unknown key is a no-op (returns `false`);
   *  - when the removed tab was focused, focus falls back to the Activity tab (if shown),
   *    else the first remaining channel tab;
   *  - a pending flash on the removed tab is cleaned up so the highlight can't dangle.
   *
   * @param key The tab key to remove.
   * @returns `true` when a tab was removed.
   */
  public RemoveTab(key: string): boolean {
    if (key === RealtimeSurfaceTabsModel.ActivityTabKey || !this.channelTabs.some(t => t.Key === key)) {
      return false;
    }
    this.channelTabs = this.channelTabs.filter(t => t.Key !== key);
    if (this.ActiveKey === key) {
      this.ActiveKey = this.showActivity
        ? RealtimeSurfaceTabsModel.ActivityTabKey
        : (this.channelTabs[0]?.Key ?? RealtimeSurfaceTabsModel.ActivityTabKey);
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
