/**
 * @fileoverview The user's own choice of how much of each channel the agent may perceive.
 *
 * Exposure policy has four layers (see `ResolveChannelExposure` in `@memberjunction/ai-core-plus`); the
 * fourth is the USER's, set from the "agent can see" control in the realtime overlay and remembered per
 * channel key so a person who turned the agent's view of their whiteboard off does not have to do it
 * again next call.
 *
 * Where it is remembered is the host's business, which is why this is an interface: the runtime is
 * framework-neutral and does not know whether the person is signed in. Signed-in hosts back it with the
 * user's persisted settings (`mj.realtime.visualPerception.v1`, via `UserInfoEngine`); an anonymous
 * principal or a connect-only embed has no settings to write to and uses the in-memory store, so the
 * choice lasts for the page and no longer.
 *
 * @module @memberjunction/realtime-runtime
 */

import { UserInfoEngine } from '@memberjunction/core-entities';
import { IsExposureLevel, NormalizeChannelKey, type RealtimeChannelExposure } from '@memberjunction/ai-core-plus';

/**
 * The `UserInfoEngine` setting key the choices are persisted under, per user. The `v1` is the shape of
 * the stored JSON ({@link SerializeExposurePreferences}); bump it if that shape ever changes so old
 * values can be read and migrated rather than misread.
 */
export const VISUAL_PERCEPTION_SETTING_KEY = 'mj.realtime.visualPerception.v1';

/** Where the user's per-channel exposure choices are kept. */
export interface IChannelExposurePreferences {
  /** The user's choice for a channel (key matched case-insensitively), or `undefined` when they made none. */
  Get(channelKey: string): RealtimeChannelExposure | undefined;
  /** Records the user's choice for a channel. `undefined` clears it (back to "no choice"). */
  Set(channelKey: string, level: RealtimeChannelExposure | undefined): void;
}

/**
 * Reads persisted choices tolerantly: a hand-edited or corrupt value contributes nothing (never throws), and
 * only valid levels survive. Keys come back normalized.
 *
 * @param json The stored setting value, or `undefined`/`null`/blank when there is none.
 */
export function ParseExposurePreferences(json: string | null | undefined): Map<string, RealtimeChannelExposure> {
  const result = new Map<string, RealtimeChannelExposure>();
  if (typeof json !== 'string' || json.trim().length === 0) {
    return result;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return result;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return result;
  }
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const id = NormalizeChannelKey(key);
    if (id.length > 0 && IsExposureLevel(value)) {
      result.set(id, value);
    }
  }
  return result;
}

/**
 * Serializes choices for persistence. Only the choices themselves are stored (`{"whiteboard":"state"}`):
 * a channel the user never touched has no entry, so a later change to a channel's default is not
 * frozen in by an old write.
 */
export function SerializeExposurePreferences(preferences: ReadonlyMap<string, RealtimeChannelExposure>): string {
  const record: Record<string, RealtimeChannelExposure> = {};
  for (const [key, level] of preferences) {
    record[key] = level;
  }
  return JSON.stringify(record);
}

/** The default store: choices last for this object's lifetime only. */
export class InMemoryChannelExposurePreferences implements IChannelExposurePreferences {
  private readonly values = new Map<string, RealtimeChannelExposure>();

  public Get(channelKey: string): RealtimeChannelExposure | undefined {
    return this.values.get(NormalizeChannelKey(channelKey));
  }

  public Set(channelKey: string, level: RealtimeChannelExposure | undefined): void {
    const id = NormalizeChannelKey(channelKey);
    if (level === undefined) {
      this.values.delete(id);
    } else {
      this.values.set(id, level);
    }
  }
}

/**
 * The default store: persisted in the signed-in user's settings (`MJ: User Settings`, key
 * {@link VISUAL_PERCEPTION_SETTING_KEY}) via `UserInfoEngine`, so the choice follows the person across
 * devices; kept in memory when there is no user to persist for (an anonymous principal, a connect-only embed).
 *
 * Writes always go to memory first, so a choice takes effect and is read back even if persisting it
 * fails or is not possible. Reads prefer the persisted value when persistence is available, since
 * `UserInfoEngine.GetSetting` is a synchronous cache hit that already reflects a pending debounced write.
 */
export class UserSettingsExposurePreferences implements IChannelExposurePreferences {
  private readonly memory = new InMemoryChannelExposurePreferences();
  private warnedAboutRead = false;

  /** @param canPersist Whether user settings can be read and written right now (a signed-in user on a metadata-bearing provider). */
  constructor(private readonly canPersist: () => boolean) {}

  public Get(channelKey: string): RealtimeChannelExposure | undefined {
    if (!this.canPersist()) {
      return this.memory.Get(channelKey);
    }
    return this.readPersisted().get(NormalizeChannelKey(channelKey)) ?? this.memory.Get(channelKey);
  }

  public Set(channelKey: string, level: RealtimeChannelExposure | undefined): void {
    this.memory.Set(channelKey, level);
    if (!this.canPersist()) {
      return;
    }
    const persisted = this.readPersisted();
    const id = NormalizeChannelKey(channelKey);
    if (level === undefined) {
      persisted.delete(id);
    } else {
      persisted.set(id, level);
    }
    UserInfoEngine.Instance.SetSettingDebounced(VISUAL_PERCEPTION_SETTING_KEY, SerializeExposurePreferences(persisted));
  }

  /** The persisted choices; empty (and logged once) when the settings cache cannot be read. */
  private readPersisted(): Map<string, RealtimeChannelExposure> {
    try {
      return ParseExposurePreferences(UserInfoEngine.Instance.GetSetting(VISUAL_PERCEPTION_SETTING_KEY));
    } catch (error) {
      if (!this.warnedAboutRead) {
        this.warnedAboutRead = true;
        console.warn('[RealtimeSession] Could not read the saved visual-perception choices; using this page\'s choices only:', error);
      }
      return new Map();
    }
  }
}
