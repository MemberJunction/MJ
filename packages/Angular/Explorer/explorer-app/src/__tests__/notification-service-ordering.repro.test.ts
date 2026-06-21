/**
 * REPRODUCTION — latent ordering bug exposed by magic-link login.
 *
 * MJExplorerAppComponent reads `MJNotificationService.Instance` STATICALLY at
 * explorer-app.component.ts:135 (and :590) but never injects the service into
 * its constructor. The static getter does NOT lazily construct — it is a pure
 * read of the MJGlobal global-object-store slot:
 *
 *     // notifications.service.ts:155-157
 *     public static get Instance(): MJNotificationService {
 *       return GetGlobalObjectStore()![MJNotificationService._globalStoreKey] as MJNotificationService;
 *     }
 *
 * The slot is only populated by the service CONSTRUCTOR (notifications.service.ts:71,
 * `g[_globalStoreKey] = this`), which runs only when Angular DI first instantiates
 * the `@Injectable({providedIn:'root'})` service. Until then `.Instance` is undefined.
 *
 * In `handleLogin` the component does:
 *     // explorer-app.component.ts:135
 *     MJNotificationService.Instance.ShouldSuppressToast = (statusObj) => { ... };
 *
 * With MSAL/Auth0 the auth redirect round-trip lets shell DI construct the service
 * before handleLogin runs. Magic-link resolves auth SYNCHRONOUSLY from the URL
 * fragment during APP_INITIALIZER (no redirect), so handleLogin can fire before
 * anything constructs the service → `.Instance` is undefined → the assignment throws.
 *
 * This test exercises the REAL shared global-object-store (`@memberjunction/global`)
 * with the REAL store key, mirroring the getter / constructor / line-135 verbatim.
 * It is deterministic where the live magic-link path is racy.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';

// The exact key MJNotificationService registers under (notifications.service.ts:21).
const STORE_KEY = '___SINGLETON__MJNotificationService';

/** Mirror of notifications.service.ts:155-157 — a pure, non-lazy slot read. */
function notificationServiceInstance(): { ShouldSuppressToast?: unknown } {
  return GetGlobalObjectStore()![STORE_KEY] as { ShouldSuppressToast?: unknown };
}

/** Mirror of the constructor self-register (notifications.service.ts:71) — what DI does. */
function constructNotificationServiceViaDI(): void {
  GetGlobalObjectStore()![STORE_KEY] = {};
}

describe('MJNotificationService ordering bug (magic-link login)', () => {
  beforeEach(() => {
    // Simulate "service has not been DI-constructed yet" — the magic-link timing.
    delete GetGlobalObjectStore()![STORE_KEY];
  });

  it('returns undefined from .Instance when nothing has constructed the service yet', () => {
    expect(notificationServiceInstance()).toBeUndefined();
  });

  it('CRASHES at the explorer-app.component.ts:135 assignment when .Instance is undefined', () => {
    // This is the bug: handleLogin running before any DI construction of the service.
    expect(() => {
      notificationServiceInstance().ShouldSuppressToast = (_s: Record<string, unknown>) => false;
    }).toThrow(TypeError);
  });

  it('does NOT crash once the service has been DI-constructed first (the fix principle)', () => {
    // Injecting MJNotificationService into the component constructor forces this
    // construction to happen before handleLogin runs.
    constructNotificationServiceViaDI();
    expect(() => {
      notificationServiceInstance().ShouldSuppressToast = (_s: Record<string, unknown>) => false;
    }).not.toThrow();
  });
});
