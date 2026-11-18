import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HasMagicLinkSessionToken, MAGIC_LINK_TOKEN_STORAGE_KEY } from '../magic-link-session';
import { AuthProviderCatalog } from '../auth-provider-catalog';
import { PreloadActiveAuthProvider } from '../auth-provider-loader';

describe('HasMagicLinkSessionToken', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  it('returns false when window is undefined', () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(HasMagicLinkSessionToken()).toBe(false);
  });

  it('returns true when token is present in URL hash fragment', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { hash: '#token=jwt-abc' },
        sessionStorage: { getItem: () => null },
      },
      configurable: true,
      writable: true,
    });
    expect(HasMagicLinkSessionToken()).toBe(true);
  });

  it('returns true when token is stored in sessionStorage', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { hash: '' },
        sessionStorage: {
          getItem: (key: string) => (key === MAGIC_LINK_TOKEN_STORAGE_KEY ? 'stored-jwt' : null),
        },
      },
      configurable: true,
      writable: true,
    });
    expect(HasMagicLinkSessionToken()).toBe(true);
  });

  it('returns false when neither hash nor sessionStorage has a token', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { hash: '' },
        sessionStorage: { getItem: () => null },
      },
      configurable: true,
      writable: true,
    });
    expect(HasMagicLinkSessionToken()).toBe(false);
  });
});

describe('PreloadActiveAuthProvider', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { hash: '' },
        sessionStorage: { getItem: () => null },
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('returns undefined when catalog is empty and AUTH_TYPE is unset', async () => {
    vi.spyOn(AuthProviderCatalog, 'GetPreloaded').mockReturnValue([]);
    const resolved = await PreloadActiveAuthProvider({});
    expect(resolved).toBeUndefined();
  });

  it('resolves unknown custom AUTH_TYPE without throwing', async () => {
    vi.spyOn(AuthProviderCatalog, 'GetPreloaded').mockReturnValue([]);
    const resolved = await PreloadActiveAuthProvider({ AUTH_TYPE: 'CustomEnterpriseSSO' });
    expect(resolved).toBe('customenterprisesso');
  });

  it('loads magic-link when a magic-link session token is active regardless of AUTH_TYPE', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { hash: '#token=guest-jwt' },
        sessionStorage: { getItem: () => null },
      },
      configurable: true,
      writable: true,
    });
    vi.spyOn(AuthProviderCatalog, 'GetPreloaded').mockReturnValue([]);
    const resolved = await PreloadActiveAuthProvider({ AUTH_TYPE: 'msal' });
    expect(resolved).toBe('magic-link');
  });
});
