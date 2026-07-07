/**
 * @fileoverview Per-conversation Plan Mode preference.
 *
 * Plan Mode is scoped to a CONVERSATION, not globally to the user: toggling it in one
 * conversation must not bleed into others. State is persisted server-side in a single
 * `MJ: User Settings` row (via `UserInfoEngine`, debounced writes + read-after-write
 * cache) so it survives component recreation, navigation, reloads, and sessions:
 *
 * ```json
 * { "pendingNew": true, "byConversation": { "<conversationId>": true, ... } }
 * ```
 *
 * - `pendingNew` — the toggle state chosen on a composer with NO conversation yet (the
 *   empty-state / new-conversation composer). It is CLAIMED by (moved onto) the actual
 *   conversation when its first message is routed.
 * - `byConversation` — per-conversation flags, capped at {@link MAX_TRACKED} entries
 *   (oldest dropped) so the settings row stays small. Keys are normalized UUIDs so
 *   SQL Server (uppercase) and PostgreSQL (lowercase) ids can't create duplicates.
 *
 * All composer instances (empty-state, chat-area, thread panel) and the plan-approval
 * form handler read/write through this ONE class, so they can never disagree.
 *
 * @module @memberjunction/ng-conversations
 */

import { UserInfoEngine } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';

/** Persisted shape of the plan-mode preference setting. */
interface PlanModeState {
  /** Toggle state chosen before the conversation exists (new-conversation composer). */
  pendingNew?: boolean;
  /** Per-conversation toggle states, keyed by normalized conversation ID. */
  byConversation?: Record<string, boolean>;
}

/** Static utility — all state lives in UserInfoEngine's cache; this class only parses/writes. */
export class PlanModePreference {
  /** `MJ: User Settings` key for the per-conversation plan-mode map. */
  private static readonly PrefKey = 'mj.conversations.planMode.v2';
  /** v1 stored a single global boolean — superseded by per-conversation scoping; deleted on sight. */
  private static readonly LegacyPrefKey = 'mj.conversations.planMode.v1';
  /** Cap on tracked conversations (oldest entries dropped beyond this). */
  private static readonly MAX_TRACKED = 100;

  /** Memoized parse of the raw setting string (avoids JSON.parse per change-detection pass). */
  private static rawCache: string | undefined = undefined;
  private static stateCache: PlanModeState = {};

  /**
   * Whether Plan Mode is on for the given conversation (or for the not-yet-created
   * conversation when `conversationId` is null/undefined). Synchronous cache read —
   * safe to call from Angular getters every change-detection pass.
   */
  public static IsEnabled(conversationId: string | null | undefined): boolean {
    const state = this.read();
    if (!conversationId) {
      return state.pendingNew === true;
    }
    return state.byConversation?.[NormalizeUUID(conversationId)] === true;
  }

  /** Sets Plan Mode for the given conversation (or the pending-new bucket when no id yet). */
  public static Set(conversationId: string | null | undefined, enabled: boolean): void {
    const state = { ...this.read() };
    if (!conversationId) {
      state.pendingNew = enabled;
    } else {
      state.byConversation = this.capped({
        ...(state.byConversation ?? {}),
        [NormalizeUUID(conversationId)]: enabled,
      });
    }
    this.write(state);
  }

  /**
   * Moves a `pendingNew` choice onto the actual conversation. Call when routing the FIRST
   * message of a conversation — whichever composer instance sends it claims the pending
   * value (the empty-state composer that set it never routes; it hands off via
   * `emptyStateSubmit`). No-op when nothing is pending.
   */
  public static ClaimPendingNew(conversationId: string): void {
    const state = this.read();
    if (state.pendingNew === undefined) {
      return;
    }
    const next: PlanModeState = {
      byConversation: this.capped({
        ...(state.byConversation ?? {}),
        [NormalizeUUID(conversationId)]: state.pendingNew,
      }),
    };
    this.write(next);
  }

  /**
   * Warm the UserInfoEngine cache and drop the superseded v1 (global) setting if present.
   * Fire-and-forget from component init; failures just leave the default (off).
   */
  public static Warm(): void {
    UserInfoEngine.Instance.Config()
      .then(() => {
        if (UserInfoEngine.Instance.GetSetting(this.LegacyPrefKey) !== undefined) {
          void UserInfoEngine.Instance.DeleteSetting(this.LegacyPrefKey);
        }
      })
      .catch(() => { /* reads fall back to default (off) until the engine loads */ });
  }

  /** Read + memoize the persisted state. Defensive: any failure yields the last-known state. */
  private static read(): PlanModeState {
    try {
      const raw = UserInfoEngine.Instance.GetSetting(this.PrefKey);
      if (raw !== this.rawCache) {
        this.rawCache = raw;
        this.stateCache = raw ? (JSON.parse(raw) as PlanModeState) : {};
      }
      return this.stateCache;
    } catch {
      return this.stateCache; // engine not configured yet or malformed payload
    }
  }

  private static write(state: PlanModeState): void {
    try {
      UserInfoEngine.Instance.SetSettingDebounced(this.PrefKey, JSON.stringify(state));
    } catch (error) {
      console.warn('[PlanModePreference] Failed to persist plan-mode preference:', error);
    }
  }

  /** Cap the per-conversation map, dropping the OLDEST entries (insertion order). */
  private static capped(map: Record<string, boolean>): Record<string, boolean> {
    const keys = Object.keys(map);
    if (keys.length <= this.MAX_TRACKED) {
      return map;
    }
    for (const stale of keys.slice(0, keys.length - this.MAX_TRACKED)) {
      delete map[stale];
    }
    return map;
  }
}
