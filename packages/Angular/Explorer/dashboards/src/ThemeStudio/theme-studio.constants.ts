/**
 * @fileoverview Shared constants for the Theme Studio + Theme Manager.
 * @module ThemeStudio
 */

/**
 * The seeded, built-in MemberJunction theme (created by migration
 * V202607202101__v5.49.x__Add_Theme_Entity.sql with this stable, hardcoded ID).
 * It is protected from edit and delete so there is always a safe fallback theme,
 * regardless of what the user does to their own themes. Duplicating it is allowed.
 */
export const MJ_BUILTIN_THEME_ID = '64A6B519-CFBA-4F25-98D4-8398D397E21C';

/** Whether a theme id is the protected built-in MemberJunction theme (case-insensitive). */
export function isBuiltInTheme(id: string | null | undefined): boolean {
  return !!id && id.toUpperCase() === MJ_BUILTIN_THEME_ID;
}

/**
 * Real MJ chrome selectors a themer can target from Custom CSS — component element
 * tags (Angular selectors) + the shell logo class. Offered for autocomplete alongside
 * the derived `--mj-*` tokens. Curated to the persistent chrome worth theming (not
 * transient dialogs/resources). Element tags are reliable targets; internal component
 * classes are view-encapsulated and generally not selectable from an overlay.
 */
export const MJ_CHROME_SELECTORS: string[] = [
  'mj-shell',
  'mj-app-nav',
  'mj-app-switcher',
  'mj-tab-container',
  'mj-single-dashboard',
  'mj-single-record',
  'mj-single-query',
  'mj-single-search-result',
  'mj-command-palette',
  'mj-omnibar-palette',
  'mj-notifications-resource',
  'mj-empty-state',
  'mj-loading',
  'mj-dialog',
  'mj-dialog-actions',
  'mj-profile-dialog',
  'mj-server-connectivity-banner',
  'mj-system-validation-banner',
  '.mj-logo',
];
