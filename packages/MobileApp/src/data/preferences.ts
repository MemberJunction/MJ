import { MMKV } from 'react-native-mmkv';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * App-level user preferences, persisted to `MJ: User Settings` via
 * {@link UserInfoEngine} with a local MMKV mirror (`PrefsStorage`) for
 * synchronous, zero-flash reads on cold boot and reactive UI subscriptions via
 * `useMMKVString` / `useMMKVBoolean`.
 */
export const PrefsStorage = new MMKV({ id: 'mj-mobile-prefs' });

/** The three appearance choices a user can select (`'system'` follows the OS). */
export type AppearanceMode = 'light' | 'dark' | 'system';

/** Canonical MMKV key names for each persisted preference. */
export const PrefKeys = {
  appearance: 'pref.appearance',
  defaultAgentId: 'pref.defaultAgentId',
  defaultAgentName: 'pref.defaultAgentName',
  voiceResponses: 'pref.voiceResponses',
  pushNotifications: 'pref.pushNotifications',
  faceIdLock: 'pref.faceIdLock',
} as const;

/** Server-side `MJ: User Settings` keys synced through `UserInfoEngine`. */
export const ServerSettingKeys = {
  appearance: 'mobile.appearance',
  defaultAgentId: 'mobile.defaultAgentId',
  defaultAgentName: 'mobile.defaultAgentName',
} as const;

/** Order the appearance toggle advances through: System → Light → Dark → (wrap). */
export const APPEARANCE_CYCLE: AppearanceMode[] = ['system', 'light', 'dark'];

/** Human-readable label for each appearance mode. */
export const APPEARANCE_LABEL: Record<AppearanceMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function syncToUserInfoEngine(settingKey: string, value: string): void {
  try {
    if (UserInfoEngine.Instance.LoadedForUserId) {
      UserInfoEngine.Instance.SetSettingDebounced(settingKey, value);
    }
  } catch {
    // Non-fatal when called outside an authenticated MJ session or in unit tests.
  }
}

/** Read the current appearance mode (defaults to 'system'). */
export function GetAppearance(): AppearanceMode {
  const raw = PrefsStorage.getString(PrefKeys.appearance);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

/** Advance appearance System → Light → Dark → System and persist it. */
export function CycleAppearance(): AppearanceMode {
  const current = GetAppearance();
  const next = APPEARANCE_CYCLE[(APPEARANCE_CYCLE.indexOf(current) + 1) % APPEARANCE_CYCLE.length];
  PrefsStorage.set(PrefKeys.appearance, next);
  syncToUserInfoEngine(ServerSettingKeys.appearance, next);
  return next;
}

/** Persist the chosen default agent (the one that answers without an @mention). */
export function SetDefaultAgent(id: string, name: string): void {
  PrefsStorage.set(PrefKeys.defaultAgentId, id);
  PrefsStorage.set(PrefKeys.defaultAgentName, name);
  syncToUserInfoEngine(ServerSettingKeys.defaultAgentId, id);
  syncToUserInfoEngine(ServerSettingKeys.defaultAgentName, name);
}

/** Read the persisted default-agent display name, or `undefined` if unset. */
export function GetDefaultAgentName(): string | undefined {
  return PrefsStorage.getString(PrefKeys.defaultAgentName);
}

/** Read the persisted default-agent id, or `undefined` if unset. */
export function GetDefaultAgentId(): string | undefined {
  return PrefsStorage.getString(PrefKeys.defaultAgentId);
}

/**
 * Hydrate the local MMKV preference mirror from `UserInfoEngine.Instance` (`MJ: User Settings`)
 * once the authenticated session has finished booting.
 */
export function SyncPreferencesFromServer(): void {
  try {
    if (!UserInfoEngine.Instance.LoadedForUserId) return;
    const appearance = UserInfoEngine.Instance.GetSetting(ServerSettingKeys.appearance);
    if (appearance === 'light' || appearance === 'dark' || appearance === 'system') {
      PrefsStorage.set(PrefKeys.appearance, appearance);
    }
    const agentId = UserInfoEngine.Instance.GetSetting(ServerSettingKeys.defaultAgentId);
    const agentName = UserInfoEngine.Instance.GetSetting(ServerSettingKeys.defaultAgentName);
    if (agentId && agentName) {
      PrefsStorage.set(PrefKeys.defaultAgentId, agentId);
      PrefsStorage.set(PrefKeys.defaultAgentName, agentName);
    }
  } catch {
    // Non-fatal if settings cannot be read in a permission-constrained session.
  }
}

/**
 * Clear per-user preferences from the local MMKV mirror on `signOut()`.
 * Preserves the installation's `mobile.pushDeviceId` while wiping user-scoped choices.
 */
export function ClearUserPreferences(): void {
  PrefsStorage.delete(PrefKeys.appearance);
  PrefsStorage.delete(PrefKeys.defaultAgentId);
  PrefsStorage.delete(PrefKeys.defaultAgentName);
  PrefsStorage.delete(PrefKeys.voiceResponses);
  PrefsStorage.delete(PrefKeys.pushNotifications);
  PrefsStorage.delete(PrefKeys.faceIdLock);
}
