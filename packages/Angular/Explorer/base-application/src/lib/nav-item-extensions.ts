import { LogError } from '@memberjunction/core';
import { NavItem } from './interfaces/nav-item.interface';

/**
 * Prefix of the `MJ: Application Settings` names that add a nav item to an application.
 *
 * An Open App extends another application's top nav by installing an app-scoped setting row:
 * `ApplicationID` = the application to extend, `Name` = `NavItem.<unique key>` (for example
 * `NavItem.bizapps-tasks.priorities`), `Value` = one {@link NavItem} as JSON. The row ships in
 * the extending app's metadata, and its teardown deletes it, so removing the app removes the item.
 */
export const NAV_ITEM_SETTING_PREFIX = 'NavItem.';

/** Sequence of an extension nav item that does not set one: after the application's own items. */
export const DEFAULT_EXTENSION_NAV_ITEM_SEQUENCE = 1000;

/** The setting fields the merge reads. */
export interface NavItemSetting {
  Name: string;
  Value: string;
}

/** True when an application setting name declares a nav item extension. */
export function IsNavItemSettingName(name: string | null | undefined): boolean {
  return !!name && name.startsWith(NAV_ITEM_SETTING_PREFIX) && name.length > NAV_ITEM_SETTING_PREFIX.length;
}

/**
 * Parses one nav item setting. Returns null, and logs, when the value is not a JSON object with
 * a Label and a Route or ResourceType. An extension never sets the application's default item,
 * so `isDefault` is dropped.
 */
export function ParseNavItemSetting(setting: NavItemSetting): NavItem | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(setting.Value);
  } catch (e) {
    LogError(`Nav item setting "${setting.Name}" is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    LogError(`Nav item setting "${setting.Name}" must be a JSON object`);
    return null;
  }
  const item = parsed as NavItem;
  const hasTarget = (typeof item.Route === 'string' && item.Route.length > 0)
    || (typeof item.ResourceType === 'string' && item.ResourceType.length > 0);
  if (typeof item.Label !== 'string' || item.Label.trim().length === 0 || !hasTarget) {
    LogError(`Nav item setting "${setting.Name}" needs a Label and a Route or ResourceType`);
    return null;
  }
  const { isDefault: _ignored, ...rest } = item;
  return rest;
}

/**
 * The application's own nav items plus the items its nav item settings add, in Sequence order.
 *
 * An item's Sequence is its own `Sequence` when set; otherwise an application item gets
 * (position + 1) × 10 and an extension item gets {@link DEFAULT_EXTENSION_NAV_ITEM_SEQUENCE}.
 * So an extension with Sequence 15 lands between an application's first and second items. Ties
 * keep application items first, then extensions by setting name. An extension whose Label
 * matches an item already present is skipped: labels identify nav items.
 */
export function MergeNavItemExtensions(appItems: readonly NavItem[], settings: readonly NavItemSetting[]): NavItem[] {
  const ordered = appItems.map((item, index) => ({ item, sequence: item.Sequence ?? (index + 1) * 10, rank: index }));
  const labels = new Set(appItems.map((item) => item.Label));
  const extensions = settings
    .filter((s) => IsNavItemSettingName(s.Name))
    .sort((a, b) => a.Name.localeCompare(b.Name));
  for (const setting of extensions) {
    const item = ParseNavItemSetting(setting);
    if (!item) {
      continue;
    }
    if (labels.has(item.Label)) {
      LogError(`Nav item setting "${setting.Name}" is skipped: the application already has a nav item labeled "${item.Label}"`);
      continue;
    }
    labels.add(item.Label);
    ordered.push({ item, sequence: item.Sequence ?? DEFAULT_EXTENSION_NAV_ITEM_SEQUENCE, rank: ordered.length });
  }
  return ordered
    .sort((a, b) => a.sequence - b.sequence || a.rank - b.rank)
    .map((entry) => entry.item);
}
