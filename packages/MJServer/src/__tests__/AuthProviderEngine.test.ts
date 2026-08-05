import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the metadata-driven auth provider catalog.
 *
 * The focus is the security boundary: `GetPublicCatalog` feeds an UNAUTHENTICATED endpoint, so
 * these assert what may not escape it — server-only configuration, credential linkage, and any
 * non-primitive value that could carry a secret. Also covers the registration path's isolation
 * (one bad row must not cost a deployment its other providers) and the config projection.
 */

// vi.mock factories are hoisted above module-level consts, so the shared spies have to be
// created inside vi.hoisted() to exist by the time a factory runs.
const { registerMock, createProviderMock, clearMock, getCredentialMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  createProviderMock: vi.fn(),
  clearMock: vi.fn(),
  getCredentialMock: vi.fn()
}));

vi.mock('@memberjunction/auth-providers', () => ({
  AuthProviderFactory: {
    Instance: {
      register: registerMock,
      clear: clearMock
    },
    createProvider: createProviderMock
  }
}));

vi.mock('@memberjunction/credentials', () => ({
  CredentialEngine: {
    Instance: {
      Config: vi.fn(async () => undefined),
      getCredential: getCredentialMock
    }
  }
}));

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/core', () => ({
  BaseEngine: class {
    protected async Load(): Promise<void> {
      /* no-op: tests inject rows directly */
    }
    protected GetConfigData<T>(propertyName: string): T[] {
      return (this as unknown as Record<string, T[]>)[propertyName] ?? [];
    }
    public static getInstance<T>(this: new () => T): T {
      return new this();
    }
  },
  RegisterForStartup: () => (target: unknown) => target,
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  LogStatusEx: vi.fn()
}));

import { AuthProviderEngine } from '../auth/AuthProviderEngine.js';

/** Minimal stand-in for a generated MJAuthenticationProviderEntity row. */
type Row = {
  Name: string;
  DriverClass: string;
  Issuer: string | null;
  Audience: string | null;
  JWKSUri: string | null;
  ClientID: string | null;
  Domain: string | null;
  Scopes: string | null;
  AdditionalConfiguration: string | null;
  ClientConfiguration: string | null;
  CredentialID: string | null;
  Credential: string | null;
  Status: string;
  IsDefault: boolean;
  ClientVisible: boolean;
  DisplayName: string | null;
  Icon: string | null;
  Sequence: number;
};

function row(overrides: Partial<Row> & { Name: string; DriverClass: string }): Row {
  return {
    Issuer: null,
    Audience: null,
    JWKSUri: null,
    ClientID: null,
    Domain: null,
    Scopes: null,
    AdditionalConfiguration: null,
    ClientConfiguration: null,
    CredentialID: null,
    Credential: null,
    Status: 'Active',
    IsDefault: false,
    ClientVisible: true,
    DisplayName: null,
    Icon: null,
    Sequence: 0,
    ...overrides
  };
}

/** Builds an engine whose cached rows are the supplied ones. */
function engineWith(rows: Row[]): AuthProviderEngine {
  const engine = new AuthProviderEngine();
  (engine as unknown as { _providers: Row[] })._providers = rows;
  return engine;
}

beforeEach(() => {
  vi.clearAllMocks();
  createProviderMock.mockImplementation((config: unknown) => ({ config }));
});

