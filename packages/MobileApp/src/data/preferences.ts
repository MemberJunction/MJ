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
export const prefsStorage = new MMKV({ id: 'mj-mobile-prefs' });

export type AppearanceMode = 'light' | 'dark' | 'system';

export const PrefKeys = {
  appearance: 'pref.appearance',
  defaultAgentId: 'pref.defaultAgentId',
  defaultAgentName: 'pref.defaultAgentName',
  voiceResponses: 'pref.voiceResponses',
  pushNotifications: 'pref.pushNotifications',
  faceIdLock: 'pref.faceIdLock',
} as const;

export const APPEARANCE_CYCLE: AppearanceMode[] = ['system', 'light', 'dark'];

export const APPEARANCE_LABEL: Record<AppearanceMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** Read the current appearance mode (defaults to 'system'). */
export function getAppearance(): AppearanceMode {
  const raw = prefsStorage.getString(PrefKeys.appearance);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

/** Advance appearance System → Light → Dark → System and persist it. */
export function cycleAppearance(): AppearanceMode {
  const current = getAppearance();
  const next = APPEARANCE_CYCLE[(APPEARANCE_CYCLE.indexOf(current) + 1) % APPEARANCE_CYCLE.length];
  prefsStorage.set(PrefKeys.appearance, next);
  return next;
}

/** Persist the chosen default agent (the one that answers without an @mention). */
export function setDefaultAgent(id: string, name: string): void {
  prefsStorage.set(PrefKeys.defaultAgentId, id);
  prefsStorage.set(PrefKeys.defaultAgentName, name);
}

export function getDefaultAgentName(): string | undefined {
  return prefsStorage.getString(PrefKeys.defaultAgentName);
}

export function getDefaultAgentId(): string | undefined {
  return prefsStorage.getString(PrefKeys.defaultAgentId);
}
