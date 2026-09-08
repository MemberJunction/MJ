/**
 * @fileoverview Bridges a metadata provider row to the flat `environment` record that the
 * browser auth drivers already consume.
 *
 * Every `MJAuthBase` subclass exposes `static angularProviderFactory(environment)` and reads
 * its settings from prefixed keys on that record (`AUTH0_DOMAIN`, `WORKOS_CLIENTID`, ...).
 * Rather than rewrite each driver to accept a catalog row, the catalog is projected INTO that
 * record — so a provider configured from metadata and one configured from `environment.ts`
 * take an identical code path, and drivers keep working untouched.
 *
 * @module @memberjunction/ng-auth-services
 */

import type { PublicAuthProviderInfo } from '@memberjunction/core';

/**
 * Optional hook a provider class may expose when the generic prefixed-key convention does not
 * describe its configuration. MSAL is the built-in example: it reads unprefixed `CLIENT_ID` /
 * `CLIENT_AUTHORITY`, so it maps the catalog row itself.
 */
export interface CatalogEnvironmentMapper {
  EnvironmentFromCatalog?: (info: PublicAuthProviderInfo) => Record<string, unknown>;
}

/**
 * `redirectUri` → `REDIRECT_URI`, `apiHostname` → `API_HOSTNAME`, `userPoolId` → `USER_POOL_ID`.
 */
function camelToUpperSnake(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
}

/**
 * The environment-key prefix for a driver: `workos` → `WORKOS`, `magic-link` → `MAGIC_LINK`.
 */
function environmentPrefix(driverClass: string): string {
  return camelToUpperSnake(driverClass);
}

/**
 * Projects a catalog row onto the conventional prefixed environment keys.
 *
 * The convention — `<DRIVER>_CLIENTID`, `<DRIVER>_DOMAIN`, `<DRIVER>_SCOPES`, plus one key per
 * `clientConfiguration` entry — is exactly what the Auth0, Okta, Cognito and WorkOS drivers
 * already read, so those four need no per-driver mapping at all. A driver that deviates
 * supplies `EnvironmentFromCatalog`.
 *
 * Only defined values are emitted, so a catalog row never blanks out a key the app's compiled
 * environment legitimately supplies. `clientConfiguration` entries are projected FIRST so the
 * modelled columns win a key collision — the same precedence the server enforces in
 * `buildProviderConfig`, where a blob must not silently redefine a described, reviewable column
 * (`{"scopes": "..."}` in the blob would otherwise clobber the parsed `Scopes` column).
 */
export function buildGenericEnvironmentOverlay(info: PublicAuthProviderInfo): Record<string, unknown> {
  const prefix = environmentPrefix(info.driverClass);
  const overlay: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(info.clientConfiguration ?? {})) {
    if (value !== null && value !== undefined) {
      overlay[`${prefix}_${camelToUpperSnake(key)}`] = value;
    }
  }

  if (info.clientId) {
    overlay[`${prefix}_CLIENTID`] = info.clientId;
  }
  if (info.domain) {
    overlay[`${prefix}_DOMAIN`] = info.domain;
  }
  if (Array.isArray(info.scopes) && info.scopes.length > 0) {
    // The catalog publishes scopes pre-parsed (the server splits the delimited column at the
    // trust boundary). The drivers that read this key — Okta and Cognito — hand it straight to
    // SDK config typed `string[]`. The Array.isArray guard keeps a malformed or older server's
    // string value from reaching those SDKs: this module runs at bootstrap, where the contract
    // is degrade-to-compiled-environment, never throw.
    overlay[`${prefix}_SCOPES`] = info.scopes;
  }
  if (info.issuer) {
    overlay[`${prefix}_ISSUER`] = info.issuer;
  }

  return overlay;
}

/**
 * Produces the environment record to hand a driver for a catalog-selected provider.
 *
 * The app's compiled environment stays the base layer — it carries app-wide settings such as
 * `GRAPHQL_URI` that have nothing to do with the identity provider — and the catalog overlays
 * only the provider's own keys on top. Metadata therefore wins over a stale compiled value for
 * the settings it owns, without the catalog having to restate the whole environment.
 *
 * @param environment The app's compiled environment object.
 * @param info The provider selected from the catalog.
 * @param providerClass The resolved `MJAuthBase` subclass, consulted for a custom mapper.
 */
export function mergeCatalogEnvironment(
  environment: Record<string, unknown>,
  info: PublicAuthProviderInfo,
  providerClass?: CatalogEnvironmentMapper
): Record<string, unknown> {
  const overlay =
    typeof providerClass?.EnvironmentFromCatalog === 'function'
      ? providerClass.EnvironmentFromCatalog(info)
      : buildGenericEnvironmentOverlay(info);

  return { ...environment, ...overlay, AUTH_TYPE: info.driverClass };
}