describe('AuthProviderEngine.GetPublicCatalog', () => {
  it('never publishes server-only configuration or credential linkage', () => {
    const catalog = engineWith([
      row({
        Name: 'WorkOS Production',
        DriverClass: 'workos',
        ClientID: 'client_123',
        Issuer: 'https://api.workos.com/user_management/client_123',
        AdditionalConfiguration: JSON.stringify({ managementApiKey: 'sk_live_SECRET' }),
        CredentialID: 'CRED-1',
        Credential: 'WorkOS Secret'
      })
    ]).GetPublicCatalog();

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain('sk_live_SECRET');
    expect(serialized).not.toContain('managementApiKey');
    expect(serialized).not.toContain('CRED-1');
    expect(catalog[0]).not.toHaveProperty('credentialID');
    expect(catalog[0]).not.toHaveProperty('additionalConfiguration');
  });

  it('excludes providers that are not client-visible', () => {
    const catalog = engineWith([
      row({ Name: 'Interactive', DriverClass: 'okta' }),
      row({ Name: 'Machine to machine', DriverClass: 'auth0', ClientVisible: false })
    ]).GetPublicCatalog();

    expect(catalog.map((p) => p.name)).toEqual(['Interactive']);
  });

  it('falls back to Name when DisplayName is unset', () => {
    const [info] = engineWith([row({ Name: 'Corporate Azure AD', DriverClass: 'msal' })]).GetPublicCatalog();
    expect(info.displayName).toBe('Corporate Azure AD');
  });

  it('publishes ClientConfiguration primitives for the browser driver', () => {
    const [info] = engineWith([
      row({
        Name: 'WorkOS',
        DriverClass: 'workos',
        ClientConfiguration: JSON.stringify({ redirectUri: 'https://app.example.com', devMode: false })
      })
    ]).GetPublicCatalog();

    expect(info.clientConfiguration).toEqual({ redirectUri: 'https://app.example.com', devMode: false });
  });

  it('drops non-primitive ClientConfiguration values so a nested blob cannot ride along', () => {
    const [info] = engineWith([
      row({
        Name: 'WorkOS',
        DriverClass: 'workos',
        ClientConfiguration: JSON.stringify({ redirectUri: 'https://app.example.com', secrets: { apiKey: 'sk_live_SECRET' } })
      })
    ]).GetPublicCatalog();

    expect(info.clientConfiguration).toEqual({ redirectUri: 'https://app.example.com' });
    expect(JSON.stringify(info)).not.toContain('sk_live_SECRET');
  });

  it('treats malformed ClientConfiguration as absent rather than failing the catalog', () => {
    const [info] = engineWith([row({ Name: 'Broken', DriverClass: 'okta', ClientConfiguration: '{not json' })]).GetPublicCatalog();
    expect(info.clientConfiguration).toBeUndefined();
    expect(info.name).toBe('Broken');
  });
});

describe('AuthProviderEngine.RegisterAll', () => {
  it('registers every active provider', async () => {
    const count = await engineWith([
      row({ Name: 'A', DriverClass: 'okta' }),
      row({ Name: 'B', DriverClass: 'auth0' })
    ]).RegisterAll();

    expect(count).toBe(2);
    expect(registerMock).toHaveBeenCalledTimes(2);
  });

  it('isolates a failing row so the other providers still register', async () => {
    createProviderMock.mockImplementation((config: { type: string }) => {
      if (config.type === 'broken') {
        throw new Error('no driver registered');
      }
      return { config };
    });

    const count = await engineWith([
      row({ Name: 'Broken', DriverClass: 'broken' }),
      row({ Name: 'Good', DriverClass: 'okta' })
    ]).RegisterAll();

    expect(count).toBe(1);
    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it('projects the row onto the driver config, splitting scopes into an array', async () => {
    await engineWith([
      row({
        Name: 'Okta Prod',
        DriverClass: 'okta',
        ClientID: 'cid',
        Domain: 'example.okta.com',
        Issuer: 'https://example.okta.com',
        Audience: 'api://default',
        JWKSUri: 'https://example.okta.com/keys',
        Scopes: 'openid profile email'
      })
    ]).RegisterAll();

    expect(createProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Okta Prod',
        type: 'okta',
        clientId: 'cid',
        domain: 'example.okta.com',
        issuer: 'https://example.okta.com',
        audience: 'api://default',
        jwksUri: 'https://example.okta.com/keys',
        scopes: ['openid', 'profile', 'email']
      })
    );
  });

  it('does not let AdditionalConfiguration override a modelled column', async () => {
    await engineWith([
      row({
        Name: 'Okta',
        DriverClass: 'okta',
        Issuer: 'https://real-issuer.example.com',
        AdditionalConfiguration: JSON.stringify({ issuer: 'https://attacker.example.com' })
      })
    ]).RegisterAll();

    expect(createProviderMock).toHaveBeenCalledWith(expect.objectContaining({ issuer: 'https://real-issuer.example.com' }));
  });

  it('merges decrypted credential values when the row links one', async () => {
    getCredentialMock.mockResolvedValue({ values: { clientSecret: 'shhh' } });

    await engineWith([row({ Name: 'Confidential', DriverClass: 'okta', CredentialID: 'CRED-1', Credential: 'Okta Secret' })]).RegisterAll();

    expect(getCredentialMock).toHaveBeenCalledWith('Okta Secret', expect.objectContaining({ subsystem: 'Authentication' }));
    expect(createProviderMock).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: 'shhh' }));
  });

  it('does not touch CredentialEngine when no credential is linked', async () => {
    await engineWith([row({ Name: 'Public JWKS', DriverClass: 'okta' })]).RegisterAll();
    expect(getCredentialMock).not.toHaveBeenCalled();
  });
});
