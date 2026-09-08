/**
 * Locks in the invariant that `AuthProviderFactory` now depends on.
 *
 * The factory used to carry a literal `import './providers/Auth0Provider.js'` roster to force
 * registration. That roster was removed because it made the built-ins look like a closed set
 * that had to be edited to add a provider — registration actually comes from importing the
 * package ENTRY POINT, which exports every provider by name.
 *
 * That makes `index.ts` load-bearing in a way nothing previously asserted: dropping a provider's
 * export would silently stop registering it, and the failure would surface only as production
 * tokens from that issuer being rejected. These tests import the entry point exactly as every
 * real consumer does, and fail loudly if an export goes missing.
 */
import { describe, it, expect } from 'vitest';

// Import the package entry point (NOT a deep path) — this is the behaviour under test.
import { AuthProviderFactory } from '../index.js';

/** Every driver key MJ ships, matching the @RegisterClass keys on the concrete providers. */
const BUILT_IN_DRIVER_KEYS = ['auth0', 'msal', 'okta', 'cognito', 'google', 'workos', 'magic-link'] as const;

describe('built-in auth provider registration via the package entry point', () => {
  it.each(BUILT_IN_DRIVER_KEYS)("registers the '%s' driver", (key) => {
    expect(AuthProviderFactory.isProviderTypeRegistered(key)).toBe(true);
  });

  it('exposes every built-in driver key through the ClassFactory', () => {
    const registered = AuthProviderFactory.getRegisteredProviderTypes();
    for (const key of BUILT_IN_DRIVER_KEYS) {
      expect(registered).toContain(key);
    }
  });

  it('reports an unregistered driver key as unregistered', () => {
    expect(AuthProviderFactory.isProviderTypeRegistered('not-a-real-provider')).toBe(false);
  });
});
