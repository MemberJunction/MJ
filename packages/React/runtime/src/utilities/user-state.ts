/**
 * @fileoverview Helpers for the per-user interactive-component settings contract
 * (`savedUserSettings` in / `onSaveUserSettings` out).
 *
 * These helpers are intentionally **pure and framework-agnostic** so the Angular
 * host bridge and the Node test harness share one implementation and the scoping /
 * serialization logic can be unit tested in isolation. The host wires these to a
 * durable per-user store (e.g. `UserInfoEngine`); the runtime itself never persists.
 *
 * @module @memberjunction/react-runtime
 */

/**
 * Prefix applied to every interactive-component user-settings storage key. The
 * full key is `ic.<scope>`, where `<scope>` is resolved by
 * {@link resolveUserStateScope}. Keeping the prefix in one place avoids
 * stringly-typed drift between the seed (read) and persist (write) paths.
 */
export const USER_STATE_KEY_PREFIX = 'ic.';

/**
 * Resolve the stable per-component scope used to namespace a component's
 * persisted user settings.
 *
 * An explicit, host-supplied scope always wins (used when a host needs to
 * differentiate two instances of the same component spec — e.g. scope a form's
 * settings by the entity it edits). Otherwise the scope is derived from the
 * component spec's `namespace` + `name`.
 *
 * The result is lowercased to avoid case-variant duplicate rows in the settings
 * store (per MJ's user-settings key convention).
 *
 * @returns the resolved scope, or `null` when no stable scope can be derived
 *          (e.g. an unnamed component) — signaling the caller to skip persistence.
 */
export function resolveUserStateScope(
  explicitScope: string | undefined | null,
  namespace: string | undefined | null,
  name: string | undefined | null
): string | null {
  const explicit = explicitScope?.trim();
  if (explicit) {
    return explicit.toLowerCase();
  }
  const cleanName = name?.trim();
  if (!cleanName) {
    return null;
  }
  const cleanNamespace = namespace?.trim();
  const scope = cleanNamespace ? `${cleanNamespace}/${cleanName}` : cleanName;
  return scope.toLowerCase();
}

/**
 * Build the full storage key for a resolved scope, or `null` when the scope is
 * `null` (persistence should be skipped).
 */
export function userStateStorageKey(scope: string | null): string | null {
  return scope ? `${USER_STATE_KEY_PREFIX}${scope}` : null;
}

/**
 * Safely parse a stored settings blob into a plain object. Returns `{}` for
 * null/empty input, invalid JSON, or any non-object JSON (arrays, primitives) —
 * persisted user settings are always a flat key/value object.
 */
export function parseStoredUserSettings(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Merge host-provided defaults with the stored per-user settings. Stored values
 * win, so a returning user sees their saved preferences while a host can still
 * seed sensible first-run defaults that fill any gaps.
 */
export function mergeUserSettings(
  hostDefaults: Record<string, unknown> | undefined | null,
  stored: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  return { ...(hostDefaults ?? {}), ...(stored ?? {}) };
}
