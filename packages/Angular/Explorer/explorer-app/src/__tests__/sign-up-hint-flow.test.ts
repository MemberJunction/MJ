// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Observable, of, throwError } from 'rxjs';
import type { PublicAuthProviderInfo } from '@memberjunction/core';
import { AuthProviderCatalog, type AuthProviderResolution } from '@memberjunction/ng-auth-services';
import { MJExplorerAppComponent } from '../public-api';

/**
 * A public page sends "Create account" visitors to `/?signup=1`. Explorer removes the hint from
 * the address bar and opens the identity provider's sign-up form instead of sign-in.
 */

interface FakeAuth {
  getUserInfo: () => Observable<null>;
  isAuthenticated: () => Observable<boolean>;
  login: ReturnType<typeof vi.fn>;
  GetSignUpOptions: () => Record<string, unknown> | null;
}

interface FakeWindow {
  location: { pathname: string; search: string; hash: string };
  history: { state: null; replaceState: ReturnType<typeof vi.fn> };
  localStorage: Storage;
}

type AppInternals = { startAutoLoginIfPending(): void };

const SIGN_UP_OPTIONS = { prompt: 'create' };

function provider(name: string): PublicAuthProviderInfo {
  return { name, driverClass: name, displayName: name, sequence: 0, isDefault: false };
}

function installWindow(search: string): FakeWindow {
  const store: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  } as Storage;
  const fakeWindow: FakeWindow = {
    location: { pathname: '/', search, hash: '' },
    history: { state: null, replaceState: vi.fn() },
    localStorage: storage,
  };
  vi.stubGlobal('window', fakeWindow);
  return fakeWindow;
}

function fakeAuth(loggedIn: boolean, signUpOptions: Record<string, unknown> | null = SIGN_UP_OPTIONS): FakeAuth {
  return {
    getUserInfo: () => of(null),
    isAuthenticated: () => of(loggedIn),
    login: vi.fn(() => of(undefined)),
    GetSignUpOptions: () => signUpOptions,
  };
}

function appWith(auth: FakeAuth, resolution: AuthProviderResolution | null = null): MJExplorerAppComponent {
  // Only the auth flow runs, so the component is built without its injected services.
  const app: MJExplorerAppComponent = Object.create(MJExplorerAppComponent.prototype);
  return Object.assign(app, {
    AuthBase: auth,
    authResolution: resolution,
    cdr: { detectChanges: vi.fn() },
    Document: { defaultView: { location: { reload: vi.fn() } } },
    SigningIn: false,
  });
}

function pickerResolution(activeName: string, extra: Partial<AuthProviderResolution> = {}): AuthProviderResolution {
  return {
    active: provider(activeName),
    choices: [provider('auth0'), provider('okta')],
    showPicker: true,
    autoLogin: false,
    ...extra,
  };
}

describe('MJExplorerAppComponent sign-up hint', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('removes the hint and starts sign-up for a visitor with no session (single provider)', async () => {
    const win = installWindow('?a=1&signup=1');
    const auth = fakeAuth(false);

    await appWith(auth).SetupAuth();

    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/?a=1');
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(auth.login).toHaveBeenCalledWith(SIGN_UP_OPTIONS);
  });

  it('starts a normal login when the provider has no sign-up hint', async () => {
    installWindow('?signup=1');
    const auth = fakeAuth(false, null);

    await appWith(auth).SetupAuth();

    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(auth.login).toHaveBeenCalledWith(undefined);
  });

  it('only removes the hint for a signed-in visitor', async () => {
    const win = installWindow('?signup=true');
    const auth = fakeAuth(true);

    await appWith(auth).SetupAuth();

    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('falls back to the login screen when the sign-up start fails', async () => {
    installWindow('?signup=1');
    const auth = fakeAuth(false);
    auth.login.mockReturnValueOnce(throwError(() => new Error('redirect blocked')));
    const app = appWith(auth);

    await app.SetupAuth();

    expect(auth.login).toHaveBeenCalledWith(SIGN_UP_OPTIONS);
    expect(app.SigningIn).toBe(false);
  });

  it('waits for the picker, then signs up with the chosen active provider', async () => {
    installWindow('?signup=1');
    const auth = fakeAuth(false);
    const app = appWith(auth, pickerResolution('auth0'));

    await app.SetupAuth();
    expect(auth.login).not.toHaveBeenCalled();

    app.OnAuthProviderSelected(provider('auth0'));
    expect(auth.login).toHaveBeenCalledWith(SIGN_UP_OPTIONS);
  });

  it('uses a normal login for a later pick after a failed sign-up start', async () => {
    installWindow('?signup=1');
    const auth = fakeAuth(false);
    auth.login.mockReturnValueOnce(throwError(() => new Error('redirect blocked')));
    const app = appWith(auth, pickerResolution('auth0'));

    await app.SetupAuth();
    app.OnAuthProviderSelected(provider('auth0'));
    app.OnAuthProviderSelected(provider('auth0'));

    expect(auth.login).toHaveBeenNthCalledWith(1, SIGN_UP_OPTIONS);
    expect(auth.login).toHaveBeenNthCalledWith(2, undefined);
  });

  it('keeps the sign-up intent across the reload a provider switch needs', async () => {
    installWindow('?signup=1');
    const auth = fakeAuth(false);
    const app = appWith(auth, pickerResolution('auth0'));

    await app.SetupAuth();
    app.OnAuthProviderSelected(provider('okta'));

    const reloaded = AuthProviderCatalog.Resolve([provider('auth0'), provider('okta')]);
    expect(reloaded.autoLogin).toBe(true);
    expect(reloaded.autoSignUp).toBe(true);
  });

  it('opens sign-up after the reload when the pending login is a sign-up', () => {
    installWindow('');
    const auth = fakeAuth(false);
    const app = appWith(auth, pickerResolution('okta', { autoLogin: true, autoSignUp: true }));

    (app as unknown as AppInternals).startAutoLoginIfPending();

    expect(auth.login).toHaveBeenCalledWith(SIGN_UP_OPTIONS);
  });
});
