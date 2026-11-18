import { afterEach, describe, expect, it, vi } from 'vitest';

const { startPublicHost } = vi.hoisted(() => ({ startPublicHost: vi.fn() }));
vi.mock('../public-host.component', () => ({ StartPublicHost: startPublicHost }));

import {
  BuildLoginScreenURL, BuildSignInURL, FindPublicPage, IsPublicPagePath, LoadPublicPageComponent, ParsePublicPagePath,
  ResolvePublicMJAPIURL, TryStartPublicPage, type PublicPageEntry,
} from '../public-pages';

const pages: PublicPageEntry[] = [{ Slug: 'pricing', AppName: 'Acme', Load: () => Promise.reject(new Error('not loaded')) }];
const options = { Environment: { GRAPHQL_URI: 'http://localhost:4000/' }, PublicPages: pages };

function visit(pathname: string): void {
  vi.stubGlobal('window', { location: { pathname } });
}

describe('TryStartPublicPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    startPublicHost.mockReset();
  });

  it('does nothing on an Explorer path, so main.ts starts Explorer', async () => {
    visit('/app/home');
    await expect(TryStartPublicPage(options)).resolves.toBe(false);
    expect(startPublicHost).not.toHaveBeenCalled();
  });

  it('starts the public host on a /p/ path', async () => {
    visit('/p/pricing');
    startPublicHost.mockResolvedValue(undefined);
    await expect(TryStartPublicPage(options)).resolves.toBe(true);
    expect(startPublicHost).toHaveBeenCalledWith(options);
  });

  it('does not let Explorer start when the public host fails', async () => {
    visit('/p/pricing');
    startPublicHost.mockRejectedValue(new Error('chunk failed'));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(TryStartPublicPage(options)).resolves.toBe(true);
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});

class FakePage {}
const LoadFake = (): Promise<typeof FakePage> => Promise.resolve(FakePage);

describe('IsPublicPagePath', () => {
  it('matches paths under /p/', () => {
    expect(IsPublicPagePath('/p/lumen')).toBe(true);
    expect(IsPublicPagePath('/p/lumen/')).toBe(true);
    expect(IsPublicPagePath('/p/')).toBe(true);
  });

  it('does not match Explorer paths', () => {
    expect(IsPublicPagePath('/')).toBe(false);
    expect(IsPublicPagePath('/p')).toBe(false);
    expect(IsPublicPagePath('/pricing')).toBe(false);
    expect(IsPublicPagePath('/app/home')).toBe(false);
    expect(IsPublicPagePath('/oauth/callback')).toBe(false);
  });
});

describe('ParsePublicPagePath', () => {
  it('reads the first segment after /p/', () => {
    expect(ParsePublicPagePath('/p/lumen').Slug).toBe('lumen');
    expect(ParsePublicPagePath('/p/lumen/').Slug).toBe('lumen');
    expect(ParsePublicPagePath('/p/lumen/plans').Slug).toBe('lumen');
  });

  it('reads the path after the slug', () => {
    expect(ParsePublicPagePath('/p/lumen').SubPath).toBe('');
    expect(ParsePublicPagePath('/p/lumen/plans/').SubPath).toBe('plans');
    expect(ParsePublicPagePath('/p/lumen/plans/team').SubPath).toBe('plans/team');
  });

  it('decodes and lower-cases the slug', () => {
    expect(ParsePublicPagePath('/p/Lumen').Slug).toBe('lumen');
  });

  it('returns null when there is no slug', () => {
    expect(ParsePublicPagePath('/p/').Slug).toBeNull();
    expect(ParsePublicPagePath('/app/home').Slug).toBeNull();
  });

  it('returns null for a slug with a bad percent code', () => {
    expect(ParsePublicPagePath('/p/%E0%A4%A').Slug).toBeNull();
  });
});

describe('FindPublicPage', () => {
  const pages: PublicPageEntry[] = [
    { Slug: 'lumen', AppName: 'acme-lumen', Load: LoadFake },
    { Slug: 'lumen-pricing', AppName: 'acme-lumen', Load: LoadFake },
  ];

  it('finds a page by slug', () => {
    expect(FindPublicPage(pages, 'lumen-pricing')?.Slug).toBe('lumen-pricing');
  });

  it('returns null for an unknown or missing slug', () => {
    expect(FindPublicPage(pages, 'other')).toBeNull();
    expect(FindPublicPage(pages, null)).toBeNull();
  });
});

describe('LoadPublicPageComponent', () => {
  it('rejects when the package has no export with the page\'s name', async () => {
    const page = { Slug: 'lumen', AppName: 'acme-lumen', Load: () => Promise.resolve(undefined) } as unknown as PublicPageEntry;
    await expect(LoadPublicPageComponent(page)).rejects.toThrow(/lumen/);
  });
});

describe('ResolvePublicMJAPIURL', () => {
  it('uses MJAPI_URI without a trailing slash', () => {
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: 'https://host/api/' })).toBe('https://host/api');
  });

  it('uses the GraphQL origin when MJAPI_URI is blank or missing', () => {
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/graphql' })).toBe('http://localhost:4000');
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: '  ' })).toBe('http://localhost:4000');
  });
});

describe('BuildLoginScreenURL', () => {
  it('is the MJAPI login-screen route', () => {
    expect(BuildLoginScreenURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: 'https://host/api' })).toBe('https://host/api/auth/login-screen');
  });
});

describe('BuildSignInURL', () => {
  it('is Explorer\'s root', () => {
    expect(BuildSignInURL()).toBe('/');
  });
});
