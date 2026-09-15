import { MMKV } from 'react-native-mmkv';

/**
 * App-level user preferences, persisted with MMKV (synchronous, fast, native).
 *
 * This is intentionally separate from the `mj-mobile-cache` instance used by
 * {@link MMKVStorageProvider} for MJ's data cache — preferences are small,
 * long-lived UI settings and shouldn't be cleared when the data cache is.
 *
 * Components read/write these reactively via react-native-mmkv's
 * `useMMKVString` / `useMMKVBoolean` hooks (pass `prefsStorage` as the instance),
 * so a change on the profile screen re-renders any other subscriber immediately.
 *
 * Phase 1 scope: the values persist now. `appearance` is honored for the choice
 * itself; full dark-theme *rendering* is a Phase 2 task (see theme/tokens.ts).
 * Voice / push / Face-ID toggles persist here so Phase 2 features can read them.
 */
export const PrefsStorage = new MMKV({ id: 'mj-mobile-prefs' });

/** @deprecated Use {@link PrefsStorage}. */
export const prefsStorage = PrefsStorage;

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

/** Order the appearance toggle advances through: System → Light → Dark → (wrap). */
export const APPEARANCE_CYCLE: AppearanceMode[] = ['system', 'light', 'dark'];

/** Human-readable label for each appearance mode. */
export const APPEARANCE_LABEL: Record<AppearanceMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** Read the current appearance mode (defaults to 'system'). */
export function GetAppearance(): AppearanceMode {
  const raw = PrefsStorage.getString(PrefKeys.appearance);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

/** @deprecated Use {@link GetAppearance}. */
export function getAppearance(): AppearanceMode {
  return GetAppearance();
}

/** Advance appearance System → Light → Dark → System and persist it. */
export function CycleAppearance(): AppearanceMode {
  const current = GetAppearance();
  const next = APPEARANCE_CYCLE[(APPEARANCE_CYCLE.indexOf(current) + 1) % APPEARANCE_CYCLE.length];
  PrefsStorage.set(PrefKeys.appearance, next);
  return next;
}

/** @deprecated Use {@link CycleAppearance}. */
export function cycleAppearance(): AppearanceMode {
  return CycleAppearance();
}

/** Persist the chosen default agent (the one that answers without an @mention). */
export function SetDefaultAgent(id: string, name: string): void {
  PrefsStorage.set(PrefKeys.defaultAgentId, id);
  PrefsStorage.set(PrefKeys.defaultAgentName, name);
}

/** @deprecated Use {@link SetDefaultAgent}. */
export function setDefaultAgent(id: string, name: string): void {
  return SetDefaultAgent(id, name);
}

/** Read the persisted default-agent display name, or `undefined` if unset. */
export function GetDefaultAgentName(): string | undefined {
  return PrefsStorage.getString(PrefKeys.defaultAgentName);
}

/** @deprecated Use {@link GetDefaultAgentName}. */
export function getDefaultAgentName(): string | undefined {
  return GetDefaultAgentName();
}

/** Read the persisted default-agent id, or `undefined` if unset. */
export function GetDefaultAgentId(): string | undefined {
  return PrefsStorage.getString(PrefKeys.defaultAgentId);
}

/** @deprecated Use {@link GetDefaultAgentId}. */
export function getDefaultAgentId(): string | undefined {
  return GetDefaultAgentId();
}
